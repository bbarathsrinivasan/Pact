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

// Point on circle edge toward a target
function nodeEdge(
  node: { cx: number; cy: number; r: number },
  target: { x: number; y: number },
) {
  const dx = target.x - node.cx;
  const dy = target.y - node.cy;
  const len = Math.hypot(dx, dy) || 1;
  return {
    x: node.cx + (dx / len) * node.r,
    y: node.cy + (dy / len) * node.r,
  };
}
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

  // Layout: trust boundary encloses Gemini + all AI-safe field labels
  const PERSONAL = { cx: 90, cy: 157, r: 30 };
  const BUSINESS = { cx: 726, cy: 92, r: 26 };
  const SECURE = { cx: 726, cy: 228, r: 24 };
  const GEMINI = { cx: 374, cy: 108, rInner: 26, rGlow: 32 };
  const boundary = { x: 284, y: 52, w: 180, h: 142 };
  const boundaryBottom = boundary.y + boundary.h;
  const encLaneY = boundaryBottom + 40;
  const laneDividerY = boundaryBottom + 26;

  const geminiLeft = { x: GEMINI.cx - GEMINI.rGlow, y: GEMINI.cy };
  const geminiRight = { x: GEMINI.cx + GEMINI.rGlow, y: GEMINI.cy };

  const personalAiStart = nodeEdge(PERSONAL, geminiLeft);
  const businessAiEnd = nodeEdge(BUSINESS, geminiRight);
  const personalEncStart = nodeEdge(PERSONAL, { x: SECURE.cx, y: SECURE.cy });
  const secureEncEnd = nodeEdge(SECURE, { x: PERSONAL.cx, y: PERSONAL.cy });

  // Paths anchored to node edges
  const paths = {
    p_ai1: `M ${personalAiStart.x} ${personalAiStart.y} C ${personalAiStart.x + 55} ${personalAiStart.y - 18} ${geminiLeft.x - 45} ${GEMINI.cy} ${geminiLeft.x} ${GEMINI.cy}`,
    p_ai2: `M ${geminiRight.x} ${GEMINI.cy} C ${geminiRight.x + 85} ${GEMINI.cy - 10} ${businessAiEnd.x - 75} ${businessAiEnd.y} ${businessAiEnd.x} ${businessAiEnd.y}`,
    p_enc: `M ${personalEncStart.x} ${personalEncStart.y} C ${personalEncStart.x + 90} ${encLaneY} ${secureEncEnd.x - 110} ${encLaneY} ${secureEncEnd.x} ${secureEncEnd.y}`,
  };

  const visibleFields = aiSafeFields.slice(0, 8);
  const fieldLineH = 10;
  const fieldCols = visibleFields.length > 4 ? 2 : 1;
  const fieldColGap = 76;
  // Start field list below Gemini glow + label
  const fieldStartY = GEMINI.cy + GEMINI.rGlow + 14;

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
        viewBox="0 0 820 320"
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

        {/* ── Trust boundary (AI-safe lane only) ───────────────────────── */}
        <rect
          x={boundary.x}
          y={boundary.y}
          width={boundary.w}
          height={boundary.h}
          rx="10"
          fill="url(#gGemini)"
          stroke={C.boundary}
          strokeWidth="1"
          strokeDasharray="7 3"
          style={{ animation: "boundaryPulse 3s ease-in-out infinite" }}
        />
        <text
          x={boundary.x + 8}
          y={boundary.y - 6}
          fontSize="8.5"
          fill={C.boundary}
          fontFamily="monospace"
          style={{ letterSpacing: "2px", animation: "boundaryPulse 3s ease-in-out infinite" }}
        >
          AI TRUST BOUNDARY
        </text>
        <text
          x={boundary.x + boundary.w - 10}
          y={boundary.y + 14}
          textAnchor="end"
          fontSize="6.5"
          fill={C.boundary}
          fontFamily="monospace"
          opacity="0.55"
        >
          Gemini 3.5 Flash — AI-safe only
        </text>

        {/* Lane separator — encrypted route stays outside boundary */}
        {hasEnc && (
          <>
            <line
              x1="118"
              y1={laneDividerY}
              x2="702"
              y2={laneDividerY}
              stroke="#1f1f1f"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
            <text x="118" y={laneDividerY + 14} fontSize="7" fill="#525252" fontFamily="monospace">
              outside AI boundary ↓
            </text>
          </>
        )}

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

            {/* Pill label — upper AI-safe lane */}
            <rect x={personalAiStart.x + 18} y={GEMINI.cy - 12} width="72" height="14" rx="3" fill="rgba(0,0,0,0.85)" />
            <text x={personalAiStart.x + 21} y={GEMINI.cy - 1.5} fontSize="8" fill={C.aiSafe} fontFamily="monospace">
              AI-safe data
            </text>
            <text x="470" y="100" fontSize="8" fill={C.aiSafe} fontFamily="monospace">
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

            {/* Bypass label — lower lane, clear of boundary box */}
            <rect x="380" y={encLaneY + 10} width="106" height="14" rx="3" fill="rgba(0,0,0,0.85)" />
            <text x="383" y={encLaneY + 20.5} fontSize="8" fill={C.encrypted} fontFamily="monospace">
              🔒 encrypted bypass
            </text>
          </>
        )}

        {/* ── NODES ───────────────────────────────────────────────────── */}

        {/* Personal Agent */}
        <circle cx={PERSONAL.cx} cy={PERSONAL.cy} r="50" fill="url(#gPersonal)"
                style={{ animation: "gNodePulse 3.5s ease-in-out infinite" }} />
        <circle cx={PERSONAL.cx} cy={PERSONAL.cy} r={PERSONAL.r} fill="#0e0e0e" stroke={C.personal} strokeWidth="1.5"
                style={{ filter: `drop-shadow(0 0 8px ${C.personal}88)` }} />
        <text x={PERSONAL.cx} y={PERSONAL.cy - 4} textAnchor="middle" fontSize="15" fill={C.personal}>◈</text>
        <text x={PERSONAL.cx} y={PERSONAL.cy + 8} textAnchor="middle" fontSize="7.5" fill={C.personal} fontFamily="monospace">Personal</text>
        <text x={PERSONAL.cx} y={PERSONAL.cy + 18} textAnchor="middle" fontSize="7" fill="#8a8a8a" fontFamily="monospace">Agent</text>

        {/* Gemini — fully inside trust boundary */}
        <circle
          cx={GEMINI.cx}
          cy={GEMINI.cy}
          r={GEMINI.rGlow}
          fill="url(#gGemini)"
          style={{ animation: "geminiPulse 2.5s ease-in-out infinite" }}
        />
        <circle
          cx={GEMINI.cx}
          cy={GEMINI.cy}
          r={GEMINI.rInner}
          fill="#0c0c0e"
          stroke={C.gemini}
          strokeWidth="1.5"
          style={{ filter: `drop-shadow(0 0 12px ${C.gemini}99)` }}
        />
        <text x={GEMINI.cx} y={GEMINI.cy - 6} textAnchor="middle" fontSize="16" fill={C.gemini}>⬡</text>
        <text x={GEMINI.cx} y={GEMINI.cy + 6} textAnchor="middle" fontSize="7.5" fill={C.gemini} fontFamily="monospace">Gemini</text>
        <text x={GEMINI.cx} y={GEMINI.cy + 16} textAnchor="middle" fontSize="7" fill="#8a8a8a" fontFamily="monospace">3.5 Flash</text>

        {/* Divider between Gemini node and AI-safe field list */}
        {visibleFields.length > 0 && (
          <line
            x1={boundary.x + 14}
            y1={fieldStartY - 6}
            x2={boundary.x + boundary.w - 14}
            y2={fieldStartY - 6}
            stroke={C.boundary}
            strokeWidth="0.5"
            opacity="0.25"
          />
        )}

        {/* Business Agent */}
        <circle cx={BUSINESS.cx} cy={BUSINESS.cy} r="42" fill="url(#gBusiness)"
                style={{ animation: "gNodePulse 4s ease-in-out infinite" }} />
        <circle cx={BUSINESS.cx} cy={BUSINESS.cy} r={BUSINESS.r} fill="#0e0e0e" stroke={C.business} strokeWidth="1.5"
                style={{ filter: `drop-shadow(0 0 8px ${C.business}88)` }} />
        <text x={BUSINESS.cx} y={BUSINESS.cy - 5} textAnchor="middle" fontSize="13" fill={C.business}>◈</text>
        <text x={BUSINESS.cx} y={BUSINESS.cy + 7} textAnchor="middle" fontSize="7.5" fill={C.business} fontFamily="monospace">{busLabel}</text>
        <text x={BUSINESS.cx} y={BUSINESS.cy + 17} textAnchor="middle" fontSize="7" fill="#8a8a8a" fontFamily="monospace">Business</text>

        {/* Secure Endpoint */}
        <circle cx={SECURE.cx} cy={SECURE.cy} r="38" fill="url(#gSecure)"
                style={{ animation: "gNodePulse 3s ease-in-out infinite 0.5s" }} />
        <circle cx={SECURE.cx} cy={SECURE.cy} r={SECURE.r} fill="#0e0e0e" stroke={C.secure} strokeWidth="1.5"
                style={{ filter: `drop-shadow(0 0 8px ${C.secure}88)` }} />
        <text x={SECURE.cx} y={SECURE.cy - 6} textAnchor="middle" fontSize="15" fill={C.secure}>🔒</text>
        <text x={SECURE.cx} y={SECURE.cy + 8} textAnchor="middle" fontSize="7.5" fill={C.secure} fontFamily="monospace">Secure</text>
        <text x={SECURE.cx} y={SECURE.cy + 18} textAnchor="middle" fontSize="7" fill="#8a8a8a" fontFamily="monospace">Endpoint</text>

        {/* AI-safe fields — below Gemini, centered in boundary */}
        {visibleFields.map((f, i) => {
          const col = fieldCols === 2 ? i % 2 : 0;
          const row = fieldCols === 2 ? Math.floor(i / 2) : i;
          const fx =
            fieldCols === 2
              ? GEMINI.cx + (col === 0 ? -fieldColGap / 2 : fieldColGap / 2)
              : GEMINI.cx;
          const fy = fieldStartY + row * fieldLineH;
          if (fy > boundaryBottom - 8) return null;
          return (
            <text
              key={f}
              x={fx}
              y={fy}
              textAnchor="middle"
              fontSize="6.5"
              fill={C.aiSafe}
              fontFamily="monospace"
              opacity="0.75"
            >
              ● {f}
            </text>
          );
        })}
        {aiSafeFields.length > 8 && (
          <text
            x={GEMINI.cx}
            y={boundaryBottom - 6}
            textAnchor="middle"
            fontSize="6"
            fill={C.aiSafe}
            fontFamily="monospace"
            opacity="0.5"
          >
            +{aiSafeFields.length - 8} more
          </text>
        )}

        {/* ── Legend ─────────────────────────────────────────────────── */}
        <rect x="12" y="291" width="264" height="22" rx="4" fill="rgba(0,0,0,0.6)" stroke="#1f1f1f" strokeWidth="0.5" />
        <circle cx="26" cy="302" r="4" fill={C.aiSafe} style={{ filter: `drop-shadow(0 0 3px ${C.aiSafe})` }} />
        <text x="34" y="306" fontSize="8" fill="#9a9a9a" fontFamily="monospace">Through AI (safe)</text>
        <circle cx="150" cy="302" r="4" fill={C.encrypted} style={{ filter: `drop-shadow(0 0 3px ${C.encrypted})` }} />
        <text x="158" y="306" fontSize="8" fill="#9a9a9a" fontFamily="monospace">Encrypted bypass</text>
      </svg>
    </div>
  );
}
