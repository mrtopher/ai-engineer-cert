import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { generateReply, streamConcierge } from "./chat.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT ?? 3001);

app.use(express.json());

interface ChatRequestBody {
  message?: unknown;
  conversation_id?: unknown;
}

// Validate the shared request body; returns typed fields or an error string.
function parseChatBody(
  body: ChatRequestBody,
): { message: string; conversationId: string } | { error: string } {
  const { message, conversation_id } = body;
  if (typeof message !== "string" || message.trim() === "") {
    return { error: "`message` must be a non-empty string." };
  }
  if (typeof conversation_id !== "string" || conversation_id === "") {
    return { error: "`conversation_id` must be a non-empty string." };
  }
  return { message, conversationId: conversation_id };
}

app.post("/api/chat", async (req, res) => {
  const parsed = parseChatBody(req.body as ChatRequestBody);
  if ("error" in parsed) {
    return res.status(400).json({ error: parsed.error });
  }

  const reply = await generateReply(parsed.message, parsed.conversationId);
  return res.json({ reply });
});

// Streaming variant: live progress (tool calls) then the final reply, over SSE.
app.post("/api/chat/stream", async (req, res) => {
  const parsed = parseChatBody(req.body as ChatRequestBody);
  if ("error" in parsed) {
    return res.status(400).json({ error: parsed.error });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable proxy buffering
  res.flushHeaders();

  const send = (event: unknown) => res.write(`data: ${JSON.stringify(event)}\n\n`);

  try {
    for await (const event of streamConcierge(parsed.message, parsed.conversationId)) {
      send(event);
    }
  } catch (err) {
    console.error("Stream error:", err);
    send({ type: "error", reply: "Sorry — the stream failed." });
  }
  res.end();
});

// In production, serve the built client (Vite output) and let the SPA handle routing.
if (process.env.NODE_ENV === "production") {
  const clientDist = path.resolve(__dirname, "../../client/dist");
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
