"""
Unit tests for core security functions (passwords, JWT, E2E NaCl encryption).
"""
import pytest
from core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_key_pair,
    encrypt_message_e2e,
    decrypt_message_e2e,
)

def test_password_hashing():
    raw_password = "SecurePassword123!"
    hashed = hash_password(raw_password)
    assert hashed != raw_password
    assert verify_password(raw_password, hashed) is True
    assert verify_password("WrongPassword", hashed) is False

def test_jwt_tokens():
    data = {"sub": "user_123", "email": "test@example.com", "role": "member"}
    token = create_access_token(data)
    decoded = decode_token(token)
    assert decoded["sub"] == "user_123"
    assert decoded["email"] == "test@example.com"
    assert decoded["type"] == "access"

def test_e2e_encryption():
    alice_keys = generate_key_pair()
    bob_keys = generate_key_pair()

    message = "Confidential meeting notes for MicroproTeams"

    # Alice encrypts for Bob
    encrypted = encrypt_message_e2e(
        message,
        sender_private_b64=alice_keys["private_key"],
        recipient_public_b64=bob_keys["public_key"]
    )
    assert encrypted != message

    # Bob decrypts message from Alice
    decrypted = decrypt_message_e2e(
        encrypted,
        recipient_private_b64=bob_keys["private_key"],
        sender_public_b64=alice_keys["public_key"]
    )
    assert decrypted == message
