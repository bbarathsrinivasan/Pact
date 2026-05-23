"use client";

import { useEffect, useRef, useState } from "react";
import { relativeTime } from "../lib/utils";

interface ProtocolEvent {
  id: number;
  event: string;
  details?: string | null;
  privacy_type?: string | null;
  created_at: string;
}

const EVENT_CFG: Record<string, { label: string; color: string; prefix: string }> = {
  handshake_initiated: { label: "HANDSHAKE",    color: "#60a5fa", prefix: "⟷" },
  field_classified:    { label: "CLASSIFY",      color: "#737373", prefix: "◎" },
  ai_safe_sent:        { label: "AI TRANSFER",   color: "#22c55e", prefix: "→" },
  encrypted_direct:    { label: "ENC BYPASS",    color: "#f59e0b", prefix: "🔒" },
  order_confirmed:     { label: "CONFIRMED",     color: "#22c55e", prefix: "✓" },
};

function PrivacyTag({ type }: { type?: string | null }) {
  if (type === "encrypted")
    return (
      <span style={{ color: "#f59e0b", fontFamily: "monospace", fontSize: "10px" }}>
        🔒 bypassed AI
      </span>
    );
  if (type === "ai_safe")
    return (
      <span style={{ color: "#22c55e", fontFamily: "monospace", fontSize: "10px" }}>
        ✓ through AI
      </span>
    );
  return <span style={{ color: "#525252", fontSize: "10px" }}>—</span>;
}

interface LiveProtocolProps {
  agentId: string;
}

export default function LiveProtocol({ agentId }: LiveProtocolProps) {
  const [events, setEvents] = useState<ProtocolEvent[]>([]);
  const [newIds, setNewIds] = useState<Set<number>>(new Set());
  const prevIds = useRef<Set<number>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!agentId) return;

    const poll = async () => {
      try {
        const res = await fetch(
          `http://localhost:8000/api/activity?agent_id=${encodeURIComponent(agentId)}`
        );
        const data: ProtocolEvent[] = await res.json();
        const latest = data.slice(0, 10);

        const incoming = new Set<number>();
        latest.forEach((e) => {
          if (!prevIds.current.has(e.id)) incoming.add(e.id);
        });

        if (incoming.size > 0) {
          setNewIds(incoming);
          setTimeout(() => setNewIds(new Set()), 1200);
        }

        prevIds.current = new Set(latest.map((e) => e.id));
        setEvents(latest);
      } catch {
        // silently fail
      }
    };

    poll();
    const id = setInterval(poll, 2_000);
    return () => clearInterval(id);
  }, [agentId]);

  return (
    <div
      style={{
        background: "#111111",
        border: "1px solid #1f1f1f",
        borderRadius: "6px",
        overflow: "hidden",
        height: "100%",
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
        }}
      >
        <span
          className="text-xs uppercase tracking-widest font-medium"
          style={{ color: "#737373" }}
        >
          Live Protocol
        </span>
        <span
          className="text-xs flex items-center gap-1"
          style={{ color: "#22c55e", fontFamily: "monospace" }}
        >
          <span className="pulse-dot" style={{ display: "inline-block", width: "6px", height: "6px", borderRadius: "50%", background: "#22c55e" }} />
          live · 2s
        </span>
      </div>

      {/* Event stream */}
      <div
        ref={listRef}
        style={{
          overflowY: "auto",
          maxHeight: "320px",
          fontFamily: "monospace",
        }}
      >
        {events.length === 0 ? (
          <div style={{ padding: "32px 14px", textAlign: "center" }}>
            <p style={{ color: "#525252", fontSize: "12px" }}>Waiting for protocol events…</p>
          </div>
        ) : (
          events.map((ev, i) => {
            const cfg = EVENT_CFG[ev.event] ?? { label: ev.event.toUpperCase(), color: "#525252", prefix: "·" };
            const isNew = newIds.has(ev.id);
            return (
              <div
                key={ev.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "56px 90px 1fr 88px",
                  gap: "8px",
                  alignItems: "center",
                  padding: "7px 14px",
                  borderBottom: i < events.length - 1 ? "1px solid #1a1a1a" : "none",
                  background: isNew ? "rgba(34,197,94,0.04)" : "transparent",
                  transition: "background 0.6s",
                }}
              >
                {/* Timestamp */}
                <span style={{ fontSize: "10px", color: "#525252" }}>
                  {relativeTime(ev.created_at)}
                </span>

                {/* Event badge */}
                <span
                  style={{
                    fontSize: "9px",
                    color: cfg.color,
                    border: `1px solid ${cfg.color}44`,
                    borderRadius: "3px",
                    padding: "1px 5px",
                    background: `${cfg.color}0a`,
                    whiteSpace: "nowrap",
                    textAlign: "center",
                  }}
                >
                  {cfg.prefix} {cfg.label}
                </span>

                {/* Details */}
                <span
                  style={{
                    fontSize: "10px",
                    color: "#737373",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {ev.details ?? "—"}
                </span>

                {/* Privacy */}
                <PrivacyTag type={ev.privacy_type} />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
