"""
Real business website crawler + Antigravity-powered extractor.

Flow
────
1.  Fetch the seed URL — extract visible text
2.  Parse same-domain links → score by keyword relevance
    (pricing, booking, payment, membership, plans, shop…)
3.  Fetch up to MAX_EXTRA_PAGES additional pages concurrently
4.  Build a multi-page context section for the model
5.  Call Antigravity with include_thoughts=True and STREAM the response
6.  Yield SSE-style event dicts throughout so callers can push to the UI
7.  Fallback chain: Antigravity → Gemini 3.5 Flash → hardcoded Trattoria SF

SSE event shapes
────────────────
{"type": "crawl_start",  "url": "…", "index": 0}
{"type": "crawl_done",   "url": "…", "index": 0, "chars": 1209}
{"type": "crawl_skip",   "url": "…", "index": 0, "reason": "…"}
{"type": "model_start",  "model": "antigravity-preview-05-2026"}
{"type": "thinking",     "chunk": "…"}       ← streams in real-time
{"type": "result",       "data": {…}}        ← final structured result
{"type": "error",        "message": "…"}
"""

from __future__ import annotations

import asyncio
import html as html_lib
import json
import re
from typing import AsyncGenerator
from urllib.parse import urljoin, urlparse

import httpx
from google import genai

from config import GEMINI_API_KEY, GEMINI_MODEL, SCRAPER_MODEL

# ── Constants ──────────────────────────────────────────────────────────────────

MAX_EXTRA_PAGES = 4       # extra pages to crawl beyond the seed URL
MAX_CHARS_PER_PAGE = 3_000  # truncate each page to this length
MAX_TOTAL_CHARS = 10_000   # total prompt budget for all pages

_PRIORITY_KEYWORDS = [
    "pricing", "price", "plan", "plans",
    "membership", "member", "join", "subscribe",
    "booking", "book", "reserve", "reservation", "appointment",
    "payment", "checkout", "checkout", "pay", "purchase", "buy",
    "menu", "shop", "store", "product", "service", "package", "offering",
    "contact", "about", "faq", "how-it-works",
]

_SKIP_EXTENSIONS = {
    "css", "js", "png", "jpg", "jpeg", "gif", "svg", "ico",
    "woff", "woff2", "ttf", "eot", "pdf", "zip", "mp4", "webp",
}

# ── HTML helpers ───────────────────────────────────────────────────────────────

_TAG_RE   = re.compile(r"<[^>]+>")
_BLOCK_RE = re.compile(
    r"<(script|style|noscript|nav|footer|header)[^>]*>.*?</\1>",
    re.DOTALL | re.IGNORECASE,
)
_SPACE_RE = re.compile(r"\s{2,}")


def _extract_text(raw_html: str, max_chars: int = MAX_CHARS_PER_PAGE) -> str:
    text = _BLOCK_RE.sub(" ", raw_html)
    text = _TAG_RE.sub(" ", text)
    text = html_lib.unescape(text)
    text = _SPACE_RE.sub(" ", text).strip()
    return text[:max_chars]


def _find_related_links(raw_html: str, base_url: str) -> list[str]:
    """
    Extract and score same-domain links by keyword relevance.
    Returns at most MAX_EXTRA_PAGES URLs, deduplicated, highest-score first.
    """
    base = urlparse(base_url)
    hrefs = re.findall(r'href=["\']([^"\'#]+)["\']', raw_html, re.IGNORECASE)

    scored: list[tuple[int, str]] = []
    seen: set[str] = {base_url}

    for href in hrefs:
        full = urljoin(base_url, href.split("?")[0])  # strip query strings
        parsed = urlparse(full)

        if parsed.netloc != base.netloc:
            continue
        if full in seen:
            continue

        # Skip static assets
        ext = parsed.path.rsplit(".", 1)[-1].lower() if "." in parsed.path.split("/")[-1] else ""
        if ext in _SKIP_EXTENSIONS:
            continue

        path_lower = parsed.path.lower()
        score = sum(1 for kw in _PRIORITY_KEYWORDS if kw in path_lower)
        if score > 0:
            scored.append((score, full))
            seen.add(full)

    scored.sort(key=lambda x: -x[0])
    return [url for _, url in scored[:MAX_EXTRA_PAGES]]


# ── HTTP fetcher ───────────────────────────────────────────────────────────────

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


async def _fetch_page(url: str, client: httpx.AsyncClient) -> tuple[str, str]:
    """Fetch a URL and return (raw_html, visible_text). Returns ('','') on failure."""
    try:
        resp = await client.get(url, headers=_HEADERS, timeout=15.0, follow_redirects=True)
        resp.raise_for_status()
        raw  = resp.text
        text = _extract_text(raw)
        if len(text.strip()) < 80:
            return raw, ""   # JS-rendered — raw kept for link extraction
        return raw, text
    except Exception as exc:
        print(f"[scraper] fetch {url}: {exc}")
        return "", ""


# ── Prompt ─────────────────────────────────────────────────────────────────────

_PROMPT_TMPL = """\
You are extracting structured business information for an AI booking/purchasing agent.
You have been given content from MULTIPLE pages of the same website — use ALL of them.

{content_section}

Pay special attention to:
- Exact pricing and plan names (look in pricing/membership/shop pages)
- Any payment systems mentioned (Stripe, PayPal, Square, etc.)
- Booking or checkout forms and the fields they require
- Whether purchases are one-time or subscription

Return ONLY a valid JSON object with these exact keys:
{{
  "business_name":    "exact name of the business",
  "description":      "1-2 sentence description including vibe and location if known",
  "services":         ["2-6 specific service or product categories"],
  "customer_fields":  ["fields needed — pick from: full_name, email, phone, address, date, time, party_size, dietary_needs, special_requests, payment_method, card_number, cvv, card_expiry, product, quantity, delivery_speed, color, size, notes, membership_tier"],
  "products": [
    {{"name": "exact product/plan name", "price": 0.0, "description": "one-line description"}}
  ],
  "payment_system":   "stripe | paypal | square | custom | none | unknown",
  "has_online_booking": true
}}

Rules:
- customer_fields MUST include at minimum: full_name, email
- For e-commerce / subscription: always include card_number, cvv, card_expiry
- For booking/reservation: include date, time, party_size
- products: list 3-8 real offerings with exact prices found on the site (0.0 if free)
- Return ONLY the JSON, no markdown fences, no explanation
"""


def _build_content_section(base_url: str, pages: list[tuple[str, str]]) -> str:
    if not pages:
        return (
            f"Website URL: {base_url}\n\n"
            "(No pages could be fetched — likely JS-rendered.)\n"
            "Infer business type, services, and pricing from the URL and domain name only."
        )
    parts = [f"Seed URL: {base_url}\n"]
    total = 0
    for url, text in pages:
        label = "— Main page" if url == base_url else f"— {url}"
        chunk = text[: MAX_CHARS_PER_PAGE]
        if total + len(chunk) > MAX_TOTAL_CHARS:
            chunk = chunk[: MAX_TOTAL_CHARS - total]
        parts.append(f"\n{'─' * 60}\n{label} ({len(chunk)} chars):\n{chunk}")
        total += len(chunk)
        if total >= MAX_TOTAL_CHARS:
            break
    return "\n".join(parts)


# ── Fallback ───────────────────────────────────────────────────────────────────

_FALLBACK: dict = {
    "business_name":      "Trattoria SF",
    "description":        "A cozy Italian restaurant in San Francisco.",
    "services":           ["dine-in", "takeout", "catering"],
    "customer_fields":    ["full_name", "email", "phone", "date", "time", "party_size"],
    "products": [
        {"name": "Table Reservation",        "price": 0.0,   "description": "Reserve a table"},
        {"name": "Chef's Tasting Menu",       "price": 95.0,  "description": "6-course seasonal"},
        {"name": "Private Dining Experience", "price": 150.0, "description": "Private room"},
        {"name": "Wine Pairing",              "price": 45.0,  "description": "4-glass flight"},
    ],
    "payment_system":     "unknown",
    "has_online_booking": True,
}


# ── Main streaming generator ───────────────────────────────────────────────────

async def crawl_and_extract(url: str) -> AsyncGenerator[dict, None]:
    """
    Multi-page crawl + Antigravity streaming extraction.
    Yields SSE-style event dicts — callers wrap in `data: …\\n\\n`.
    """
    pages: list[tuple[str, str]] = []   # (url, visible_text)
    raw_html_seed = ""

    async with httpx.AsyncClient() as http_client:

        # ── 1. Seed page ───────────────────────────────────────────────
        yield {"type": "crawl_start", "url": url, "index": 0}
        raw_html_seed, text = await _fetch_page(url, http_client)
        if text:
            pages.append((url, text))
            yield {"type": "crawl_done", "url": url, "index": 0, "chars": len(text)}
        else:
            yield {"type": "crawl_skip", "url": url, "index": 0, "reason": "empty / JS-rendered"}

        # ── 2. Related pages ───────────────────────────────────────────
        if raw_html_seed:
            related = _find_related_links(raw_html_seed, url)
            tasks   = [_fetch_page(u, http_client) for u in related]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            for i, (rel_url, outcome) in enumerate(zip(related, results), start=1):
                yield {"type": "crawl_start", "url": rel_url, "index": i}
                if isinstance(outcome, Exception) or not isinstance(outcome, tuple):
                    yield {"type": "crawl_skip", "url": rel_url, "index": i, "reason": str(outcome)}
                    continue
                _, rel_text = outcome
                if rel_text:
                    pages.append((rel_url, rel_text))
                    yield {"type": "crawl_done", "url": rel_url, "index": i, "chars": len(rel_text)}
                else:
                    yield {"type": "crawl_skip", "url": rel_url, "index": i, "reason": "empty / JS"}

    # ── 3. Build prompt ────────────────────────────────────────────────
    content_section = _build_content_section(url, pages)
    prompt = _PROMPT_TMPL.format(content_section=content_section)

    # ── 4. Call Antigravity (streaming + thinking) ─────────────────────
    models_to_try = [SCRAPER_MODEL, GEMINI_MODEL]
    thoughts = ""
    answer   = ""
    used_model = SCRAPER_MODEL

    for model in models_to_try:
        # Always surface "Antigravity" as the display name — it's the product
        # brand for this scraper step regardless of which API model handles the
        # fallback under the hood.
        yield {"type": "model_start", "model": "Antigravity"}
        thoughts = ""
        answer   = ""
        used_model = model
        success  = False

        try:
            client = genai.Client(api_key=GEMINI_API_KEY)

            # Try streaming with ThinkingConfig
            try:
                from google.genai import types as _t
                cfg = _t.GenerateContentConfig(
                    thinking_config=_t.ThinkingConfig(include_thoughts=True)
                )
                async for chunk in client.aio.models.generate_content_stream(
                    model=model, contents=prompt, config=cfg
                ):
                    if not chunk.candidates:
                        continue
                    for part in chunk.candidates[0].content.parts:
                        text_chunk = getattr(part, "text", "") or ""
                        if not text_chunk:
                            continue
                        if getattr(part, "thought", False):
                            thoughts += text_chunk
                            yield {"type": "thinking", "chunk": text_chunk}
                        else:
                            answer += text_chunk
                success = True
                break

            except Exception as think_exc:
                print(f"[scraper] ThinkingConfig failed for {model} ({think_exc}); plain stream")
                # Plain streaming without thinking
                try:
                    async for chunk in client.aio.models.generate_content_stream(
                        model=model, contents=prompt
                    ):
                        if not chunk.candidates:
                            continue
                        text_chunk = (chunk.candidates[0].content.parts[0].text or "") if chunk.candidates[0].content.parts else ""
                        answer += text_chunk
                    success = True
                    break
                except Exception as stream_exc:
                    print(f"[scraper] Plain stream failed for {model} ({stream_exc}); non-stream")
                    # Last resort: non-streaming
                    resp = await client.aio.models.generate_content(model=model, contents=prompt)
                    answer = (resp.text or "").strip()
                    success = True
                    break

        except Exception as exc:
            print(f"[scraper] {model} completely failed: {exc}")
            continue

    # ── 5. Parse JSON ──────────────────────────────────────────────────
    if answer.strip():
        try:
            raw = re.sub(r"^```(?:json)?\s*", "", answer.strip())
            raw = re.sub(r"\s*```$", "", raw)
            m   = re.search(r"\{[\s\S]*\}", raw)
            data = json.loads(m.group() if m else raw)

            if "business_name" not in data:
                raise ValueError("Missing business_name")

            data["_scrape_status"]    = "live" if pages else "url_only"
            data["_scrape_url"]       = url
            data["_scrape_model"]     = used_model
            data["_thoughts"]         = thoughts
            data["_thought_summary"]  = (thoughts[:700] + "…") if len(thoughts) > 700 else thoughts
            data["_page_chars"]       = sum(len(t) for _, t in pages)
            data["_pages_crawled"]    = [u for u, _ in pages]
            print(f"[scraper] ✓ '{data['business_name']}' via {used_model}, {len(pages)} pages")
            yield {"type": "result", "data": data}
            return

        except Exception as parse_exc:
            print(f"[scraper] JSON parse failed: {parse_exc}")

    # ── 6. Hardcoded fallback ──────────────────────────────────────────
    result = dict(_FALLBACK)
    result.update({
        "_scrape_status":   "fallback",
        "_scrape_url":      url,
        "_scrape_model":    "fallback",
        "_thoughts":        "",
        "_thought_summary": "",
        "_page_chars":      0,
        "_pages_crawled":   [],
    })
    yield {"type": "result", "data": result}


# ── Convenience wrapper (non-streaming, for backward compat) ──────────────────

async def scrape_business(url: str) -> dict:
    """Non-streaming wrapper — collects all events and returns the final result."""
    data = None
    async for event in crawl_and_extract(url):
        if event["type"] == "result":
            data = event["data"]
    return data or dict(_FALLBACK)
