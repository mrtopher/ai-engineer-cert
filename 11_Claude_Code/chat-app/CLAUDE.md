# CLAUDE.md

Guidance for working in this repo.

## What this is

A minimal chat web app skeleton. TypeScript throughout.

- **Backend:** Node + Express (`server/`)
- **Frontend:** Vite + React + TypeScript + Tailwind v4 + shadcn/ui (`client/`)

## Run & test

Install everything first:

```bash
npm run install:all
```

**Development** — Express (`:3001`) + Vite (`:5173`) together; Vite proxies `/api` to Express:

```bash
npm run dev
```

Open http://localhost:5173.

**Production** — build the client and serve everything from Express on one port:

```bash
npm run build
npm start          # http://localhost:3001
```

**Test the endpoint** with curl (server must be running):

```bash
curl -s -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"hello","conversation_id":"demo-1"}'
# -> {"reply":"You said: hello"}
```

## The architecture decision that matters

All agent logic lives in `server/src/chat.ts`, behind two functions:

- `streamConcierge(message, conversationId)` — the core async generator. Runs the Claude
  Agent SDK `query()` and yields `tool` progress events then a terminal `reply`/`error`.
- `generateReply(message, conversationId)` — thin wrapper that consumes the generator and
  returns only the final reply string.

The two endpoints in `server/src/index.ts` are built on these: `POST /api/chat` (single
JSON reply) and `POST /api/chat/stream` (SSE live progress). To change agent behavior,
edit `chat.ts` only — the routes and frontend contract stay put.

## Conventions

- **Keep the stub isolated.** All reply logic stays inside `generateReply`. Don't scatter
  chat/agent logic into the route handler or the frontend.
- **Wire format is snake_case:** request `{ message, conversation_id }` → response
  `{ reply }`. Don't rename these fields.
- **Server is ESM** (`"type": "module"`, `moduleResolution: NodeNext`): relative imports
  need the `.js` extension (e.g. `import { generateReply } from "./chat.js"`).
- **Client uses the `@/*` path alias** for `src/*` (configured in `tsconfig` + `vite.config.ts`).
- **Tailwind v4:** no `tailwind.config.js`/PostCSS — the `@tailwindcss/vite` plugin plus
  `@import "tailwindcss";` in `src/index.css`. Add UI via `npx shadcn@latest add <component>`.
- **Do not add `baseUrl` to tsconfig** — TS 5.7+ deprecates it; `paths` works without it.
