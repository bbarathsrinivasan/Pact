import json
import random
import string
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from config import USER_CONTEXT_PATH, ENCRYPTED_STORE_PATH, BUSINESS_ENCRYPTION_KEY
from encryption import decrypt_fields
from registry import get_all_agents, find_agents_by_capability, get_agent
from agents.scraper import scrape_business
from agents.creator import classify_fields
from agents.builder import build_agent_card
from personal.agent import run_personal_agent
from database import (
    init_db, get_orders, create_order,
    log_activity, get_activity, count_sessions,
    register_session, seed_agent_data,
)

app = FastAPI(title="Pact API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_sessions: dict = {}


def _gen_token(n: int = 12) -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=n))


# ── Startup ──────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    init_db()


# ── Models ────────────────────────────────────────────────────────────────────

class OnboardRequest(BaseModel):
    url: str

class HandshakeRequest(BaseModel):
    intent: str
    capability: str

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


# ── Business agent routes ─────────────────────────────────────────────────────

@app.post("/api/onboard")
async def onboard(req: OnboardRequest):
    business_data = scrape_business(req.url)
    classified = classify_fields(business_data)
    agent_card = build_agent_card(classified, classified.get("business_name", "Business"))
    seed_agent_data(agent_card["id"], agent_card)
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


# ── Handshake / Personal agent ────────────────────────────────────────────────

@app.post("/api/handshake")
async def handshake(req: HandshakeRequest):
    agents = find_agents_by_capability(req.capability)
    if not agents:
        agents = list(get_all_agents().values())

    if not agents:
        return {
            "session_token": _gen_token(),
            "ai_safe_schema": ["date", "party_size", "dietary_needs", "cuisine_preference"],
            "encrypted_schema": ["full_name", "email", "phone"],
            "secure_endpoint": "/secure/submit",
            "business_agent_id": "pact://trattoria-sf",
            "business_name": "Trattoria SF",
        }

    agent = agents[0]
    token = _gen_token()
    _sessions[token] = {"agent": agent, "intent": req.intent}

    # Track session
    register_session(token, agent["id"])

    # Log activity
    log_activity({
        "agent_id": agent["id"],
        "event": "handshake_initiated",
        "details": f"Personal agent connected — intent: {req.intent[:60]}",
        "privacy_type": None,
    })

    return {
        "session_token": token,
        "ai_safe_schema": agent.get("ai_safe_schema", []),
        "encrypted_schema": agent.get("encrypted_schema", {}).get("fields", []),
        "secure_endpoint": agent.get("encrypted_schema", {}).get("endpoint", "/secure/submit"),
        "business_agent_id": agent["id"],
        "business_name": agent.get("name", "Business"),
    }


@app.post("/api/chat")
async def chat(req: ChatRequest):
    session = _sessions.setdefault(req.session_id, {"state": "idle"})
    context = USER_CONTEXT_PATH.read_text() if USER_CONTEXT_PATH.exists() else ""
    result = await run_personal_agent(req.message, context, session)
    return result


@app.post("/api/confirm")
async def confirm(req: ConfirmRequest):
    if not req.approved:
        session = _sessions.get(req.session_token, {})
        session["approved"] = False
        return {"confirmation_code": None, "cancelled": True}

    session = _sessions.get(req.session_token, {})
    session["approved"] = True
    session["state"] = "awaiting_confirm"

    context = USER_CONTEXT_PATH.read_text() if USER_CONTEXT_PATH.exists() else ""
    result = await run_personal_agent("", context, session)
    return result


@app.post("/secure/submit")
async def secure_submit(req: SecureSubmitRequest):
    if not BUSINESS_ENCRYPTION_KEY:
        code = "PACT-" + _gen_token(6)
        store = json.loads(ENCRYPTED_STORE_PATH.read_text()) if ENCRYPTED_STORE_PATH.exists() else {}
        store[code] = {"token": req.session_token, "payload": req.encrypted_payload}
        ENCRYPTED_STORE_PATH.write_text(json.dumps(store, indent=2))
        return {"confirmation": code}

    try:
        data = decrypt_fields(req.encrypted_payload, BUSINESS_ENCRYPTION_KEY)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Decryption failed: {e}")

    code = "PACT-" + _gen_token(6)
    store = json.loads(ENCRYPTED_STORE_PATH.read_text()) if ENCRYPTED_STORE_PATH.exists() else {}
    store[code] = {"token": req.session_token, "data": data}
    ENCRYPTED_STORE_PATH.write_text(json.dumps(store, indent=2))
    return {"confirmation": code}


# ── Context routes ────────────────────────────────────────────────────────────

@app.get("/api/context")
async def get_context():
    if not USER_CONTEXT_PATH.exists():
        return {"context": ""}
    return {"context": USER_CONTEXT_PATH.read_text()}


@app.delete("/api/context")
async def delete_context():
    if USER_CONTEXT_PATH.exists():
        USER_CONTEXT_PATH.write_text("")
    return {"success": True}


# ── Orders routes ─────────────────────────────────────────────────────────────

@app.get("/api/orders")
async def list_orders(agent_id: str):
    return get_orders(agent_id)


@app.post("/api/orders")
async def new_order(req: OrderCreate):
    return create_order(req.model_dump())


# ── Activity routes ───────────────────────────────────────────────────────────

@app.get("/api/activity")
async def list_activity(agent_id: str):
    return get_activity(agent_id)


@app.post("/api/activity")
async def new_activity(req: ActivityCreate):
    log_activity(req.model_dump())
    return {"ok": True}
