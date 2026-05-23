"""
Google A2A (Agent-to-Agent) Protocol — Pact Implementation
Spec: https://google.github.io/A2A/specification/   v0.2.1

Flow:
  Personal Agent  →  task_create()          → status: submitted
  Business Agent  →  task.set_working()     → status: working
  Business Agent  →  task.complete(artifact)→ status: completed
  Error path      →  task.fail(reason)      → status: failed

The A2A task is the unit of inter-agent communication.
AI-safe data travels in task messages; encrypted fields bypass
the task entirely and go direct to /secure/submit.
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


# ── Typed message parts ────────────────────────────────────────────────────────


class TextPart(BaseModel):
    type: Literal["text"] = "text"
    text: str


class DataPart(BaseModel):
    type: Literal["data"] = "data"
    data: dict[str, Any]


# ── Message ────────────────────────────────────────────────────────────────────


class A2AMessage(BaseModel):
    role: Literal["user", "agent"]
    parts: list[TextPart | DataPart] = []

    @classmethod
    def user_text(cls, text: str) -> "A2AMessage":
        return cls(role="user", parts=[TextPart(text=text)])

    @classmethod
    def user_data(cls, data: dict) -> "A2AMessage":
        return cls(role="user", parts=[DataPart(data=data)])

    @classmethod
    def agent_text(cls, text: str) -> "A2AMessage":
        return cls(role="agent", parts=[TextPart(text=text)])

    def get_text(self) -> str:
        for p in self.parts:
            if isinstance(p, TextPart):
                return p.text
        return ""

    def get_data(self) -> dict | None:
        for p in self.parts:
            if isinstance(p, DataPart):
                return p.data
        return None


# ── Task lifecycle ─────────────────────────────────────────────────────────────

TaskStatus = Literal["submitted", "working", "input-required", "completed", "failed"]


class A2ATask(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    agent_id: str
    session_id: str | None = None
    status: TaskStatus = "submitted"
    messages: list[A2AMessage] = []
    artifacts: list[dict[str, Any]] = []
    metadata: dict[str, Any] = {}
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now().isoformat())

    def _touch(self) -> None:
        self.updated_at = datetime.now().isoformat()

    def set_working(self) -> None:
        self.status = "working"
        self._touch()

    def add_agent_message(self, text: str) -> None:
        self.messages.append(A2AMessage.agent_text(text))
        self._touch()

    def complete(self, artifact: dict) -> None:
        self.artifacts.append({"type": "booking_confirmation", **artifact})
        self.status = "completed"
        self._touch()

    def fail(self, reason: str) -> None:
        self.status = "failed"
        self.metadata["error"] = reason
        self._touch()

    def get_confirmation(self) -> str | None:
        for a in self.artifacts:
            if "confirmation_code" in a:
                return a["confirmation_code"]
        return None


# ── Task store (in-process; tasks are ephemeral within a server run) ───────────

_store: dict[str, A2ATask] = {}


def task_create(agent_id: str, session_id: str, first_msg: A2AMessage) -> A2ATask:
    task = A2ATask(agent_id=agent_id, session_id=session_id, messages=[first_msg])
    _store[task.id] = task
    return task


def task_get(task_id: str) -> A2ATask | None:
    return _store.get(task_id)


def task_save(task: A2ATask) -> None:
    _store[task.id] = task


# ── Agent Card helpers ─────────────────────────────────────────────────────────


def _slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")


def agent_url_slug(agent_id: str) -> str:
    """pact://some-restaurant → some-restaurant"""
    return re.sub(r"[^a-z0-9\-]+", "-", agent_id.lower()).strip("-")


def pact_to_a2a_card(card: dict, base_url: str = "http://localhost:8000") -> dict:
    """
    Convert a Pact registry card to A2A Agent Card JSON format.
    Published at: GET /a2a/agents/{slug}/card
    """
    slug = agent_url_slug(card["id"])
    return {
        "name": card.get("name", "Business Agent"),
        "description": card.get("description", ""),
        "url": f"{base_url}/a2a/agents/{slug}",
        "version": "0.2.1",
        "capabilities": {
            "streaming": False,
            "pushNotifications": False,
            "stateTransitionHistory": True,
        },
        "skills": [
            {
                "id": _slugify(cap),
                "name": cap,
                "description": f"Handles {cap} requests",
                "inputModes": ["text", "data"],
                "outputModes": ["text"],
            }
            for cap in card.get("capabilities", [])
        ],
        "defaultInputModes": ["text", "data"],
        "defaultOutputModes": ["text"],
        "extensions": {
            "pact": {
                "agent_id": card["id"],
                "protocol_version": "1.0",
                "ai_safe_schema": card.get("ai_safe_schema", []),
                "encrypted_schema": card.get("encrypted_schema", {}),
                "privacy_endpoint": f"{base_url}/secure/submit",
                "encryption": "AES-256-Fernet",
                "note": "Encrypted fields bypass all AI models and go direct to privacy_endpoint.",
            }
        },
    }
