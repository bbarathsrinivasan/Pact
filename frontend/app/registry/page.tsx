"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import RegistryCard from "../../components/RegistryCard";
import { decodeAgentId } from "../../lib/utils";

const API = "http://localhost:8000";

const ALL_CAPS = ["purchase", "reservation", "order_tracking", "dine-in reservations", "private events", "takeout"];

interface AgentCard {
  id: string;
  name: string;
  description?: string;
  capabilities?: string[];
  ai_safe_schema?: string[];
  encrypted_schema?: { fields: string[] };
  registered_at?: string;
}

function RegistryContent() {
  const params = useSearchParams();
  const [agents, setAgents] = useState<AgentCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [capFilter, setCapFilter] = useState("all");
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const highlightRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const h = params.get("highlight");
    if (h) setHighlightId(decodeAgentId(h));
  }, [params]);

  useEffect(() => {
    fetch(`${API}/api/registry`)
      .then((r) => r.json())
      .then((data) => {
        const list: AgentCard[] = Object.values(data);
        setAgents(list);
        setLoading(false);
      })
      .catch(() => { setError("Failed to load registry."); setLoading(false); });
  }, []);

  // Scroll to highlighted card
  useEffect(() => {
    if (highlightId && !loading) {
      setTimeout(() => {
        const el = document.getElementById(`agent-${highlightId}`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 300);
    }
  }, [highlightId, loading]);

  // Derive capability pills from all agents
  const allCaps = Array.from(
    new Set(agents.flatMap((a) => a.capabilities ?? []))
  ).slice(0, 8);

  const filtered = agents.filter((a) => {
    const matchesSearch =
      !search ||
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      (a.description ?? "").toLowerCase().includes(search.toLowerCase());
    const matchesCap =
      capFilter === "all" ||
      (a.capabilities ?? []).some((c) => c.toLowerCase().includes(capFilter.toLowerCase()));
    return matchesSearch && matchesCap;
  });

  return (
    <div style={{ minHeight: "calc(100vh - 44px)" }}>
      {/* Header */}
      <div
        style={{
          borderBottom: "1px solid var(--border)",
          padding: "32px 24px",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span style={{ color: "var(--muted)", fontFamily: "monospace" }}>◈</span>
            <h1 className="text-lg font-medium" style={{ color: "var(--text)" }}>
              Pact Registry
            </h1>
          </div>
          <p className="text-sm" style={{ color: "var(--muted)", maxWidth: "520px", lineHeight: "1.6" }}>
            All agents registered on the Pact network. Each agent publishes a capability card
            describing what data it collects and how.
          </p>
        </div>
        <div className="text-right">
          <p style={{ fontFamily: "monospace", fontSize: "24px", color: "var(--text)" }}>
            {loading ? "—" : agents.length}
          </p>
          <p className="text-xs" style={{ color: "var(--muted-2)" }}>on network</p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          className="flex items-center justify-between px-4 py-2 text-sm mx-6 mt-4"
          style={{ background: "#1a0a0a", border: "1px solid #7f1d1d", borderRadius: "6px", color: "var(--error)" }}
        >
          {error}
          <button onClick={() => setError(null)} style={{ background: "none", border: "none", color: "var(--error)", cursor: "pointer" }}>✕</button>
        </div>
      )}

      {/* Filter bar */}
      <div
        style={{
          position: "sticky",
          top: "44px",
          zIndex: 10,
          height: "44px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg)",
          padding: "0 24px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
        }}
      >
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search agents..."
          style={{
            width: "256px",
            height: "28px",
            padding: "0 10px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "6px",
            color: "var(--text)",
            fontFamily: "monospace",
            fontSize: "12px",
            outline: "none",
          }}
          onFocus={(e) => (e.target.style.borderColor = "#333")}
          onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
        />

        {/* Capability pills */}
        {["all", ...allCaps].map((cap) => (
          <button
            key={cap}
            onClick={() => setCapFilter(cap)}
            style={{
              height: "24px",
              padding: "0 12px",
              borderRadius: "6px",
              fontSize: "11px",
              fontFamily: "monospace",
              cursor: "pointer",
              border: capFilter === cap ? "none" : "1px solid var(--border)",
              background: capFilter === cap ? "var(--accent)" : "var(--surface)",
              color: capFilter === cap ? "var(--bg)" : "var(--muted)",
              transition: "all 150ms",
            }}
          >
            {cap}
          </button>
        ))}
      </div>

      {/* Cards */}
      <div style={{ padding: "24px" }}>
        {loading ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "16px",
            }}
          >
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  height: "320px",
                }}
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              paddingTop: "128px",
              paddingBottom: "128px",
            }}
          >
            <p style={{ color: "var(--muted-2)", fontFamily: "monospace", fontSize: "24px" }}>◈</p>
            <p className="text-sm mt-3" style={{ color: "var(--muted)" }}>
              {agents.length === 0 ? "No agents registered" : "No agents match your search"}
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--muted-2)" }}>
              {agents.length === 0
                ? "Onboard your first business to get started"
                : "Try adjusting your search or filter"}
            </p>
            {agents.length === 0 && (
              <a
                href="/business"
                style={{
                  marginTop: "16px",
                  fontSize: "13px",
                  color: "var(--text)",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  padding: "6px 16px",
                  textDecoration: "none",
                }}
              >
                → Business Onboarding
              </a>
            )}
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "16px",
            }}
          >
            {filtered.map((agent) => (
              <RegistryCard
                key={agent.id}
                agent={agent}
                highlighted={agent.id === highlightId}
              />
            ))}
          </div>
        )}
      </div>

      {/* Mobile notice */}
      <div
        className="lg:hidden"
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "12px 16px",
          background: "var(--surface)",
          borderTop: "1px solid var(--border)",
          textAlign: "center",
          fontSize: "12px",
          color: "var(--muted)",
        }}
      >
        Best viewed on desktop (1024px+)
      </div>
    </div>
  );
}

export default function RegistryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center" style={{ minHeight: "calc(100vh - 44px)" }}>
          <p style={{ color: "var(--muted)", fontSize: "13px" }}>Loading registry…</p>
        </div>
      }
    >
      <RegistryContent />
    </Suspense>
  );
}
