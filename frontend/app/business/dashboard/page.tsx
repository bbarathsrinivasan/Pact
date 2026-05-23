"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import DashboardSidebar from "../../../components/DashboardSidebar";
import StatCards from "../../../components/StatCards";
import OrdersTable from "../../../components/OrdersTable";
import ActivityLogTable from "../../../components/ActivityLogTable";
import AgentGraph from "../../../components/AgentGraph";
import LiveProtocol from "../../../components/LiveProtocol";
import NetworkTraffic from "../../../components/NetworkTraffic";
import { relativeTime, formatCurrency, decodeAgentId } from "../../../lib/utils";

const API = "http://localhost:8000";
const POLL_INTERVAL = 10_000;

interface AgentCard {
  id: string;
  name: string;
  description?: string;
  capabilities?: string[];
  ai_safe_schema?: string[];
  encrypted_schema?: { fields: string[]; endpoint: string };
  products?: Array<{ name: string; price: number; description?: string }>;
  registered_at?: string;
}

interface Order {
  id: string;
  product: string;
  quantity: number;
  total: number;
  status: string;
  delivery_speed: string;
  created_at: string;
  session_id?: string;
}

interface ActivityEvent {
  id: number;
  agent_id: string;
  event: string;
  details?: string;
  privacy_type?: string;
  created_at: string;
}

function DashboardContent() {
  const params = useSearchParams();
  const [agentId, setAgentId] = useState<string | null>(null);
  const [agent, setAgent] = useState<AgentCard | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [sessionCount, setSessionCount] = useState(0);
  const [agentLoading, setAgentLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number>(Date.now());
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [flashing, setFlashing] = useState(false);
  const prevOrderCount = useRef(0);

  // Resolve agent id
  useEffect(() => {
    const fromParam = params.get("id");
    if (fromParam) {
      setAgentId(decodeAgentId(fromParam));
      return;
    }
    const fromStorage =
      typeof window !== "undefined"
        ? localStorage.getItem("pact_business_agent_id")
        : null;
    if (fromStorage) setAgentId(fromStorage);
  }, [params]);

  // Fetch agent card
  useEffect(() => {
    if (!agentId) return;
    setAgentLoading(true);
    fetch(`${API}/api/business?id=${encodeURIComponent(agentId)}`)
      .then((r) => r.json())
      .then((data) => {
        setAgent(data);
        setAgentLoading(false);
      })
      .catch(() => {
        setError("Failed to load agent card.");
        setAgentLoading(false);
      });
  }, [agentId]);

  // Fetch orders + activity
  const fetchOrders = async (id: string, showLoader = false) => {
    if (showLoader) setOrdersLoading(true);
    try {
      const [ordersRes, activityRes] = await Promise.all([
        fetch(`${API}/api/orders?agent_id=${encodeURIComponent(id)}`),
        fetch(`${API}/api/activity?agent_id=${encodeURIComponent(id)}`),
      ]);
      const newOrders: Order[] = await ordersRes.json();
      const newActivity: ActivityEvent[] = await activityRes.json();

      // Flash if new orders arrived
      if (!showLoader && newOrders.length > prevOrderCount.current) {
        setFlashing(true);
        setTimeout(() => setFlashing(false), 1200);
      }
      prevOrderCount.current = newOrders.length;

      setOrders(newOrders);
      setActivity(newActivity);
      setLastUpdated(Date.now());
      setSecondsAgo(0);

      const sessions = new Set(
        newOrders.map((o) => o.session_id).filter(Boolean)
      );
      setSessionCount(sessions.size || 1);
    } catch {
      // silently fail on poll
    } finally {
      if (showLoader) setOrdersLoading(false);
      setActivityLoading(false);
    }
  };

  useEffect(() => {
    if (!agentId) return;
    fetchOrders(agentId, true);
    const poll = setInterval(() => fetchOrders(agentId), POLL_INTERVAL);
    return () => clearInterval(poll);
  }, [agentId]);

  // Tick "last updated Xs ago"
  useEffect(() => {
    const ticker = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastUpdated) / 1000));
    }, 1000);
    return () => clearInterval(ticker);
  }, [lastUpdated]);

  if (!agentId && !agentLoading) {
    return (
      <div
        className="flex flex-col items-center justify-center"
        style={{ minHeight: "calc(100vh - 44px)" }}
      >
        <p style={{ color: "var(--muted)" }} className="text-sm">
          No agent selected.
        </p>
        <a
          href="/business"
          style={{ color: "var(--blue)", fontSize: "13px", marginTop: "8px" }}
        >
          ← Onboard a business
        </a>
      </div>
    );
  }

  // Derive recent activity for AgentGraph (last 10 events)
  const recentActivity = activity.slice(0, 10).map((e) => ({
    event: e.event,
    privacy_type: e.privacy_type,
  }));

  return (
    <div
      style={{ minHeight: "calc(100vh - 44px)", display: "flex", flexDirection: "column" }}
    >
      {/* Error banner */}
      {error && (
        <div
          className="flex items-center justify-between px-4 py-2 text-sm"
          style={{
            background: "#1a0a0a",
            border: "1px solid #7f1d1d",
            borderRadius: "6px",
            color: "var(--error)",
            margin: "12px 24px 0",
          }}
        >
          {error}
          <button
            onClick={() => setError(null)}
            style={{
              background: "none",
              border: "none",
              color: "var(--error)",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Agent header bar */}
      <div
        style={{
          height: "56px",
          borderBottom: "1px solid var(--border)",
          padding: "0 24px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          flexShrink: 0,
        }}
      >
        <div>
          {agentLoading ? (
            <div
              className="animate-pulse rounded"
              style={{ height: "16px", width: "120px", background: "var(--surface-2)" }}
            />
          ) : (
            <div className="flex items-center gap-2">
              <span style={{ color: "var(--muted)", fontFamily: "monospace" }}>◈</span>
              <span className="text-sm font-medium" style={{ color: "var(--text)" }}>
                {agent?.name ?? "Business"}
              </span>
            </div>
          )}
          <p
            style={{
              fontFamily: "monospace",
              fontSize: "11px",
              color: "var(--muted-2)",
              marginTop: "1px",
            }}
          >
            {agentId}
          </p>
        </div>

        <div className="flex-1" />

        <span
          className="text-xs px-2 py-1 rounded flex items-center gap-1"
          style={{
            background: "var(--success-bg)",
            border: "1px solid var(--success-border)",
            color: "var(--success)",
            fontFamily: "monospace",
          }}
        >
          <span style={{ fontSize: "7px" }}>●</span> Live
        </span>
        <span
          className="text-xs px-2 py-1 rounded"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            color: "var(--muted)",
            fontFamily: "monospace",
          }}
        >
          Gemini 3.5 Flash
        </span>
        <a
          href={`/registry?highlight=${encodeURIComponent(agentId ?? "")}`}
          className="text-xs transition-colors duration-150"
          style={{ color: "var(--muted)", textDecoration: "none" }}
          onMouseEnter={(e) =>
            ((e.target as HTMLElement).style.color = "var(--text)")
          }
          onMouseLeave={(e) =>
            ((e.target as HTMLElement).style.color = "var(--muted)")
          }
        >
          View in Registry →
        </a>
      </div>

      {/* Body */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <DashboardSidebar agent={agent} loading={agentLoading} />

        {/* Main content */}
        <main style={{ flex: 1, overflowY: "auto", padding: "24px" }}>

          {/* ── Agent Communication Graph ─────────────────────────── */}
          <AgentGraph
            agentName={agent?.name ?? "Business"}
            aiSafeFields={agent?.ai_safe_schema ?? []}
            encryptedFields={agent?.encrypted_schema?.fields ?? []}
            recentActivity={recentActivity}
          />

          {/* ── Live Protocol + Network Traffic ──────────────────── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "16px",
              marginTop: "16px",
            }}
          >
            <div style={{ minHeight: "320px" }}>
              {agentId && <LiveProtocol agentId={agentId} />}
            </div>
            <div style={{ minHeight: "320px" }}>
              {agentId && <NetworkTraffic agentId={agentId} />}
            </div>
          </div>

          {/* ── Stat cards ───────────────────────────────────────── */}
          <div style={{ marginTop: "24px" }}>
            <StatCards
              orders={orders}
              sessionCount={sessionCount}
              loading={ordersLoading}
            />
          </div>

          {/* ── Orders table ─────────────────────────────────────── */}
          <div style={{ marginTop: "28px" }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium" style={{ color: "var(--text)" }}>
                Orders
              </span>
              <div className="flex items-center gap-2">
                <span
                  className="text-xs flex items-center gap-1"
                  style={{ color: "var(--success)", fontFamily: "monospace" }}
                >
                  <span style={{ fontSize: "7px" }}>●</span> Live
                </span>
                <span className="text-xs" style={{ color: "var(--muted-2)" }}>
                  Updated{" "}
                  {secondsAgo === 0 ? "just now" : `${secondsAgo}s ago`}
                </span>
              </div>
            </div>
            <OrdersTable
              orders={orders}
              loading={ordersLoading}
              flashing={flashing}
            />
          </div>

          {/* ── Product catalog ───────────────────────────────────── */}
          {agent?.products && agent.products.length > 0 && (
            <div style={{ marginTop: "28px" }}>
              <p
                className="text-sm font-medium mb-3"
                style={{ color: "var(--text)" }}
              >
                Product Catalog
              </p>
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
                    <tr
                      style={{
                        background: "var(--surface-2)",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      {["Name", "Price", "Description", "Availability"].map(
                        (h) => (
                          <th
                            key={h}
                            className="text-left text-xs uppercase tracking-widest"
                            style={{
                              padding: "10px 16px",
                              color: "var(--muted)",
                              fontWeight: 400,
                            }}
                          >
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {agent.products.map((p, i) => (
                      <tr
                        key={i}
                        style={{
                          borderBottom:
                            i < (agent.products?.length ?? 0) - 1
                              ? "1px solid var(--border)"
                              : "none",
                        }}
                        onMouseEnter={(e) =>
                          ((e.currentTarget as HTMLElement).style.background =
                            "var(--surface-2)")
                        }
                        onMouseLeave={(e) =>
                          ((e.currentTarget as HTMLElement).style.background =
                            "transparent")
                        }
                      >
                        <td style={{ padding: "10px 16px" }}>
                          <span className="text-xs" style={{ color: "var(--text)" }}>
                            {p.name}
                          </span>
                        </td>
                        <td style={{ padding: "10px 16px" }}>
                          <span
                            className="text-xs"
                            style={{
                              color: "var(--text)",
                              fontFamily: "monospace",
                            }}
                          >
                            {p.price === 0 ? "Free" : formatCurrency(p.price)}
                          </span>
                        </td>
                        <td style={{ padding: "10px 16px" }}>
                          <span className="text-xs" style={{ color: "var(--muted)" }}>
                            {p.description ?? "—"}
                          </span>
                        </td>
                        <td style={{ padding: "10px 16px" }}>
                          <span
                            className="text-xs px-2 py-0.5 rounded"
                            style={{
                              background: "var(--success-bg)",
                              border: "1px solid var(--success-border)",
                              color: "var(--success)",
                              fontFamily: "monospace",
                            }}
                          >
                            In Stock
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Activity log ─────────────────────────────────────── */}
          <div style={{ marginTop: "28px", marginBottom: "40px" }}>
            <div className="flex items-center justify-between mb-3">
              <span
                className="text-sm font-medium"
                style={{ color: "var(--text)" }}
              >
                Agent Activity
              </span>
              <span className="text-xs" style={{ color: "var(--muted-2)" }}>
                Last 50 events
              </span>
            </div>
            <ActivityLogTable events={activity} loading={activityLoading} />
          </div>
        </main>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div
          className="flex items-center justify-center"
          style={{ minHeight: "calc(100vh - 44px)" }}
        >
          <p style={{ color: "var(--muted)", fontSize: "13px" }}>
            Loading dashboard…
          </p>
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
