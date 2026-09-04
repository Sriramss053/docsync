import os
import base64
import hashlib
from cryptography.fernet import Fernet


def _derive_key(secret: str) -> bytes:
    """Derive a valid 32-byte urlsafe base64 Fernet key from any secret string."""
    digest = hashlib.sha256(secret.encode()).digest()
    return base64.urlsafe_b64encode(digest)


def get_fernet():
    key = os.environ.get("ENCRYPTION_KEY") or os.environ.get("SECRET_KEY", "dev-secret")
    return Fernet(_derive_key(key))


def encrypt_text(plaintext: str) -> str:
    if plaintext is None:
        plaintext = ""
    f = get_fernet()
    return f.encrypt(plaintext.encode()).decode()


def decrypt_text(ciphertext: str) -> str:
    if not ciphertext:
        return ""
    f = get_fernet()
    try:
        return f.decrypt(ciphertext.encode()).decode()
    except Exception:
        # Not encrypted yet / corrupted - return as-is to avoid hard failure
        return ciphertext
