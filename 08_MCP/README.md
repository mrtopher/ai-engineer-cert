<p align="center" draggable="false"><img src="https://github.com/AI-Maker-Space/LLM-Dev-101/assets/37101144/d1343317-fa2f-41e1-8af1-1dbb18399719"
     width="200px"
     height="auto"/>
</p>

<h1 align="center" id="heading">Session 8: Model Context Protocol (MCP)</h1>

### [Quicklinks]()

| Session Sheet | Recording | Slides | Repo | Homework | Feedback |
|:--------------|:----------|:-------|:-----|:---------|:---------|
| [Session 8: MCP](https://github.com/AI-Maker-Space/The-AI-Engineering-Certification-v1.0/tree/main/00_Docs/Modules/08_MCP) |[Recording!](https://us02web.zoom.us/rec/share/rqw5I5hwbOOHy8TrGjnu0IjDJi53ykHb0k897jYfyHqZpgRhUuFP4A18d4NrcEKS.18sNk6Do9XwyaVUy) <br> passcode: `E56&^V+8`| [Session 8 Slides](https://canva.link/k8cixqgkfeghdsn) |You are here! | [Session 8 Assignment](https://forms.gle/TcjjChq38ydMjuqn8) | [Feedback 6/25](https://forms.gle/DvcWDgBXatBWCXqi7) |

## Useful Resources

**MCP (Model Context Protocol)**
- [MCP Official Docs](https://modelcontextprotocol.io/) — Spec, tutorials, and guides
- [MCP-UI](https://mcpui.dev/) — Official standard for interactive UI in MCP
- [MCP Auth Guide (Auth0)](https://auth0.com/blog/mcp-specs-update-all-about-auth/) — Deep dive into MCP auth spec updates

## Main Assignment

In this session, you will build an MCP server with OAuth authentication — a cat
shop application that exposes tools for browsing products, managing a cart, and
checking out.

The main entry point is:

```text
server.py
```

The server implementation lives in:

```text
app/
```

Available MCP tools:

- `list_products`
- `search_products` _(Activity 1)_
- `get_product`
- `add_to_cart`
- `view_cart`
- `update_cart_quantity` _(Activity 1)_
- `remove_from_cart`
- `checkout`

## Setup

From this folder:

```bash
uv sync
```

Copy the example env file and fill in your OpenAI API key:

```bash
cp .env.example .env
```

## Running the MCP Server

Run the server locally:

```bash
uv run server.py
```

The server starts on `http://localhost:8000`.

### Expose the server with ngrok

In a separate terminal, start an ngrok tunnel:

```bash
ngrok http 8000
```

Copy the ngrok forwarding URL (e.g. `https://xxxx-xx-xx-xx-xx.ngrok-free.app`) and
restart the server with it:

```bash
ISSUER_URL=https://xxxx-xx-xx-xx-xx.ngrok-free.app uv run server.py
```

> **Note:** The `ISSUER_URL` must match the public URL clients use to reach the
> server, otherwise OAuth authentication will fail.

## Outline

### Breakout Room #1

- Set up the MCP server with OAuth and the product database
- Explore the MCP tools: `list_products`, `get_product`, `add_to_cart`, `view_cart`, `remove_from_cart`, `checkout`

### Breakout Room #2

- Connect an MCP client to the server
- Build an end-to-end interaction flow using the MCP tools

## Ship

The completed MCP server and client integration!

### Deliverables

- A short Loom of either:
  - the MCP server you built and a demo of the client interacting with it; or
  - the notebook you created for the Advanced Build

## Share

Make a social media post about your final application!

### Deliverables

- Make a post on any social media platform about what you built!

Here's a template to get you started:

```
🚀 Exciting News! 🚀

I am thrilled to announce that I have just built and shipped an MCP server with OAuth authentication! 🎉🤖

🔍 Three Key Takeaways:
1️⃣
2️⃣
3️⃣

Let's continue pushing the boundaries of what's possible in the world of AI and tool integration. Here's to many more innovations! 🚀
Shout out to @AIMakerspace !

#MCP #ModelContextProtocol #OAuth #Innovation #AI #TechMilestone

Feel free to reach out if you're curious or would like to collaborate on similar projects! 🤝🔥
```

## Submitting Your Homework 

Follow these steps to prepare and submit your homework assignment:

1. Review the MCP server code in `server.py` and the `app/` directory
2. Run the MCP server locally using `uv run server.py`
3. Connect to the server using an MCP client (e.g., Claude Desktop, or a custom client)
4. Test all available tools: browsing products, adding to cart, viewing cart, removing items, and checkout
5. Record a Loom video reviewing what you have learned from this session

## Questions

### Question #1

Why is OAuth important for MCP servers, and what security considerations should you keep in mind when exposing tools to AI clients?

#### Answer

MCP tools are not read-only — in this server they mutate state and act on a
user's behalf (`add_to_cart`, `remove_from_cart`, `checkout`). The moment a
server is exposed publicly, anyone who can reach the URL could call those tools.
OAuth solves two distinct problems:

1. **Authentication / identity** — it establishes *who* is calling. Our tools
   resolve the caller's username from their bearer token (`_get_username()` in
   `app/tools.py`), so each user gets their own isolated cart. Without an
   authenticated identity there is no safe way to key per-user data or attribute
   a `checkout` to anyone.
2. **Authorization / scoping** — the token carries scopes (`read`, `write`) and
   an audience (`resource`), so a token is only valid for the operations and the
   specific server it was issued for.

OAuth 2.1 is also what the MCP spec standardizes on, including **dynamic client
registration** (clients register themselves with no pre-shared secret) and
**PKCE** (the `code_challenge` in `app/oauth.py`), which protects the
authorization-code exchange from interception.

Security considerations when exposing tools to AI clients:

- **Resource/audience binding.** A token must only work against the server it was
  minted for. 
- **Least privilege via scopes.** Grant the narrowest scopes a tool needs; a
  read-only browsing client should not hold a `write` token that can `checkout`.
- **Short-lived tokens + revocation.** Access tokens here expire in 1 hour with
  longer-lived refresh tokens, and revocation is enabled
  (`RevocationOptions(enabled=True)`) so a leaked token can be invalidated.
- **Don't trust tool inputs.** An AI client (or a prompt-injected one) can call
  tools with arbitrary arguments, so every tool must validate inputs and enforce
  ownership server-side — never assume the model "won't" call a destructive tool.
- **Transport security.** Tokens travel in `Authorization` headers, so the public
  endpoint must be HTTPS (ngrok terminates TLS for us in this exercise).
- **Confused-deputy / consent.** The server should make the user explicitly
  authorize a client (our `/login` page) rather than silently granting access,
  so a malicious client can't act on a user's behalf without consent.

### Question #2

What is Streamable HTTP transport in MCP, and why might you expose a server publicly with OAuth instead of using a local stdio connection?

#### Answer

**Streamable HTTP** is MCP's transport for communicating with a server over the
network instead of over local process pipes. The client sends JSON-RPC requests
via HTTP `POST` to a single endpoint (here, `/mcp`), and the server can stream
responses back using Server-Sent Events when it needs to push multiple
messages, progress updates, or long-running results over one connection.

The alternative, **stdio**, runs the server as a child process of the client and
exchanges messages over stdin/stdout. It's simple and secure-by-locality (no
network surface, no auth needed), which makes it great for a tool running on the
same machine as the client — e.g. a local CLI plugin.

Why expose a server publicly with OAuth instead of using stdio:

- **Remote / multi-user access.** stdio only works when the client can spawn the
  server locally. A hosted service that many different users and clients connect
  to over the internet must be a network server — and that immediately needs
  authentication, which stdio's "same machine = trusted" model doesn't provide.
- **Per-user identity and state.** Because there's no spawned local process tied
  to one user, the server needs OAuth to know *who* each request belongs to so it
  can isolate data (our per-username carts).
- **Decoupled deployment.** The server can run, scale, and be updated
  independently of any client. Clients just need the URL and a token, not the
  ability to execute the server binary.
- **Works with any client.** Claude Desktop, a custom LangChain agent, or the
  `demo_flow.py` driver can all talk to the same running instance — exactly what
  we demonstrated by tunneling the local server through ngrok and authenticating
  over OAuth.

## Activity 1: Extend the MCP Server

Add at least one new tool to the cat shop MCP server (e.g., `search_products`, `update_cart_quantity`, or `get_order_history`). Ensure the new tool integrates properly with the existing database and OAuth authentication. Demo the new tool through an MCP client and include it in your Loom video.

### Implementation

Two new tools were added to `app/tools.py`:

- **`search_products(query)`** — case-insensitive keyword search over product
  names and descriptions. Read-only; queries the existing `products` table.
- **`update_cart_quantity(product_id, quantity)`** — sets the exact quantity of
  an item already in the cart; a quantity of `0` or less removes it. Auth-scoped
  per user via `_get_username()` (resolved from the OAuth token), so it operates
  only on the caller's own cart and returns an error if the item isn't present.

Both are demonstrated end-to-end (real OAuth handshake over Streamable HTTP) by
`demo_flow.py` and the Activity 1 driver, which verify registration, search
results, quantity updates, removal-on-zero, and the not-in-cart error path.

## Advanced Activity: Build a Custom MCP Client

Build a custom MCP client that connects to the cat shop server over Streamable HTTP, authenticates via OAuth, and orchestrates a multi-step shopping flow (browse → add to cart → checkout). Compare the developer experience of MCP-based tool integration vs. traditional REST API calls.

Include your findings and a demo in your Loom video.
