"""
Real business website scraper.

Flow:
  1. httpx async GET → raw HTML
  2. Strip tags/scripts → visible text (no extra deps, pure regex)
  3. Feed text to Gemini 3.5 Flash for structured extraction
  4. Parse JSON response → business_data dict
  5. Fallback to hardcoded Trattoria SF on any error
"""

import html as html_lib
import json
import re

import httpx
from google import genai

from config import GEMINI_API_KEY, SCRAPER_MODEL

# ── Fallback ───────────────────────────────────────────────────────────────────

_FALLBACK: dict = {
    "business_name": "Trattoria SF",
    "description": (
        "A cozy Italian restaurant in the heart of San Francisco "
        "serving handmade pasta and wood-fired pizza since 1987."
    ),
    "services": ["dine-in reservations", "private events", "takeout", "catering"],
    "customer_fields": [
        "full_name", "email", "phone",
        "date", "time", "party_size",
        "dietary_needs", "special_requests",
    ],
    "products": [
        {"name": "Table Reservation",        "price": 0.0,   "description": "Reserve your table — no fee"},
        {"name": "Chef's Tasting Menu",       "price": 95.0,  "description": "6-course seasonal tasting menu"},
        {"name": "Private Dining Experience", "price": 150.0, "description": "Exclusive private room, min 8 guests"},
        {"name": "Wine Pairing",              "price": 45.0,  "description": "Sommelier-curated 4-glass flight"},
    ],
}

# ── HTML text extraction ───────────────────────────────────────────────────────

_TAG_RE    = re.compile(r"<[^>]+>")
_BLOCK_RE  = re.compile(
    r"<(script|style|noscript|nav|footer|header)[^>]*>.*?</\1>",
    re.DOTALL | re.IGNORECASE,
)
_SPACE_RE  = re.compile(r"\s{2,}")


def _extract_text(raw_html: str, max_chars: int = 8_000) -> str:
    text = _BLOCK_RE.sub(" ", raw_html)
    text = _TAG_RE.sub(" ", text)
    text = html_lib.unescape(text)
    text = _SPACE_RE.sub(" ", text).strip()
    return text[:max_chars]


# ── Gemini extraction ─────────────────────────────────────────────────────────

_PROMPT_TMPL = """\
You are extracting structured business information for an AI booking agent.

{content_section}

Return ONLY a valid JSON object with these exact keys:
{{
  "business_name": "exact name of the business",
  "description": "1-2 sentence description of what they do and their vibe",
  "services": ["list of 2-5 services or offerings"],
  "customer_fields": ["fields needed for booking — pick from: full_name, email, phone, date, time, party_size, dietary_needs, special_requests, address, payment_method"],
  "products": [
    {{"name": "product or service name", "price": 0.0, "description": "one-line description"}}
  ]
}}

Rules:
- customer_fields must include at minimum: full_name, email, date
- products: list 3-6 real or inferred offerings with realistic USD prices (0.0 if free)
- If you cannot determine a price, estimate based on typical market rates
- Return ONLY the JSON, no markdown fences, no explanation
"""


async def scrape_business(url: str) -> dict:
    """
    Fetch a business URL and extract structured data via Gemini.
    Returns a dict with a '_scrape_status' key for debugging:
      'live'     — page fetched + Gemini extracted
      'url_only' — page fetch failed, Gemini inferred from URL
      'fallback' — Gemini also failed, hardcoded Trattoria data used
    """

    # ── Step 1: HTTP fetch ─────────────────────────────────────────────────
    page_text = ""
    fetch_error = ""
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(20.0),
            follow_redirects=True,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"
                ),
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
            },
        ) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            raw_html = resp.text
            page_text = _extract_text(raw_html)
            if len(page_text.strip()) < 100:
                # Page rendered via JS — we got a shell
                page_text = ""
                fetch_error = "JS-rendered page (content empty after tag stripping)"
    except Exception as exc:
        fetch_error = str(exc)
        print(f"[scraper] HTTP fetch failed: {fetch_error}")

    # ── Step 2: Build Gemini prompt ────────────────────────────────────────
    scrape_mode = "live" if page_text else "url_only"
    if page_text:
        content_section = (
            f"Website URL: {url}\n\n"
            f"Extracted page text ({len(page_text)} chars):\n{page_text}"
        )
    else:
        content_section = (
            f"Website URL: {url}\n\n"
            f"(Page could not be fetched: {fetch_error or 'unknown error'})\n"
            "Infer business type, services, and fields from the URL and domain name alone. "
            "Make reasonable assumptions for a real business of this type."
        )

    prompt = _PROMPT_TMPL.format(content_section=content_section)

    # ── Step 3: Call Gemini 3.5 Flash for structured extraction ─────────────
    client = genai.Client(api_key=GEMINI_API_KEY)

    try:
        response = await client.aio.models.generate_content(
            model=SCRAPER_MODEL,
            contents=prompt,
        )
        raw = response.text.strip()
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)

        match = re.search(r"\{[\s\S]*\}", raw)
        data = json.loads(match.group() if match else raw)

        if "business_name" not in data:
            raise ValueError("Missing business_name in model response")

        data["_scrape_status"] = scrape_mode
        data["_scrape_url"]    = url
        data["_scrape_model"]  = SCRAPER_MODEL
        print(f"[scraper] ✓ '{data['business_name']}' via {SCRAPER_MODEL}/{scrape_mode} from {url}")
        return data

    except Exception as exc:
        print(f"[scraper] {SCRAPER_MODEL} failed ({exc}); using hardcoded fallback")

    result = dict(_FALLBACK)
    result["_scrape_status"] = "fallback"
    result["_scrape_url"]    = url
    result["_scrape_model"]  = "fallback"
    return result
