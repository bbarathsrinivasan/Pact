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
          <p style={{ ...monoStyle, marginTop: "3px" }}>
            {agent.id}
          </p>
        </>
      ) : null}

      <Divider />

      {/* Capabilities */}
      <Label>Capabilities</Label>
      {loading ? (
        <div className="flex flex-wrap gap-1.5">
          <Skeleton w="60px" h="20px" />
          <Skeleton w="80px" h="20px" />
          <Skeleton w="50px" h="20px" />
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {agent?.capabilities?.map((cap) => (
            <span
              key={cap}
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
              {cap}
            </span>
          ))}
        </div>
      )}

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
