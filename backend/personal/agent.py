import re
import json
import httpx
from google import genai
from config import GEMINI_API_KEY, ENCRYPTION_KEY, USER_CONTEXT_PATH
from policy import scan_for_sensitive, check_policy
from agents.assistant import run_assistant
from encryption import encrypt_fields


def _read_context() -> str:
    if USER_CONTEXT_PATH.exists():
        return USER_CONTEXT_PATH.read_text()
    return ""


def _parse_intent(message: str, context: str) -> dict:
    client = genai.Client(api_key=GEMINI_API_KEY)
    prompt = f"""Given this user message: "{message}"
And user context:
{context}

Extract the reservation intent. Return ONLY valid JSON:
{{
  "intent": "short description of what user wants",
  "business_type": "restaurant|hotel|salon|other",
  "date": "extracted date or null",
  "party_size": "number or null",
  "dietary_needs": "extracted dietary needs or null",
  "cuisine_preference": "extracted preference or null",
  "budget_range": "extracted budget or null",
  "is_reservation": true/false
}}"""
    try:
        response = client.models.generate_content(model="gemini-2.0-flash", contents=prompt)
        text = response.text.strip()
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if match:
            return json.loads(match.group())
        return json.loads(text)
    except Exception:
        return {
            "intent": message,
            "business_type": "restaurant",
            "date": None,
            "party_size": None,
            "dietary_needs": None,
            "cuisine_preference": None,
            "budget_range": None,
            "is_reservation": True,
        }


def _collect_ai_safe_fields(intent_data: dict, schema_fields: list) -> dict:
    field_map = {
        "date": intent_data.get("date"),
        "party_size": intent_data.get("party_size"),
        "dietary_needs": intent_data.get("dietary_needs"),
        "cuisine_preference": intent_data.get("cuisine_preference"),
        "budget_range": intent_data.get("budget_range"),
    }
    return {k: v for k, v in field_map.items() if k in schema_fields and v is not None}


def _collect_encrypted_fields(context: str, schema_fields: list) -> dict:
    result = {}
    name_match = re.search(r'Name:\s*(.+)', context)
    if "full_name" in schema_fields and name_match:
        result["full_name"] = name_match.group(1).strip()
    email_match = re.search(r'Email:\s*(\S+@\S+)', context)
    if "email" in schema_fields and email_match:
        result["email"] = email_match.group(1).strip()
    phone_match = re.search(r'Phone:\s*(\S+)', context)
    if "phone" in schema_fields and phone_match:
        result["phone"] = phone_match.group(1).strip()
    return result


async def run_personal_agent(message: str, context: str, session: dict) -> dict:
    scan = scan_for_sensitive(message)
    if not scan["clean"]:
        return {
            "response": scan["warning"],
            "state": "idle",
            "policy_check_result": None,
            "sensitive_warning": scan,
        }

    intent_data = _parse_intent(message, context)

    if not intent_data.get("is_reservation", False):
        client = genai.Client(api_key=GEMINI_API_KEY)
        try:
            resp = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=f"User context:\n{context}\n\nUser says: {message}\n\nRespond helpfully.",
            )
            return {"response": resp.text.strip(), "state": "idle", "policy_check_result": None, "sensitive_warning": None}
        except Exception:
            return {"response": "How can I help you?", "state": "idle", "policy_check_result": None, "sensitive_warning": None}

    if session.get("state") == "awaiting_confirm" and session.get("approved") is True:
        return await _complete_reservation(session, context)

    async with httpx.AsyncClient() as client:
        try:
            hs_resp = await client.post(
                "http://localhost:8000/api/handshake",
                json={"intent": intent_data.get("intent", message), "capability": intent_data.get("business_type", "restaurant")},
                timeout=10,
            )
            handshake = hs_resp.json()
        except Exception:
            handshake = {
                "session_token": "fallback-token",
                "ai_safe_schema": ["date", "party_size", "dietary_needs", "cuisine_preference"],
                "encrypted_schema": ["full_name", "email", "phone"],
                "secure_endpoint": "/secure/submit",
                "business_agent_id": "pact://trattoria-sf",
                "business_name": "Trattoria SF",
            }

    policy_result = check_policy(
        handshake.get("ai_safe_schema", []) + handshake.get("encrypted_schema", []),
        context,
    )

    ai_safe_data = _collect_ai_safe_fields(intent_data, handshake.get("ai_safe_schema", []))
    encrypted_fields = _collect_encrypted_fields(context, handshake.get("encrypted_schema", []))

    session.update({
        "state": "awaiting_confirm",
        "handshake": handshake,
        "intent_data": intent_data,
        "ai_safe_data": ai_safe_data,
        "encrypted_fields": encrypted_fields,
        "policy_result": policy_result,
    })

    return {
        "response": f"I found a matching business agent. Here's what I'd share to complete your reservation:",
        "state": "policy_check",
        "policy_check_result": policy_result,
        "session_token": handshake.get("session_token"),
        "business_name": handshake.get("business_name", "the business"),
        "sensitive_warning": None,
    }


async def _complete_reservation(session: dict, context: str) -> dict:
    handshake = session.get("handshake", {})
    ai_safe_data = session.get("ai_safe_data", {})
    encrypted_fields = session.get("encrypted_fields", {})
    business_name = handshake.get("business_name", "the business")

    confirmation_text = run_assistant(
        user_intent=session.get("intent_data", {}).get("intent", "reservation"),
        ai_safe_data=ai_safe_data,
        business_name=business_name,
    )

    confirmation_code = None
    if ENCRYPTION_KEY and encrypted_fields:
        try:
            encrypted_payload = encrypt_fields(encrypted_fields, ENCRYPTION_KEY)
            async with httpx.AsyncClient() as http:
                resp = await http.post(
                    "http://localhost:8000/secure/submit",
                    json={
                        "encrypted_payload": encrypted_payload,
                        "session_token": handshake.get("session_token", ""),
                    },
                    timeout=10,
                )
                confirmation_code = resp.json().get("confirmation")
        except Exception:
            confirmation_code = "PACT-DEMO"

    session["state"] = "complete"

    return {
        "response": confirmation_text,
        "state": "complete",
        "confirmation_code": confirmation_code or "PACT-DEMO",
        "policy_check_result": session.get("policy_result"),
        "sensitive_warning": None,
    }
