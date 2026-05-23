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


def _normalize_name(name: str) -> str:
    return "".join(c for c in name.lower() if c.isalnum())


def delete_agent(agent_id: str) -> bool:
    """Remove an agent from the registry. Returns True if it existed."""
    registry = load_registry()
    if agent_id not in registry:
        return False
    del registry[agent_id]
    save_registry(registry)
    return True


def find_agent_by_name(name: str) -> dict | None:
    """Fuzzy match a business name against registered agents."""
    if not name or not name.strip():
        return None
    needle = _normalize_name(name)
    if not needle:
        return None

    best: dict | None = None
    best_score = 0
    for agent in load_registry().values():
        aname = agent.get("name", "")
        hay = _normalize_name(aname)
        if not hay:
            continue
        if needle == hay or needle in hay or hay in needle:
            score = len(hay) if needle in hay else len(needle)
            if score > best_score:
                best_score = score
                best = agent
    return best
