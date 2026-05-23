import json
from cryptography.fernet import Fernet


def generate_key() -> bytes:
    return Fernet.generate_key()


def _fernet(key: bytes) -> Fernet:
    return Fernet(key)


def encrypt(data: str, key: bytes) -> str:
    return _fernet(key).encrypt(data.encode()).decode()


def decrypt(data: str, key: bytes) -> str:
    return _fernet(key).decrypt(data.encode()).decode()


def encrypt_fields(fields: dict, key: bytes) -> str:
    return encrypt(json.dumps(fields), key)


def decrypt_fields(encrypted: str, key: bytes) -> dict:
    return json.loads(decrypt(encrypted, key))
