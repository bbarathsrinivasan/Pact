"use client";

import { useState } from "react";

const API = "http://localhost:8000";

const STEPS = ["Scraping", "Classifying", "Building", "Live!"];

interface AgentCard {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  ai_safe_schema: string[];
  encrypted_schema: { fields: string[]; endpoint: string };
}

export default function BusinessPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(-1);
  const [card, setCard] = useState<AgentCard | null>(null);
  const [error, setError] = useState("");
  const [showJson, setShowJson] = useState(false);

  const build = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setStep(0);
    setCard(null);
    setError("");

    const stepDelay = (s: number) =>
      new Promise<void>((res) => {
        setTimeout(() => { setStep(s); res(); }, 800);
      });

    try {
      await stepDelay(1);
      const res = await fetch(`${API}/api/onboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data: AgentCard = await res.json();
      await stepDelay(2);
      await stepDelay(3);
      setCard(data);
    } catch (e: any) {
      setError(e.message || "Something went wrong.");
      setStep(-1);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="max-w-2xl mx-auto py-12 px-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Business Agent Onboarding</h1>
        <p className="text-neutral-400 text-sm mt-1">
          Enter your website and we&apos;ll build a privacy-aware agent card for your business.
        </p>
      </div>

      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && build()}
          placeholder="https://your-business.com"
          className="flex-1 bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-2.5 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-green-500 transition-colors"
        />
        <button
          onClick={build}
          disabled={loading || !url.trim()}
          className="bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors"
        >
          Build My Agent
        </button>
      </div>

      {step >= 0 && (
        <div className="flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all ${
                  i < step
                    ? "bg-green-900 text-green-300"
                    : i === step
                    ? "bg-yellow-900 text-yellow-300 animate-pulse"
                    : "bg-neutral-800 text-neutral-500"
                }`}
              >
                {i < step && "✓ "}
                {s}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`h-px w-6 ${i < step ? "bg-green-700" : "bg-neutral-700"}`} />
              )}
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="bg-red-950 border border-red-800 text-red-300 rounded-xl px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {card && (
        <div className="space-y-6">
          <div className="bg-green-950 border border-green-800 rounded-xl px-4 py-3">
            <p className="text-green-300 font-semibold text-sm">
              ✓ Your agent is live
            </p>
            <p className="text-green-500 text-xs font-mono mt-0.5">{card.id}</p>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-neutral-200 mb-1">{card.name}</h2>
            {card.description && (
              <p className="text-neutral-400 text-sm">{card.description}</p>
            )}
          </div>

          {card.capabilities.length > 0 && (
            <div>
              <p className="text-xs text-neutral-400 uppercase tracking-wider mb-2">Capabilities</p>
              <div className="flex flex-wrap gap-1.5">
                {card.capabilities.map((c) => (
                  <span key={c} className="bg-neutral-800 text-neutral-300 px-2.5 py-1 rounded-full text-xs">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
              <p className="text-xs font-semibold text-green-400 mb-3">AI can see</p>
              <div className="space-y-1.5">
                {card.ai_safe_schema.map((f) => (
                  <div key={f} className="flex items-center gap-2 text-sm text-neutral-300">
                    <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                    {f}
                  </div>
                ))}
                {card.ai_safe_schema.length === 0 && (
                  <p className="text-neutral-600 text-xs italic">None</p>
                )}
              </div>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
              <p className="text-xs font-semibold text-red-400 mb-3">🔒 Encrypted only</p>
              <div className="space-y-1.5">
                {card.encrypted_schema.fields.map((f) => (
                  <div key={f} className="flex items-center gap-2 text-sm text-neutral-300">
                    <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                    {f}
                  </div>
                ))}
                {card.encrypted_schema.fields.length === 0 && (
                  <p className="text-neutral-600 text-xs italic">None</p>
                )}
              </div>
            </div>
          </div>

          <div>
            <button
              onClick={() => setShowJson(!showJson)}
              className="text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
            >
              {showJson ? "▲ Hide" : "▼ Show"} Agent Card JSON
            </button>
            {showJson && (
              <pre className="mt-2 bg-neutral-900 border border-neutral-800 rounded-xl p-4 text-xs text-green-300 font-mono overflow-x-auto">
                {JSON.stringify(card, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
