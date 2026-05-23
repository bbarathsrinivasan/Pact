"""
Field classifier — determines which customer fields are AI-safe vs. must be encrypted.

AI-safe  (non-PII, safe through Gemini):
  date, time, party_size, dietary_needs, cuisine_preference,
  special_requests, location_general, budget_range,
  product, quantity, delivery_speed, color, size, notes   ← e-commerce

Encrypted (PII, bypass AI, AES-256 direct to /secure/submit):
  full_name, email, phone, address, payment_method, ssn, dob,
  card_number, cvv, card_expiry                           ← e-commerce

Uses Gemini 3.5 Flash for context-aware classification.
"""

import json
import re

from google import genai

from config import GEMINI_API_KEY, GEMINI_MODEL

_PROMPT = """\
You are a privacy classifier for AI agent systems.

Business: {business_name}
Description: {description}
Services offered: {services}
Customer fields required: {fields}

Classify EACH customer field into exactly one of:
  - ai_safe   → safe for any AI model to see (scheduling, preferences, non-PII)
  - encrypted → must NEVER pass through AI; must be AES-encrypted and sent direct (PII, contact, payment)

CANONICAL FIELD NAMES — you MUST use these exact names (no variations):

  ai_safe allowed (non-PII, safe through AI):
    Service/booking: date, time, party_size, dietary_needs, cuisine_preference,
                     special_requests, seating_preference, budget_range, location_general
    E-commerce:      product, quantity, delivery_speed, color, size, notes

  encrypted allowed (PII, must bypass AI entirely):
    Identity:  full_name, email, phone, address
    Payment:   payment_method, card_number, cvv, card_expiry
    Other:     ssn, dob

Map any synonym to the canonical name:
  num_guests/guests/covers → party_size
  reservation_date/booking_date/delivery_date → date
  booking_time/arrival_time → time
  dietary_restrictions/allergies → dietary_needs
  name/customer_name/first_name/last_name → full_name
  mobile/cell/telephone → phone
  home_address/street_address/shipping_address → address
  credit_card/payment/card/card_number_input → card_number
  security_code/cvc → cvv
  expiry/expiration → card_expiry
  credit_card_full/payment_details → payment_method
  item/sku/product_name → product
  qty/amount/count → quantity
  shipping_speed/fulfillment_speed → delivery_speed

Also derive a capabilities list (2-5 short phrases) from the services.

Return ONLY valid JSON — no markdown, no explanation:
{{
  "ai_safe": ["date", "time", "party_size"],
  "encrypted": ["full_name", "email", "phone"],
  "capabilities": ["capability1", "capability2"],
  "privacy_note": "one sentence explaining the main classification decision"
}}
"""


async def classify_fields(business_data: dict) -> dict:
    """
    Classify customer fields into ai_safe vs encrypted.
    Passes products through unchanged from scraper output.
    """
    fields   = business_data.get("customer_fields", [])
    services = business_data.get("services", [])

    prompt = _PROMPT.format(
        business_name=business_data.get("business_name", "Unknown"),
        description=business_data.get("description", ""),
        services=services,
        fields=fields,
    )

    try:
        client = genai.Client(api_key=GEMINI_API_KEY)
        response = await client.aio.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
        )
        raw = response.text.strip()
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)

        match = re.search(r"\{[\s\S]*\}", raw)
        result = json.loads(match.group() if match else raw)

    except Exception as exc:
        print(f"[creator] Gemini classification failed ({exc}); using heuristics")
        result = _heuristic_classify(fields, services)

    # Normalize field names regardless of what Gemini returned
    result["ai_safe"]   = _normalize_fields(result.get("ai_safe", []))
    result["encrypted"] = _normalize_fields(result.get("encrypted", []))

    # Always carry through metadata and products from scraper
    result["business_name"] = business_data.get("business_name", "Unknown Business")
    result["description"]   = business_data.get("description", "")
    result["products"]      = business_data.get("products", [])
    return result


_CANONICAL_AI_SAFE = {
    # Service / restaurant
    "date", "time", "party_size", "dietary_needs", "cuisine_preference",
    "special_requests", "seating_preference", "budget_range", "location_general",
    # E-commerce
    "product", "quantity", "delivery_speed", "color", "size", "notes",
}

_CANONICAL_ENCRYPTED = {
    # Identity
    "full_name", "email", "phone", "address",
    # Payment
    "payment_method", "card_number", "cvv", "card_expiry",
    # Other PII
    "ssn", "dob",
}

_SYNONYM_MAP = {
    # Booking
    "num_guests": "party_size", "guests": "party_size", "covers": "party_size",
    "reservation_date": "date", "booking_date": "date", "delivery_date": "date",
    "booking_time": "time", "arrival_time": "time",
    "dietary_restrictions": "dietary_needs", "allergies": "dietary_needs",
    # Identity
    "name": "full_name", "customer_name": "full_name",
    "first_name": "full_name", "last_name": "full_name",
    "mobile": "phone", "cell": "phone", "telephone": "phone",
    "home_address": "address", "street_address": "address", "shipping_address": "address",
    # Payment
    "credit_card": "card_number", "card": "card_number", "card_number_input": "card_number",
    "security_code": "cvv", "cvc": "cvv",
    "expiry": "card_expiry", "expiration": "card_expiry",
    "payment": "payment_method", "credit_card_full": "payment_method",
    # E-commerce
    "item": "product", "sku": "product", "product_name": "product",
    "qty": "quantity", "amount": "quantity", "count": "quantity",
    "shipping_speed": "delivery_speed", "fulfillment_speed": "delivery_speed",
}


def _normalize_fields(fields: list) -> list:
    """Map synonym field names to canonical names."""
    normalized = []
    seen = set()
    for f in fields:
        canonical = _SYNONYM_MAP.get(f.lower(), f.lower())
        if canonical not in seen:
            normalized.append(canonical)
            seen.add(canonical)
    return normalized


def _heuristic_classify(fields: list, services: list) -> dict:
    """Fallback rule-based classifier using canonical field names."""
    normalized = _normalize_fields(fields)
    ai_safe   = [f for f in normalized if f in _CANONICAL_AI_SAFE]
    encrypted = [f for f in normalized if f in _CANONICAL_ENCRYPTED]
    return {
        "ai_safe":      ai_safe or ["product", "quantity", "delivery_speed", "date", "special_requests"],
        "encrypted":    encrypted or ["full_name", "email", "phone", "address", "card_number", "cvv"],
        "capabilities": services or ["reservations"],
        "privacy_note": "Applied default heuristic classification.",
    }
