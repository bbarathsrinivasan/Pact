"use client";

import { relativeTime } from "../lib/utils";

interface AgentCard {
  id: string;
  name: string;
  description?: string;
  capabilities?: string[];
  ai_safe_schema?: string[];
  encrypted_schema?: { fields: string[]; endpoint: string };
  registered_at?: string;
}

interface DashboardSidebarProps {
  agent: AgentCard | null;
  loading?: boolean;
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs uppercase tracking-widest mb-2" style={{ color: "var(--muted-2)" }}>
      {children}
    </p>
  );
}

function Divider() {
  return <div style={{ borderTop: "1px solid var(--border)", margin: "16px 0" }} />;
}

function Skeleton({ w = "100%", h = "14px" }: { w?: string; h?: string }) {
  return (
    <div
      className="animate-pulse rounded"
      style={{ width: w, height: h, background: "var(--surface-2)", marginBottom: "6px" }}
    />
  );
}

/** Deterministic hue from a string so each capability gets a stable color */
function capColor(cap: string): { color: string; bg: string; border: string } {
  const palettes = [
    { color: "#60a5fa", bg: "rgba(96,165,250,0.07)",  border: "rgba(96,165,250,0.28)"  }, // blue
    { color: "#a78bfa", bg: "rgba(167,139,250,0.07)", border: "rgba(167,139,250,0.28)" }, // violet
    { color: "#34d399", bg: "rgba(52,211,153,0.07)",  border: "rgba(52,211,153,0.28)"  }, // emerald
    { color: "#f472b6", bg: "rgba(244,114,182,0.07)", border: "rgba(244,114,182,0.28)" }, // pink
    { color: "#fb923c", bg: "rgba(251,146,60,0.07)",  border: "rgba(251,146,60,0.28)"  }, // orange
    { color: "#22d3ee", bg: "rgba(34,211,238,0.07)",  border: "rgba(34,211,238,0.28)"  }, // cyan
  ];
  let h = 0;
  for (let i = 0; i < cap.length; i++) h = (h * 31 + cap.charCodeAt(i)) >>> 0;
  return palettes[h % palettes.length];
}

/** Mini SVG showing the AI trust boundary concept */
function TrustBoundaryMini() {
  return (
    <div
      style={{
        background: "#0a0a0a",
        border: "1px solid #1f1f1f",
        borderRadius: "6px",
        padding: "10px",
        marginTop: "4px",
      }}
    >
      <svg viewBox="0 0 220 110" style={{ width: "100%", height: "auto", display: "block" }}>
        <defs>
          <radialGradient id="sb-p" cx="50%" cy="50%">
            <stop offset="0%"  stopColor="#60a5fa" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#60a5fa" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="sb-g" cx="50%" cy="50%">
            <stop offset="0%"  stopColor="#a78bfa" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="sb-b" cx="50%" cy="50%">
            <stop offset="0%"  stopColor="#34d399" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="sb-s" cx="50%" cy="50%">
            <stop offset="0%"  stopColor="#fbbf24" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
          </radialGradient>
          {/* Path used by animateMotion particle */}
          <path id="sb-ai-path" d="M 38 45 L 80 50 L 148 42 L 180 38" />
        </defs>

        {/* AI trust boundary box */}
        <rect x="72" y="16" width="76" height="74" rx="6"
          fill="none" stroke="#7c3aed" strokeWidth="0.8" strokeDasharray="4 2" opacity="0.7" />
        <text x="76" y="13" fontSize="5.5" fill="#7c3aed" fontFamily="monospace" letterSpacing="1">
          AI BOUNDARY
        </text>

        {/* AI-safe path: personal → gemini */}
        <line x1="38" y1="45" x2="80" y2="50" stroke="#22c55e" strokeWidth="1.2"
          strokeDasharray="5 3" opacity="0.8" />
        {/* AI-safe path: gemini → business */}
        <line x1="148" y1="42" x2="180" y2="38" stroke="#22c55e" strokeWidth="1.2"
          strokeDasharray="5 3" opacity="0.8" />
        {/* Encrypted path: personal → secure (bypasses gemini) */}
        <path d="M 38 55 Q 110 95 180 72" fill="none" stroke="#f59e0b" strokeWidth="1"
          strokeDasharray="4 3" opacity="0.7" />

        {/* Nodes */}
        {/* Personal */}
        <circle cx="28" cy="50" r="14" fill="url(#sb-p)" />
        <circle cx="28" cy="50" r="9"  fill="#0e0e0e" stroke="#60a5fa" strokeWidth="1" />
        <text x="28" y="53" textAnchor="middle" fontSize="9" fill="#60a5fa">◈</text>
        <text x="28" y="68" textAnchor="middle" fontSize="5" fill="#525252" fontFamily="monospace">personal</text>

        {/* Gemini */}
        <circle cx="110" cy="52" r="16" fill="url(#sb-g)" />
        <circle cx="110" cy="52" r="10" fill="#0c0c0e" stroke="#a78bfa" strokeWidth="1" />
        <text x="110" y="55.5" textAnchor="middle" fontSize="10" fill="#a78bfa">⬡</text>
        <text x="110" y="70" textAnchor="middle" fontSize="5" fill="#525252" fontFamily="monospace">gemini</text>

        {/* Business */}
        <circle cx="190" cy="36" r="12" fill="url(#sb-b)" />
        <circle cx="190" cy="36" r="8"  fill="#0e0e0e" stroke="#34d399" strokeWidth="1" />
        <text x="190" y="39" textAnchor="middle" fontSize="8" fill="#34d399">◈</text>
        <text x="190" y="52" textAnchor="middle" fontSize="5" fill="#525252" fontFamily="monospace">business</text>

        {/* Secure endpoint */}
        <circle cx="190" cy="72" r="11" fill="url(#sb-s)" />
        <circle cx="190" cy="72" r="7"  fill="#0e0e0e" stroke="#fbbf24" strokeWidth="1" />
        <text x="190" y="75" textAnchor="middle" fontSize="8" fill="#fbbf24">🔒</text>
        <text x="190" y="88" textAnchor="middle" fontSize="5" fill="#525252" fontFamily="monospace">secure</text>

        {/* Animated particle on AI-safe path */}
        <circle r="2" fill="#22c55e" opacity="0.9"
          style={{ filter: "drop-shadow(0 0 3px #22c55e)" }}>
          <animateMotion dur="1.6s" repeatCount="indefinite">
            <mpath href="#sb-ai-path" />
          </animateMotion>
        </circle>

        {/* Legend */}
        <circle cx="8"  cy="101" r="2.5" fill="#22c55e" />
        <text x="13"  y="104" fontSize="5" fill="#525252" fontFamily="monospace">AI-safe</text>
        <circle cx="60" cy="101" r="2.5" fill="#f59e0b" />
        <text x="65" y="104" fontSize="5" fill="#525252" fontFamily="monospace">enc bypass</text>
      </svg>
    </div>
  );
}

export default function DashboardSidebar({ agent, loading }: DashboardSidebarProps) {
  const monoStyle: React.CSSProperties = { fontFamily: "monospace", fontSize: "11px", color: "var(--muted-2)" };

  return (
    <aside
      style={{
        width: "256px",
        flexShrink: 0,
        borderRight: "1px solid var(--border)",
        padding: "20px 16px",
        overflowY: "auto",
        height: "calc(100vh - 44px - 56px)",
      }}
    >
      {/* Agent Info */}
      <Label>Agent Info</Label>
      {loading ? (
        <>
          <Skeleton h="16px" w="70%" />
          <Skeleton h="12px" />
          <Skeleton h="12px" w="80%" />
        </>
      ) : agent ? (
        <>
          <p className="text-sm font-medium mb-1" style={{ color: "var(--text)" }}>
            {agent.name}
          </p>
          {agent.description && (
            <p className="text-xs leading-relaxed mb-3" style={{ color: "var(--muted)" }}>
              {agent.description}
            </p>
          )}
          <p style={monoStyle}>Registered: {relativeTime(agent.registered_at)}</p>
          <p style={{ ...monoStyle, marginTop: "3px" }}>{agent.id}</p>
        </>
      ) : null}

      <Divider />

      {/* Glowing capability cards */}
      <Label>Capabilities</Label>
      {loading ? (
        <div className="flex flex-wrap gap-1.5">
          <Skeleton w="60px" h="22px" />
          <Skeleton w="80px" h="22px" />
          <Skeleton w="50px" h="22px" />
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {agent?.capabilities?.map((cap) => {
            const { color, bg, border } = capColor(cap);
            return (
              <span
                key={cap}
                style={{
                  background: bg,
                  border: `1px solid ${border}`,
                  borderRadius: "4px",
                  padding: "3px 8px",
                  fontFamily: "monospace",
                  fontSize: "10px",
                  color: color,
                  boxShadow: `0 0 8px ${color}33, 0 0 1px ${color}55`,
                  transition: "box-shadow 0.2s, border-color 0.2s",
                  cursor: "default",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.boxShadow =
                    `0 0 16px ${color}55, 0 0 4px ${color}77`;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.boxShadow =
                    `0 0 8px ${color}33, 0 0 1px ${color}55`;
                }}
              >
                {cap}
              </span>
            );
          })}
        </div>
      )}

      <Divider />

      {/* Trust boundary mini-viz */}
      <Label>Trust Boundary</Label>
      <TrustBoundaryMini />

      <Divider />

      {/* AI can see */}
      <Label>
        <span style={{ color: "var(--success)" }}>AI Can See</span>
      </Label>
      {loading ? (
        <>
          <Skeleton w="70%" />
          <Skeleton w="60%" />
        </>
      ) : (
        <div className="space-y-1.5">
          {agent?.ai_safe_schema?.map((f) => (
            <div key={f} className="flex items-center gap-2">
              <span style={{ color: "var(--success)", fontSize: "8px" }}>●</span>
              <span style={{ fontFamily: "monospace", fontSize: "11px", color: "var(--text)" }}>
                {f}
              </span>
            </div>
          ))}
        </div>
      )}

      <Divider />

      {/* Encrypted only */}
      <Label>
        <span style={{ color: "var(--amber)" }}>Encrypted Only</span>
      </Label>
      {loading ? (
        <>
          <Skeleton w="60%" />
          <Skeleton w="50%" />
        </>
      ) : (
        <>
          <div className="space-y-1.5 mb-3">
            {agent?.encrypted_schema?.fields?.map((f) => (
              <div key={f} className="flex items-center gap-2">
                <span style={{ fontSize: "11px" }}>🔒</span>
                <span style={{ fontFamily: "monospace", fontSize: "11px", color: "var(--text)" }}>
                  {f}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs leading-relaxed" style={{ color: "var(--muted-2)" }}>
            These fields bypass Gemini entirely. Sent encrypted direct to endpoint.
          </p>
        </>
      )}

      <Divider />

      {/* Endpoint */}
      <Label>Secure Endpoint</Label>
      <p style={monoStyle}>{agent?.encrypted_schema?.endpoint ?? "/secure/submit"}</p>
      <p style={{ ...monoStyle, marginTop: "3px" }}>AES-256-Fernet</p>
    </aside>
  );
}
