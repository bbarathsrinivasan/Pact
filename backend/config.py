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

# Gemini 3.5 Flash — used by Creator agent, Builder agent, Business assistant
GEMINI_MODEL = "gemini-2.5-flash-preview-05-20"

# Antigravity — web-browsing scraper model used exclusively by the Scraper agent
SCRAPER_MODEL = "antigravity-preview-05-2026"
