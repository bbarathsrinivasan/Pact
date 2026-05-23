import re


def check_policy(requested_fields: list, user_context: str) -> dict:
    blocked = []
    encrypt = []
    approved = []

    lines = user_context.lower().splitlines()

    never_share = []
    always_encrypt = []
    ok_to_share = []
    requires_confirm = False

    section = None
    for line in lines:
        line = line.strip()
        if "never share" in line:
            section = "never"
        elif "always encrypt" in line:
            section = "encrypt"
        elif "ok to share" in line:
            section = "ok"
        elif "requires my approval" in line:
            section = "confirm"
        elif line.startswith("- ") and section:
            item = line[2:].strip()
            if section == "never":
                never_share.append(item)
            elif section == "encrypt":
                always_encrypt.append(item)
            elif section == "ok":
                ok_to_share.append(item)
            elif section == "confirm":
                requires_confirm = True

    for field in requested_fields:
        field_lower = field.lower()
        if any(b in field_lower or field_lower in b for b in never_share):
            blocked.append(field)
        elif any(e in field_lower or field_lower in e for e in always_encrypt):
            encrypt.append(field)
        else:
            approved.append(field)

    return {
        "approved": approved,
        "encrypt": encrypt,
        "blocked": blocked,
        "requires_confirmation": requires_confirm or bool(blocked) or bool(encrypt),
    }


_PHONE_RE = re.compile(r'\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b')
_CARD_RE = re.compile(r'\b(?:\d[ -]?){13,16}\b')
_SSN_RE = re.compile(r'\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b')
_EMAIL_RE = re.compile(r'\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b')


def scan_for_sensitive(message: str) -> dict:
    flagged = []
    if _PHONE_RE.search(message):
        flagged.append("phone_number")
    if _CARD_RE.search(message):
        flagged.append("credit_card")
    if _SSN_RE.search(message):
        flagged.append("ssn")
    if _EMAIL_RE.search(message):
        flagged.append("email_address")

    if flagged:
        return {
            "clean": False,
            "flagged_types": flagged,
            "warning": (
                f"Your message appears to contain sensitive data: {', '.join(flagged)}. "
                "Pact blocked this from being sent to any AI. Please remove it and try again."
            ),
        }
    return {"clean": True, "flagged_types": [], "warning": ""}
