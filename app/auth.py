import binascii
import secrets
from base64 import b64decode

from starlette.datastructures import Headers
from starlette.responses import PlainTextResponse


class BasicAuthMiddleware:
    def __init__(self, app, username: str, password: str, realm: str = "SSC Finance"):
        if not username or not password:
            raise RuntimeError("BASIC_AUTH_USERNAME and BASIC_AUTH_PASSWORD must be set")

        self.app = app
        self.username = username
        self.password = password
        self.realm = realm

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] == "OPTIONS":
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        if self._is_authorized(headers.get("authorization")):
            await self.app(scope, receive, send)
            return

        response = PlainTextResponse(
            "Authentication required",
            status_code=401,
            headers={"WWW-Authenticate": f'Basic realm="{self.realm}"'},
        )
        await response(scope, receive, send)

    def _is_authorized(self, authorization: str | None) -> bool:
        if not authorization:
            return False

        scheme, _, encoded_credentials = authorization.partition(" ")
        if scheme.lower() != "basic" or not encoded_credentials:
            return False

        try:
            decoded = b64decode(encoded_credentials).decode("utf-8")
        except (binascii.Error, UnicodeDecodeError):
            return False

        username, separator, password = decoded.partition(":")
        if not separator:
            return False

        return secrets.compare_digest(username, self.username) and secrets.compare_digest(
            password,
            self.password,
        )
