"use client";

import { relativeTime } from "../lib/utils";

interface ActivityEvent {
  id: number;
  agent_id: string;
  event: string;
  details?: string;
  privacy_type?: string;
  created_at: string;
}

const EVENT_META: Record<string, { label: string; color: string }> = {
  handshake_initiated: { label: "Handshake",      color: "var(--blue)" },
  field_classified:    { label: "Classification", color: "var(--muted)" },
  ai_safe_sent:        { label: "AI Transfer",    color: "var(--success)" },
  encrypted_direct:    { label: "Encrypted Send", color: "var(--amber)" },
  order_confirmed:     { label: "Confirmed",      color: "var(--success)" },
};

function PrivacyCell({ privacy_type }: { privacy_type?: string }) {
  if (privacy_type === "encrypted") {
    return (
      <span className="text-xs" style={{ color: "var(--amber)", fontFamily: "monospace" }}>
        🔒 Bypassed AI
      </span>
    );
  }
  if (privacy_type === "ai_safe") {
    return (
      <span className="text-xs" style={{ color: "var(--success)", fontFamily: "monospace" }}>
        ✓ Through AI
      </span>
    );
  }
  return <span className="text-xs" style={{ color: "var(--muted-2)" }}>—</span>;
}

interface ActivityLogTableProps {
  events: ActivityEvent[];
  loading?: boolean;
}

export default function ActivityLogTable({ events, loading }: ActivityLogTableProps) {
  const cols = ["Timestamp", "Event", "Details", "Privacy"];

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "6px",
        overflow: "hidden",
      }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
            {cols.map((h) => (
              <th
                key={h}
                className="text-left text-xs uppercase tracking-widest"
                style={{ padding: "10px 16px", color: "var(--muted)", fontWeight: 400 }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                {cols.map((h) => (
                  <td key={h} style={{ padding: "10px 16px" }}>
                    <div className="animate-pulse rounded" style={{ height: "14px", background: "var(--surface-2)", width: "70%" }} />
                  </td>
                ))}
              </tr>
            ))
          ) : events.length === 0 ? (
            <tr>
              <td colSpan={4} style={{ padding: "40px 16px", textAlign: "center" }}>
                <p className="text-sm" style={{ color: "var(--muted)" }}>No activity yet</p>
              </td>
            </tr>
          ) : (
            events.map((ev, i) => {
              const meta = EVENT_META[ev.event] ?? { label: ev.event, color: "var(--muted)" };
              return (
                <tr
                  key={ev.id}
                  style={{ borderBottom: i < events.length - 1 ? "1px solid var(--border)" : "none" }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--surface-2)")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                >
                  <td style={{ padding: "10px 16px" }}>
                    <span className="text-xs" style={{ color: "var(--muted-2)", fontFamily: "monospace" }}>
                      {relativeTime(ev.created_at)}
                    </span>
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    <span className="text-xs font-medium" style={{ color: meta.color }}>
                      {meta.label}
                    </span>
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    <span className="text-xs" style={{ color: "var(--muted)" }}>
                      {ev.details ?? "—"}
                    </span>
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    <PrivacyCell privacy_type={ev.privacy_type ?? undefined} />
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
