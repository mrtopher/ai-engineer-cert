import os

from mcp.server.auth.settings import (
    AuthSettings,
    ClientRegistrationOptions,
    RevocationOptions,
)
from mcp.server.fastmcp import FastMCP

from .oauth import CatShopOAuthProvider

PORT = int(os.environ.get("PORT", "8000"))
ISSUER_URL = os.environ.get("ISSUER_URL", f"http://localhost:{PORT}")

oauth_provider = CatShopOAuthProvider(issuer_url=ISSUER_URL)

mcp = FastMCP(
    "Cat Shop",
    auth_server_provider=oauth_provider,
    auth=AuthSettings(
        issuer_url=ISSUER_URL,
        resource_server_url=ISSUER_URL,
        client_registration_options=ClientRegistrationOptions(
            enabled=True,
            valid_scopes=["read", "write"],
            default_scopes=["read", "write"],
        ),
        revocation_options=RevocationOptions(enabled=True),
    ),
    host="0.0.0.0",
    port=PORT,
)
