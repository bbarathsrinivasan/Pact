"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

const API = "http://localhost:8000";

// ── Types ──────────────────────────────────────────────────────────────────────

type StepStatus = "idle" | "running" | "done" | "error";
type StepKey    = "scrape" | "classify" | "build" | "register";

interface CrawlEntry {
  url:    string;
  status: "fetching" | "done" | "skipped";
  chars?: number;
}

interface ScrapeState {
  status:    StepStatus;
  crawlLog:  CrawlEntry[];
  thinking:  string;     // live streaming text
  model:     string;
  result:    any | null; // final structured data
}

interface SimpleStep {
  status:   StepStatus;
  thinking: any | null;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "done")
    return <span style={{ color: "#22c55e", fontFamily: "monospace" }}>✓</span>;
  if (status === "running")
    return (
      <span className="pulse-dot" style={{ color: "var(--text)", fontFamily: "monospace", display: "inline-block" }}>
        ◉
      </span>
    );
  if (status === "error")
    return <span style={{ color: "#ef4444", fontFamily: "monospace" }}>✗</span>;
  return <span style={{ color: "#333", fontFamily: "monospace" }}>○</span>;
}

function StepBadge({ status, model }: { status: StepStatus; model?: string }) {
  if (status === "idle") return null;
  if (status === "running")
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        {model && (
          <span style={{ fontFamily: "monospace", fontSize: "9px", padding: "1px 6px", borderRadius: "3px", background: "rgba(167,139,250,0.07)", border: "1px solid rgba(167,139,250,0.2)", color: "#a78bfa" }}>
            {model}
          </span>
        )}
        <span style={{ fontFamily: "monospace", fontSize: "10px", padding: "2px 8px", borderRadius: "4px", background: "var(--surface)", border: "1px solid var(--border-2)", color: "var(--muted)" }}>
          Running
        </span>
      </div>
    );
  return (
    <span style={{ fontFamily: "monospace", fontSize: "10px", padding: "2px 8px", borderRadius: "4px", background: "var(--success-bg)", border: "1px solid var(--success-border)", color: "var(--success)" }}>
      Done
    </span>
  );
}

function FieldPill({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{ fontFamily: "monospace", fontSize: "9px", padding: "2px 6px", borderRadius: "3px", color, background: bg }}>
      {label}
    </span>
  );
}

function Row({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
      <span style={{ fontFamily: "monospace", fontSize: "9px", color: "#2a2a2a", minWidth: "52px" }}>{label}</span>
      <span style={{ fontFamily: "monospace", fontSize: "9px", color }}>{String(value)}</span>
    </div>
  );
}

// ── Live scrape panel (shown WHILE step is running + after) ────────────────────

function ScrapePanel({
  crawlLog,
  thinking,
  model,
  result,
  running,
}: {
  crawlLog: CrawlEntry[];
  thinking: string;
  model:    string;
  result:   any | null;
  running:  boolean;
}) {
  const [open, setOpen] = useState(true);
  const thinkRef = useRef<HTMLDivElement>(null);

  // Auto-scroll thinking box as text streams in
  useEffect(() => {
    if (thinkRef.current) {
      thinkRef.current.scrollTop = thinkRef.current.scrollHeight;
    }
  }, [thinking]);

  return (
    <div style={{ background: "#070707", border: "1px solid #1c1c1c", borderRadius: "6px", overflow: "hidden", marginTop: "8px" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
      >
        <span style={{ fontFamily: "monospace", fontSize: "10px", color: "#2a2a2a" }}>{open ? "▾" : "▸"}</span>
        <span style={{ fontFamily: "monospace", fontSize: "10px", color: "#444", flex: 1 }}>
          Scraping website · live
        </span>
        {model && (
          <span style={{ fontFamily: "monospace", fontSize: "9px", padding: "1px 6px", borderRadius: "3px", background: "rgba(167,139,250,0.07)", border: "1px solid rgba(167,139,250,0.2)", color: "#a78bfa" }}>
            {model}
          </span>
        )}
      </button>

      {open && (
        <div style={{ padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: "10px" }}>

          {/* Crawl log */}
          {crawlLog.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
              <p style={{ fontFamily: "monospace", fontSize: "9px", color: "#2a2a2a", marginBottom: "4px", letterSpacing: "0.06em" }}>
                ─ crawling ─
              </p>
              {crawlLog.map((entry, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontFamily: "monospace", fontSize: "10px", flexShrink: 0,
                    color: entry.status === "done" ? "#22c55e" : entry.status === "skipped" ? "#8a8a8a" : "#f59e0b"
                  }}>
                    {entry.status === "done" ? "✓" : entry.status === "skipped" ? "–" : "⟳"}
                  </span>
                  <span style={{ fontFamily: "monospace", fontSize: "9px", color: "#444", flex: 1, wordBreak: "break-all" }}>
                    {entry.url.replace(/^https?:\/\//, "")}
                  </span>
                  {entry.chars != null && (
                    <span style={{ fontFamily: "monospace", fontSize: "8px", color: "#2a2a2a", flexShrink: 0 }}>
                      {entry.chars} chars
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Live thinking stream */}
          {(thinking || running) && (
            <div>
              <p style={{ fontFamily: "monospace", fontSize: "9px", color: "#2a2a2a", marginBottom: "4px", letterSpacing: "0.06em" }}>
                ─ model thinking ─
              </p>
              <div
                ref={thinkRef}
                style={{
                  padding: "8px 10px", background: "#030303", border: "1px solid #111",
                  borderRadius: "4px", fontFamily: "monospace", fontSize: "9.5px",
                  color: "#333", lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word",
                  maxHeight: "260px", overflowY: "auto",
                }}
              >
                {thinking || " "}
                {running && thinking && (
                  <span style={{ color: "#a78bfa", animation: "pulse-dot 1s ease-in-out infinite" }}>▊</span>
                )}
              </div>
            </div>
          )}

          {/* Final structured result */}
          {result && (
            <div style={{ display: "flex", flexDirection: "column", gap: "5px", borderTop: "1px solid #111", paddingTop: "8px" }}>
              <p style={{ fontFamily: "monospace", fontSize: "9px", color: "#2a2a2a", marginBottom: "4px" }}>─ extracted ─</p>
              <Row label="name"     value={result.business_name}               color="#ededed" />
              <Row label="pages"    value={`${result._pages_crawled?.length ?? 1} crawled`} color="#60a5fa" />
              <Row label="products" value={`${result.products?.length ?? 0} found`}           color="#a78bfa" />
              <Row label="fields"   value={`${result.customer_fields?.length ?? 0} identified`} color="#a78bfa" />
              {result.payment_system && result.payment_system !== "unknown" && (
                <Row label="payment" value={result.payment_system}             color="#f59e0b" />
              )}
              {result.services?.length > 0 && (
                <Row label="services" value={result.services.join(", ")}       color="#8a8a8a" />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Generic thinking panel (classify / build) ─────────────────────────────────

function ThinkingPanel({ stepKey, model, thinking }: { stepKey: StepKey; model: string; thinking: any }) {
  const [open, setOpen] = useState(true);
  const t = thinking;

  const meta: React.ReactNode = (() => {
    if (stepKey === "classify") return (
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {t.ai_safe?.length > 0 && (
          <div>
            <p style={{ fontFamily: "monospace", fontSize: "9px", color: "#22c55e", marginBottom: "5px" }}>● AI-safe — passes through Gemini</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "3px" }}>
              {t.ai_safe.map((f: string) => <FieldPill key={f} label={f} color="#22c55e" bg="rgba(34,197,94,0.07)" />)}
            </div>
          </div>
        )}
        {t.encrypted?.length > 0 && (
          <div>
            <p style={{ fontFamily: "monospace", fontSize: "9px", color: "#f59e0b", marginBottom: "5px" }}>🔒 encrypted — bypasses AI entirely</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "3px" }}>
              {t.encrypted.map((f: string) => <FieldPill key={f} label={f} color="#f59e0b" bg="rgba(245,158,11,0.07)" />)}
            </div>
          </div>
        )}
        {t.privacy_note && (
          <p style={{ fontFamily: "monospace", fontSize: "9px", color: "#3a3a3a", lineHeight: 1.6 }}>{t.privacy_note}</p>
        )}
      </div>
    );

    if (stepKey === "build") {
      const slug = t.endpoint ? t.endpoint.replace("/secure/submit/", "") : "";
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {t.capabilities?.length > 0 && (
            <div>
              <p style={{ fontFamily: "monospace", fontSize: "9px", color: "#a78bfa", marginBottom: "5px" }}>capabilities</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "3px" }}>
                {t.capabilities.map((c: string) => <FieldPill key={c} label={c} color="#a78bfa" bg="rgba(167,139,250,0.07)" />)}
              </div>
            </div>
          )}
          {slug && (
            <div>
              <p style={{ fontFamily: "monospace", fontSize: "9px", color: "#f59e0b", marginBottom: "5px" }}>🔒 endpoints created</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {[
                  { method: "GET",  path: `/a2a/agents/${slug}/card`,  note: "A2A discovery" },
                  { method: "POST", path: `/a2a/agents/${slug}/tasks`, note: "A2A task creation" },
                  { method: "POST", path: t.endpoint,                  note: "AES-256 PII — AI never sees this" },
                ].map((ep) => (
                  <div key={ep.path} style={{ display: "flex", alignItems: "flex-start", gap: "6px" }}>
                    <span style={{ fontFamily: "monospace", fontSize: "8px", padding: "1px 5px", borderRadius: "3px", background: "rgba(245,158,11,0.07)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.15)", flexShrink: 0, marginTop: "1px" }}>
                      {ep.method}
                    </span>
                    <div>
                      <p style={{ fontFamily: "monospace", fontSize: "9px", color: "#8a8a8a" }}>{ep.path}</p>
                      <p style={{ fontFamily: "monospace", fontSize: "8px", color: "#2a2a2a" }}>{ep.note}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {t.privacy_note && (
            <p style={{ fontFamily: "monospace", fontSize: "9px", color: "#3a3a3a", lineHeight: 1.6 }}>{t.privacy_note}</p>
          )}
        </div>
      );
    }
    return null;
  })();

  return (
    <div style={{ background: "#070707", border: "1px solid #1c1c1c", borderRadius: "6px", overflow: "hidden", marginTop: "8px" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
      >
        <span style={{ fontFamily: "monospace", fontSize: "10px", color: "#2a2a2a" }}>{open ? "▾" : "▸"}</span>
        <span style={{ fontFamily: "monospace", fontSize: "10px", color: "#444", flex: 1 }}>
          {stepKey === "classify" ? "Classify · field routing" : "Build · agent card"}
        </span>
        <span style={{ fontFamily: "monospace", fontSize: "9px", padding: "1px 6px", borderRadius: "3px", background: "rgba(96,165,250,0.07)", border: "1px solid rgba(96,165,250,0.2)", color: "#60a5fa" }}>
          {model}
        </span>
      </button>
      {open && (
        <div style={{ padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {meta}
          {t.thoughts ? (
            <div style={{ marginTop: "4px", padding: "8px 10px", background: "#030303", border: "1px solid #111", borderRadius: "4px", fontFamily: "monospace", fontSize: "9.5px", color: "#333", lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: "200px", overflowY: "auto" }}>
              <span style={{ color: "#222", display: "block", marginBottom: "6px" }}>─ model thinking ─</span>
              {t.thoughts}
            </div>
          ) : (
            <p style={{ fontFamily: "monospace", fontSize: "9px", color: "#2a2a2a", fontStyle: "italic" }}>
              (thinking trace not available for this model)
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function BusinessPage() {
  const [started, setStarted]   = useState(false);
  const [url, setUrl]           = useState("");
  const [error, setError]       = useState<string | null>(null);
  const [agentCard, setAgentCard] = useState<any>(null);
  const router = useRouter();

  // Scrape step — rich live state
  const [scrape, setScrape] = useState<ScrapeState>({
    status: "idle", crawlLog: [], thinking: "", model: "", result: null,
  });

  // Classify + Build steps — simple
  const [classify, setClassify] = useState<SimpleStep>({ status: "idle", thinking: null });
  const [build,    setBuild]    = useState<SimpleStep>({ status: "idle", thinking: null });
  const [register, setRegister] = useState<SimpleStep>({ status: "idle", thinking: null });

  // ── SSE consumer helper ──────────────────────────────────────────────
  const consumeScrapeSSE = async (streamUrl: string, body: object) => {
    const res = await fetch(streamUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      // Try to surface a meaningful error from the JSON body (e.g. 409 duplicate)
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.detail ?? `HTTP ${res.status}`);
    }
    if (!res.body) throw new Error("No response body");

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer    = "";
    let finalData: any = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE lines
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        let event: any;
        try { event = JSON.parse(line.slice(6)); } catch { continue; }

        switch (event.type) {
          case "crawl_start":
            setScrape((s) => ({
              ...s,
              crawlLog: [...s.crawlLog, { url: event.url, status: "fetching" }],
            }));
            break;

          case "crawl_done":
            setScrape((s) => ({
              ...s,
              crawlLog: s.crawlLog.map((e, i) =>
                i === event.index ? { ...e, status: "done", chars: event.chars } : e
              ),
            }));
            break;

          case "crawl_skip":
            setScrape((s) => ({
              ...s,
              crawlLog: s.crawlLog.map((e, i) =>
                i === event.index ? { ...e, status: "skipped" } : e
              ),
            }));
            break;

          case "model_start":
            setScrape((s) => ({ ...s, model: event.model }));
            break;

          case "thinking":
            setScrape((s) => ({ ...s, thinking: s.thinking + event.chunk }));
            break;

          case "result":
            finalData = event.data;
            setScrape((s) => ({ ...s, result: event.data, status: "done" }));
            break;

          case "error":
            setScrape((s) => ({ ...s, status: "error" }));
            throw new Error(event.message ?? "Scraper error");
        }
      }
    }
    return finalData;
  };

  // ── Main build flow ──────────────────────────────────────────────────
  const startBuild = async () => {
    if (!url.trim()) return;
    setStarted(true);
    setError(null);
    setAgentCard(null);
    setScrape({ status: "idle", crawlLog: [], thinking: "", model: "", result: null });
    setClassify({ status: "idle", thinking: null });
    setBuild({ status: "idle", thinking: null });
    setRegister({ status: "idle", thinking: null });

    try {
      // ── Step 1: Scrape (SSE streaming) ────────────────────────────
      setScrape((s) => ({ ...s, status: "running" }));
      const businessData = await consumeScrapeSSE(`${API}/api/onboard/scrape`, { url });
      if (!businessData) throw new Error("Scrape produced no result");

      // ── Step 2: Classify ──────────────────────────────────────────
      setClassify({ status: "running", thinking: null });
      const classRes  = await fetch(`${API}/api/onboard/classify`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business_data: businessData }),
      });
      if (!classRes.ok) throw new Error(`Classify failed: ${classRes.status}`);
      const classData = await classRes.json();
      setClassify({ status: "done", thinking: classData.thinking });

      // ── Step 3: Build ─────────────────────────────────────────────
      setBuild({ status: "running", thinking: null });
      const buildRes  = await fetch(`${API}/api/onboard/build`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classified:    classData.classified,
          business_name: businessData.business_name ?? "Business",
        }),
      });
      if (!buildRes.ok) throw new Error(`Build failed: ${buildRes.status}`);
      const buildData = await buildRes.json();
      setBuild({ status: "done", thinking: buildData.thinking });

      // ── Step 4: Register (visual beat only) ───────────────────────
      setRegister({ status: "running", thinking: null });
      await new Promise((r) => setTimeout(r, 350));
      setRegister({ status: "done", thinking: null });
      setAgentCard(buildData.agent_card);

      if (typeof window !== "undefined") {
        localStorage.setItem("pact_business_agent_id", buildData.agent_card.id);
      }
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong");
    }
  };

  // ── IDLE ─────────────────────────────────────────────────────────────────
  if (!started) {
    return (
      <div className="flex flex-col items-center" style={{ paddingTop: "96px", minHeight: "calc(100vh - 44px)" }}>
        <div style={{ width: "480px" }}>
          <p style={{ color: "var(--muted)", fontFamily: "monospace" }} className="text-lg mb-5">◈</p>
          <h1 className="text-xl font-medium mb-1" style={{ color: "var(--text)" }}>Business Onboarding</h1>
          <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>
            Turn your website into an AI agent that joins the Pact network.
          </p>
          <div className="flex items-center gap-2 mb-8">
            <span style={{ fontFamily: "monospace", fontSize: "10px", padding: "2px 8px", borderRadius: "4px", background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.25)", color: "#a78bfa" }}>
              Antigravity · Crawler + Extractor
            </span>
            <span style={{ fontFamily: "monospace", fontSize: "10px", padding: "2px 8px", borderRadius: "4px", background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.25)", color: "#60a5fa" }}>
              Gemini 3.5 Flash · Classify + Build
            </span>
          </div>
          <div className="mb-8">
            <p className="text-xs uppercase tracking-widest mb-4" style={{ color: "var(--muted-2)" }}>How it works</p>
            <div className="space-y-3">
              {["Paste your website URL",
                "Antigravity crawls related pages and streams its reasoning",
                "AI classifies what data stays private",
                "Your agent is registered with per-business secure endpoints",
              ].map((text, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span style={{ fontFamily: "monospace", color: "var(--muted-2)", minWidth: "24px" }} className="text-sm">0{i + 1}</span>
                  <span className="text-sm" style={{ color: "var(--muted)" }}>{text}</span>
                </div>
              ))}
            </div>
          </div>
          <input
            value={url} onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && startBuild()}
            placeholder="https://your-store.com"
            style={{ height: "36px", width: "100%", padding: "0 12px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "6px", color: "var(--text)", fontFamily: "monospace", fontSize: "13px", outline: "none" }}
            onFocus={(e) => (e.target.style.borderColor = "#333")}
            onBlur={(e)  => (e.target.style.borderColor = "var(--border)")}
          />
          <button onClick={startBuild} disabled={!url.trim()} style={{ width: "100%", height: "36px", marginTop: "8px", background: "var(--accent)", color: "var(--bg)", fontSize: "13px", fontWeight: 500, borderRadius: "6px", border: "none", cursor: url.trim() ? "pointer" : "not-allowed", opacity: url.trim() ? 1 : 0.4 }}>
            Build My Agent
          </button>
          <div className="mt-6 pt-5" style={{ borderTop: "1px solid var(--border)" }}>
            <p className="text-xs" style={{ color: "var(--muted-2)" }}>
              Try the demo store →{" "}
              <button onClick={() => setUrl("http://localhost:3000/store")} className="underline" style={{ color: "var(--muted)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                localhost:3000/store
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── BUILDING ─────────────────────────────────────────────────────────────
  const steps: { key: StepKey; label: string; sub: string; status: StepStatus; model?: string }[] = [
    { key: "scrape",   label: "Scraping website",    sub: "Crawling pages and reasoning about content",  status: scrape.status,   model: scrape.model || "Antigravity" },
    { key: "classify", label: "Classifying fields",  sub: "Routing AI-safe vs encrypted data",           status: classify.status, model: "Gemini 3.5 Flash" },
    { key: "build",    label: "Building agent card", sub: "Generating capabilities and endpoints",        status: build.status,    model: "Gemini 3.5 Flash" },
    { key: "register", label: "Registering agent",   sub: "Adding to Pact network",                      status: register.status  },
  ];

  return (
    <div className="flex flex-col items-center" style={{ paddingTop: "56px", paddingBottom: "60px", minHeight: "calc(100vh - 44px)" }}>
      <div style={{ width: "580px" }}>
        <p style={{ color: "var(--text)" }} className="text-sm font-medium mb-1">Building your agent</p>
        <p style={{ color: "var(--muted)", fontFamily: "monospace" }} className="text-xs mb-8 truncate">{url}</p>

        {error && (
          <div style={{ background: "#1a0a0a", border: "1px solid #7f1d1d", borderRadius: "6px", padding: "10px 14px", marginBottom: "20px", fontFamily: "monospace", fontSize: "11px", color: "#ef4444" }}>
            ✗ {error}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {steps.map((step) => (
            <div key={step.key}>
              {/* Step row */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                <div style={{ marginTop: "1px", width: "16px", textAlign: "center" }}>
                  <StepIcon status={step.status} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span className="text-sm" style={{ color: step.status === "idle" ? "var(--muted-2)" : "var(--text)" }}>
                      {step.label}
                    </span>
                    <StepBadge status={step.status} model={step.status === "running" ? step.model : undefined} />
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: "var(--muted-2)" }}>{step.sub}</p>
                  {/* Classify quick summary */}
                  {step.key === "classify" && step.status === "done" && classify.thinking && (
                    <p className="text-xs mt-1" style={{ color: "#22c55e", fontFamily: "monospace" }}>
                      ✓ {classify.thinking.ai_safe?.length ?? 0} AI-safe · {classify.thinking.encrypted?.length ?? 0} encrypted
                    </p>
                  )}
                </div>
              </div>

              {/* ── Thinking panels ────────────────────────────── */}
              {step.key === "scrape" && (scrape.status === "running" || scrape.status === "done") && (
                <div style={{ marginLeft: "28px" }}>
                  <ScrapePanel
                    crawlLog={scrape.crawlLog}
                    thinking={scrape.thinking}
                    model={scrape.model}
                    result={scrape.result}
                    running={scrape.status === "running"}
                  />
                </div>
              )}
              {step.key === "classify" && step.status === "done" && classify.thinking && (
                <div style={{ marginLeft: "28px" }}>
                  <ThinkingPanel stepKey="classify" model="gemini-3.5-flash" thinking={classify.thinking} />
                </div>
              )}
              {step.key === "build" && step.status === "done" && build.thinking && (
                <div style={{ marginLeft: "28px" }}>
                  <ThinkingPanel stepKey="build" model="gemini-3.5-flash" thinking={build.thinking} />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── View Dashboard ───────────────────────────────────── */}
        {agentCard && (
          <div style={{ marginTop: "32px", borderTop: "1px solid #1a1a1a", paddingTop: "24px", display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontFamily: "monospace", fontSize: "11px", color: "#22c55e" }}>✓</span>
              <span style={{ fontSize: "13px", color: "var(--text)", fontWeight: 500 }}>
                {agentCard.name} registered on Pact
              </span>
            </div>
            <p style={{ fontFamily: "monospace", fontSize: "10px", color: "#444" }}>{agentCard.id}</p>
            <button
              onClick={() => router.push(`/business/dashboard?id=${encodeURIComponent(agentCard.id)}`)}
              style={{ height: "36px", padding: "0 20px", marginTop: "4px", background: "var(--accent)", color: "var(--bg)", fontSize: "13px", fontWeight: 500, borderRadius: "6px", border: "none", cursor: "pointer", alignSelf: "flex-start" }}
            >
              View Dashboard →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
