import json
import re
from google import genai
from config import GEMINI_API_KEY


def classify_fields(business_data: dict) -> dict:
    fields = business_data.get("customer_fields", [])
    client = genai.Client(api_key=GEMINI_API_KEY)

    prompt = f"""You are a privacy classifier. Given these customer fields: {fields}

Classify each field into one of three categories:
- ai_safe: fields safe to pass through AI (e.g. date, party_size, preferences, dietary_needs, cuisine_preference)
- encrypted: fields that must be encrypted and never seen by AI (e.g. phone, full_name, email, payment, address)
- capabilities: what this business can do based on: {business_data.get("services", [])}

Return ONLY valid JSON in this exact format:
{{
  "ai_safe": ["field1", "field2"],
  "encrypted": ["field3", "field4"],
  "capabilities": ["capability1", "capability2"]
}}"""

    try:
        response = client.models.generate_content(model="gemini-2.0-flash", contents=prompt)
        text = response.text.strip()
        json_match = re.search(r'\{.*\}', text, re.DOTALL)
        if json_match:
            result = json.loads(json_match.group())
        else:
            result = json.loads(text)
        result["business_name"] = business_data.get("business_name", "Unknown Business")
        result["description"] = business_data.get("description", "")
        return result
    except Exception:
        return {
            "business_name": business_data.get("business_name", "Unknown Business"),
            "description": business_data.get("description", ""),
            "ai_safe": ["date", "party_size", "dietary_needs", "special_requests"],
            "encrypted": ["full_name", "email", "phone"],
            "capabilities": business_data.get("services", ["reservations"]),
        }
