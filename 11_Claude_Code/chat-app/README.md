# Chat App

A minimal chat web app skeleton.

- **Frontend:** React + Vite + TypeScript + Tailwind v4 + [shadcn/ui](https://ui.shadcn.com)
- **Backend:** Node + Express (TypeScript)
- **`POST /api/chat`** currently returns an **echo stub**. The reply logic lives in one
  place — `server/src/chat.ts` (`generateReply`) — ready to be swapped for a real agent.

## Layout

```
chat-app/
├── server/          # Express API (TypeScript)
│   └── src/
│       ├── index.ts # POST /api/chat + static serving in production
│       └── chat.ts  # generateReply() — the stub to replace with an agent
└── client/          # Vite + React + shadcn/ui chat UI
    └── src/App.tsx  # message history, input, send button; calls /api/chat
```

## Prerequisites

- Node.js 20+ and npm

## Install

```bash
cd chat-app
npm run install:all
```

## Development

Runs the Express API (`:3001`) and the Vite dev server (`:5173`) together. Vite proxies
`/api` requests to Express, so you only need to open the Vite URL.

```bash
npm run dev
```

Open http://localhost:5173.

## Production

Builds the client to `client/dist` and compiles the server, then serves everything from
Express on a single port.

```bash
npm run build
npm start
```

Open http://localhost:3001.

## The API

**`POST /api/chat`** — single JSON response.

Request:

```json
{ "message": "what does this repo do?", "conversation_id": "<uuid>" }
```

Response:

```json
{ "reply": "This repo is a codebase concierge chat app…" }
```

**`POST /api/chat/stream`** — same request body, streams the agent's activity over
Server-Sent Events so the UI can show live progress ("Reading X…", "Counting lines…")
while the agent works. Each frame is `data: <json>\n\n`, where the JSON is one of:

```jsonc
{ "type": "tool",  "name": "Read", "label": "Reading server/src/chat.ts" } // live progress
{ "type": "reply", "reply": "…final answer…" }                             // terminal
{ "type": "error", "reply": "…polite error…" }                            // terminal
```

The browser consumes this via `fetch` + a `ReadableStream` reader (not `EventSource`, so
the POST body is preserved). See `client/src/App.tsx` → `streamChat`.

## The agent (codebase concierge)

`server/src/chat.ts` runs a read-only Claude agent over a target repo:

- `streamConcierge()` — the core async generator; yields `tool` progress events then a
  terminal `reply`/`error`. Both endpoints are built on it (`generateReply` just keeps the
  final reply).
- Read-only allowlist: `Read`, `Glob`, `Grep`, plus the custom `count_lines` tool. No
  `Write`/`Edit`/`Bash` — the agent structurally cannot modify the filesystem.
- `maxTurns: 25` caps each request; per-conversation memory via SDK session `resume`.
- Target repo is `CONCIERGE_TARGET_REPO` (defaults to this repo). Requires auth via the
  Claude Agent SDK (`ANTHROPIC_API_KEY` or ambient Claude Code credentials).
