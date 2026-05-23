"""
Builder agent — takes classified field data and generates the agent card.

Uses Gemini 3.5 Flash to:
  - Derive meaningful capabilities from the business description + services
  - Write a concise privacy note
  - Produce an enhanced agent description

The resulting card is stored in registry.json and served via A2A protocol.
"""

import json
import re
from datetime import datetime

from google import genai

import registry as reg
from config import GEMINI_API_KEY, GEMINI_MODEL

_BUILD_PROMPT = """\
You are a Builder agent in an AI agent network. Generate a rich agent card for this business.

Business name: {business_name}
Description:   {description}
AI-safe fields (pass through Gemini):  {ai_safe}
Encrypted fields (bypass AI entirely): {encrypted}
Products / services: {products}

Your job:
1. Derive 3-5 capability phrases that describe what this agent can do for customers.
   Use active verb-noun form: e.g. "process orders", "accept reservations", "schedule appointments"
2. Write one sentence explaining the privacy enforcement (what gets encrypted, what AI sees).
3. Write an enhanced 1-2 sentence agent description (cleaner than the raw scraped text).

Return ONLY valid JSON — no markdown, no explanation:
{{
  "capabilities": ["capability1", "capability2", "capability3"],
  "privacy_note": "one sentence",
  "agent_description": "1-2 sentences"
}}
"""

_DEFAULT_PRODUCTS_BY_TYPE = {
    "ecommerce": [
        {"name": "Standard Order",     "price": 0.0,   "description": "Place a new order"},
        {"name": "Express Delivery",   "price": 9.99,  "description": "Next-day shipping upgrade"},
        {"name": "Gift Wrapping",      "price": 4.99,  "description": "Add gift wrap and message"},
    ],
    "restaurant": [
        {"name": "Table Reservation",        "price": 0.0,   "description": "Reserve your table — no fee"},
        {"name": "Chef's Tasting Menu",       "price": 95.0,  "description": "6-course seasonal tasting menu"},
        {"name": "Private Dining Experience", "price": 150.0, "description": "Exclusive private room, min 8 guests"},
        {"name": "Wine Pairing",              "price": 45.0,  "description": "Sommelier-curated 4-glass flight"},
    ],
    "hotel": [
        {"name": "Standard Room",      "price": 189.0, "description": "Queen bed, city view"},
        {"name": "Deluxe Suite",       "price": 329.0, "description": "King bed, premium amenities"},
        {"name": "Breakfast Package",  "price": 25.0,  "description": "Full breakfast for two"},
    ],
    "salon": [
        {"name": "Haircut & Style",    "price": 85.0,  "description": "Cut and blow-dry"},
        {"name": "Color Treatment",    "price": 150.0, "description": "Full color application"},
        {"name": "Spa Package",        "price": 220.0, "description": "Hair, nails, and facial"},
    ],
    "default": [
        {"name": "Standard Service",   "price": 50.0,  "description": "Core service offering"},
        {"name": "Premium Package",    "price": 120.0, "description": "Full-service experience"},
    ],
}


def _slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def _infer_type(caps_text: str, ai_safe: list) -> str:
    """Infer business type from capabilities and AI-safe field names."""
    text = caps_text.lower()
    safe = " ".join(ai_safe).lower()
    if any(w in text or w in safe for w in ("product", "quantity", "delivery", "order", "ship", "sku", "cart")):
        return "ecommerce"
    if any(w in text for w in ("restaurant", "dining", "reservation", "cuisine", "food")):
        return "restaurant"
    if any(w in text for w in ("hotel", "room", "accommodation", "stay")):
        return "hotel"
    if any(w in text for w in ("salon", "hair", "spa", "beauty", "nail")):
        return "salon"
    return "default"


async def build_agent_card(classified: dict, business_name: str) -> dict:
    """
    Call Gemini 3.5 Flash to generate capabilities + privacy note,
    then assemble and register the full agent card.
    """
    slug     = _slugify(business_name)
    agent_id = f"pact://{slug}"

    ai_safe   = classified.get("ai_safe", [])
    encrypted = classified.get("encrypted", [])
    products  = classified.get("products") or []

    # ── Call Gemini (Builder agent) ────────────────────────────────────────
    gemini_caps   = []
    privacy_note  = ""
    enhanced_desc = classified.get("description", "")

    try:
        client = genai.Client(api_key=GEMINI_API_KEY)
        prompt = _BUILD_PROMPT.format(
            business_name=business_name,
            description=classified.get("description", ""),
            ai_safe=ai_safe,
            encrypted=encrypted,
            products=[p.get("name") for p in products],
        )
        response = await client.aio.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
        )
        raw = response.text.strip()
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
        m   = re.search(r"\{[\s\S]*\}", raw)
        result = json.loads(m.group() if m else raw)

        gemini_caps   = result.get("capabilities", [])
        privacy_note  = result.get("privacy_note", "")
        enhanced_desc = result.get("agent_description", enhanced_desc)
        print(f"[builder] ✓ Gemini generated {len(gemini_caps)} capabilities for '{business_name}'")

    except Exception as exc:
        print(f"[builder] Gemini call failed ({exc}); deriving capabilities from services")
        gemini_caps = classified.get("capabilities") or ["accept reservations", "process orders"]

    # Fall back to scraper-derived capabilities if Gemini returned none
    capabilities = gemini_caps or classified.get("capabilities", [])

    # Infer business type to pick default products if scraper found none
    btype    = _infer_type(" ".join(capabilities), ai_safe)
    products = products or _DEFAULT_PRODUCTS_BY_TYPE.get(btype, _DEFAULT_PRODUCTS_BY_TYPE["default"])

    card = {
        "id":          agent_id,
        "type":        "business",
        "name":        business_name,
        "description": enhanced_desc,
        "capabilities":capabilities,
        "privacy_note":privacy_note,
        "ai_safe_schema": ai_safe,
        "encrypted_schema": {
            "fields":   encrypted,
            # Per-business endpoint template — encrypted PII is posted here directly,
            # bypassing every AI model. The slug scopes it to this business.
            "endpoint": f"/secure/submit/{slug}",
            "method":   "POST",
            "encryption": "AES-256-Fernet",
        },
        "products":      products,
        "registered_at": datetime.now().isoformat(),
    }

    reg.register_agent(card)
    return card
