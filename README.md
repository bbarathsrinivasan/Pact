# Pact — Privacy-Preserving AI Agent Network

Pact is a protocol where your personal AI agent negotiates reservations and bookings with business agents, sharing only what you've approved — sensitive data is encrypted end-to-end and never passes through any AI model.

## Setup

### 1. Configure environment variables

```bash
cp .env .env.local   # or edit .env directly
```

Generate encryption keys:

```python
from cryptography.fernet import Fernet
print(Fernet.generate_key().decode())  # run twice — one for each key
```

Set in `.env`:
```
GEMINI_API_KEY=your_gemini_api_key
ENCRYPTION_KEY=<generated_key>
BUSINESS_ENCRYPTION_KEY=<generated_key>
```

### 2. Start the backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 3. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000

---

## Demo Script — 5-Step Reservation Flow

**Step 1 — Business Onboarding**
Navigate to http://localhost:3000/business. Enter a restaurant URL (e.g. `https://trattoriasf.com`). Watch the agent scrape, classify fields, and build an agent card. Note the split: "AI can see" vs "Encrypted only".

**Step 2 — User sends intent**
On the main chat at http://localhost:3000, type:
> "Book a table for 2 at a quiet Italian place this Friday, no shellfish"

**Step 3 — Policy check**
The personal agent runs a sensitive input scan, then handshakes with the business agent registry. A PolicyCard appears showing exactly what data goes where.

**Step 4 — User confirms**
The user clicks Confirm. A ConfirmationModal appears for final approval.

**Step 5 — Completion**
The personal agent calls the business assistant with only AI-safe fields (date, party_size, dietary_needs). Encrypted fields (name, email) go directly to `/secure/submit` — the AI never sees them. A `PACT-XXXXXX` confirmation code is returned.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER BROWSER                             │
│                                                                 │
│  ┌──────────────────┐          ┌───────────────────────────┐   │
│  │   Chat UI         │          │   Business Onboarding UI  │   │
│  │   (page.tsx)      │          │   (business/page.tsx)     │   │
│  └────────┬─────────┘          └──────────────┬────────────┘   │
└───────────┼──────────────────────────────────┼─────────────────┘
            │ /api/chat                         │ /api/onboard
            ▼                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                     FASTAPI BACKEND (port 8000)                 │
│                                                                 │
│   /api/chat ──► policy.scan_for_sensitive()                    │
│                  └──► personal/agent.py                        │
│                         ├── Gemini: parse intent               │
│                         ├── /api/handshake ──► registry.py     │
│                         ├── policy.check_policy()              │
│                         └── state: "policy_check"              │
│                                                                 │
│   /api/confirm ──► personal/agent._complete_reservation()      │
│                         ├── agents/assistant.py (AI-safe only) │
│                         └── /secure/submit (encrypted direct)  │
│                                                                 │
│   /api/onboard ──► scraper.py ──► creator.py ──► builder.py   │
│                                                   └── registry │
│                                                                 │
│   /secure/submit  ◄── encrypted payload (AI never touches)     │
│                    └── decrypt with BUSINESS_ENCRYPTION_KEY    │
└─────────────────────────────────────────────────────────────────┘

Data Flow:
  AI-safe fields  ──────────────────────► Business Assistant AI
  Encrypted fields ──────────────────────► /secure/submit (direct)
  Blocked fields   ──────────────────────► nowhere (stay on device)
```
