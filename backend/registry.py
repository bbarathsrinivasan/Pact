import json
from config import REGISTRY_PATH


def load_registry() -> dict:
    if not REGISTRY_PATH.exists():
        return {}
    with open(REGISTRY_PATH) as f:
        return json.load(f)


def save_registry(data: dict) -> None:
    with open(REGISTRY_PATH, "w") as f:
        json.dump(data, f, indent=2)


def register_agent(agent_card: dict) -> None:
    registry = load_registry()
    registry[agent_card["id"]] = agent_card
    save_registry(registry)


def get_agent(agent_id: str) -> dict | None:
    return load_registry().get(agent_id)


def get_all_agents() -> dict:
    return load_registry()


def find_agents_by_capability(capability: str) -> list[dict]:
    registry = load_registry()
    return [
        card for card in registry.values()
        if any(capability.lower() in cap.lower() for cap in card.get("capabilities", []))
    ]
