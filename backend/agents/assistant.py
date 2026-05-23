from google import genai
from config import GEMINI_API_KEY


def run_assistant(user_intent: str, ai_safe_data: dict, business_name: str = "the business") -> str:
    client = genai.Client(api_key=GEMINI_API_KEY)

    system_prompt = (
        f"You are the AI assistant for {business_name}. "
        "You handle reservations and bookings. "
        "You only see AI-safe data — never personal identifiers. "
        "Confirm the reservation details warmly and professionally in 2-3 sentences."
    )

    user_message = (
        f"Customer intent: {user_intent}\n"
        f"Reservation details (AI-safe): {ai_safe_data}\n\n"
        "Please confirm this reservation."
    )

    try:
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=f"{system_prompt}\n\n{user_message}",
        )
        return response.text.strip()
    except Exception as e:
        return f"Reservation noted. We look forward to welcoming you at {business_name}. (ref: {e})"
