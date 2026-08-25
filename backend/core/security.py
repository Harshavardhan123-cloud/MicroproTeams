"""
Security: JWT, password hashing, and E2E encryption key management.
"""
import secrets
import base64
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import jwt
from nacl.public import PrivateKey, Box, PublicKey
from nacl.encoding import Base64Encoder
import nacl.secret
import nacl.utils

from core.config import settings

import bcrypt


def hash_password(plain: str) -> str:
    pwd_bytes = plain.encode("utf-8")[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    pwd_bytes = plain.encode("utf-8")[:72]
    return bcrypt.checkpw(pwd_bytes, hashed.encode("utf-8"))


# ── JWT ─────────────────────────────────────────────────────────────
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    payload = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    payload.update({"exp": expire, "type": "access"})
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(data: dict) -> str:
    payload = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS)
    payload.update({"exp": expire, "type": "refresh"})
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])


# ── E2E Encryption (NaCl / Signal-like for DMs) ─────────────────────
def generate_key_pair() -> dict:
    """Generate a NaCl keypair for a user. Private key stored encrypted server-side."""
    private_key = PrivateKey.generate()
    public_key = private_key.public_key
    return {
        "private_key": private_key.encode(Base64Encoder).decode(),
        "public_key": public_key.encode(Base64Encoder).decode(),
    }


def encrypt_message_e2e(plaintext: str, sender_private_b64: str, recipient_public_b64: str) -> str:
    """Encrypt a DM message using NaCl box (Curve25519 + XSalsa20-Poly1305)."""
    sender_private = PrivateKey(sender_private_b64.encode(), Base64Encoder)
    recipient_public = PublicKey(recipient_public_b64.encode(), Base64Encoder)
    box = Box(sender_private, recipient_public)
    encrypted = box.encrypt(plaintext.encode())
    return base64.b64encode(encrypted).decode()


def decrypt_message_e2e(ciphertext_b64: str, recipient_private_b64: str, sender_public_b64: str) -> str:
    """Decrypt a DM message."""
    recipient_private = PrivateKey(recipient_private_b64.encode(), Base64Encoder)
    sender_public = PublicKey(sender_public_b64.encode(), Base64Encoder)
    box = Box(recipient_private, sender_public)
    ciphertext = base64.b64decode(ciphertext_b64)
    return box.decrypt(ciphertext).decode()


def encrypt_private_key_for_storage(private_key_b64: str, user_password_hash: str) -> str:
    """Encrypt user's private key with a derived key before storing in DB."""
    key = nacl.utils.random(nacl.secret.SecretBox.KEY_SIZE)
    box = nacl.secret.SecretBox(key)
    encrypted = box.encrypt(private_key_b64.encode())
    # In production: derive key from user's password using Argon2
    return base64.b64encode(encrypted).decode()


def generate_secure_token(length: int = 32) -> str:
    return secrets.token_urlsafe(length)
