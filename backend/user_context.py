"""
User context helpers — read profile/preferences from user_context.md and
detect missing data before bookings or profile questions.
"""

from __future__ import annotations

import re

# Regex mirrors personal/agent.py field extraction
_FIELD_PATTERNS = {
    "full_name":   re.compile(r"^Name:\s*(.+)$", re.IGNORECASE | re.MULTILINE),
    "email":       re.compile(r"^Email:\s*(\S+@\S+\.\S+)$", re.IGNORECASE | re.MULTILINE),
    "phone":       re.compile(r"^Phone:\s*([\d\s\-\+\(\)\.]{7,})$", re.IGNORECASE | re.MULTILINE),
    "address":     re.compile(r"^Address:\s*(.+)$", re.IGNORECASE | re.MULTILINE),
    "card_number": re.compile(r"^Card:\s*([\d\s\-]{13,19})$", re.IGNORECASE | re.MULTILINE),
    "cvv":         re.compile(r"^CVV:\s*(\d{3,4})$", re.IGNORECASE | re.MULTILINE),
    "card_expiry": re.compile(r"^Expiry:\s*([\d/]+)$", re.IGNORECASE | re.MULTILINE),
    "size":        re.compile(r"^Shoe size:\s*(.+)$", re.IGNORECASE | re.MULTILINE),
    "budget_range":re.compile(r"^Budget:\s*(.+)$", re.IGNORECASE | re.MULTILINE),
}

_PREFERENCE_PATTERNS = {
    "dietary_needs":     re.compile(r"dietary:\s*(.+)$", re.IGNORECASE | re.MULTILINE),
    "budget_range":      re.compile(r"budget:\s*(.+)$", re.IGNORECASE | re.MULTILINE),
    "location_general":  re.compile(r"^Location:\s*(.+)$", re.IGNORECASE | re.MULTILINE),
    "cuisine_preference": re.compile(r"cuisine:\s*(.+)$", re.IGNORECASE | re.MULTILINE),
    "size":              re.compile(r"shoe size:\s*(.+)$", re.IGNORECASE | re.MULTILINE),
}

_FIELD_LABELS = {
    "full_name":          "full name",
    "email":              "email address",
    "phone":              "phone number",
    "address":            "address",
    "card_number":        "payment card",
    "cvv":                "card CVV",
    "card_expiry":        "card expiry",
    "date":               "preferred date for the booking",
    "time":               "preferred time",
    "party_size":         "party size (how many people)",
    "product":            "which product you want",
    "quantity":           "quantity",
    "delivery_speed":     "delivery speed",
    "dietary_needs":      "dietary requirements",
    "special_requests":   "any special requests",
    "size":               "shoe size",
    "budget_range":       "budget",
}

# AI-safe keys in intent dict
_INTENT_KEYS = {
    "date": "date",
    "time": "time",
    "party_size": "party_size",
    "dietary_needs": "dietary_needs",
    "cuisine_preference": "cuisine_preference",
    "budget_range": "budget_range",
    "special_requests": "special_requests",
    "product": "product",
    "quantity": "quantity",
    "delivery_speed": "delivery_speed",
    "color": "color",
    "size": "size",
    "notes": "notes",
}

_PROFILE_QUESTION_RE = re.compile(
    r"\b("
    r"my name|my email|my phone|my mobile|my address|my dietary|my diet|my budget|"
    r"my (?:shoe )?size|my preference|my location|what(?:'s| is) my|do i have|"
    r"what are my preferences|what do you know about me|"
    r"what(?:'s| is) in my profile|what do you have on me"
    r")\b",
    re.IGNORECASE,
)

# Patterns for extracting profile updates from conversational statements
_INLINE_UPDATE_PATTERNS = {
    "email":       re.compile(r"\b(?:my email(?:\s+address)? is|email is|email:)\s*(\S+@\S+\.\S+)", re.I),
    "phone":       re.compile(r"\b(?:my (?:phone|mobile|cell|number)(?:\s+number)? is|phone is|phone:|mobile:)\s*([\d\s\-\+\(\)\.]{7,30})", re.I),
    "full_name":   re.compile(r"\b(?:my name is|name is|i(?:'m| am))\s+([A-Za-z][a-zA-Z\s]{1,40}?)(?:\.|,|$)", re.I | re.MULTILINE),
    "address":     re.compile(r"\b(?:my address is|i live at|my home is at|i(?:'m| am) at)\s*(.+?)(?:\.|$)", re.I | re.MULTILINE),
    "size":        re.compile(r"\b(?:my (?:shoe )?size is|shoe size[:\s]+|size[:\s]+)\s*([\d.]+(?:\.5)?(?:\s*(?:M|W|EU|UK))?)\b", re.I),
    "budget_range":re.compile(r"\b(?:my budget is|budget[:\s]+|under|less than|around)\s*\$?([\d,]+(?:\s*[-–]\s*\$?[\d,]+)?(?:\s*(?:dollars?|bucks?|usd))?)\b", re.I),
    "party_size":  re.compile(r"\b(?:party of|table for|group of|for)\s+(\d+)\b", re.I),
    "date":        re.compile(r"\b(?:on|this|next)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|tonight|today|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\b", re.I),
    "color":       re.compile(r"\b(?:i(?:'d| would) (?:like|prefer|want)|in|color[:\s]+)\s+(black|white|red|blue|green|grey|gray|navy|brown|pink|yellow|purple|orange|beige|cream)\b", re.I),
}


def field_label(field: str) -> str:
    return _FIELD_LABELS.get(field, field.replace("_", " "))


def get_field_value(
    context: str,
    field: str,
    overrides: dict | None = None,
) -> str | None:
    """Return a field value from context file, session overrides, or preferences."""
    overrides = overrides or {}
    if field in overrides and str(overrides[field]).strip():
        return str(overrides[field]).strip()

    pattern = _FIELD_PATTERNS.get(field) or _PREFERENCE_PATTERNS.get(field)
    if pattern and context:
        m = pattern.search(context)
        if m:
            return m.group(1).strip()
    return None


def has_field(context: str, field: str, overrides: dict | None = None) -> bool:
    return bool(get_field_value(context, field, overrides))


def extract_overrides_from_message(message: str) -> dict:
    """Pull profile updates the user typed in chat (this session only)."""
    found: dict = {}
    for field, pat in _INLINE_UPDATE_PATTERNS.items():
        m = pat.search(message)
        if m:
            val = m.group(1).strip()
            if val:
                found[field] = val
    return found


def merge_overrides(memory: dict, message: str) -> dict:
    overrides = dict(memory.get("context_overrides") or {})
    overrides.update(extract_overrides_from_message(message))
    memory["context_overrides"] = overrides
    return overrides


def detect_inline_profile_update(message: str) -> dict:
    """
    Returns extracted fields if the message is (only or primarily) providing profile info.
    Used to acknowledge updates without triggering a booking flow.
    """
    found = extract_overrides_from_message(message)
    if not found:
        return {}
    # Only treat as pure update if not a booking request
    booking_signals = re.search(
        r"\b(?:book|reserve|order|buy|purchase|make a (?:booking|reservation))\b",
        message, re.I
    )
    if booking_signals:
        return {}  # Has booking intent too — let normal flow handle it
    return found


def enrich_intent_from_context(intent: dict, context: str, overrides: dict) -> dict:
    """Fill intent gaps from stored profile/preferences."""
    enriched = dict(intent)
    for field, key in _INTENT_KEYS.items():
        if enriched.get(key) is None:
            val = get_field_value(context, field, overrides)
            if val:
                enriched[key] = val
    return enriched


def find_missing_for_booking(
    context: str,
    intent: dict,
    encrypt_fields: list[str],
    ai_safe_fields: list[str],
    overrides: dict | None = None,
) -> list[str]:
    """
    Returns list of missing required fields.
    Encrypted fields (PII) are NEVER blocking — they are collected inline at confirmation.
    Only AI-safe fields that are truly required block the flow.
    """
    overrides = overrides or {}
    missing: list[str] = []

    # Never block on encrypted fields — collected in PolicyCard confirmation
    # Only check AI-safe required fields
    business_type = (intent.get("business_type") or "restaurant").lower()
    is_ecommerce = business_type in ("ecommerce", "store")

    # For e-commerce: product is required (but handled by catalog flow)
    # For reservations: don't block — proceed with whatever date/time we have
    # → Return empty to never block on missing data
    return missing


def format_missing_prompt(missing: list[str], agent_name: str | None = None) -> str:
    items = "\n".join(f"- **{m}**" for m in missing)
    where = f" at **{agent_name}**" if agent_name else ""
    return (
        f"Before I can start a booking{where}, I checked your **Profile** and our chat — "
        f"I'm still missing:\n{items}\n\n"
        "Please add these in the **Profile** tab (left sidebar), or tell me here "
        "(e.g. \"my email is you@example.com\", \"party of 4 on Friday\")."
    )


def is_profile_question(message: str) -> bool:
    return bool(_PROFILE_QUESTION_RE.search(message))


def answer_profile_question(context: str, message: str, overrides: dict | None = None) -> str | None:
    """
    Answer questions about the user's stored profile from context only.
    Returns None if Gemini should handle (not a profile question).
    """
    if not is_profile_question(message):
        return None

    overrides = overrides or {}
    msg = message.lower()

    checks = [
        ("name",       "full_name",          "name"),
        ("email",      "email",              "email"),
        ("phone",      "phone",              "phone number"),
        ("mobile",     "phone",              "phone number"),
        ("address",    "address",            "address"),
        ("diet",       "dietary_needs",      "dietary preference"),
        ("budget",     "budget_range",       "budget"),
        ("location",   "location_general",   "location"),
        ("preference", "cuisine_preference", "cuisine preference"),
        ("size",       "size",               "shoe size"),
    ]

    for keyword, field, label in checks:
        if keyword in msg:
            val = get_field_value(context, field, overrides)
            if val:
                # Check if the value was just provided in this message
                just_set = extract_overrides_from_message(message)
                if field in just_set:
                    return f"Got it! I've noted your {label} as **{val}** for this session. 🙌"
                return f"From your profile, your {label} is **{val}**."
            # Check if they're providing it right now
            just_set = extract_overrides_from_message(message)
            if field in just_set:
                return f"Got it! I've saved your {label} as **{just_set[field]}** for this session. 🙌"
            return (
                f"I don't have your {label} saved yet. "
                f"You can add it in the **Profile** tab, or just tell me here "
                f"(e.g. \"{'My email is you@example.com' if field == 'email' else 'My name is Alex'}\")."
            )

    # Generic "what do you know about me"
    if re.search(r"what do you know|what(?:'s| is) in my profile|what do you have", msg):
        lines = []
        for field in ("full_name", "email", "phone", "size", "budget_range", "dietary_needs", "location_general"):
            val = get_field_value(context, field, overrides)
            if val:
                lines.append(f"- **{field_label(field)}**: {val}")
        if lines:
            return "Here's what I have for you:\n" + "\n".join(lines)
        return (
            "Your profile is mostly empty right now. Open the **Profile** tab to add "
            "your name, email, shoe size, budget, and preferences — I'll use these for every booking!"
        )

    return None
