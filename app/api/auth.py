import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from jose import JWTError, jwt
from pydantic import BaseModel
from starlette.datastructures import Headers
from starlette.requests import Request

from app.config import settings

router = APIRouter(prefix="/auth", tags=["auth"])

ALGORITHM = "HS256"


def _get_secret_key() -> str:
    if settings.jwt_secret_key:
        return settings.jwt_secret_key
    # Fallback: derive from auth password (stable across restarts if password unchanged)
    return f"ssc-jwt-{settings.basic_auth_password}"


def create_access_token(username: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=settings.jwt_expiry_hours)
    payload = {"sub": username, "exp": expire}
    return jwt.encode(payload, _get_secret_key(), algorithm=ALGORITHM)


def verify_token(token: str) -> str | None:
    """Returns username if valid, None otherwise."""
    try:
        payload = jwt.decode(token, _get_secret_key(), algorithms=[ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


@router.post("/login", response_model=LoginResponse)
def login(data: LoginRequest):
    if not (
        secrets.compare_digest(data.username, settings.basic_auth_username)
        and secrets.compare_digest(data.password, settings.basic_auth_password)
    ):
        raise HTTPException(401, "Invalid credentials")

    token = create_access_token(data.username)
    return LoginResponse(
        access_token=token,
        expires_in=settings.jwt_expiry_hours * 3600,
    )


@router.get("/me")
def get_me(request: Request):
    # Username is set by the auth middleware on the request state
    return {"username": getattr(request.state, "username", settings.basic_auth_username)}
