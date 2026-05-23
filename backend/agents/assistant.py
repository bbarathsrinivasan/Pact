"""
Business AI Assistant — processes A2A tasks.

CRITICAL PRIVACY RULE:
  This assistant ONLY receives ai_safe fields.
  It NEVER sees: names, emails, phones, or any PII.
  Those fields are AES-256 encrypted and POSTed directly
  to /secure/submit — this function is never in that path.
"""

from google import genai

from config import GEMINI_API_KEY, GEMINI_MODEL
from database import create_order, log_activity
from registry import get_agent

_SYSTEM = """\
You are a warm, enthusiastic AI assistant for {business_name}.

PRIVACY CONSTRAINTS (enforced by Pact protocol):
- You ONLY see AI-safe data (scheduling, product, size, etc.). You do NOT have the customer's name, email, phone, or payment details.
- Those sensitive details are encrypted and sent directly — you never touch them. Mention this briefly to reassure the customer.
- Never ask for PII. Never reference what you don't have access to.

Your job:
1. Confirm the order/reservation with genuine excitement in 2-3 sentences.
2. Echo back the key details you received (product, size, date, etc.) so the customer feels heard.
3. End with a warm note that their personal and payment details are secured via Pact's encrypted channel and never passed through any AI.

Be concise, warm, and human. No bullet points — just friendly natural language.
"""

_USER = """\
Customer intent: {intent}
AI-safe order/reservation details: {safe_summary}

Confirm this warmly and concisely.
"""


async def run_assistant(
    user_intent: str,
    ai_safe_data: dict,
    business_name: str = "the business",
    agent_id: str | None = None,
    session_id: str | None = None,
) -> tuple[str, str | None]:
    """
    Call Gemini with only AI-safe data.
    Creates an order in the database.

    Returns:
        (confirmation_text, order_id | None)
    """
    safe_summary = (
        ", ".join(f"{k}: {v}" for k, v in ai_safe_data.items() if v)
        or "no additional details provided"
    )

    prompt = (
        _SYSTEM.format(business_name=business_name)
        + "\n\n"
        + _USER.format(intent=user_intent, safe_summary=safe_summary)
    )

    try:
        client = genai.Client(api_key=GEMINI_API_KEY)
        response = await client.aio.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
        )
        confirmation_text = response.text.strip()
    except Exception as exc:
        print(f"[assistant] Gemini call failed ({exc})")
        confirmation_text = (
            f"Your reservation at {business_name} has been received. "
            "We look forward to welcoming you! "
            "Your contact details are secured via Pact's encrypted channel."
        )

    # ── Create live order in database ──────────────────────────────────────
    order_id = None
    if agent_id:
        agent = get_agent(agent_id)
        if agent:
            products = agent.get("products") or [{"name": "Reservation", "price": 0.0}]

            # Try to match the ordered product by name (for e-commerce/shoes)
            ordered_product_name = ai_safe_data.get("product", "")
            product = products[0]  # default
            if ordered_product_name:
                name_lower = ordered_product_name.lower()
                for p in products:
                    if name_lower in p.get("name", "").lower() or p.get("name", "").lower() in name_lower:
                        product = p
                        break

            try:
                qty = max(1, int(ai_safe_data.get("quantity") or ai_safe_data.get("party_size") or 1))
            except (ValueError, TypeError):
                qty = 1

            delivery = ai_safe_data.get("delivery_speed", "standard") or "standard"
            price = float(product.get("price", 0.0))
            total = round(price * qty, 2)

            order = create_order({
                "agent_id":       agent_id,
                "session_id":     session_id,
                "product":        product.get("name", ordered_product_name or "Reservation"),
                "quantity":       qty,
                "total":          total,
                "delivery_speed": delivery,
                "status":         "confirmed",
            })
            order_id = order["id"]

            log_activity({
                "agent_id":    agent_id,
                "event":       "order_confirmed",
                "details":     f"Booking confirmed via A2A — order {order_id}",
                "privacy_type": "ai_safe",
            })

    return confirmation_text, order_id
