"use client";

interface PolicyResult {
  approved: string[];
  encrypt:  string[];
  blocked:  string[];
  requires_confirmation: boolean;
}

interface PolicyCardProps {
  businessName:  string;
  policyResult:  PolicyResult;
  onConfirm:     () => void;
  onCancel:      () => void;
  confirming?:   boolean;   // loading state while API call is in flight
  confirmed?:    boolean;   // true once booking is complete
  confirmationCode?: string;
}

const pill = (label: string, color: string, bg: string, border: string) => (
  <span
    key={label}
    style={{
      fontFamily:   "monospace",
      fontSize:     "10px",
      padding:      "2px 8px",
      borderRadius: "4px",
      color,
      background:   bg,
      border:       `1px solid ${border}`,
    }}
  >
    {label}
  </span>
);

export default function PolicyCard({
  businessName,
  policyResult,
  onConfirm,
  onCancel,
  confirming = false,
  confirmed  = false,
  confirmationCode,
}: PolicyCardProps) {
  return (
    <div
      style={{
        background:   "#0d0d0d",
        border:       `1px solid ${confirmed ? "#14532d" : "#1f1f1f"}`,
        borderRadius: "10px",
        padding:      "14px 16px",
        width:        "100%",
        maxWidth:     "400px",
        display:      "flex",
        flexDirection:"column",
        gap:          "12px",
        transition:   "border-color 0.3s",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ fontFamily: "monospace", fontSize: "13px", color: "#8a8a8a" }}>◈</span>
        <span style={{ fontSize: "12px", color: "#b8b8b8" }}>
          Sharing with{" "}
          <span style={{ color: "#ededed", fontWeight: 500 }}>{businessName}</span>
        </span>
        {confirmed && (
          <span
            style={{
              marginLeft:   "auto",
              fontFamily:   "monospace",
              fontSize:     "10px",
              padding:      "2px 8px",
              borderRadius: "4px",
              background:   "rgba(34,197,94,0.08)",
              border:       "1px solid rgba(34,197,94,0.3)",
              color:        "#22c55e",
            }}
          >
            ✓ confirmed
          </span>
        )}
      </div>

      {/* AI-safe fields */}
      {policyResult.approved.length > 0 && (
        <div>
          <p style={{ fontSize: "10px", color: "#8a8a8a", marginBottom: "6px", fontFamily: "monospace" }}>
            <span style={{ color: "#22c55e" }}>●</span> AI can see
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
            {policyResult.approved.map((f) =>
              pill(f, "#22c55e", "rgba(34,197,94,0.07)", "rgba(34,197,94,0.25)")
            )}
          </div>
        </div>
      )}

      {/* Encrypted fields */}
      {policyResult.encrypt.length > 0 && (
        <div>
          <p style={{ fontSize: "10px", color: "#8a8a8a", marginBottom: "6px", fontFamily: "monospace" }}>
            🔒 Encrypted — bypasses AI entirely
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
            {policyResult.encrypt.map((f) =>
              pill(f, "#f59e0b", "rgba(245,158,11,0.07)", "rgba(245,158,11,0.25)")
            )}
          </div>
        </div>
      )}

      {/* Blocked fields */}
      {policyResult.blocked.length > 0 && (
        <div>
          <p style={{ fontSize: "10px", color: "#8a8a8a", marginBottom: "6px", fontFamily: "monospace" }}>
            🚫 Blocked — not sharing
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
            {policyResult.blocked.map((f) =>
              pill(f, "#8a8a8a", "rgba(82,82,82,0.07)", "rgba(82,82,82,0.2)")
            )}
          </div>
        </div>
      )}

      {/* ── Confirmed state ───────────────────────────────────────────── */}
      {confirmed ? (
        <div
          style={{
            display:      "flex",
            alignItems:   "center",
            gap:          "10px",
            padding:      "10px 12px",
            background:   "rgba(34,197,94,0.06)",
            border:       "1px solid rgba(34,197,94,0.2)",
            borderRadius: "8px",
          }}
        >
          <div
            style={{
              width:        "28px",
              height:       "28px",
              borderRadius: "50%",
              background:   "rgba(34,197,94,0.12)",
              border:       "1px solid rgba(34,197,94,0.3)",
              display:      "flex",
              alignItems:   "center",
              justifyContent: "center",
              flexShrink:   0,
              fontSize:     "13px",
            }}
          >
            ✓
          </div>
          <div>
            <p style={{ fontSize: "12px", color: "#ededed", fontWeight: 500 }}>
              Booking confirmed
            </p>
            {confirmationCode && (
              <p style={{ fontFamily: "monospace", fontSize: "10px", color: "#22c55e", marginTop: "2px" }}>
                {confirmationCode}
              </p>
            )}
          </div>
        </div>
      ) : confirming ? (
        /* ── Confirming (loading) ──────────────────────────────────────── */
        <div
          style={{
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            gap:            "8px",
            padding:        "10px",
            borderRadius:   "8px",
            background:     "#111",
            border:         "1px solid #1f1f1f",
          }}
        >
          {[0, 0.15, 0.3].map((d) => (
            <span
              key={d}
              style={{
                width:     "5px",
                height:    "5px",
                borderRadius: "50%",
                background: "#22c55e",
                display:   "inline-block",
                animation: `pulse-dot 1.2s ease-in-out ${d}s infinite`,
              }}
            />
          ))}
          <span style={{ fontFamily: "monospace", fontSize: "10px", color: "#8a8a8a" }}>
            Completing booking…
          </span>
        </div>
      ) : (
        /* ── Action buttons ────────────────────────────────────────────── */
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={onConfirm}
            style={{
              flex:         1,
              height:       "32px",
              background:   "rgba(34,197,94,0.1)",
              border:       "1px solid rgba(34,197,94,0.35)",
              borderRadius: "6px",
              color:        "#22c55e",
              fontSize:     "12px",
              fontWeight:   500,
              cursor:       "pointer",
              fontFamily:   "monospace",
              transition:   "background 0.15s",
            }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLElement).style.background = "rgba(34,197,94,0.18)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLElement).style.background = "rgba(34,197,94,0.1)")
            }
          >
            ✓ Confirm
          </button>
          <button
            onClick={onCancel}
            style={{
              flex:         1,
              height:       "32px",
              background:   "rgba(239,68,68,0.07)",
              border:       "1px solid rgba(239,68,68,0.2)",
              borderRadius: "6px",
              color:        "#ef4444",
              fontSize:     "12px",
              fontWeight:   500,
              cursor:       "pointer",
              fontFamily:   "monospace",
              transition:   "background 0.15s",
            }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.14)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.07)")
            }
          >
            ✕ Cancel
          </button>
        </div>
      )}
    </div>
  );
}
