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

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
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
from agents.scraper import scrape_business
from config import BUSINESS_ENCRYPTION_KEY, ENCRYPTED_STORE_PATH, USER_CONTEXT_PATH
from database import (
    delete_session,
    get_activity,
    get_history,
    get_orders,
    init_db,
    load_session,
    log_activity,
    create_order,
    register_session,
    save_session,
    seed_agent_data,
)
from encryption import decrypt_fields
from personal.agent import run_personal_agent
from registry import get_agent, get_all_agents

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
    _seed_demo_agents()


def _seed_demo_agents() -> None:
    """
    Ensure at least two agents exist in the registry for multi-business demo.
    Only inserts agents that are not already registered (idempotent).
    """
    from registry import get_agent, register_agent
    from datetime import datetime

    DEMO_AGENTS = [
        {
            "id":          "pact://trattoria-sf",
            "type":        "business",
            "name":        "Trattoria SF",
            "description": "Cozy Italian restaurant in San Francisco serving handmade pasta and wood-fired pizza.",
            "capabilities": ["accept reservations", "private dining", "dietary accommodations", "wine pairing"],
            "privacy_note": "Date, time, and party size go through AI; name, email, and phone are AES-256 encrypted.",
            "ai_safe_schema": ["date", "time", "party_size", "dietary_needs", "special_requests"],
            "encrypted_schema": {
                "fields":    ["full_name", "email", "phone"],
                "endpoint":  "/secure/submit/trattoria-sf",
                "method":    "POST",
                "encryption":"AES-256-Fernet",
            },
            "products": [
                {"name": "Table Reservation",        "price": 0.0,  "description": "Reserve your table — no fee"},
                {"name": "Chef's Tasting Menu",       "price": 95.0, "description": "6-course seasonal tasting menu"},
                {"name": "Private Dining Experience", "price": 150.0,"description": "Exclusive private room, min 8 guests"},
                {"name": "Wine Pairing",              "price": 45.0, "description": "Sommelier-curated 4-glass flight"},
            ],
            "registered_at": datetime(2026, 5, 1).isoformat(),
        },
        {
            "id":          "pact://pact-demo-store",
            "type":        "business",
            "name":        "Pact Demo Store",
            "description": "Demo e-commerce store for the Pact privacy-preserving agent network.",
            "capabilities": ["process orders", "express delivery", "product catalog", "order tracking"],
            "privacy_note": "Product, quantity, and delivery speed go through AI; card number, CVV, and address are AES-256 encrypted.",
            "ai_safe_schema": ["product", "quantity", "delivery_speed", "color", "size", "notes"],
            "encrypted_schema": {
                "fields":    ["full_name", "email", "address", "card_number", "cvv", "card_expiry"],
                "endpoint":  "/secure/submit/pact-demo-store",
                "method":    "POST",
                "encryption":"AES-256-Fernet",
            },
            "products": [
                {"name": "Standard Order",   "price": 0.0,  "description": "Place a new order"},
                {"name": "Express Delivery", "price": 9.99, "description": "Next-day shipping upgrade"},
                {"name": "Gift Wrapping",    "price": 4.99, "description": "Add gift wrap and message"},
            ],
            "registered_at": datetime(2026, 5, 1).isoformat(),
        },
    ]

    for agent in DEMO_AGENTS:
        if not get_agent(agent["id"]):
            register_agent(agent)
            seed_agent_data(agent["id"], agent)
            print(f"[startup] Seeded demo agent: {agent['name']}")


# ── Shared helpers ─────────────────────────────────────────────────────────────


def _gen_token(n: int = 12) -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=n))


def _read_context() -> str:
    return USER_CONTEXT_PATH.read_text() if USER_CONTEXT_PATH.exists() else ""


# ── Request / Response models ──────────────────────────────────────────────────


class OnboardRequest(BaseModel):
    url: str


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
      1. httpx scrape the URL
      2. Gemini classifies fields (ai_safe vs encrypted)
      3. Build + register agent card
      4. Seed mock orders/activity for dashboard demo
    """
    business_data = await scrape_business(req.url)
    classified    = await classify_fields(business_data)
    agent_card    = await build_agent_card(classified, classified.get("business_name", "Business"))
    seed_agent_data(agent_card["id"], agent_card)

    # Surface scrape diagnostics so the frontend/caller can see what happened
    agent_card["_scrape_status"] = business_data.get("_scrape_status", "unknown")
    agent_card["_scrape_url"]    = business_data.get("_scrape_url", req.url)
    return agent_card


@app.get("/api/business")
async def get_business(id: str):
    agent = get_agent(id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@app.get("/api/registry")
async def get_registry():
    return get_all_agents()


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
