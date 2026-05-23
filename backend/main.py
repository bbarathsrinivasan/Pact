"""
Pact FastAPI application.

Routes
──────
Personal agent
  POST /api/chat          – main chat endpoint
  POST /api/confirm       – user approval gate
  GET  /api/context       – read user_context.md
  DELETE /api/context     – wipe user data

Business onboarding
  POST /api/onboard       – scrape → classify → build agent card
  GET  /api/business      – fetch single agent card by id
  GET  /api/registry      – all registered agent cards

Orders & activity (dashboard)
  GET  /api/orders        – orders for an agent
  POST /api/orders        – manually create an order
  GET  /api/activity      – activity log for an agent
  POST /api/activity      – log an activity event

Privacy endpoint (AI never touches this path)
  POST /secure/submit     – receive AES-256 encrypted PII, decrypt, store

A2A protocol
  GET  /a2a/agents/{slug}/card            – A2A-format agent card
  POST /a2a/agents/{slug}/tasks           – create A2A task
  GET  /a2a/agents/{slug}/tasks/{task_id} – task status/result
  GET  /.well-known/agent.json            – Pact's own A2A discovery card
"""

import json
import random
import string
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from a2a import (
    A2AMessage,
    A2ATask,
    agent_url_slug,
    pact_to_a2a_card,
    task_create,
    task_get,
)
from agents.builder import build_agent_card
from agents.creator import classify_fields
from agents.scraper import crawl_and_extract, scrape_business
from config import BUSINESS_ENCRYPTION_KEY, ENCRYPTED_STORE_PATH, USER_CONTEXT_PATH
from database import (
    delete_session,
    delete_agent_data,
    get_activity,
    get_history,
    get_orders,
    init_db,
    load_session,
    log_activity,
    create_order,
    register_session,
    save_session,
)
from encryption import decrypt_fields
from personal.agent import run_personal_agent
from registry import delete_agent, get_agent, get_all_agents

app = FastAPI(title="Pact — Privacy-Preserving Agent Network")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Startup ────────────────────────────────────────────────────────────────────


@app.on_event("startup")
async def startup() -> None:
    init_db()


# ── Shared helpers ─────────────────────────────────────────────────────────────


def _gen_token(n: int = 12) -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=n))


def _read_context() -> str:
    return USER_CONTEXT_PATH.read_text() if USER_CONTEXT_PATH.exists() else ""


# ── Request / Response models ──────────────────────────────────────────────────


class OnboardRequest(BaseModel):
    url: str

class OnboardClassifyRequest(BaseModel):
    business_data: dict

class OnboardBuildRequest(BaseModel):
    classified: dict
    business_name: str


class ChatRequest(BaseModel):
    message: str
    session_id: str = "default"


class ConfirmRequest(BaseModel):
    session_token: str
    approved: bool


class SecureSubmitRequest(BaseModel):
    encrypted_payload: str
    session_token: str


class OrderCreate(BaseModel):
    agent_id: str
    product: str
    quantity: int = 1
    total: float = 0.0
    delivery_speed: str = "standard"
    session_id: str | None = None
    status: str = "confirmed"


class ActivityCreate(BaseModel):
    agent_id: str
    event: str
    details: str | None = None
    privacy_type: str | None = None


class A2ATaskRequest(BaseModel):
    message: str
    session_id: str = "anonymous"


# ── Business onboarding ────────────────────────────────────────────────────────


@app.post("/api/onboard")
async def onboard(req: OnboardRequest):
    """
    Full onboarding pipeline:
      1. httpx scrape the URL (Antigravity thinking model)
      2. Gemini classifies fields (ai_safe vs encrypted)
      3. Build + register agent card (Gemini generates capabilities)
      4. Seed mock orders/activity for dashboard demo
    Returns step-by-step thinking traces for UI display.
    """
    business_data = await scrape_business(req.url)
    classified    = await classify_fields(business_data)
    scrape_url    = business_data.get("_scrape_url", req.url)
    agent_card    = await build_agent_card(classified, classified.get("business_name", "Business"), scrape_url=scrape_url)

    # Surface scrape diagnostics + full thinking chain for the onboarding UI
    agent_card["_scrape_status"] = business_data.get("_scrape_status", "unknown")
    agent_card["_scrape_url"]    = business_data.get("_scrape_url", req.url)
    agent_card["_thinking"] = {
        "scrape": {
            "model":          business_data.get("_scrape_model", "unknown"),
            "status":         business_data.get("_scrape_status", "unknown"),
            "page_chars":     business_data.get("_page_chars", 0),
            "thoughts":       business_data.get("_thought_summary", ""),
            "extracted_name": business_data.get("business_name", ""),
            "num_fields":     len(business_data.get("customer_fields", [])),
            "num_products":   len(business_data.get("products", [])),
            "services":       business_data.get("services", []),
        },
        "classify": {
            "model":          "gemini-3.5-flash",
            "thoughts":       classified.get("_thought_summary", ""),
            "ai_safe":        classified.get("ai_safe", []),
            "encrypted":      classified.get("encrypted", []),
            "privacy_note":   classified.get("privacy_note", ""),
        },
        "build": {
            "model":          "gemini-3.5-flash",
            "thoughts":       agent_card.get("_thought_summary", ""),
            "capabilities":   agent_card.get("capabilities", []),
            "privacy_note":   agent_card.get("privacy_note", ""),
            "endpoint":       agent_card.get("encrypted_schema", {}).get("endpoint", ""),
        },
    }

    # Strip internal thinking fields from the stored agent card (not needed in registry)
    for k in ("_thoughts", "_thought_summary"):
        agent_card.pop(k, None)

    return agent_card


# ── Streaming onboarding — three separate steps ────────────────────────────────


def _url_domain(url: str) -> str:
    """Normalise a URL to its bare hostname, stripping www."""
    try:
        return urlparse(url).netloc.lower().removeprefix("www.")
    except Exception:
        return ""


@app.post("/api/onboard/scrape")
async def onboard_scrape_stream(req: OnboardRequest):
    """
    Step 1: Multi-page crawl + Antigravity streaming extraction.
    Returns text/event-stream (SSE).  Each event is a JSON line:
      data: {"type": "crawl_start"|"crawl_done"|"thinking"|"result", …}
    The final event is always type="result" with the full business_data dict.
    Raises 409 if an agent for the same domain is already registered.
    """
    # ── Duplicate URL check (before starting the stream) ──────────────
    incoming_domain = _url_domain(req.url)
    if incoming_domain:
        for agent in get_all_agents().values():
            existing_domain = _url_domain(agent.get("source_url", ""))
            if existing_domain and existing_domain == incoming_domain:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"'{agent['name']}' is already registered for {incoming_domain}. "
                        "Delete it from the registry first to re-onboard."
                    ),
                )

    async def generate():
        async for event in crawl_and_extract(req.url):
            yield f"data: {json.dumps(event)}\n\n"
        yield "data: {\"type\": \"done\"}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":    "no-cache",
            "X-Accel-Buffering":"no",
            "Connection":       "keep-alive",
        },
    )


@app.post("/api/onboard/classify")
async def onboard_classify(req: OnboardClassifyRequest):
    """Step 2: Classify fields into ai_safe vs encrypted with Gemini."""
    classified = await classify_fields(req.business_data)
    return {
        "classified": classified,
        "thinking": {
            "model":        "gemini-3.5-flash",
            "thoughts":     classified.get("_thought_summary", ""),
            "ai_safe":      classified.get("ai_safe", []),
            "encrypted":    classified.get("encrypted", []),
            "privacy_note": classified.get("privacy_note", ""),
        },
    }


@app.post("/api/onboard/build")
async def onboard_build(req: OnboardBuildRequest):
    """Step 3: Build agent card with Gemini and register it. No pre-populated data."""
    scrape_url = req.classified.get("_scrape_url", "")
    agent_card = await build_agent_card(req.classified, req.business_name, scrape_url=scrape_url)
    thinking = {
        "model":        "gemini-3.5-flash",
        "thoughts":     agent_card.get("_thought_summary", ""),
        "capabilities": agent_card.get("capabilities", []),
        "privacy_note": agent_card.get("privacy_note", ""),
        "endpoint":     agent_card.get("encrypted_schema", {}).get("endpoint", ""),
    }
    for k in ("_thoughts", "_thought_summary"):
        agent_card.pop(k, None)
    return {"agent_card": agent_card, "thinking": thinking}


@app.get("/api/business")
async def get_business(id: str):
    agent = get_agent(id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@app.get("/api/registry")
async def get_registry():
    return get_all_agents()


@app.delete("/api/registry")
async def delete_registry_agent(id: str):
    """
    Delete an agent from the registry by its full ID (e.g. pact://my-business).
    Also purges all associated orders and activity from the database.
    """
    agent = get_agent(id)
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent '{id}' not found")
    delete_agent(id)
    delete_agent_data(id)
    return {"deleted": id, "name": agent.get("name", "")}


# ── Personal agent chat ────────────────────────────────────────────────────────


@app.post("/api/chat")
async def chat(req: ChatRequest):
    """
    Main chat endpoint. Runs the full personal agent pipeline:
    sensitive scan → intent parse → agent discovery → policy check.
    Returns state that drives the frontend UI.
    """
    context = _read_context()
    return await run_personal_agent(req.message, context, req.session_id)


@app.post("/api/confirm")
async def confirm(req: ConfirmRequest):
    """
    User confirmed the policy check. Triggers booking completion:
    - Sends AI-safe data to business assistant (Gemini)
    - Sends encrypted PII directly to /secure/submit (bypasses AI)
    - Creates order in database
    - Completes A2A task
    """
    if not req.approved:
        save_session(req.session_token, "cancelled", {})
        return {"state": "idle", "cancelled": True, "response": "Booking cancelled."}

    context = _read_context()
    # Empty message signals the completion path inside run_personal_agent
    return await run_personal_agent("", context, req.session_token)


# ── Privacy endpoint (AI NEVER touches this route) ────────────────────────────


@app.post("/secure/submit/{slug}")
@app.post("/secure/submit")
async def secure_submit(req: SecureSubmitRequest, slug: str = "default"):
    """
    Receives AES-256-Fernet encrypted PII from the personal agent.
    THE AI ASSISTANT NEVER CALLS THIS ROUTE — it is a direct encrypted channel.

    Storage policy (secure at rest):
      - The encrypted blob is ALWAYS stored as-is (model never has access).
      - If BUSINESS_ENCRYPTION_KEY is available, a decrypted copy is stored
        in a separate 'pii_decrypted' key for business-side retrieval only.
      - The route is scoped per business via {slug} so stores don't mix.
    """
    code = "PACT-" + _gen_token(6)
    store = json.loads(ENCRYPTED_STORE_PATH.read_text()) if ENCRYPTED_STORE_PATH.exists() else {}

    entry: dict = {
        "business_slug":    slug,
        "session_token":    req.session_token,
        "encrypted_payload": req.encrypted_payload,   # always stored encrypted
        "received_at":      __import__("datetime").datetime.now().isoformat(),
    }

    # Optionally decrypt for business-side display (never exposed to AI models)
    if BUSINESS_ENCRYPTION_KEY:
        try:
            entry["pii_decrypted"] = decrypt_fields(req.encrypted_payload, BUSINESS_ENCRYPTION_KEY)
        except Exception as exc:
            entry["decrypt_error"] = str(exc)

    store[code] = entry
    ENCRYPTED_STORE_PATH.write_text(json.dumps(store, indent=2))
    return {"confirmation": code, "slug": slug}


# ── Context ────────────────────────────────────────────────────────────────────


@app.get("/api/context")
async def get_context():
    return {"context": _read_context()}


class ContextUpdate(BaseModel):
    context: str


@app.post("/api/context")
async def update_context(req: ContextUpdate):
    """Save user context (user_context.md)."""
    USER_CONTEXT_PATH.parent.mkdir(parents=True, exist_ok=True)
    USER_CONTEXT_PATH.write_text(req.context)
    return {"success": True}


@app.delete("/api/context")
async def delete_context():
    if USER_CONTEXT_PATH.exists():
        USER_CONTEXT_PATH.write_text("")
    return {"success": True}


@app.get("/api/history")
async def get_chat_history():
    """Return recent personal agent interaction sessions."""
    return get_history(limit=30)


# ── Orders ─────────────────────────────────────────────────────────────────────


@app.get("/api/orders")
async def list_orders(agent_id: str):
    return get_orders(agent_id)


@app.post("/api/orders")
async def new_order(req: OrderCreate):
    return create_order(req.model_dump())


# ── Activity log ───────────────────────────────────────────────────────────────


@app.get("/api/activity")
async def list_activity(agent_id: str):
    return get_activity(agent_id)


@app.post("/api/activity")
async def new_activity(req: ActivityCreate):
    log_activity(req.model_dump())
    return {"ok": True}


# ── A2A Protocol routes ────────────────────────────────────────────────────────


@app.get("/.well-known/agent.json")
async def well_known():
    """Pact's own A2A discovery card."""
    return {
        "name": "Pact Personal Agent",
        "description": (
            "Privacy-preserving personal AI agent. "
            "Negotiates with business agents via A2A while keeping PII "
            "encrypted and never passing through any AI model."
        ),
        "url": "http://localhost:8000",
        "version": "1.0.0",
        "capabilities": {
            "streaming": False,
            "pushNotifications": False,
            "stateTransitionHistory": True,
        },
        "skills": [
            {"id": "reservation",  "name": "Make Reservations",        "inputModes": ["text"]},
            {"id": "discovery",    "name": "Discover Business Agents",  "inputModes": ["text"]},
            {"id": "policy_check", "name": "Privacy Policy Enforcement","inputModes": ["data"]},
        ],
        "extensions": {
            "pact": {
                "protocol_version": "1.0",
                "encryption":       "AES-256-Fernet",
                "privacy_guarantee": "PII never passes through any AI model",
            }
        },
    }


def _find_agent_by_slug(slug: str) -> dict | None:
    return next(
        (a for a in get_all_agents().values() if agent_url_slug(a["id"]) == slug),
        None,
    )


@app.get("/a2a/agents/{slug}/card")
async def a2a_get_card(slug: str):
    """Return the A2A-format agent card for a registered business."""
    agent = _find_agent_by_slug(slug)
    if not agent:
        raise HTTPException(status_code=404, detail=f"No agent with slug '{slug}'")
    return pact_to_a2a_card(agent)


@app.post("/a2a/agents/{slug}/tasks")
async def a2a_create_task(slug: str, req: A2ATaskRequest):
    """
    Create a new A2A task for a business agent.
    The task carries AI-safe data only; encrypted fields bypass this route.
    """
    agent = _find_agent_by_slug(slug)
    if not agent:
        raise HTTPException(status_code=404, detail=f"No agent with slug '{slug}'")

    msg  = A2AMessage.user_text(req.message)
    task = task_create(agent["id"], req.session_id, msg)

    log_activity({
        "agent_id":     agent["id"],
        "event":        "handshake_initiated",
        "details":      f"A2A task {task.id[:8]} created for session {req.session_id[:8]}",
        "privacy_type": None,
    })

    register_session(req.session_id, agent["id"])
    return task.model_dump()


@app.get("/a2a/agents/{slug}/tasks/{task_id}")
async def a2a_get_task(slug: str, task_id: str):
    """Poll for A2A task status and result."""
    task = task_get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task.model_dump()


@app.get("/a2a/agents/{slug}")
async def a2a_agent_info(slug: str):
    """Entry point for an A2A agent — returns its card."""
    agent = _find_agent_by_slug(slug)
    if not agent:
        raise HTTPException(status_code=404, detail=f"No agent with slug '{slug}'")
    return pact_to_a2a_card(agent)
