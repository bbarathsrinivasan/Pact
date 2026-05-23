"""
Pact Personal Agent — core privacy-preserving orchestrator.

Full flow
─────────
1.  Load persistent session from SQLite (survives server restarts)
2.  scan_for_sensitive()  →  block PII before ANY AI call
3.  Parse intent with Gemini 3.5 Flash
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
from registry import find_agent_by_name, find_agents_by_capability, get_agent, get_all_agents
from user_context import (
    answer_profile_question,
    enrich_intent_from_context,
    find_missing_for_booking,
    format_missing_prompt,
    get_field_value,
    merge_overrides,
)

# ── Helpers ────────────────────────────────────────────────────────────────────

_INTENT_PROMPT = """\
Extract the user's intent using the FULL conversation — the current message may refer to earlier turns ("here", "that place", "same restaurant").

Recent conversation:
{history}

Current user message: "{message}"

User profile preferences (DO NOT share with AI, do NOT include in output):
{context}

Return ONLY valid JSON — no markdown, no explanation:
{{
  "intent":                 "concise description of what the user wants now",
  "business_type":          "restaurant | hotel | salon | spa | cafe | bar | gym | ecommerce | store | other",
  "is_reservation":         true,
  "is_booking_recall":      false,
  "target_business_name":   "specific business to book at, resolved from this message OR prior turns, or null",
  "discussed_business_name":"business mentioned for info only (not booking), or null",
  "date":                   "extracted date string or null",
  "time":                   "extracted time string or null",
  "party_size":             "number as string or null",
  "dietary_needs":          "extracted restrictions or null",
  "cuisine_preference":     "extracted cuisine or null",
  "budget_range":           "extracted budget or null",
  "special_requests":       "any extras or null",
  "product":                "product name if e-commerce order, else null",
  "quantity":               "quantity as string if e-commerce, else null",
  "delivery_speed":         "standard | express | overnight or null",
  "color":                  "color preference or null",
  "size":                   "size preference or null",
  "notes":                  "any order notes or null"
}}

Rules:
- Set is_booking_recall=true for questions like "where did you book?", "which place was my booking?", "what did you book for me?"
- Set is_reservation=true for new booking/order requests (including "book here", "make a booking there", "book at Shack15")
- Set is_reservation=false for general chat, business info questions, or booking recall questions
- Resolve target_business_name from pronouns/deictics using conversation history (e.g. "here" → the business just discussed)
"""

_CONVO_PROMPT = """\
You are Pact, a helpful personal AI agent with memory of this conversation.

User profile & stored context (CHECK THIS FIRST for any question about the user):
{context}

Completed bookings in this session:
{bookings_summary}

Recent conversation:
{history}

User says: {message}

STRICT RULES:
1. For questions about the USER (name, email, phone, dietary needs, budget, location, preferences):
   - Answer ONLY from the profile/context above.
   - If the information is NOT in the profile, say clearly that it is not saved yet and ask the user to add it in the Profile tab or tell you now.
   - Do NOT invent user details that are not in the profile.

2. For booking recall, use the completed bookings list above.

3. For general knowledge (e.g. a business location) not in the profile:
   - First note whether the user has any related notes in their profile.
   - If not in profile, you may answer from general knowledge but mention it is not from their stored profile.

Respond in 1-3 sentences. Be direct and helpful.
"""

_MAX_HISTORY = 20

_REFERS_PRIOR_RE = re.compile(
    r"\b("
    r"here|there|this place|that place|this one|that one|same place|"
    r"that restaurant|this restaurant|that spot|this spot|"
    r"book here|book there|make a booking here|make a booking there|"
    r"reserve here|reserve there"
    r")\b",
    re.IGNORECASE,
)

_BOOKING_RECALL_RE = re.compile(
    r"\b("
    r"where did you book|where was my booking|which place did you|"
    r"what place did you|in which place|where is my booking|"
    r"my booking at|did you book|made my booking|made the booking|"
    r"where did we book|what did you book"
    r")\b",
    re.IGNORECASE,
)

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
    return (response.text or "").strip()


def _format_history(history: list[dict], limit: int = 10) -> str:
    if not history:
        return "(no prior messages)"
    lines = []
    for turn in history[-limit:]:
        role = "User" if turn.get("role") == "user" else "Pact"
        content = (turn.get("content") or "").strip().replace("\n", " ")
        if content:
            lines.append(f"{role}: {content[:400]}")
    return "\n".join(lines) if lines else "(no prior messages)"


def _format_bookings_summary(bookings: list[dict]) -> str:
    if not bookings:
        return "None yet in this session."
    lines = []
    for b in bookings[-5:]:
        code = b.get("confirmation_code") or "pending"
        lines.append(
            f"- {b.get('agent_name', 'Unknown')} "
            f"(confirmation {code}, intent: {b.get('intent', '')[:80]})"
        )
    return "\n".join(lines)


def _extract_memory(session_data: dict) -> dict:
    return {
        "chat_history":              session_data.get("chat_history", []),
        "completed_bookings":        session_data.get("completed_bookings", []),
        "context_overrides":         session_data.get("context_overrides", {}),
        "last_discussed_agent_id":   session_data.get("last_discussed_agent_id"),
        "last_discussed_agent_name": session_data.get("last_discussed_agent_name"),
    }


def _merge_session_data(memory: dict, extra: dict | None = None) -> dict:
    data = dict(memory)
    if extra:
        data.update(extra)
    return data


def _append_history(memory: dict, role: str, content: str) -> None:
    history = list(memory.get("chat_history", []))
    history.append({"role": role, "content": content[:2000]})
    memory["chat_history"] = history[-_MAX_HISTORY:]


def _refers_to_prior_place(message: str) -> bool:
    return bool(_REFERS_PRIOR_RE.search(message))


def _answer_booking_recall(message: str, memory: dict) -> str | None:
    bookings = memory.get("completed_bookings") or []
    if not bookings:
        if _BOOKING_RECALL_RE.search(message):
            return "I haven't completed any bookings in our conversation yet. Tell me where you'd like to go and I can start one."
        return None

    if not (_BOOKING_RECALL_RE.search(message) or "booking" in message.lower() and "where" in message.lower()):
        return None

    if len(bookings) == 1:
        b = bookings[-1]
        code = b.get("confirmation_code", "")
        extra = f" Confirmation code: {code}." if code else ""
        return f"I made your booking at **{b.get('agent_name', 'the business')}**.{extra}"

    lines = ["Here are the bookings I've completed this session:"]
    for b in bookings[-5:]:
        code = b.get("confirmation_code", "")
        lines.append(f"- **{b.get('agent_name')}** ({code})")
    return "\n".join(lines)


def _update_last_discussed(memory: dict, message: str, intent: dict) -> None:
    name = intent.get("target_business_name") or intent.get("discussed_business_name")
    if name and str(name).lower() not in ("null", "none", ""):
        agent = find_agent_by_name(str(name))
        if agent:
            memory["last_discussed_agent_id"] = agent["id"]
            memory["last_discussed_agent_name"] = agent.get("name", name)
        else:
            memory["last_discussed_agent_name"] = str(name)
        return

    for agent in get_all_agents().values():
        aname = agent.get("name", "")
        if not aname:
            continue
        norm = _normalize_name_local(aname)
        msg_norm = _normalize_name_local(message)
        if norm and norm in msg_norm:
            memory["last_discussed_agent_id"] = agent["id"]
            memory["last_discussed_agent_name"] = aname
            return


def _normalize_name_local(name: str) -> str:
    return "".join(c for c in name.lower() if c.isalnum())


async def _parse_intent(message: str, context: str, history: list[dict]) -> dict:
    try:
        raw = await _gemini(_INTENT_PROMPT.format(
            message=message,
            context=context[:800],
            history=_format_history(history),
        ))
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
        match = re.search(r"\{[\s\S]*\}", raw)
        return json.loads(match.group() if match else raw)
    except Exception:
        is_recall = bool(_BOOKING_RECALL_RE.search(message))
        refers_prior = _refers_to_prior_place(message)
        return {
            "intent": message[:200],
            "business_type": "restaurant",
            "is_reservation": not is_recall and not message.strip().endswith("?"),
            "is_booking_recall": is_recall,
            "target_business_name": None,
            "discussed_business_name": None,
            "date": None, "time": None, "party_size": None,
            "dietary_needs": None, "cuisine_preference": None,
            "budget_range": None, "special_requests": None,
            "_refers_prior": refers_prior,
        }


async def _direct_answer(message: str, context: str, memory: dict) -> str:
    try:
        return await _gemini(_CONVO_PROMPT.format(
            context=context[:500],
            message=message,
            history=_format_history(memory.get("chat_history", [])),
            bookings_summary=_format_bookings_summary(memory.get("completed_bookings", [])),
        ))
    except Exception:
        recall = _answer_booking_recall(message, memory)
        if recall:
            return recall
        return "How can I help you today?"


async def _discover_agent_semantic(
    intent_text: str,
    business_type: str,
    user_preferences: str = "",
    conversation_history: str = "",
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
    history_section = (
        f"\nRecent conversation (use to resolve references like 'here' or 'that place'):\n{conversation_history}\n"
        if conversation_history.strip() and conversation_history != "(no prior messages)"
        else ""
    )

    prompt = (
        f'You are a routing agent. Match the user\'s intent to the best business agent.\n\n'
        f'User intent: "{intent_text}"\n'
        f'Inferred business type: {business_type}\n'
        f'{pref_section}'
        f'{history_section}\n'
        f'Registered agents:\n{summaries}\n\n'
        f'Pick the agent that best satisfies the intent, conversation context, AND user preferences.\n'
        f'If the user refers to a specific business from the conversation, pick THAT agent.\n'
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


async def _resolve_agent(
    intent: dict,
    message: str,
    memory: dict,
    context: str,
) -> dict | None:
    """Pick business agent using explicit name, deictic reference, then semantic search."""
    target = intent.get("target_business_name")
    if target and str(target).lower() not in ("null", "none", ""):
        agent = find_agent_by_name(str(target))
        if agent:
            print(f"[discovery] Explicit target → {agent['id']}")
            return agent

    refers_prior = _refers_to_prior_place(message) or intent.get("_refers_prior")
    if refers_prior:
        last_id = memory.get("last_discussed_agent_id")
        if last_id:
            agent = get_agent(last_id)
            if agent:
                print(f"[discovery] Deictic 'here/there' → {last_id}")
                return agent
        last_name = memory.get("last_discussed_agent_name")
        if last_name:
            agent = find_agent_by_name(str(last_name))
            if agent:
                print(f"[discovery] Deictic via last discussed name → {agent['id']}")
                return agent

    return await _discover_agent_semantic(
        intent.get("intent", message),
        intent.get("business_type", "restaurant"),
        user_preferences=context,
        conversation_history=_format_history(memory.get("chat_history", [])),
    )


def _finish_turn(
    session_id: str,
    state: str,
    memory: dict,
    response: str,
    *,
    pending: dict | None = None,
    policy_check_result=None,
    session_token: str | None = None,
    business_name: str | None = None,
    confirmation_code: str | None = None,
    sensitive_warning=None,
    response_state: str | None = None,
) -> dict:
    """Persist memory + optional pending booking state; return API payload."""
    _append_history(memory, "agent", response)
    payload = _merge_session_data(memory, pending)
    save_session(session_id, state, payload)
    result = {
        "response":            response,
        "state":               response_state or state,
        "policy_check_result": policy_check_result,
        "sensitive_warning":   sensitive_warning,
    }
    if session_token:
        result["session_token"] = session_token
    if business_name:
        result["business_name"] = business_name
    if confirmation_code:
        result["confirmation_code"] = confirmation_code
    return result


async def run_personal_agent(message: str, context: str, session_id: str) -> dict:
    """
    Primary orchestrator called by POST /api/chat and POST /api/confirm.
    Maintains conversation memory and completed bookings per session_id.
    """
    session_row  = load_session(session_id)
    session_data = session_row["data"] if session_row else {}
    state        = session_row["state"] if session_row else "idle"
    memory       = _extract_memory(session_data)

    # ── Completion path (user approved via /api/confirm) ────────────────────
    if state == "awaiting_confirm" and not message.strip():
        return await _complete_booking(session_id, session_data, memory)

    if not message.strip():
        return _finish_turn(session_id, "idle", memory, "How can I help you?")

    # Record user turn before any AI call
    _append_history(memory, "user", message)

    # ── Sensitive input scan — fires BEFORE any AI ──────────────────────────
    scan = scan_for_sensitive(message)
    if not scan["clean"]:
        # Remove the user line we just added — message was blocked
        memory["chat_history"] = memory.get("chat_history", [])[:-1]
        save_session(session_id, "idle", memory)
        return {
            "response": scan["warning"],
            "state": "idle",
            "policy_check_result": None,
            "sensitive_warning": scan,
        }

    # ── Parse intent with full conversation context ────────────────────────
    overrides = merge_overrides(memory, message)
    intent = await _parse_intent(message, context, memory.get("chat_history", []))
    intent = enrich_intent_from_context(intent, context, overrides)
    _update_last_discussed(memory, message, intent)

    # ── Profile questions — answer from context only ───────────────────────
    profile_answer = answer_profile_question(context, message, overrides)
    if profile_answer:
        return _finish_turn(session_id, "idle", memory, profile_answer)

    # ── Booking recall ("where did you book?") ────────────────────────────
    if intent.get("is_booking_recall"):
        recall = _answer_booking_recall(message, memory)
        if recall:
            return _finish_turn(session_id, "idle", memory, recall)

    # ── Conversational reply (not a new booking) ──────────────────────────
    if not intent.get("is_reservation"):
        answer = await _direct_answer(message, context, memory)
        return _finish_turn(session_id, "idle", memory, answer)

    # ── Resolve business agent (name, "here", then semantic) ─────────────
    agent = await _resolve_agent(intent, message, memory, context)
    if not agent:
        return _finish_turn(
            session_id,
            "idle",
            memory,
            "No business agents are registered yet. Ask a business to onboard at /business first.",
        )

    memory["last_discussed_agent_id"] = agent["id"]
    memory["last_discussed_agent_name"] = agent.get("name", "Business")

    # ── Policy check ───────────────────────────────────────────────────────
    ai_safe_fields   = agent.get("ai_safe_schema", [])
    encrypted_fields = agent.get("encrypted_schema", {}).get("fields", [])
    all_fields       = ai_safe_fields + encrypted_fields
    policy           = check_policy(all_fields, context)
    approved_ai_safe = [f for f in ai_safe_fields if f in policy["approved"]]
    encrypt_needed   = [f for f in encrypted_fields if f in policy["encrypt"]]

    # ── Require profile data before proceeding ─────────────────────────────
    missing = find_missing_for_booking(
        context, intent, encrypt_needed, approved_ai_safe, overrides
    )
    if missing:
        return _finish_turn(
            session_id,
            "idle",
            memory,
            format_missing_prompt(missing, agent.get("name")),
        )

    ai_safe_data = _collect_ai_safe(intent, approved_ai_safe, context, overrides)
    pii_data     = _collect_pii_from_context(context, policy["encrypt"], overrides)

    # ── A2A task (submitted) ───────────────────────────────────────────────
    task = task_create(
        agent_id=agent["id"],
        session_id=session_id,
        first_msg=A2AMessage.user_data({
            "intent":            intent.get("intent", ""),
            "ai_safe":           ai_safe_data,
            "capability_schema": {
                "ai_safe_fields":   agent.get("ai_safe_schema", []),
                "encrypted_fields": agent.get("encrypted_schema", {}).get("fields", []),
                "secure_endpoint":  agent.get("encrypted_schema", {}).get("endpoint", "/secure/submit"),
            },
        }),
    )

    register_session(session_id, agent["id"])
    log_activity({
        "agent_id": agent["id"],
        "event": "handshake_initiated",
        "details": f"A2A task {task.id[:8]} submitted — {intent.get('intent', '')[:60]}",
        "privacy_type": None,
    })
    log_activity({
        "agent_id": agent["id"],
        "event": "field_classified",
        "details": (
            f"AI-safe schema: {approved_ai_safe or 'none'} | "
            f"Collected values: {[k for k in ai_safe_data if k not in ('intent_summary', 'business_type')] or 'none'}"
        ),
        "privacy_type": None,
    })
    if pii_data:
        log_activity({
            "agent_id": agent["id"],
            "event": "field_classified",
            "details": f"To encrypt: {list(pii_data.keys())}",
            "privacy_type": None,
        })

    pending = {
        "agent_id":     agent["id"],
        "agent_name":   agent.get("name", "Business"),
        "intent":       intent,
        "ai_safe_data": ai_safe_data,
        "pii_data":     pii_data,
        "policy":       policy,
        "a2a_task_id":  task.id,
    }

    response_text = (
        f"I found **{agent.get('name', 'a business agent')}** on the Pact network. "
        "Review what your agent will share below, then confirm to proceed."
    )

    return _finish_turn(
        session_id,
        "awaiting_confirm",
        memory,
        response_text,
        pending=pending,
        policy_check_result=policy,
        session_token=session_id,
        business_name=agent.get("name", "Business"),
        response_state="policy_check",
    )


def _collect_ai_safe(
    intent: dict,
    allowed_fields: list,
    context: str = "",
    overrides: dict | None = None,
) -> dict:
    result = {}
    if intent.get("intent"):
        result["intent_summary"] = str(intent["intent"])
    if intent.get("business_type"):
        result["business_type"] = str(intent["business_type"])
    for field in allowed_fields:
        key = _AI_SAFE_MAP.get(field)
        if key and intent.get(key) is not None:
            result[field] = str(intent[key])
        elif field not in result:
            val = get_field_value(context, field, overrides)
            if val:
                result[field] = val
    return result


def _collect_pii_from_context(
    context: str,
    fields_to_encrypt: list,
    overrides: dict | None = None,
) -> dict:
    result = {}
    for field in fields_to_encrypt:
        val = get_field_value(context, field, overrides)
        if val:
            result[field] = val
            continue
        pattern = _FIELD_PATTERNS.get(field)
        if pattern:
            m = pattern.search(context)
            if m:
                result[field] = m.group(1).strip()
    return result


# ── Completion (called after user approves) ────────────────────────────────────


async def _complete_booking(session_id: str, session_data: dict, memory: dict) -> dict:
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

    # ── Persist completion + conversation memory ─────────────────────────────
    bookings = list(memory.get("completed_bookings", []))
    bookings.append({
        "agent_id":          agent_id,
        "agent_name":        agent_name,
        "confirmation_code": confirmation_code,
        "order_id":          order_id,
        "intent":            intent.get("intent", ""),
    })
    memory["completed_bookings"] = bookings[-10:]
    memory["last_discussed_agent_id"] = agent_id
    memory["last_discussed_agent_name"] = agent_name

    return _finish_turn(
        session_id,
        "idle",
        memory,
        confirmation_text,
        confirmation_code=confirmation_code,
        policy_check_result=session_data.get("policy"),
        response_state="complete",
    )
