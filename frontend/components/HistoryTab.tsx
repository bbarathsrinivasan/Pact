"use client";

import { useEffect, useState } from "react";
import { relativeTime } from "../lib/utils";

const API = "http://localhost:8000";

interface HistoryItem {
  session_id:    string;
  state:         "complete" | "cancelled";
  agent_name:    string;
  agent_id:      string;
  intent:        string;
  business_type: string;
  ai_safe_fields: string[];
  enc_fields:    string[];
  created_at:    string;
  completed_at:  string;
}

function BusinessTypeIcon({ type }: { type: string }) {
  const icons: Record<string, string> = {
    restaurant: "🍽",
    hotel:      "🏨",
    salon:      "✂️",
    spa:        "🧖",
    cafe:       "☕",
    bar:        "🍸",
    gym:        "💪",
  };
  return <span>{icons[type] ?? "◈"}</span>;
}

function HistoryCard({ item, expanded, onToggle }: {
  item: HistoryItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isComplete = item.state === "complete";

  return (
    <div
      style={{
        borderBottom: "1px solid #111111",
        cursor: "pointer",
      }}
    >
      {/* Summary row */}
      <div
        onClick={onToggle}
        style={{
          padding: "10px 16px",
          display: "flex",
          alignItems: "flex-start",
          gap: "10px",
        }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "#0d0d0d")}
        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
      >
        {/* Icon */}
        <span style={{ fontSize: "14px", flexShrink: 0, marginTop: "1px" }}>
          <BusinessTypeIcon type={item.business_type} />
        </span>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
            <span style={{ fontFamily: "monospace", fontSize: "11px", color: "#ededed" }}>
              {item.agent_name}
            </span>
            <span
              style={{
                fontFamily: "monospace",
                fontSize: "9px",
                padding: "1px 5px",
                borderRadius: "3px",
                background: isComplete ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
                border: `1px solid ${isComplete ? "#166534" : "#7f1d1d"}`,
                color: isComplete ? "#22c55e" : "#ef4444",
              }}
            >
              {isComplete ? "✓" : "✕"}
            </span>
          </div>
          <p
            style={{
              fontFamily: "monospace",
              fontSize: "10px",
              color: "#8a8a8a",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {item.intent || "No intent captured"}
          </p>
          <p style={{ fontFamily: "monospace", fontSize: "9px", color: "#3a3a3a", marginTop: "3px" }}>
            {relativeTime(item.completed_at)}
          </p>
        </div>

        {/* Chevron */}
        <span style={{ color: "#3a3a3a", fontSize: "10px", marginTop: "3px" }}>
          {expanded ? "▲" : "▼"}
        </span>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div
          style={{
            padding: "0 16px 12px 40px",
            background: "#0a0a0a",
          }}
        >
          {/* Data tracks */}
          <div style={{ marginBottom: "10px" }}>
            {item.ai_safe_fields.length > 0 && (
              <div style={{ marginBottom: "6px" }}>
                <span
                  style={{
                    fontFamily: "monospace",
                    fontSize: "9px",
                    color: "#8a8a8a",
                    textTransform: "uppercase",
                    letterSpacing: "1px",
                  }}
                >
                  Through AI
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "4px" }}>
                  {item.ai_safe_fields.map((f) => (
                    <span
                      key={f}
                      style={{
                        fontFamily: "monospace",
                        fontSize: "9px",
                        padding: "1px 5px",
                        borderRadius: "3px",
                        background: "rgba(34,197,94,0.06)",
                        border: "1px solid rgba(34,197,94,0.2)",
                        color: "#22c55e",
                      }}
                    >
                      ● {f}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {item.enc_fields.length > 0 && (
              <div>
                <span
                  style={{
                    fontFamily: "monospace",
                    fontSize: "9px",
                    color: "#8a8a8a",
                    textTransform: "uppercase",
                    letterSpacing: "1px",
                  }}
                >
                  Encrypted bypass
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "4px" }}>
                  {item.enc_fields.map((f) => (
                    <span
                      key={f}
                      style={{
                        fontFamily: "monospace",
                        fontSize: "9px",
                        padding: "1px 5px",
                        borderRadius: "3px",
                        background: "rgba(245,158,11,0.06)",
                        border: "1px solid rgba(245,158,11,0.2)",
                        color: "#f59e0b",
                      }}
                    >
                      🔒 {f}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {item.ai_safe_fields.length === 0 && item.enc_fields.length === 0 && (
              <p style={{ fontFamily: "monospace", fontSize: "10px", color: "#3a3a3a" }}>
                No field data recorded
              </p>
            )}
          </div>

          {/* Session ID */}
          <p
            style={{
              fontFamily: "monospace",
              fontSize: "9px",
              color: "#2a2a2a",
              marginTop: "6px",
            }}
          >
            session {item.session_id}
          </p>

          {/* View business */}
          {item.agent_id && (
            <a
              href={`/business/dashboard?id=${encodeURIComponent(item.agent_id)}`}
              style={{
                fontFamily: "monospace",
                fontSize: "9px",
                color: "#8a8a8a",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "3px",
                marginTop: "6px",
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#9a9a9a")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#8a8a8a")}
            >
              View {item.agent_name} dashboard →
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export default function HistoryTab() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/api/history`)
      .then((r) => r.json())
      .then((data) => { setHistory(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const toggle = (id: string) =>
    setExpandedId((prev) => (prev === id ? null : id));

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div
        style={{
          padding: "12px 16px 10px",
          borderBottom: "1px solid #1f1f1f",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <p
            style={{
              fontFamily: "monospace",
              fontSize: "9px",
              color: "#8a8a8a",
              textTransform: "uppercase",
              letterSpacing: "2px",
              marginBottom: "2px",
            }}
          >
            Interaction History
          </p>
          <p style={{ fontSize: "11px", color: "#8a8a8a" }}>
            {history.length} session{history.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => {
            setLoading(true);
            fetch(`${API}/api/history`)
              .then((r) => r.json())
              .then((data) => { setHistory(data); setLoading(false); })
              .catch(() => setLoading(false));
          }}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontFamily: "monospace",
            fontSize: "11px",
            color: "#8a8a8a",
            padding: 0,
          }}
        >
          ↻
        </button>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {loading ? (
          <div style={{ padding: "24px 16px" }}>
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="animate-pulse"
                style={{
                  height: "56px",
                  background: "#111111",
                  borderRadius: "4px",
                  marginBottom: "8px",
                }}
              />
            ))}
          </div>
        ) : history.length === 0 ? (
          <div style={{ padding: "40px 16px", textAlign: "center" }}>
            <p style={{ fontFamily: "monospace", fontSize: "11px", color: "#3a3a3a" }}>
              No sessions yet
            </p>
            <p style={{ fontFamily: "monospace", fontSize: "10px", color: "#2a2a2a", marginTop: "6px" }}>
              Start a conversation to see history here
            </p>
          </div>
        ) : (
          history.map((item) => (
            <HistoryCard
              key={item.session_id}
              item={item}
              expanded={expandedId === item.session_id}
              onToggle={() => toggle(item.session_id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
