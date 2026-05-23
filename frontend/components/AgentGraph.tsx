"use client";

import { useEffect, useState } from "react";

interface Activity {
  event: string;
  privacy_type?: string | null;
}

interface AgentGraphProps {
  agentName: string;
  aiSafeFields: string[];
  encryptedFields: string[];
  recentActivity: Activity[];
}

const C = {
  aiSafe:    "#22c55e",
  encrypted: "#f59e0b",
  gemini:    "#a78bfa",
  personal:  "#60a5fa",
  business:  "#34d399",
  secure:    "#fbbf24",
  boundary:  "#7c3aed",
  bg:        "#0a0a0a",
  surface:   "#111111",
};

// Animated particle along a path
function Particle({
  pathId, color, dur, delay,
}: { pathId: string; color: string; dur: number; delay: number }) {
  return (
    <circle r="3.5" fill={color} opacity="0.95" style={{ filter: `drop-shadow(0 0 4px ${color})` }}>
      <animateMotion dur={`${dur}s`} begin={`${delay}s`} repeatCount="indefinite" rotate="auto">
        <mpath href={`#${pathId}`} />
      </animateMotion>
    </circle>
  );
}

// Flowing dashed path
function FlowPath({
  d, color, speed = 2,
}: { d: string; color: string; speed?: number }) {
  const id = `fp-${color.replace("#", "")}-${Math.random().toString(36).slice(2, 6)}`;
  return (
    <>
      {/* Static glow track */}
      <path d={d} stroke={color} strokeWidth="1" fill="none" opacity="0.12" />
      {/* Animated dashes */}
      <path
        d={d}
        stroke={color}
        strokeWidth="1.8"
        fill="none"
        strokeDasharray="10 6"
        opacity="0.75"
        style={{
          animation: `flowDash ${speed}s linear infinite`,
        }}
      />
    </>
  );
}

export default function AgentGraph({
  agentName,
  aiSafeFields,
  encryptedFields,
  recentActivity,
}: AgentGraphProps) {
  const [tick, setTick] = useState(0);

  // Force particle reanimation on new activity
  useEffect(() => {
    setTick((t) => t + 1);
  }, [recentActivity.length]);

  const hasAiSafe  = aiSafeFields.length > 0;
  const hasEnc     = encryptedFields.length > 0;
  const busLabel   = agentName.length > 10 ? agentName.slice(0, 9) + "…" : agentName;

  // Path definitions — referenced by ID for animateMotion
  const paths = {
    p_ai1: "M 128 148 C 190 148 248 148 278 148",
    p_ai2: "M 448 138 C 545 118 638 98 698 92",
    p_enc: "M 128 166 C 230 216 538 236 698 228",
  };

  return (
    <div
      style={{
        background: C.surface,
        border: "1px solid #1f1f1f",
        borderRadius: "6px",
        padding: "20px 20px 12px",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium" style={{ color: "#ededed" }}>
          Agent Communication Graph
        </span>
        <div className="flex items-center gap-3">
          <span className="text-xs" style={{ color: "#9a9a9a", fontFamily: "monospace" }}>
            A2A Protocol v0.2.1
          </span>
          <span
            className="text-xs px-2 py-0.5 rounded flex items-center gap-1"
            style={{
              background: "#0a1a0a",
              border: "1px solid #166534",
              color: "#22c55e",
              fontFamily: "monospace",
            }}
          >
            <span style={{ fontSize: "7px" }}>●</span> Live
          </span>
        </div>
      </div>

      {/* Inject keyframe CSS */}
      <style>{`
        @keyframes flowDash {
          from { stroke-dashoffset: 0; }
          to   { stroke-dashoffset: -48; }
        }
        @keyframes gNodePulse {
          0%, 100% { opacity: 0.07; }
          50%       { opacity: 0.18; }
        }
        @keyframes geminiPulse {
          0%, 100% { opacity: 0.10; }
          50%       { opacity: 0.25; }
        }
        @keyframes boundaryPulse {
          0%, 100% { opacity: 0.55; }
          50%       { opacity: 0.85; }
        }
      `}</style>

      <svg
        viewBox="0 0 820 295"
        style={{ width: "100%", height: "auto", display: "block" }}
        key={tick}
      >
        <defs>
          {/* Path refs for particles */}
          <path id="p_ai1" d={paths.p_ai1} />
          <path id="p_ai2" d={paths.p_ai2} />
          <path id="p_enc" d={paths.p_enc} />

          {/* Radial glows */}
          <radialGradient id="gGemini" cx="50%" cy="50%">
            <stop offset="0%"   stopColor={C.gemini}  stopOpacity="0.22" />
            <stop offset="100%" stopColor={C.gemini}  stopOpacity="0" />
          </radialGradient>
          <radialGradient id="gPersonal" cx="50%" cy="50%">
            <stop offset="0%"   stopColor={C.personal} stopOpacity="0.18" />
            <stop offset="100%" stopColor={C.personal} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="gBusiness" cx="50%" cy="50%">
            <stop offset="0%"   stopColor={C.business} stopOpacity="0.18" />
            <stop offset="100%" stopColor={C.business} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="gSecure" cx="50%" cy="50%">
            <stop offset="0%"   stopColor={C.secure}   stopOpacity="0.18" />
            <stop offset="100%" stopColor={C.secure}   stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* ── Trust boundary ─────────────────────────────────────────── */}
        <rect
          x="266" y="48" width="216" height="196" rx="10"
          fill="url(#gGemini)"
          stroke={C.boundary}
          strokeWidth="1"
          strokeDasharray="7 3"
          style={{ animation: "boundaryPulse 3s ease-in-out infinite" }}
        />
        <text x="282" y="44" fontSize="8.5" fill={C.boundary} fontFamily="monospace"
              style={{ letterSpacing: "2px", animation: "boundaryPulse 3s ease-in-out infinite" }}>
          AI TRUST BOUNDARY
        </text>
        <text x="278" y="234" fontSize="7.5" fill={C.boundary} fontFamily="monospace" opacity="0.55">
          Gemini 3.5 Flash — never sees PII
        </text>

        {/* ── AI-safe path ────────────────────────────────────────────── */}
        {hasAiSafe && (
          <>
            <FlowPath d={paths.p_ai1} color={C.aiSafe} speed={1.7} />
            <FlowPath d={paths.p_ai2} color={C.aiSafe} speed={1.9} />
            <Particle pathId="p_ai1" color={C.aiSafe} dur={1.7} delay={0}   />
            <Particle pathId="p_ai1" color={C.aiSafe} dur={1.7} delay={0.57} />
            <Particle pathId="p_ai1" color={C.aiSafe} dur={1.7} delay={1.13} />
            <Particle pathId="p_ai2" color={C.aiSafe} dur={1.9} delay={0.9}  />
            <Particle pathId="p_ai2" color={C.aiSafe} dur={1.9} delay={1.6}  />

            {/* Pill label */}
            <rect x="148" y="128" width="72" height="14" rx="3" fill="rgba(0,0,0,0.85)" />
            <text x="151" y="138.5" fontSize="8" fill={C.aiSafe} fontFamily="monospace">
              AI-safe data
            </text>
            <text x="470" y="110" fontSize="8" fill={C.aiSafe} fontFamily="monospace">
              ▸ confirmed
            </text>
          </>
        )}

        {/* ── Encrypted path (bypasses Gemini) ────────────────────────── */}
        {hasEnc && (
          <>
            <FlowPath d={paths.p_enc} color={C.encrypted} speed={2.4} />
            <Particle pathId="p_enc" color={C.encrypted} dur={2.4} delay={0}   />
            <Particle pathId="p_enc" color={C.encrypted} dur={2.4} delay={0.8} />
            <Particle pathId="p_enc" color={C.encrypted} dur={2.4} delay={1.6} />

            {/* Bypass label */}
            <rect x="310" y="240" width="106" height="14" rx="3" fill="rgba(0,0,0,0.85)" />
            <text x="313" y="250.5" fontSize="8" fill={C.encrypted} fontFamily="monospace">
              🔒 encrypted bypass
            </text>
          </>
        )}

        {/* ── NODES ───────────────────────────────────────────────────── */}

        {/* Personal Agent */}
        <circle cx="90" cy="157" r="50" fill="url(#gPersonal)"
                style={{ animation: "gNodePulse 3.5s ease-in-out infinite" }} />
        <circle cx="90" cy="157" r="30" fill="#0e0e0e" stroke={C.personal} strokeWidth="1.5"
                style={{ filter: `drop-shadow(0 0 8px ${C.personal}88)` }} />
        <text x="90" y="153" textAnchor="middle" fontSize="15" fill={C.personal}>◈</text>
        <text x="90" y="165" textAnchor="middle" fontSize="7.5" fill={C.personal} fontFamily="monospace">Personal</text>
        <text x="90" y="175" textAnchor="middle" fontSize="7" fill="#8a8a8a" fontFamily="monospace">Agent</text>

        {/* Gemini */}
        <circle cx="374" cy="146" r="58" fill="url(#gGemini)"
                style={{ animation: "geminiPulse 2.5s ease-in-out infinite" }} />
        <circle cx="374" cy="146" r="34" fill="#0c0c0e" stroke={C.gemini} strokeWidth="1.5"
                style={{ filter: `drop-shadow(0 0 12px ${C.gemini}99)` }} />
        <text x="374" y="140" textAnchor="middle" fontSize="18" fill={C.gemini}>⬡</text>
        <text x="374" y="154" textAnchor="middle" fontSize="7.5" fill={C.gemini} fontFamily="monospace">Gemini</text>
        <text x="374" y="164" textAnchor="middle" fontSize="7" fill="#8a8a8a" fontFamily="monospace">3.5 Flash</text>

        {/* Business Agent */}
        <circle cx="726" cy="92" r="42" fill="url(#gBusiness)"
                style={{ animation: "gNodePulse 4s ease-in-out infinite" }} />
        <circle cx="726" cy="92" r="26" fill="#0e0e0e" stroke={C.business} strokeWidth="1.5"
                style={{ filter: `drop-shadow(0 0 8px ${C.business}88)` }} />
        <text x="726" y="87" textAnchor="middle" fontSize="13" fill={C.business}>◈</text>
        <text x="726" y="99" textAnchor="middle" fontSize="7.5" fill={C.business} fontFamily="monospace">{busLabel}</text>
        <text x="726" y="109" textAnchor="middle" fontSize="7" fill="#8a8a8a" fontFamily="monospace">Business</text>

        {/* Secure Endpoint */}
        <circle cx="726" cy="228" r="38" fill="url(#gSecure)"
                style={{ animation: "gNodePulse 3s ease-in-out infinite 0.5s" }} />
        <circle cx="726" cy="228" r="24" fill="#0e0e0e" stroke={C.secure} strokeWidth="1.5"
                style={{ filter: `drop-shadow(0 0 8px ${C.secure}88)` }} />
        <text x="726" y="222" textAnchor="middle" fontSize="15" fill={C.secure}>🔒</text>
        <text x="726" y="236" textAnchor="middle" fontSize="7.5" fill={C.secure} fontFamily="monospace">Secure</text>
        <text x="726" y="246" textAnchor="middle" fontSize="7" fill="#8a8a8a" fontFamily="monospace">Endpoint</text>

        {/* ── Field listing inside nodes ──────────────────────────────── */}
        {/* AI-safe fields floating near Gemini */}
        {aiSafeFields.slice(0, 4).map((f, i) => (
          <text
            key={f}
            x="374"
            y={188 + i * 12}
            textAnchor="middle"
            fontSize="7"
            fill={C.aiSafe}
            fontFamily="monospace"
            opacity="0.6"
          >
            ● {f}
          </text>
        ))}

        {/* ── Legend ─────────────────────────────────────────────────── */}
        <rect x="12" y="266" width="264" height="22" rx="4" fill="rgba(0,0,0,0.6)" stroke="#1f1f1f" strokeWidth="0.5" />
        <circle cx="26" cy="277" r="4" fill={C.aiSafe} style={{ filter: `drop-shadow(0 0 3px ${C.aiSafe})` }} />
        <text x="34" y="281" fontSize="8" fill="#9a9a9a" fontFamily="monospace">Through AI (safe)</text>
        <circle cx="150" cy="277" r="4" fill={C.encrypted} style={{ filter: `drop-shadow(0 0 3px ${C.encrypted})` }} />
        <text x="158" y="281" fontSize="8" fill="#9a9a9a" fontFamily="monospace">Encrypted bypass</text>
      </svg>
    </div>
  );
}
