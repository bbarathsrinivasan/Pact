"use client";

import { relativeTime, formatCurrency } from "../lib/utils";

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

const STATUS_STYLES: Record<string, React.CSSProperties> = {
  pending:    { background: "var(--surface)",   border: "1px solid var(--border-2)", color: "var(--muted)" },
  confirmed:  { background: "var(--success-bg)", border: "1px solid var(--success-border)", color: "var(--success)" },
  processing: { background: "#0a0a1a",           border: "1px solid #1e3a5f",             color: "var(--blue)" },
  completed:  { background: "var(--surface)",   border: "1px solid var(--border-2)", color: "var(--muted-2)" },
  cancelled:  { background: "#1a0a0a",           border: "1px solid #7f1d1d",             color: "var(--error)" },
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.pending;
  return (
    <span
      className="text-xs px-2 py-0.5 rounded"
      style={{ ...style, fontFamily: "monospace" }}
    >
      {status}
    </span>
  );
}

const COL_HEADERS = ["Order ID", "Product", "Qty", "Total", "Status", "Delivery", "Created"];

interface OrdersTableProps {
  orders: Order[];
  loading?: boolean;
  flashing?: boolean;
}

export default function OrdersTable({ orders, loading, flashing }: OrdersTableProps) {
  const containerStyle: React.CSSProperties = {
    background: "var(--surface)",
    border: `1px solid var(--border)`,
    borderRadius: "6px",
    overflow: "hidden",
    transition: "border-color 0.5s",
    ...(flashing ? { borderColor: "var(--success)" } : {}),
  };

  return (
    <div style={containerStyle}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
            {COL_HEADERS.map((h) => (
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
            Array.from({ length: 3 }).map((_, i) => (
              <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                {COL_HEADERS.map((h) => (
                  <td key={h} style={{ padding: "10px 16px" }}>
                    <div
                      className="animate-pulse rounded"
                      style={{ height: "14px", background: "var(--surface-2)", width: "80%" }}
                    />
                  </td>
                ))}
              </tr>
            ))
          ) : orders.length === 0 ? (
            <tr>
              <td colSpan={COL_HEADERS.length} style={{ padding: "64px 16px", textAlign: "center" }}>
                <p style={{ color: "var(--muted)", fontFamily: "monospace" }}>○</p>
                <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>No orders yet</p>
                <p className="text-xs mt-1" style={{ color: "var(--muted-2)" }}>
                  Orders will appear here when customers interact with your agent
                </p>
              </td>
            </tr>
          ) : (
            orders.map((order, i) => (
              <tr
                key={order.id}
                style={{
                  borderBottom: i < orders.length - 1 ? "1px solid var(--border)" : "none",
                  transition: "background 150ms",
                }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--surface-2)")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
              >
                <td style={{ padding: "10px 16px" }}>
                  <span className="text-xs" style={{ color: "var(--muted-2)", fontFamily: "monospace" }}>
                    {order.id}
                  </span>
                </td>
                <td style={{ padding: "10px 16px" }}>
                  <span className="text-xs" style={{ color: "var(--text)" }}>{order.product}</span>
                </td>
                <td style={{ padding: "10px 16px", textAlign: "center" }}>
                  <span className="text-xs" style={{ color: "var(--text)", fontFamily: "monospace" }}>
                    {order.quantity}
                  </span>
                </td>
                <td style={{ padding: "10px 16px" }}>
                  <span className="text-xs" style={{ color: "var(--text)", fontFamily: "monospace" }}>
                    {formatCurrency(order.total)}
                  </span>
                </td>
                <td style={{ padding: "10px 16px" }}>
                  <StatusBadge status={order.status} />
                </td>
                <td style={{ padding: "10px 16px" }}>
                  <span className="text-xs" style={{ color: "var(--muted)" }}>{order.delivery_speed}</span>
                </td>
                <td style={{ padding: "10px 16px" }}>
                  <span className="text-xs" style={{ color: "var(--muted-2)", fontFamily: "monospace" }}>
                    {relativeTime(order.created_at)}
                  </span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
