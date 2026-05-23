import re
import registry as reg


def _slugify(name: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')


def build_agent_card(classified: dict, business_name: str) -> dict:
    slug = _slugify(business_name)
    agent_id = f"pact://{slug}"

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
    }

    reg.register_agent(card)
    return card
