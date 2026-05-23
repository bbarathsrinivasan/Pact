import os
from dotenv import load_dotenv
from pathlib import Path

load_dotenv()

BASE_DIR = Path(__file__).parent

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY", "").encode() if os.getenv("ENCRYPTION_KEY") else None
BUSINESS_ENCRYPTION_KEY = os.getenv("BUSINESS_ENCRYPTION_KEY", "").encode() if os.getenv("BUSINESS_ENCRYPTION_KEY") else None

REGISTRY_PATH = BASE_DIR / "data" / "registry.json"
USER_CONTEXT_PATH = BASE_DIR / "data" / "user_context.md"
ENCRYPTED_STORE_PATH = BASE_DIR / "data" / "encrypted_store.json"

GEMINI_MODEL = "gemini-2.0-flash"
