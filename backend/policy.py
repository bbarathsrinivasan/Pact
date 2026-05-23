"""
Policy engine — two responsibilities:

1. check_policy(requested_fields, user_context)
   Parses user_context.md and classifies each requested field as:
   approved | encrypt | blocked
   Uses strict substring matching against the three policy sections.

2. scan_for_sensitive(message)
   Regex scan that fires BEFORE any AI model sees the text.
   Detects phone numbers, credit cards, SSNs, email addresses.
   If triggered, the message is blocked entirely.
"""

import re


# ── Section parser ────────────────────────────────────────────────────────────

_SECTION_MAP = {
    "never share":         "never",
    "always encrypt":      "encrypt",
    "ok to share":         "ok",
    "requires my approval":"confirm",
}


def _parse_context(user_context: str) -> tuple[list, list, list, bool]:
    """
    Parse user_context.md into policy lists.
    Returns (never_share, always_encrypt, ok_to_share, requires_confirm).
    """
    never_share    = []
    always_encrypt = []
    ok_to_share    = []
    requires_confirm = False

    section = None
    for raw_line in user_context.splitlines():
        line = raw_line.strip().lower()

        # Detect section headers
        for keyword, tag in _SECTION_MAP.items():
            if keyword in line:
                section = tag
                break
        else:
            # Bullet point under a section
            if section and (line.startswith("- ") or line.startswith("* ")):
                item = line[2:].strip()
                if section == "never":
                    never_share.append(item)
                elif section == "encrypt":
                    always_encrypt.append(item)
                elif section == "ok":
                    ok_to_share.append(item)
                elif section == "confirm":
                    requires_confirm = True

    return never_share, always_encrypt, ok_to_share, requires_confirm


def _field_matches(field: str, policy_items: list) -> bool:
    """True if field matches any policy item (substring both ways)."""
    f = field.lower()
    return any(p in f or f in p for p in policy_items)


def check_policy(requested_fields: list, user_context: str) -> dict:
    """
    Classify each requested field according to user_context.md policy.

    Returns:
        {
            "approved":              [...],  # OK to send through AI
            "encrypt":               [...],  # Must be encrypted, bypass AI
            "blocked":               [...],  # Never share
            "requires_confirmation": bool,
        }
    """
    never_share, always_encrypt, _ok, requires_confirm = _parse_context(user_context)

    approved = []
    encrypt  = []
    blocked  = []

    for field in requested_fields:
        if _field_matches(field, never_share):
            blocked.append(field)
        elif _field_matches(field, always_encrypt):
            encrypt.append(field)
        else:
            approved.append(field)

    return {
        "approved":              approved,
        "encrypt":               encrypt,
        "blocked":               blocked,
        "requires_confirmation": requires_confirm or bool(blocked) or bool(encrypt),
    }


# ── Sensitive input scanner ───────────────────────────────────────────────────
# Fires before ANY AI model sees the user's message.

_PHONE_RE = re.compile(
    r"\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b"
)
_CARD_RE = re.compile(
    r"\b(?:\d[ \-]?){13,16}\b"
)
_SSN_RE = re.compile(
    r"\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b"
)
_EMAIL_RE = re.compile(
    r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b"
)

_SCANNER_MAP = [
    ("phone_number",  _PHONE_RE),
    ("credit_card",   _CARD_RE),
    ("ssn",           _SSN_RE),
    ("email_address", _EMAIL_RE),
]


def scan_for_sensitive(message: str) -> dict:
    """
    Scan user message for PII before sending to any AI.

    Returns:
        {"clean": bool, "flagged_types": [...], "warning": str}
    """
    flagged = [label for label, pattern in _SCANNER_MAP if pattern.search(message)]

    if flagged:
        friendly = ", ".join(flagged).replace("_", " ")
        return {
            "clean":         False,
            "flagged_types": flagged,
            "warning": (
                f"⚠ Pact blocked your message — it appears to contain {friendly}. "
                "For your protection, this was NOT sent to any AI model. "
                "Please remove the sensitive data and rephrase your request.\n\n"
                "💡 To let Pact handle your private information securely, add it in the **Profile** tab — it'll be AES-256 encrypted and sent directly to the business, never through any AI."
            ),
        }

    return {"clean": True, "flagged_types": [], "warning": ""}
