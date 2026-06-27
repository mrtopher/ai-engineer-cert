"""Autonomous end-to-end exercise of the Cat Shop MCP server over OAuth.

Drives the real Streamable HTTP MCP transport with a real OAuth handshake,
auto-completing the browser login step so no human is required. Useful as a
smoke test that the full browse -> add -> remove -> checkout loop works.

Usage:
    uv run demo_flow.py                              # localhost:8000
    uv run demo_flow.py --server-url https://xxxx.ngrok-free.app
    MCP_SERVER_URL=https://xxxx.ngrok-free.app uv run demo_flow.py

The server URL must match the server's ISSUER_URL, otherwise the OAuth
protected-resource check will (correctly) reject the connection.
"""
import argparse
import asyncio
import json
import os
import sys

import httpx
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client
from mcp.client.auth import OAuthClientProvider
from mcp.shared.auth import OAuthClientMetadata
from pydantic import AnyUrl

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from client import OAuthCallbackServer, InMemoryTokenStorage  # noqa: E402

USERNAME = "demo_user"


def show(title, result):
    text = result.content[0].text if result.content else "(empty)"
    try:
        text = json.dumps(json.loads(text), indent=2)
    except Exception:
        pass
    print(f"\n=== {title} ===\n{text}")


async def run(server_url: str) -> None:
    server_url = server_url.rstrip("/")
    # ngrok's free tier shows an interstitial to browser-like requests; skip it.
    extra_headers = (
        {"ngrok-skip-browser-warning": "true"} if "ngrok" in server_url else {}
    )

    async with OAuthCallbackServer(port=8765) as cb:
        async def redirect_handler(auth_url: str) -> None:
            # Walk the same redirect chain a browser would, headlessly:
            # /authorize -> /login (form) -> POST username -> /callback
            async with httpx.AsyncClient(
                follow_redirects=True, headers=extra_headers
            ) as http:
                resp = await http.get(auth_url)          # -> /login form
                login_url = str(resp.url)                # .../login?req=...
                await http.post(login_url, data={"username": USERNAME})

        oauth = OAuthClientProvider(
            server_url=server_url,
            client_metadata=OAuthClientMetadata(
                client_name="Cat Shop Demo Driver",
                redirect_uris=[AnyUrl(cb.callback_url)],
                grant_types=["authorization_code", "refresh_token"],
                response_types=["code"],
                scope="read write",
            ),
            storage=InMemoryTokenStorage(),
            redirect_handler=redirect_handler,
            callback_handler=cb.wait_for_callback,
        )

        async with streamablehttp_client(f"{server_url}/mcp", auth=oauth) as (read, write, _):
            async with ClientSession(read, write) as session:
                await session.initialize()
                print(f"Authenticated as: {USERNAME}")

                tools = await session.list_tools()
                print("Tools:", ", ".join(t.name for t in tools.tools))

                show("browse: list_products(category='toys')",
                     await session.call_tool("list_products", {"category": "toys"}))
                show("add_to_cart(product_id=1, quantity=2)",
                     await session.call_tool("add_to_cart", {"product_id": 1, "quantity": 2}))
                show("add_to_cart(product_id=4)",
                     await session.call_tool("add_to_cart", {"product_id": 4}))
                show("view_cart()",
                     await session.call_tool("view_cart", {}))
                show("remove_from_cart(product_id=4)",
                     await session.call_tool("remove_from_cart", {"product_id": 4}))
                show("checkout()",
                     await session.call_tool("checkout", {}))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Autonomous end-to-end OAuth + MCP smoke test for the Cat Shop server."
    )
    parser.add_argument(
        "--server-url",
        default=os.getenv("MCP_SERVER_URL", "http://localhost:8000"),
        help="Base URL of the MCP server (default: %(default)s).",
    )
    return parser.parse_args()


if __name__ == "__main__":
    asyncio.run(run(parse_args().server_url))
