<div align="center">

# 🔐 Pact

### *The Privacy-Preserving AI Agent Network*

**Your AI agent negotiates with businesses on your behalf — sharing only what you approve, encrypting everything else.**

[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Frontend-Next.js-000000?style=flat-square&logo=nextdotjs)](https://nextjs.org)
[![Gemini](https://img.shields.io/badge/AI-Gemini%202.0-4285F4?style=flat-square&logo=google)](https://ai.google.dev)
[![AES-256](https://img.shields.io/badge/Encryption-AES--256%20Fernet-8B5CF6?style=flat-square&logo=opensourceinitiative)](https://cryptography.io)
[![A2A](https://img.shields.io/badge/Protocol-Agent--to--Agent-F59E0B?style=flat-square)](https://github.com)

</div>

---

## 💡 The Problem

Every time you book a restaurant, buy something online, or reserve a workspace, you hand over your name, email, phone, and card details to an AI chatbot that has no obligation to protect it. Your data flows through models, logs, and third-party pipelines you've never consented to.

**Pact fixes this.**

---

## ✨ What Is Pact?

Pact is a two-sided protocol connecting **personal AI agents** with **business AI agents** — with privacy enforcement built into every handshake.

```
You ──► Your Pact Agent ──► [Policy Engine] ──► Business Agent
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
              AI-safe fields              Encrypted fields
          (product, date, size)      (name, card, email, phone)
                    │                             │
                    ▼                             ▼
           Business AI Model           /secure/submit endpoint
           (Gemini sees this)         (AI NEVER sees this ✓)
```

---

## 👤 The Personal Side — *Your Agent*

### Chat Interface (`localhost:3000`)

Your personal Pact agent is your privacy-first shopping and booking assistant.

| Feature | Description |
|---|---|
| 🛍️ **Smart Shopping** | Say "I want to buy shoes" → agent finds matching stores based on your saved size, budget & brand preferences |
| 📅 **Booking & Reservations** | Book restaurants, workspaces, gyms — the agent handles the whole negotiation |
| 🔒 **Sensitive Data Shield** | Phone, email, card details typed in chat are **blocked** before reaching any AI |
| 💾 **Session Memory** | Tell it your shoe size once — it remembers for the whole session |
| 🎯 **Preference Matching** | Stores are ranked by how well they match *your* profile (size, budget, brands) |

### How It Works — Shoe Shopping Example

```
1.  You:    "I want to buy shoes"

2.  Agent:  Finds Sole Studio SF based on your preferences
            ✓ Matched: size 10.5 · budget under $150 · love Nike, Adidas, Vans

3.  UI:     Shows budget-filtered product grid with images

4.  You:    Click "Buy this →" on Nike Air Force 1

5.  UI:     Pre-confirm card — "Ready to order? Confirm and I'll handle the rest"

6.  You:    Click "Buy it"

7.  Agent:  Creates A2A task → handshakes with Sole Studio SF agent
            AI-safe: product="Nike AF1", size="10.5", quantity="1"
            Encrypted: name, address, card → /secure/submit (AI never sees)

8.  Done:   Order confirmed · PACT-XXXXXX
```

### Your Privacy Policy (Fully Configurable)

Set once in the **Profile tab**, honoured everywhere:

```markdown
## Always Encrypt (send direct, never through AI)
- full_name, email, address, card_number, cvv, card_expiry, phone

## OK to Share Through AI
- date, party_size, product, size, color, quantity, delivery_speed

## Never Share
- SSN
```

---

## 🏢 The Business Side — *Your Agent*

### Onboarding (`localhost:3000/business`)

Businesses join Pact in minutes — no integration code required.

| Feature | Description |
|---|---|
| 🕷️ **Antigravity Scraper** | Crawls up to 5 pages of your website, streams live thinking |
| 🧠 **AI Field Classifier** | Automatically splits fields into AI-safe vs encrypted-only |
| 📋 **Agent Card** | Generates a structured card with capabilities, products, and pricing |
| 🔑 **AES-256 Endpoint** | A `/secure/submit` endpoint provisioned — encrypted data arrives here |
| 🚫 **Duplicate Detection** | Same URL can't be onboarded twice |

### Business Dashboard (`localhost:3000/business/dashboard`)

Real-time visibility into every interaction — without seeing customer PII.

```
┌─────────────────┬──────────────────┬─────────────────┐
│   Total Orders  │  Confirmed Today  │  Encrypted Sends│
│      24  ✓      │      8  ✓         │     72  🔒      │
└─────────────────┴──────────────────┴─────────────────┘

Live A2A Protocol Feed:
  ◎ CLASSIFY   product → ai_safe
  ● ENCRYPT    card_number → direct
  ✓ SUBMIT     /secure/submit — 128 bytes
  ⚡ CONFIRM   Order PACT-94A8 complete
```

---

## 🏗️ Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                        USER BROWSER                            │
│                                                                │
│  ┌─────────────────┐            ┌───────────────────────────┐ │
│  │  Personal Chat  │            │  Business Onboarding      │ │
│  │  page.tsx       │            │  business/page.tsx        │ │
│  └────────┬────────┘            └──────────────┬────────────┘ │
└───────────┼─────────────────────────────────────┼────────────┘
            │ POST /api/chat                       │ GET /api/onboard/stream
            ▼                                      ▼
┌────────────────────────────────────────────────────────────────┐
│                  FASTAPI BACKEND  :8000                        │
│                                                                │
│  /api/chat                                                     │
│    └──► scan_for_sensitive()       ← blocks PII before AI     │
│    └──► personal/agent.py                                      │
│           ├── Gemini: parse intent                             │
│           ├── registry: find matching business agent           │
│           ├── check_policy() → approved / encrypt / blocked    │
│           └── state = "policy_check"  →  return to UI         │
│                                                                │
│  /api/confirm                                                  │
│    └──► _complete_booking()                                    │
│           ├── agents/assistant.py  (AI-safe fields ONLY)      │
│           ├── encrypt_fields()  →  AES-256-Fernet             │
│           └── POST /secure/submit  (AI never in this path)    │
│                                                                │
│  /api/onboard/stream  (SSE)                                    │
│    └──► scraper.py  →  streams Antigravity thinking           │
│    └──► creator.py  →  classifies fields                      │
│    └──► builder.py  →  builds agent card                      │
│    └──► registry.py →  saves to registry.json                 │
│                                                                │
│  /secure/submit/:slug                                          │
│    └──► decrypt with BUSINESS_ENCRYPTION_KEY                  │
│    └──► store in encrypted_store.json                         │
└────────────────────────────────────────────────────────────────┘
```

### Data Classification — Three Tiers

| Tier | Examples | Path | AI Sees? |
|---|---|---|---|
| ✅ **AI-Safe** | date, product, size, party_size | → Business AI model | Yes |
| 🔒 **Encrypted** | name, email, card, phone, address | → `/secure/submit` direct | **Never** |
| 🚫 **Blocked** | SSN | → Nowhere | **Never** |

---

## 🚀 Getting Started

### 1. Environment Variables

```bash
# Generate encryption keys
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# Run twice — one for ENCRYPTION_KEY, one for BUSINESS_ENCRYPTION_KEY
```

Create `backend/.env`:
```env
GEMINI_API_KEY=your_gemini_api_key
ENCRYPTION_KEY=<generated_key_1>
BUSINESS_ENCRYPTION_KEY=<generated_key_2>
```

### 2. Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:3000** 🎉

---

## 🎬 Demo Flow

### Personal Side
1. Go to `localhost:3000`
2. Type **"I want to buy shoes"** → see preference-matched store + budget-filtered catalog
3. Click **"Buy this →"** on any product → pre-confirm card appears
4. Click **"Buy it"** → A2A handshake → PolicyCard shows exactly what goes where
5. Click **"Confirm"** → encrypted order placed, confirmation code returned

### Business Side
1. Go to `localhost:3000/business`
2. Paste any business URL → watch Antigravity scrape + stream thinking in real time
3. Review the generated agent card (AI-safe fields vs encrypted fields)
4. Visit `localhost:3000/business/dashboard` → see live orders, activity log, A2A protocol feed

---

## 🔑 Key Technical Properties

- **Zero PII through AI** — The AI model receives a session token, never the actual user data
- **Forward secrecy** — Each session generates independent encrypted payloads
- **User-controlled policy** — The user's `user_context.md` is the single source of truth for what can be shared
- **A2A Protocol** — Standardised task lifecycle: `submitted → working → completed`
- **Streaming scraper** — Business onboarding streams Server-Sent Events; Antigravity thinking appears in real time

---

## 📁 Project Structure

```
Pact/
├── backend/
│   ├── main.py                  # FastAPI app, all endpoints
│   ├── personal/
│   │   └── agent.py             # Personal agent orchestrator
│   ├── agents/
│   │   ├── scraper.py           # Multi-page crawler + Antigravity extractor
│   │   ├── creator.py           # Field classifier
│   │   ├── builder.py           # Agent card builder
│   │   └── assistant.py        # Business AI assistant (AI-safe only)
│   ├── policy.py                # Privacy policy engine
│   ├── encryption.py            # AES-256-Fernet helpers
│   ├── registry.py              # Business agent registry
│   ├── a2a.py                   # A2A task protocol
│   ├── user_context.py          # User profile parser
│   └── data/
│       ├── user_context.md      # Your privacy policy & profile
│       └── registry.json        # Registered business agents
└── frontend/
    ├── app/
    │   ├── page.tsx             # Personal chat
    │   ├── business/page.tsx    # Business onboarding
    │   └── business/dashboard/  # Business dashboard
    └── components/
        ├── ChatWindow.tsx       # Main chat UI + product grid
        ├── PolicyCard.tsx       # Privacy review card
        ├── LiveProtocol.tsx     # A2A protocol feed
        └── ...
```

---

<div align="center">

**Built at CMU Hackathon 2026** · Privacy shouldn't be a feature — it should be the protocol.

</div>
