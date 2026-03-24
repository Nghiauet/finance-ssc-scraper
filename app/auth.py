import binascii
import secrets
from base64 import b64decode

from starlette.datastructures import Headers
from starlette.responses import PlainTextResponse
from starlette.types import ASGIApp, Receive, Scope, Send


# Paths that bypass authentication
PUBLIC_PATHS = frozenset({"/api/auth/login"})
# Path prefixes that require authentication (API, docs)
PROTECTED_PREFIXES = ("/api/", "/docs", "/openapi.json")


class BasicAuthMiddleware:
    def __init__(self, app: ASGIApp, username: str, password: str, realm: str = "SSC Finance"):
        if not username or not password:
            raise RuntimeError("BASIC_AUTH_USERNAME and BASIC_AUTH_PASSWORD must be set")

        self.app = app
        self.username = username
        self.password = password
        self.realm = realm

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] != "http" or scope["method"] == "OPTIONS":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")

        # Only protect API endpoints, docs, and openapi.json
        # All other paths (frontend SPA) are public — React handles auth client-side
        is_protected = any(path.startswith(p) for p in PROTECTED_PREFIXES)
        if not is_protected or path in PUBLIC_PATHS:
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        # Check Authorization header first, then fall back to ?token= query param
        # (needed for iframe/direct browser requests that can't set headers)
        auth_header = headers.get("authorization")
        if not auth_header:
            qs = scope.get("query_string", b"").decode("latin-1")
            for part in qs.split("&"):
                if part.startswith("token="):
                    auth_header = f"Bearer {part[6:]}"
                    break
        username = self._is_authorized(auth_header)
        if username:
            # Store authenticated username in scope state for downstream use
            if "state" not in scope:
                scope["state"] = {}
            scope["state"]["username"] = username
            await self.app(scope, receive, send)
            return

        response = PlainTextResponse(
            "Authentication required",
            status_code=401,
            headers={"WWW-Authenticate": f'Basic realm="{self.realm}"'},
        )
        await response(scope, receive, send)

    def _is_authorized(self, authorization: str | None) -> str | None:
        """Returns username if authorized, None otherwise."""
        if not authorization:
            return None

        scheme, _, credentials = authorization.partition(" ")
        if not credentials:
            return None

        scheme_lower = scheme.lower()

        # Bearer token (JWT)
        if scheme_lower == "bearer":
            return self._verify_bearer(credentials)

        # Basic auth
        if scheme_lower == "basic":
            return self._verify_basic(credentials)

        return None

    def _verify_basic(self, encoded_credentials: str) -> str | None:
        try:
            decoded = b64decode(encoded_credentials).decode("utf-8")
        except (binascii.Error, UnicodeDecodeError):
            return None

        username, separator, password = decoded.partition(":")
        if not separator:
            return None

        if secrets.compare_digest(username, self.username) and secrets.compare_digest(
            password, self.password
        ):
            return username
        return None

    def _verify_bearer(self, token: str) -> str | None:
        # Import here to avoid circular dependency at module load time
        from app.api.auth import verify_token

        return verify_token(token)
