"use client";

import { useEffect, useRef, useState } from "react";

interface ActivityEvent {
  id: number;
  event: string;
  privacy_type?: string | null;
  created_at: string;
}

interface NetworkTrafficProps {
  agentId: string;
}

const WINDOW = 20;           // data points to keep
const TICK_MS = 3_000;       // refresh every 3s
const AI_SAFE_COLOR  = "#22c55e";
const ENC_COLOR      = "#f59e0b";
const GRID_COLOR     = "#1c1c1c";
const CHART_H        = 88;   // svg inner height for data area
const CHART_W        = 100;  // viewBox width (percentage-based)

/** Bucket recent events into rolling time-series points */
function buildSeries(events: ActivityEvent[]): { ai: number[]; enc: number[] } {
  // Sort ascending
  const sorted = [...events].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const now = Date.now();
  const totalSpan = WINDOW * TICK_MS;
  const points: { ai: number; enc: number }[] = Array.from({ length: WINDOW }, () => ({
    ai: 0,
    enc: 0,
  }));

  for (const ev of sorted) {
    const age = now - new Date(ev.created_at).getTime();
    if (age > totalSpan) continue;
    const bucketIndex = WINDOW - 1 - Math.floor(age / TICK_MS);
    if (bucketIndex < 0 || bucketIndex >= WINDOW) continue;
    if (ev.privacy_type === "ai_safe") points[bucketIndex].ai += 1;
    else if (ev.privacy_type === "encrypted") points[bucketIndex].enc += 1;
  }

  return {
    ai:  points.map((p) => p.ai),
    enc: points.map((p) => p.enc),
  };
}

/** Convert a data array into an SVG polyline points string */
function toPolyline(data: number[], max: number, svgW: number, svgH: number): string {
  const step = svgW / (data.length - 1);
  return data
    .map((v, i) => {
      const x = i * step;
      const y = max === 0 ? svgH : svgH - (v / max) * svgH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/** SVG area path (closed at the bottom) */
function toAreaPath(data: number[], max: number, svgW: number, svgH: number): string {
  if (data.length === 0) return "";
  const step = svgW / (data.length - 1);
  const pts = data.map((v, i) => {
    const x = i * step;
    const y = max === 0 ? svgH : svgH - (v / max) * svgH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `M 0,${svgH} L ${pts.join(" L ")} L ${svgW},${svgH} Z`;
}

export default function NetworkTraffic({ agentId }: NetworkTrafficProps) {
  const [series, setSeries] = useState<{ ai: number[]; enc: number[] }>({
    ai:  Array(WINDOW).fill(0),
    enc: Array(WINDOW).fill(0),
  });
  const [totals, setTotals] = useState({ ai: 0, enc: 0 });
  const prevEventsRef = useRef<ActivityEvent[]>([]);

  useEffect(() => {
    if (!agentId) return;

    const tick = async () => {
      try {
        const res = await fetch(
          `http://localhost:8000/api/activity?agent_id=${encodeURIComponent(agentId)}`
        );
        const data: ActivityEvent[] = await res.json();
        prevEventsRef.current = data;

        const s = buildSeries(data);
        setSeries(s);
        setTotals({
          ai:  data.filter((e) => e.privacy_type === "ai_safe").length,
          enc: data.filter((e) => e.privacy_type === "encrypted").length,
        });
      } catch {
        // silently ignore
      }
    };

    tick();
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [agentId]);

  const max = Math.max(1, ...series.ai, ...series.enc);
  const aiLine  = toPolyline(series.ai,  max, CHART_W, CHART_H);
  const encLine = toPolyline(series.enc, max, CHART_W, CHART_H);
  const aiArea  = toAreaPath(series.ai,  max, CHART_W, CHART_H);
  const encArea = toAreaPath(series.enc, max, CHART_W, CHART_H);

  // Last tick values
  const lastAi  = series.ai[series.ai.length - 1] ?? 0;
  const lastEnc = series.enc[series.enc.length - 1] ?? 0;

  return (
    <div
      style={{
        background: "#111111",
        border: "1px solid #1f1f1f",
        borderRadius: "6px",
        overflow: "hidden",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          borderBottom: "1px solid #1f1f1f",
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "#161616",
          flexShrink: 0,
        }}
      >
        <span
          className="text-xs uppercase tracking-widest font-medium"
          style={{ color: "#737373" }}
        >
          Network Traffic
        </span>
        <span
          className="text-xs"
          style={{ color: "#525252", fontFamily: "monospace" }}
        >
          last {(WINDOW * TICK_MS) / 1000}s · 3s resolution
        </span>
      </div>

      {/* Counters */}
      <div
        style={{
          display: "flex",
          gap: "0",
          borderBottom: "1px solid #1f1f1f",
          flexShrink: 0,
        }}
      >
        {/* AI-safe counter */}
        <div
          style={{
            flex: 1,
            padding: "10px 14px",
            borderRight: "1px solid #1f1f1f",
          }}
        >
          <p
            style={{
              fontFamily: "monospace",
              fontSize: "9px",
              color: "#525252",
              marginBottom: "3px",
              textTransform: "uppercase",
              letterSpacing: "1px",
            }}
          >
            <span style={{ color: AI_SAFE_COLOR }}>●</span> Through AI
          </p>
          <p style={{ fontFamily: "monospace", fontSize: "22px", color: AI_SAFE_COLOR, lineHeight: 1 }}>
            {totals.ai}
          </p>
          <p style={{ fontFamily: "monospace", fontSize: "9px", color: "#525252", marginTop: "3px" }}>
            +{lastAi} this tick
          </p>
        </div>
        {/* Encrypted counter */}
        <div style={{ flex: 1, padding: "10px 14px" }}>
          <p
            style={{
              fontFamily: "monospace",
              fontSize: "9px",
              color: "#525252",
              marginBottom: "3px",
              textTransform: "uppercase",
              letterSpacing: "1px",
            }}
          >
            <span style={{ color: ENC_COLOR }}>●</span> Encrypted bypass
          </p>
          <p style={{ fontFamily: "monospace", fontSize: "22px", color: ENC_COLOR, lineHeight: 1 }}>
            {totals.enc}
          </p>
          <p style={{ fontFamily: "monospace", fontSize: "9px", color: "#525252", marginTop: "3px" }}>
            +{lastEnc} this tick
          </p>
        </div>
      </div>

      {/* Chart */}
      <div style={{ flex: 1, padding: "12px 14px 8px", position: "relative" }}>
        <svg
          viewBox={`0 0 ${CHART_W} ${CHART_H + 4}`}
          preserveAspectRatio="none"
          style={{ width: "100%", height: "100%", display: "block" }}
        >
          <defs>
            <linearGradient id="nt-ai-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={AI_SAFE_COLOR} stopOpacity="0.25" />
              <stop offset="100%" stopColor={AI_SAFE_COLOR} stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id="nt-enc-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={ENC_COLOR} stopOpacity="0.22" />
              <stop offset="100%" stopColor={ENC_COLOR} stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Horizontal grid lines */}
          {[0.25, 0.5, 0.75].map((frac) => (
            <line
              key={frac}
              x1="0" y1={(CHART_H * (1 - frac)).toFixed(1)}
              x2={CHART_W} y2={(CHART_H * (1 - frac)).toFixed(1)}
              stroke={GRID_COLOR}
              strokeWidth="0.5"
            />
          ))}

          {/* AI-safe area + line */}
          <path d={aiArea}  fill="url(#nt-ai-grad)"  />
          <polyline
            points={aiLine}
            fill="none"
            stroke={AI_SAFE_COLOR}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ filter: `drop-shadow(0 0 3px ${AI_SAFE_COLOR}88)` }}
          />

          {/* Encrypted area + line */}
          <path d={encArea} fill="url(#nt-enc-grad)" />
          <polyline
            points={encLine}
            fill="none"
            stroke={ENC_COLOR}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ filter: `drop-shadow(0 0 3px ${ENC_COLOR}88)` }}
          />

          {/* Latest value dots */}
          {(() => {
            const step = CHART_W / (WINDOW - 1);
            const aiY = max === 0 ? CHART_H : CHART_H - (series.ai[WINDOW - 1] / max) * CHART_H;
            const encY = max === 0 ? CHART_H : CHART_H - (series.enc[WINDOW - 1] / max) * CHART_H;
            return (
              <>
                <circle cx={CHART_W} cy={aiY.toFixed(1)}  r="2" fill={AI_SAFE_COLOR}
                  style={{ filter: `drop-shadow(0 0 4px ${AI_SAFE_COLOR})` }} />
                <circle cx={CHART_W} cy={encY.toFixed(1)} r="2" fill={ENC_COLOR}
                  style={{ filter: `drop-shadow(0 0 4px ${ENC_COLOR})` }} />
              </>
            );
          })()}
        </svg>

        {/* Y-axis max label */}
        <span
          style={{
            position: "absolute",
            top: "14px",
            right: "18px",
            fontFamily: "monospace",
            fontSize: "8px",
            color: "#3a3a3a",
          }}
        >
          {max}
        </span>
      </div>

      {/* Footer legend */}
      <div
        style={{
          display: "flex",
          gap: "16px",
          padding: "6px 14px 10px",
          flexShrink: 0,
        }}
      >
        <span style={{ fontFamily: "monospace", fontSize: "9px", color: "#525252", display: "flex", alignItems: "center", gap: "4px" }}>
          <span style={{ width: "16px", height: "2px", background: AI_SAFE_COLOR, display: "inline-block", borderRadius: "1px" }} />
          AI-safe fields
        </span>
        <span style={{ fontFamily: "monospace", fontSize: "9px", color: "#525252", display: "flex", alignItems: "center", gap: "4px" }}>
          <span style={{ width: "16px", height: "2px", background: ENC_COLOR, display: "inline-block", borderRadius: "1px" }} />
          Encrypted bypass
        </span>
      </div>
    </div>
  );
}
