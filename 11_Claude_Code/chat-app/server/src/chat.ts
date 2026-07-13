import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  query,
  tool,
  createSdkMcpServer,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

/**
 * Chat reply generation — the seam where the Claude agent is wired in.
 *
 * `generateReply` runs a read-only "codebase concierge" agent over a target
 * repository and returns its final answer. The /api/chat route never has to
 * change: this function still just takes a message and returns a string.
 */

// The repo the concierge answers questions about. Configurable via env var;
// defaults to this chat-app repo (../../ from server/src).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TARGET_REPO =
  process.env.CONCIERGE_TARGET_REPO ?? path.resolve(__dirname, "..", "..");

const SYSTEM_PROMPT = [
  "You are a concierge for a single code repository.",
  "Answer questions about this codebase concisely and accurately.",
  "Use your read-only tools (Read, Glob, Grep) to ground every answer in the",
  "actual code — never guess. Cite the file paths you relied on.",
  "When a question is about the size of a file, prefer the count_lines tool.",
  "If something is not in the repo, say so plainly.",
].join(" ");

// Custom in-process tool: count the lines in a file inside the target repo.
// Runs as an in-process MCP server — no networking, same address space.
const countLines = tool(
  "count_lines",
  "Count the number of lines in a file inside the target repository. " +
    "Accepts a path relative to the repo root (or an absolute path within it).",
  { file_path: z.string().describe("File path, relative to the repo root") },
  async (args) => {
    console.log(`[tool] count_lines(${args.file_path})`);
    const resolved = path.resolve(TARGET_REPO, args.file_path);
    // Confine the tool to the repo — this agent is read-only and headless.
    if (resolved !== TARGET_REPO && !resolved.startsWith(TARGET_REPO + path.sep)) {
      return {
        content: [
          { type: "text", text: `Refused: "${args.file_path}" is outside the repository.` },
        ],
      };
    }
    try {
      const text = await readFile(resolved, "utf8");
      const lines = text === "" ? 0 : text.split("\n").length;
      return { content: [{ type: "text", text: `${args.file_path}: ${lines} lines` }] };
    } catch {
      return {
        content: [{ type: "text", text: `Could not read "${args.file_path}".` }],
      };
    }
  },
);

const conciergeServer = createSdkMcpServer({
  name: "concierge",
  version: "1.0.0",
  tools: [countLines],
});

// Short-term memory: maps a browser conversation_id to its SDK session_id so
// each conversation resumes where it left off. In-memory is fine for now; a
// process restart clears it. Swap for a store (Redis, DB) to persist.
const sessions = new Map<string, string>();

// SDK MCP (in-process) tools require streaming input mode, so the prompt must
// be an async iterable rather than a plain string. We yield a single message.
async function* singlePrompt(text: string): AsyncGenerator<SDKUserMessage> {
  yield {
    type: "user",
    message: { role: "user", content: text },
    parent_tool_use_id: null,
    session_id: "",
  };
}

/**
 * Events emitted while the concierge works. `tool` events are live progress
 * ("Reading X…"); exactly one terminal `reply` or `error` ends the stream.
 */
export type ConciergeEvent =
  | { type: "tool"; name: string; label: string }
  | { type: "reply"; reply: string }
  | { type: "error"; reply: string };

// Turn a tool-use block into a friendly, human-readable progress label.
function toolLabel(name: string, input: Record<string, unknown>): string {
  const rel = (p: unknown) =>
    typeof p === "string" ? path.relative(TARGET_REPO, path.resolve(TARGET_REPO, p)) || p : "";
  switch (name) {
    case "Read":
      return `Reading ${rel(input.file_path)}`;
    case "Glob":
      return `Finding files: ${String(input.pattern ?? "")}`;
    case "Grep":
      return `Searching for "${String(input.pattern ?? "")}"`;
    case "mcp__concierge__count_lines":
      return `Counting lines in ${rel(input.file_path)}`;
    default:
      return name.startsWith("mcp__") ? name.split("__").pop()! : name;
  }
}

/**
 * Run the concierge, yielding progress events as the agent works and a final
 * `reply`/`error` event at the end. This is the shared core; both the plain
 * and streaming endpoints are built on top of it.
 */
export async function* streamConcierge(
  message: string,
  conversationId: string,
): AsyncGenerator<ConciergeEvent> {
  const resume = sessions.get(conversationId);

  try {
    for await (const msg of query({
      prompt: singlePrompt(message),
      options: {
        systemPrompt: SYSTEM_PROMPT,
        mcpServers: { concierge: conciergeServer },
        allowedTools: [
          "Read",
          "Glob",
          "Grep",
          "mcp__concierge__count_lines", // custom tools must be allowlisted too
        ],
        cwd: TARGET_REPO,
        maxTurns: 25, // hard cap so no request can loop forever
        ...(resume ? { resume } : {}), // continue the prior session if we have one
      },
    })) {
      if (msg.type === "assistant") {
        for (const block of msg.message.content) {
          if (block.type === "tool_use") {
            yield {
              type: "tool",
              name: block.name,
              label: toolLabel(block.name, block.input as Record<string, unknown>),
            };
          }
        }
      } else if (msg.type === "result") {
        // Remember this conversation's session so the next turn has context.
        sessions.set(conversationId, msg.session_id);
        if (msg.subtype === "success") {
          yield { type: "reply", reply: msg.result };
        } else {
          yield { type: "error", reply: politeError(`The agent stopped early (${msg.subtype}).`) };
        }
        return;
      }
    }
    yield { type: "error", reply: politeError("The agent finished without producing a reply.") };
  } catch (err) {
    console.error("Agent error:", err);
    yield { type: "error", reply: politeError() };
  }
}

/**
 * Non-streaming convenience wrapper: run the concierge and return just the
 * final reply string. Backs the plain POST /api/chat endpoint.
 */
export async function generateReply(
  message: string,
  conversationId: string,
): Promise<string> {
  let reply = politeError("The agent finished without producing a reply.");
  for await (const ev of streamConcierge(message, conversationId)) {
    if (ev.type === "reply" || ev.type === "error") {
      reply = ev.reply;
    }
  }
  return reply;
}

function politeError(detail?: string): string {
  const base =
    "Sorry — I ran into a problem answering that. Please try rephrasing your question.";
  return detail ? `${base} (${detail})` : base;
}
