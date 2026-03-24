import base64
import hashlib

from cryptography.fernet import Fernet

from app.config import settings


def _derive_key() -> bytes:
    """Derive a Fernet key from the JWT secret or auth password."""
    secret = settings.jwt_secret_key or settings.basic_auth_password
    digest = hashlib.sha256(secret.encode()).digest()
    return base64.urlsafe_b64encode(digest)


_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        _fernet = Fernet(_derive_key())
    return _fernet


def encrypt_api_key(plaintext: str) -> str:
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt_api_key(ciphertext: str) -> str:
    return _get_fernet().decrypt(ciphertext.encode()).decode()
