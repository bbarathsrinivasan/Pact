"use client";

import { relativeTime } from "../lib/utils";

interface AgentCard {
  id: string;
  name: string;
  description?: string;
  capabilities?: string[];
  ai_safe_schema?: string[];
  encrypted_schema?: { fields: string[] };
  registered_at?: string;
}

const MAX_FIELDS = 3;

function FieldList({
  fields,
  color,
  icon,
}: {
  fields: string[];
  color: string;
  icon: React.ReactNode;
}) {
  const visible = fields.slice(0, MAX_FIELDS);
  const extra = fields.length - MAX_FIELDS;
  return (
    <div className="space-y-1">
      {visible.map((f) => (
        <div key={f} className="flex items-center gap-1.5">
          <span style={{ color, fontSize: "8px" }}>{icon}</span>
          <span style={{ fontFamily: "monospace", fontSize: "11px", color: "var(--text)" }}>
            {f}
          </span>
        </div>
      ))}
      {extra > 0 && (
        <p style={{ fontSize: "11px", color: "var(--muted-2)" }}>+{extra} more</p>
      )}
    </div>
  );
}

interface RegistryCardProps {
  agent: AgentCard;
  highlighted?: boolean;
}

export default function RegistryCard({ agent, highlighted }: RegistryCardProps) {
  return (
    <div
      id={`agent-${agent.id}`}
      style={{
        background: "var(--surface)",
        border: highlighted ? "1px solid var(--text)" : "1px solid var(--border)",
        borderRadius: "6px",
        padding: "20px",
        transition: "border-color 150ms",
        outline: highlighted ? "1px solid var(--border-2)" : "none",
        outlineOffset: "2px",
      }}
      onMouseEnter={(e) => {
        if (!highlighted)
          (e.currentTarget as HTMLElement).style.borderColor = "var(--border-2)";
      }}
      onMouseLeave={(e) => {
        if (!highlighted)
          (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
      }}
    >
      {/* Row 1: name + status */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <span style={{ color: "var(--muted)", fontFamily: "monospace" }}>◈</span>
            <span className="text-sm font-medium" style={{ color: "var(--text)" }}>
              {agent.name}
            </span>
          </div>
          <p
            className="mt-0.5"
            style={{ fontFamily: "monospace", fontSize: "11px", color: "var(--muted-2)" }}
          >
            {agent.id}
          </p>
        </div>
        <span
          className="text-xs px-2 py-1 rounded flex items-center gap-1"
          style={{
            background: "var(--success-bg)",
            border: "1px solid var(--success-border)",
            color: "var(--success)",
            fontFamily: "monospace",
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ fontSize: "7px" }}>●</span> Live
        </span>
      </div>

      {/* Description */}
      {agent.description && (
        <p
          className="mt-3 text-xs leading-relaxed"
          style={{
            color: "var(--muted)",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {agent.description}
        </p>
      )}

      {/* Divider */}
      <div style={{ borderTop: "1px solid var(--border)", margin: "12px 0" }} />

      {/* Capabilities */}
      <p className="text-xs uppercase tracking-widest mb-2" style={{ color: "var(--muted-2)" }}>
        Capabilities
      </p>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {(agent.capabilities ?? []).map((c) => (
          <span
            key={c}
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "4px",
              padding: "2px 8px",
              fontFamily: "monospace",
              fontSize: "11px",
              color: "var(--text)",
            }}
          >
            {c}
          </span>
        ))}
      </div>

      {/* Divider */}
      <div style={{ borderTop: "1px solid var(--border)", margin: "12px 0" }} />

      {/* Privacy split */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p
            className="text-xs uppercase tracking-widest mb-2"
            style={{ color: "var(--success)" }}
          >
            AI Can See
          </p>
          <FieldList
            fields={agent.ai_safe_schema ?? []}
            color="var(--success)"
            icon="●"
          />
        </div>
        <div>
          <p
            className="text-xs uppercase tracking-widest mb-2"
            style={{ color: "var(--amber)" }}
          >
            Encrypted
          </p>
          <FieldList
            fields={agent.encrypted_schema?.fields ?? []}
            color="var(--amber)"
            icon="🔒"
          />
        </div>
      </div>

      {/* Divider */}
      <div style={{ borderTop: "1px solid var(--border)", margin: "12px 0" }} />

      {/* Footer */}
      <div className="flex items-center justify-between">
        <p style={{ fontSize: "11px", color: "var(--muted-2)" }}>
          Registered {relativeTime(agent.registered_at)}
        </p>
        <a
          href={`/business/dashboard?id=${encodeURIComponent(agent.id)}`}
          className="text-xs transition-colors duration-150"
          style={{ color: "var(--muted)", textDecoration: "none" }}
          onMouseEnter={(e) => ((e.target as HTMLElement).style.color = "var(--text)")}
          onMouseLeave={(e) => ((e.target as HTMLElement).style.color = "var(--muted)")}
        >
          View Details →
        </a>
      </div>
    </div>
  );
}
