import re
from datetime import datetime
import registry as reg


def _slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


_DEFAULT_PRODUCTS_BY_TYPE = {
    "restaurant": [
        {"name": "Table Reservation", "price": 0.0, "description": "Reserve a table for dining"},
        {"name": "Private Dining Experience", "price": 150.0, "description": "Exclusive private room"},
        {"name": "Tasting Menu", "price": 95.0, "description": "Chef's seasonal tasting menu"},
        {"name": "Wine Pairing", "price": 45.0, "description": "Sommelier-curated wine flight"},
    ],
    "hotel": [
        {"name": "Standard Room", "price": 189.0, "description": "Queen bed, city view"},
        {"name": "Deluxe Suite", "price": 329.0, "description": "King bed, premium amenities"},
        {"name": "Breakfast Package", "price": 25.0, "description": "Full breakfast for two"},
    ],
    "salon": [
        {"name": "Haircut & Style", "price": 85.0, "description": "Cut and blow-dry"},
        {"name": "Color Treatment", "price": 150.0, "description": "Full color application"},
        {"name": "Spa Package", "price": 220.0, "description": "Hair, nails, and facial"},
    ],
    "default": [
        {"name": "Standard Service", "price": 50.0, "description": "Core service offering"},
        {"name": "Premium Package", "price": 120.0, "description": "Full-service experience"},
    ],
}


def build_agent_card(classified: dict, business_name: str) -> dict:
    slug = _slugify(business_name)
    agent_id = f"pact://{slug}"

    # Infer business type for default products
    caps = " ".join(classified.get("capabilities", [])).lower()
    if "restaurant" in caps or "dining" in caps or "reservation" in caps:
        btype = "restaurant"
    elif "hotel" in caps or "room" in caps or "accommodation" in caps:
        btype = "hotel"
    elif "salon" in caps or "hair" in caps or "spa" in caps:
        btype = "salon"
    else:
        btype = "default"

    products = classified.get("products") or _DEFAULT_PRODUCTS_BY_TYPE[btype]

    card = {
        "id": agent_id,
        "type": "business",
        "name": business_name,
        "description": classified.get("description", ""),
        "capabilities": classified.get("capabilities", []),
        "ai_safe_schema": classified.get("ai_safe", []),
        "encrypted_schema": {
            "fields": classified.get("encrypted", []),
            "endpoint": "/secure/submit",
        },
        "products": products,
        "registered_at": datetime.now().isoformat(),
    }

    reg.register_agent(card)
    return card
