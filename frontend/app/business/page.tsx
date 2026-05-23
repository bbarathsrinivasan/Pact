"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const API = "http://localhost:8000";

type State = "idle" | "building" | "complete";

const STEPS = [
  { label: "Scraping website",    sub: (url: string) => `Fetching content from ${url}` },
  { label: "Classifying fields",  sub: () => "Separating AI-safe from encrypted data" },
  { label: "Building agent card", sub: () => "Generating capability schema" },
  { label: "Registering agent",   sub: () => "Adding to Pact network" },
];

const STEP_TIMES = [0, 3500, 5000, 6200];
const REDIRECT_TIME = 7200;

function StepIcon({ status }: { status: "waiting" | "active" | "done" }) {
  if (status === "done")
    return <span style={{ color: "var(--success)", fontFamily: "monospace" }}>✓</span>;
  if (status === "active")
    return <span className="pulse-dot" style={{ color: "var(--text)", fontFamily: "monospace" }}>◉</span>;
  return <span style={{ color: "#333", fontFamily: "monospace" }}>○</span>;
}

function StepBadge({ status }: { status: "waiting" | "active" | "done" }) {
  if (status === "waiting") return null;
  if (status === "active")
    return (
      <span
        className="text-xs px-2 py-0.5 rounded"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border-2)",
          color: "var(--muted)",
          fontFamily: "monospace",
        }}
      >
        Running
      </span>
    );
  return (
    <span
      className="text-xs px-2 py-0.5 rounded"
      style={{
        background: "var(--success-bg)",
        border: "1px solid var(--success-border)",
        color: "var(--success)",
        fontFamily: "monospace",
      }}
    >
      Done
    </span>
  );
}

export default function BusinessPage() {
  const [pageState, setPageState] = useState<State>("idle");
  const [url, setUrl] = useState("");
  const [currentStep, setCurrentStep] = useState(-1);
  const [apiResult, setApiResult] = useState<any>(null);
  const apiDone = useRef(false);
  const animDone = useRef(false);
  const router = useRouter();

  const tryRedirect = (result: any) => {
    if (apiDone.current && animDone.current && result) {
      setPageState("complete");
      setTimeout(() => {
        router.push(`/business/dashboard?id=${encodeURIComponent(result.id)}`);
        if (typeof window !== "undefined") {
          localStorage.setItem("pact_business_agent_id", result.id);
        }
      }, 600);
    }
  };

  const startBuild = async () => {
    if (!url.trim()) return;
    setPageState("building");
    setCurrentStep(0);
    apiDone.current = false;
    animDone.current = false;
    setApiResult(null);

    // Fire API immediately
    const fetchPromise = fetch(`${API}/api/onboard`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    })
      .then((r) => r.json())
      .then((data) => {
        apiDone.current = true;
        setApiResult(data);
        tryRedirect(data);
        return data;
      })
      .catch(() => {
        apiDone.current = true;
        // fallback so animation still completes
        const fallback = { id: "pact://demo-business" };
        setApiResult(fallback);
        tryRedirect(fallback);
      });

    // Drive step animation on fixed timings
    STEP_TIMES.forEach((t, i) => {
      setTimeout(() => setCurrentStep(i), t);
    });

    setTimeout(() => {
      animDone.current = true;
      setCurrentStep(4); // all done
      fetchPromise.then((result) => tryRedirect(result));
    }, REDIRECT_TIME);
  };

  const stepStatus = (i: number): "waiting" | "active" | "done" => {
    if (currentStep > i) return "done";
    if (currentStep === i) return "active";
    return "waiting";
  };

  // ── COMPLETE ──────────────────────────────────────────────────────────────
  if (pageState === "complete") {
    return (
      <div className="flex flex-col items-center justify-center" style={{ minHeight: "calc(100vh - 44px)" }}>
        <p style={{ color: "var(--success)", fontFamily: "monospace" }} className="text-sm">
          ✓ Agent registered
        </p>
        <p style={{ color: "var(--muted)" }} className="text-xs mt-1">
          Redirecting to dashboard...
        </p>
      </div>
    );
  }

  // ── BUILDING ──────────────────────────────────────────────────────────────
  if (pageState === "building") {
    return (
      <div className="flex flex-col items-center justify-center" style={{ minHeight: "calc(100vh - 44px)" }}>
        <div style={{ width: "480px" }}>
          <p style={{ color: "var(--text)" }} className="text-sm font-medium mb-1">
            Building your agent
          </p>
          <p
            style={{ color: "var(--muted)", fontFamily: "monospace" }}
            className="text-xs mb-8 truncate"
          >
            {url}
          </p>

          <div className="space-y-5">
            {STEPS.map((step, i) => {
              const status = stepStatus(i);
              // Show scrape result on step 0 once API resolves
              const scrapeStatus = i === 0 && apiResult?._scrape_status;
              const scrapeColor =
                scrapeStatus === "live"    ? "var(--success)" :
                scrapeStatus === "url_only" ? "var(--amber)"  :
                scrapeStatus === "fallback" ? "var(--error)"  : undefined;
              const scrapeLabel =
                scrapeStatus === "live"    ? "✓ live scrape" :
                scrapeStatus === "url_only" ? "⚠ URL-only (JS site)" :
                scrapeStatus === "fallback" ? "⚠ fallback data used" : undefined;
              return (
                <div key={i} className="flex items-start gap-3">
                  <div className="mt-0.5 w-4 text-center">
                    <StepIcon status={status} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span
                        className="text-sm"
                        style={{ color: status === "waiting" ? "var(--muted-2)" : "var(--text)" }}
                      >
                        {step.label}
                      </span>
                      <div className="flex items-center gap-2">
                        {scrapeLabel && (
                          <span
                            style={{
                              fontFamily: "monospace",
                              fontSize: "10px",
                              color: scrapeColor,
                            }}
                          >
                            {scrapeLabel}
                          </span>
                        )}
                        <StepBadge status={status} />
                      </div>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: "var(--muted-2)" }}>
                      {step.sub(url)}
                    </p>
                    {/* Show extracted name once API resolves on step 1 (classify) */}
                    {i === 1 && apiResult?.name && (
                      <p className="text-xs mt-1" style={{ color: "var(--success)", fontFamily: "monospace" }}>
                        ✓ {apiResult.name} — {apiResult.ai_safe_schema?.length ?? 0} AI-safe, {apiResult.encrypted_schema?.fields?.length ?? 0} encrypted fields
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── IDLE ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col items-center" style={{ paddingTop: "96px", minHeight: "calc(100vh - 44px)" }}>
      <div style={{ width: "480px" }}>
        {/* Logo */}
        <p style={{ color: "var(--muted)", fontFamily: "monospace" }} className="text-lg mb-5">
          ◈
        </p>

        {/* Heading */}
        <h1 className="text-xl font-medium mb-1" style={{ color: "var(--text)" }}>
          Business Onboarding
        </h1>
        <p className="text-sm mb-8" style={{ color: "var(--muted)" }}>
          Turn your website into an AI agent that joins the Pact network.
        </p>

        {/* How it works */}
        <div className="mb-8">
          <p
            className="text-xs uppercase tracking-widest mb-4"
            style={{ color: "var(--muted-2)" }}
          >
            How it works
          </p>
          <div className="space-y-3">
            {[
              "Paste your website URL",
              "We scrape and analyze your business",
              "AI classifies what data stays private",
              "Your agent is registered on Pact",
            ].map((text, i) => (
              <div key={i} className="flex items-start gap-3">
                <span
                  style={{ fontFamily: "monospace", color: "var(--muted-2)", minWidth: "24px" }}
                  className="text-sm"
                >
                  0{i + 1}
                </span>
                <span className="text-sm" style={{ color: "var(--muted)" }}>
                  {text}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Input */}
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && startBuild()}
          placeholder="https://your-store.com"
          style={{
            height: "36px",
            width: "100%",
            padding: "0 12px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "6px",
            color: "var(--text)",
            fontFamily: "monospace",
            fontSize: "13px",
            outline: "none",
          }}
          onFocus={(e) => (e.target.style.borderColor = "#333")}
          onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
        />

        {/* Button */}
        <button
          onClick={startBuild}
          disabled={!url.trim()}
          style={{
            width: "100%",
            height: "36px",
            marginTop: "8px",
            background: "var(--accent)",
            color: "var(--bg)",
            fontSize: "13px",
            fontWeight: 500,
            borderRadius: "6px",
            border: "none",
            cursor: url.trim() ? "pointer" : "not-allowed",
            opacity: url.trim() ? 1 : 0.4,
            transition: "background 150ms",
          }}
          onMouseEnter={(e) => { if (url.trim()) (e.target as HTMLElement).style.background = "#fff"; }}
          onMouseLeave={(e) => { if (url.trim()) (e.target as HTMLElement).style.background = "var(--accent)"; }}
        >
          Build My Agent
        </button>

        {/* Demo note */}
        <div
          className="mt-6 pt-5"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <p className="text-xs" style={{ color: "var(--muted-2)" }}>
            Try the demo store →{" "}
            <button
              onClick={() => { setUrl("http://localhost:3000/store"); }}
              className="underline"
              style={{ color: "var(--muted)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              localhost:3000/store
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
