"use client";

import { formatCurrency } from "../lib/utils";

interface Order {
  id: string;
  status: string;
  total: number;
  session_id?: string;
}

interface StatCardsProps {
  orders: Order[];
  sessionCount: number;
  loading?: boolean;
}

function StatCard({
  label,
  value,
  sub,
  loading,
}: {
  label: string;
  value: string;
  sub: string;
  loading?: boolean;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "6px",
        padding: "16px",
      }}
    >
      <p
        className="text-xs uppercase tracking-widest mb-1"
        style={{ color: "var(--muted)" }}
      >
        {label}
      </p>
      {loading ? (
        <div
          className="animate-pulse rounded"
          style={{ height: "32px", background: "var(--surface-2)", width: "80px", marginBottom: "4px" }}
        />
      ) : (
        <p
          className="text-2xl"
          style={{ color: "var(--text)", fontFamily: "monospace" }}
        >
          {value}
        </p>
      )}
      <p className="text-xs mt-1" style={{ color: "var(--muted-2)" }}>
        {sub}
      </p>
    </div>
  );
}

export default function StatCards({ orders, sessionCount, loading }: StatCardsProps) {
  const total = orders.length;
  const pending = orders.filter((o) => o.status === "pending" || o.status === "processing").length;
  const revenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
      <StatCard label="Total Orders"    value={String(total)}              sub="All time"                  loading={loading} />
      <StatCard label="Pending"         value={String(pending)}            sub="Awaiting fulfillment"      loading={loading} />
      <StatCard label="Revenue"         value={formatCurrency(revenue)}    sub="Estimated from orders"     loading={loading} />
      <StatCard label="Agent Sessions"  value={String(sessionCount)}       sub="Conversations initiated"   loading={loading} />
    </div>
  );
}
