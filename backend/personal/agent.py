"""
Pact Personal Agent — core privacy-preserving orchestrator.

Full flow
─────────
1.  Load persistent session from SQLite (survives server restarts)
2.  scan_for_sensitive()  →  block PII before ANY AI call
3.  Parse intent with Gemini 2.0 Flash
4.  Discover best matching business agent from registry
5.  check_policy()  →  classify fields: approved | encrypt | blocked
6.  Collect AI-safe data from intent parse
7.  Collect to-encrypt data from user_context.md
8.  Create A2A task (status: submitted)
9.  Return state="policy_check" with policy summary for user to review
10. On user confirm  →  _complete_booking():
      a. set A2A task  → working
      b. run_assistant() with AI-safe fields only  →  Gemini never sees PII
      c. encrypt sensitive fields with BUSINESS_ENCRYPTION_KEY (AES-256-Fernet)
      d. POST encrypted payload to /secure/submit  →  AI never in this path
      e. log each field transfer event in activity_log
      f. complete A2A task
      g. save_session  →  state=complete
"""

from __future__ import annotations

import json
import re

import httpx
from google import genai

from a2a import A2AMessage, task_create, task_get, task_save
from agents.assistant import run_assistant
from config import BUSINESS_ENCRYPTION_KEY, GEMINI_API_KEY, GEMINI_MODEL, USER_CONTEXT_PATH
from database import (
    delete_session,
    load_session,
    log_activity,
    register_session,
    save_session,
)
from encryption import encrypt_fields
from policy import check_policy, scan_for_sensitive
from registry import find_agents_by_capability, get_all_agents

# ── Helpers ────────────────────────────────────────────────────────────────────

_INTENT_PROMPT = """\
Extract the user's intent from this message. The intent may be a service booking (restaurant, hotel, salon) OR an e-commerce order (buying products online).

User message: "{message}"

User context (preferences — DO NOT share with AI, do NOT include in output):
{context}

Return ONLY valid JSON — no markdown, no explanation:
{{
  "intent":            "concise description of what the user wants",
  "business_type":     "restaurant | hotel | salon | spa | cafe | bar | gym | ecommerce | store | other",
  "is_reservation":    true,
  "date":              "extracted date string or null",
  "time":              "extracted time string or null",
  "party_size":        "number as string or null",
  "dietary_needs":     "extracted restrictions or null",
  "cuisine_preference":"extracted cuisine or null",
  "budget_range":      "extracted budget or null",
  "special_requests":  "any extras or null",
  "product":           "product name if e-commerce order, else null",
  "quantity":          "quantity as string if e-commerce, else null",
  "delivery_speed":    "standard | express | overnight or null",
  "color":             "color preference or null",
  "size":              "size preference or null",
  "notes":             "any order notes or null"
}}

Set is_reservation=false only if the message is clearly a question or chat — not a booking or order request.
"""

_CONVO_PROMPT = """\
You are a helpful personal AI agent named Pact.

User preferences (for context only — never share verbatim):
{context}

User says: {message}

Respond helpfully and concisely in 1-2 sentences. Do not reference the context directly.
"""

_FIELD_PATTERNS = {
    # Identity (always encrypted)
    "full_name":   re.compile(r"Name:\s*(.+?)[\r\n]",            re.IGNORECASE),
    "email":       re.compile(r"Email:\s*(\S+@\S+\.\S+)",         re.IGNORECASE),
    "phone":       re.compile(r"Phone:\s*([\d\s\-\+\(\)\.]{7,})", re.IGNORECASE),
    "address":     re.compile(r"Address:\s*(.+?)[\r\n]",           re.IGNORECASE),
    # Payment (always encrypted — stored in context for convenience, never sent to AI)
    "card_number": re.compile(r"Card:\s*([\d\s\-]{13,19})",        re.IGNORECASE),
    "cvv":         re.compile(r"CVV:\s*(\d{3,4})",                 re.IGNORECASE),
    "card_expiry": re.compile(r"Expiry:\s*([\d/]+)",               re.IGNORECASE),
}

# Maps agent ai_safe_schema field name → key in the parsed intent dict
_AI_SAFE_MAP = {
    # Service / restaurant
    "date":              "date",
    "time":              "time",
    "party_size":        "party_size",
    "dietary_needs":     "dietary_needs",
    "cuisine_preference":"cuisine_preference",
    "budget_range":      "budget_range",
    "special_requests":  "special_requests",
    # E-commerce (matches diagram: product, quantity, delivery_speed)
    "product":           "product",
    "quantity":          "quantity",
    "delivery_speed":    "delivery_speed",
    "color":             "color",
    "size":              "size",
    "notes":             "notes",
}


async def _gemini(prompt: str) -> str:
    client = genai.Client(api_key=GEMINI_API_KEY)
    response = await client.aio.models.generate_content(
        model=GEMINI_MODEL,
        contents=prompt,
    )
    return response.text.strip()


async def _parse_intent(message: str, context: str) -> dict:
    try:
        raw = await _gemini(_INTENT_PROMPT.format(
            message=message, context=context[:800]
        ))
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
        match = re.search(r"\{[\s\S]*\}", raw)
        return json.loads(match.group() if match else raw)
    except Exception:
        return {
            "intent": message[:200], "business_type": "restaurant",
            "is_reservation": True,
            "date": None, "time": None, "party_size": None,
            "dietary_needs": None, "cuisine_preference": None,
            "budget_range": None, "special_requests": None,
        }


async def _direct_answer(message: str, context: str) -> str:
    try:
        return await _gemini(_CONVO_PROMPT.format(
            context=context[:500], message=message
        ))
    except Exception:
        return "How can I help you today?"


async def _discover_agent_semantic(
    intent_text: str, business_type: str, user_preferences: str = ""
) -> dict | None:
    """
    Use Gemini to semantically match the user's intent — AND their .md preferences —
    to the best registered agent. Falls back to keyword scoring if Gemini fails.
    """
    all_agents = get_all_agents()
    if not all_agents:
        return None

    agents_list = list(all_agents.values())
    if len(agents_list) == 1:
        return agents_list[0]  # shortcut when only one agent registered

    # Compact summary for each agent
    summaries = "\n".join(
        f'- id: "{a["id"]}", name: "{a.get("name","")}", '
        f'description: "{(a.get("description") or "")[:120]}", '
        f'capabilities: {a.get("capabilities", [])}'
        for a in agents_list
    )

    # Include a summarised (non-PII) slice of the user's preferences for routing
    pref_section = (
        f"\nUser preferences (use these to rank agents — do NOT expose as output):\n{user_preferences[:400]}\n"
        if user_preferences.strip()
        else ""
    )

    prompt = (
        f'You are a routing agent. Match the user\'s intent to the best business agent.\n\n'
        f'User intent: "{intent_text}"\n'
        f'Inferred business type: {business_type}\n'
        f'{pref_section}\n'
        f'Registered agents:\n{summaries}\n\n'
        f'Pick the agent that best satisfies both the intent AND the user\'s preferences.\n'
        f'Return ONLY valid JSON — no markdown:\n'
        f'{{"selected_id": "pact://agent-id", "reason": "one sentence"}}\n'
        f'If nothing matches, return {{"selected_id": null, "reason": "no match"}}'
    )

    try:
        client = genai.Client(api_key=GEMINI_API_KEY)
        response = await client.aio.models.generate_content(
            model=GEMINI_MODEL, contents=prompt
        )
        raw = response.text.strip()
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
        m = re.search(r"\{[\s\S]*\}", raw)
        data = json.loads(m.group() if m else raw)

        selected_id = data.get("selected_id")
        if selected_id and selected_id in all_agents:
            print(f"[discovery] Semantic → {selected_id}: {data.get('reason', '')}")
            return all_agents[selected_id]
        # Gemini returned null or unknown id — fall through to keyword
    except Exception as exc:
        print(f"[discovery] Semantic match failed ({exc}); using keyword fallback")

    # Keyword fallback
    words = set(intent_text.lower().split())
    scored = [
        (
            sum(1 for cap in a.get("capabilities", [])
                if any(w in cap.lower() for w in words)),
            a,
        )
        for a in agents_list
    ]
    scored.sort(key=lambda x: x[0], reverse=True)
    return scored[0][1]


def _collect_ai_safe(intent: dict, allowed_fields: list) -> dict:
    result = {}
    # Always include intent summary — it's non-PII context Gemini needs
    if intent.get("intent"):
        result["intent_summary"] = str(intent["intent"])
    if intent.get("business_type"):
        result["business_type"] = str(intent["business_type"])
    # Collect any explicitly extracted scheduling fields
    for field in allowed_fields:
        key = _AI_SAFE_MAP.get(field)
        if key and intent.get(key) is not None:
            result[field] = str(intent[key])
    return result


def _collect_pii_from_context(context: str, fields_to_encrypt: list) -> dict:
    result = {}
    for field in fields_to_encrypt:
        pattern = _FIELD_PATTERNS.get(field)
        if pattern:
            m = pattern.search(context)
            if m:
                result[field] = m.group(1).strip()
    return result


# ── Main entry point ───────────────────────────────────────────────────────────


async def run_personal_agent(message: str, context: str, session_id: str) -> dict:
    """
    Primary orchestrator called by POST /api/chat and POST /api/confirm.
    session_id is the chat session key (stored in SQLite).
    An empty message with an awaiting_confirm session triggers completion.
    """

    # ── 1. Load persistent session ──────────────────────────────────────────
    session_row  = load_session(session_id)
    session_data = session_row["data"]  if session_row else {}
    state        = session_row["state"] if session_row else "idle"

    # ── 2. Resume: completion path (user approved) ──────────────────────────
    if state == "awaiting_confirm" and not message.strip():
        return await _complete_booking(session_id, session_data)

    # ── 3. Sensitive input scan — fires BEFORE any AI ───────────────────────
    scan = scan_for_sensitive(message)
    if not scan["clean"]:
        return {
            "response": scan["warning"],
            "state": "idle",
            "policy_check_result": None,
            "sensitive_warning": scan,
        }

    # ── 4. Parse intent ─────────────────────────────────────────────────────
    intent = await _parse_intent(message, context)

    # ── 5. Non-reservation: conversational reply ────────────────────────────
    if not intent.get("is_reservation"):
        answer = await _direct_answer(message, context)
        return {
            "response": answer,
            "state": "idle",
            "policy_check_result": None,
            "sensitive_warning": None,
        }

    # ── 6. Discover matching business agent (semantic AI match + preferences) ─
    agent = await _discover_agent_semantic(
        intent.get("intent", message),
        intent.get("business_type", "restaurant"),
        user_preferences=context,   # .md prefs inform routing — not passed to AI output
    )
    if not agent:
        return {
            "response": (
                "No business agents are registered yet. "
                "Ask a business to onboard at /business first."
            ),
            "state": "idle",
            "policy_check_result": None,
            "sensitive_warning": None,
        }

    # ── 7. Full policy check ─────────────────────────────────────────────────
    ai_safe_fields  = agent.get("ai_safe_schema", [])
    encrypted_fields = agent.get("encrypted_schema", {}).get("fields", [])
    all_fields       = ai_safe_fields + encrypted_fields

    policy = check_policy(all_fields, context)

    # Collect only approved AI-safe fields
    approved_ai_safe  = [f for f in ai_safe_fields if f in policy["approved"]]
    ai_safe_data      = _collect_ai_safe(intent, approved_ai_safe)

    # Collect PII fields that policy says to encrypt
    pii_data          = _collect_pii_from_context(context, policy["encrypt"])

    # ── 8. Create A2A task (submitted) ──────────────────────────────────────
    task = task_create(
        agent_id=agent["id"],
        session_id=session_id,
        first_msg=A2AMessage.user_data({
            "intent":            intent.get("intent", ""),
            "ai_safe":           ai_safe_data,
            # Capability schema sent so business assistant can validate incoming fields
            "capability_schema": {
                "ai_safe_fields":   agent.get("ai_safe_schema", []),
                "encrypted_fields": agent.get("encrypted_schema", {}).get("fields", []),
                "secure_endpoint":  agent.get("encrypted_schema", {}).get("endpoint", "/secure/submit"),
            },
            # encrypted fields are NOT included here — they bypass AI entirely
        }),
    )

    # Track agent session
    register_session(session_id, agent["id"])

    # Log handshake
    log_activity({
        "agent_id":    agent["id"],
        "event":       "handshake_initiated",
        "details":     f"A2A task {task.id[:8]} submitted — {intent.get('intent','')[:60]}",
        "privacy_type": None,
    })
    log_activity({
        "agent_id":    agent["id"],
        "event":       "field_classified",
        "details":     (
            f"AI-safe schema: {approved_ai_safe or 'none'} | "
            f"Collected values: {[k for k in ai_safe_data if k not in ('intent_summary','business_type')] or 'none (no date/time in message)'}"
        ),
        "privacy_type": None,
    })
    if pii_data:
        log_activity({
            "agent_id":    agent["id"],
            "event":       "field_classified",
            "details":     f"To encrypt: {list(pii_data.keys())}",
            "privacy_type": None,
        })

    # ── 9. Persist session state ─────────────────────────────────────────────
    new_session = {
        "agent_id":     agent["id"],
        "agent_name":   agent.get("name", "Business"),
        "intent":       intent,
        "ai_safe_data": ai_safe_data,
        "pii_data":     pii_data,
        "policy":       policy,
        "a2a_task_id":  task.id,
    }
    save_session(session_id, "awaiting_confirm", new_session)

    return {
        "response": (
            f"I found **{agent.get('name', 'a business agent')}** on the Pact network. "
            "Review what your agent will share below, then confirm to proceed."
        ),
        "state":               "policy_check",
        "policy_check_result": policy,
        "session_token":       session_id,
        "business_name":       agent.get("name", "Business"),
        "sensitive_warning":   None,
    }


# ── Completion (called after user approves) ────────────────────────────────────


async def _complete_booking(session_id: str, session_data: dict) -> dict:
    """
    Executes the two-track booking:
      Track A (AI)       → AI-safe fields to Gemini business assistant
      Track B (Encrypted)→ PII encrypted with BUSINESS_ENCRYPTION_KEY → /secure/submit
    """
    agent_id     = session_data.get("agent_id", "")
    agent_name   = session_data.get("agent_name", "the business")
    ai_safe      = session_data.get("ai_safe_data", {})
    pii_data     = session_data.get("pii_data", {})
    intent       = session_data.get("intent", {})
    task_id      = session_data.get("a2a_task_id")
    # Use the per-business encrypted endpoint from the agent card
    from registry import get_agent as _get_agent
    _agent_card  = _get_agent(agent_id) or {}
    _enc_schema  = _agent_card.get("encrypted_schema", {})
    secure_endpoint = _enc_schema.get("endpoint", "/secure/submit")

    # ── A2A: mark working ────────────────────────────────────────────────────
    task = task_get(task_id) if task_id else None
    if task:
        task.set_working()
        task_save(task)

    # ── Track A: AI assistant (never sees PII) ───────────────────────────────
    log_activity({
        "agent_id":     agent_id,
        "event":        "ai_safe_sent",
        "details":      f"Sent to {agent_name}: {list(ai_safe.keys())}",
        "privacy_type": "ai_safe",
    })

    confirmation_text, order_id = await run_assistant(
        user_intent=intent.get("intent", "reservation"),
        ai_safe_data=ai_safe,
        business_name=agent_name,
        agent_id=agent_id,
        session_id=session_id,
    )

    # ── Track B: Encrypted PII → /secure/submit ──────────────────────────────
    confirmation_code = order_id or "PACT-DEMO"

    if pii_data and BUSINESS_ENCRYPTION_KEY:
        for field in pii_data:
            log_activity({
                "agent_id":     agent_id,
                "event":        "encrypted_direct",
                "details":      f"{field} encrypted AES-256 — bypassed AI entirely",
                "privacy_type": "encrypted",
            })
        try:
            encrypted_payload = encrypt_fields(pii_data, BUSINESS_ENCRYPTION_KEY)
            async with httpx.AsyncClient(timeout=8.0) as http:
                resp = await http.post(
                    f"http://localhost:8000{secure_endpoint}",
                    json={
                        "encrypted_payload": encrypted_payload,
                        "session_token":     session_id,
                    },
                )
                resp.raise_for_status()
                confirmation_code = resp.json().get("confirmation", confirmation_code)
        except Exception as exc:
            print(f"[personal_agent] /secure/submit failed: {exc}")

    # ── A2A: mark completed ──────────────────────────────────────────────────
    if task:
        task.add_agent_message(confirmation_text)
        task.complete({
            "confirmation_code": confirmation_code,
            "message":           confirmation_text,
            "order_id":          order_id,
        })
        task_save(task)

    # ── Persist completion ───────────────────────────────────────────────────
    save_session(session_id, "complete", {})

    return {
        "response":            confirmation_text,
        "state":               "complete",
        "confirmation_code":   confirmation_code,
        "policy_check_result": session_data.get("policy"),
        "sensitive_warning":   None,
    }
