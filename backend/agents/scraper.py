import json
import re
from google import genai
from config import GEMINI_API_KEY

_FALLBACK = {
    "business_name": "Trattoria SF",
    "description": "A cozy Italian restaurant in the heart of San Francisco serving handmade pasta and wood-fired pizza.",
    "services": ["dine-in reservations", "private events", "takeout"],
    "customer_fields": ["full_name", "email", "phone", "date", "party_size", "dietary_needs", "special_requests"],
}


def scrape_business(url: str) -> dict:
    try:
        client = genai.Client(api_key=GEMINI_API_KEY)
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=(
                f"Visit {url}. Extract business name, services, "
                "customer fields needed for booking/reservations, "
                "description. Return ONLY valid JSON with keys: "
                "business_name, description, services (list), customer_fields (list)."
            ),
        )
        text = response.text.strip()
        json_match = re.search(r'\{.*\}', text, re.DOTALL)
        if json_match:
            return json.loads(json_match.group())
        return json.loads(text)
    except Exception:
        return _FALLBACK
