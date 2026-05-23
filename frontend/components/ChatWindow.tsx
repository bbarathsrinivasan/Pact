"use client";

import { useState, useRef, useEffect } from "react";
import PolicyCard from "./PolicyCard";

const API = "http://localhost:8000";

interface HandshakeEvent {
  icon: string;
  text: string;
  type: "discover" | "info" | "safe" | "encrypt" | "handshake";
}

interface Product {
  name:        string;
  price:       number;
  description?: string;
  image_url?:  string;
  tags?:       string[];
}

interface StoreInfo {
  name:          string;
  description?:  string;
  match_reason?: string;
  source_url?:   string;
}

interface Message {
  role:                "user" | "agent";
  content:             string;
  state?:              string;
  policyResult?:       any;
  sessionToken?:       string;
  businessName?:       string;
  confirmationCode?:   string;
  handshakeEvents?:    HandshakeEvent[];
  products?:           Product[];
  storeInfo?:          StoreInfo;
  preConfirmProduct?:  Product;  // set when showing the pre-confirm card
  // Policy card states
  confirming?:          boolean;
  confirmed?:           boolean;
  isSensitiveWarning?:  boolean;
}

const PLACEHOLDERS = [
  "I want to buy shoes…",
  "Book a day pass at SHACK15 for tomorrow…",
  "My shoe size is 10.5…",
  "Show me sneakers under $120…",
  "Book me a workspace at SHACK15…",
];

// ── Type colours ───────────────────────────────────────────────────────────────
const EVENT_COLORS: Record<string, { color: string; bg: string }> = {
  discover:  { color: "#60a5fa", bg: "rgba(96,165,250,0.08)"  },
  info:      { color: "#a3a3a3", bg: "transparent"            },
  safe:      { color: "#22c55e", bg: "rgba(34,197,94,0.06)"   },
  encrypt:   { color: "#f59e0b", bg: "rgba(245,158,11,0.06)"  },
  handshake: { color: "#a78bfa", bg: "rgba(167,139,250,0.08)" },
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function AgentAvatar() {
  return (
    <div
      style={{
        width:         "24px",
        height:        "24px",
        borderRadius:  "50%",
        background:    "#111111",
        border:        "1px solid #1f1f1f",
        display:       "flex",
        alignItems:    "center",
        justifyContent:"center",
        flexShrink:    0,
        fontFamily:    "monospace",
        fontSize:      "11px",
        color:         "#8a8a8a",
      }}
    >
      ◈
    </div>
  );
}

function HandshakePanel({ events }: { events: HandshakeEvent[] }) {
  if (!events || events.length === 0) return null;

  // Find the most prominent event (handshake > discover > info)
  const primary = events.find(e => e.type === "handshake") ?? events[0];

  return (
    <div style={{ display: "flex", justifyContent: "center", marginTop: "6px" }}>
      <div
        style={{
          display:        "flex",
          flexDirection:  "column",
          alignItems:     "center",
          gap:            "6px",
          padding:        "12px 24px",
          borderRadius:   "12px",
          background:     "rgba(167,139,250,0.05)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border:         "1px solid rgba(167,139,250,0.15)",
          boxShadow:      "0 4px 24px rgba(167,139,250,0.08), inset 0 1px 0 rgba(255,255,255,0.04)",
          width:          "fit-content",
          minWidth:       "200px",
          maxWidth:       "320px",
          textAlign:      "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              width:        "6px",
              height:       "6px",
              borderRadius: "50%",
              background:   "#a78bfa",
              boxShadow:    "0 0 8px #a78bfa",
              flexShrink:   0,
            }}
          />
          <span
            style={{
              fontFamily:    "monospace",
              fontSize:      "11px",
              color:         "#a78bfa",
              letterSpacing: "0.04em",
            }}
          >
            {primary.text}
          </span>
        </div>
        {events.length > 1 && (
          <p
            style={{
              fontFamily: "monospace",
              fontSize:   "9px",
              color:      "#6b6b6b",
              margin:     0,
            }}
          >
            {events.find(e => e.type === "discover")?.text}
          </p>
        )}
      </div>
    </div>
  );
}

function StoreCard({ store }: { store: StoreInfo }) {
  return (
    <div
      style={{
        marginTop:    "10px",
        padding:      "14px 16px",
        borderRadius: "10px",
        background:   "rgba(167,139,250,0.04)",
        border:       "1px solid rgba(167,139,250,0.12)",
        boxShadow:    "0 2px 12px rgba(167,139,250,0.06)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
        <span style={{ fontSize: "15px" }}>🏪</span>
        <span style={{ fontSize: "13px", fontWeight: 600, color: "#ededed" }}>{store.name}</span>
      </div>
      {store.description && (
        <p style={{ fontSize: "11px", color: "#737373", lineHeight: 1.5, marginBottom: "8px" }}>
          {store.description}
        </p>
      )}
      {store.match_reason && (
        <div
          style={{
            display:      "flex",
            alignItems:   "center",
            gap:          "6px",
            padding:      "5px 8px",
            borderRadius: "6px",
            background:   "rgba(34,197,94,0.05)",
            border:       "1px solid rgba(34,197,94,0.15)",
          }}
        >
          <span style={{ fontSize: "10px" }}>✓</span>
          <span style={{ fontFamily: "monospace", fontSize: "10px", color: "#22c55e" }}>
            {store.match_reason}
          </span>
        </div>
      )}
    </div>
  );
}

function PreConfirmCard({
  product,
  onConfirm,
  onCancel,
}: {
  product: Product;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      style={{
        marginTop:    "10px",
        borderRadius: "10px",
        border:       "1px solid rgba(167,139,250,0.2)",
        background:   "rgba(167,139,250,0.04)",
        overflow:     "hidden",
      }}
    >
      {product.image_url && (
        <div style={{ height: "140px", overflow: "hidden", background: "#0a0a0a" }}>
          <img
            src={product.image_url}
            alt={product.name}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        </div>
      )}
      <div style={{ padding: "14px 16px" }}>
        <p style={{ fontSize: "13px", fontWeight: 600, color: "#ededed", marginBottom: "2px" }}>
          {product.name}
        </p>
        <p style={{ fontFamily: "monospace", fontSize: "14px", color: "#22c55e", marginBottom: "6px" }}>
          ${product.price.toFixed(2)}
        </p>
        {product.description && (
          <p style={{ fontSize: "11px", color: "#737373", lineHeight: 1.5, marginBottom: "12px" }}>
            {product.description}
          </p>
        )}
        <p style={{ fontSize: "12px", color: "#a3a3a3", marginBottom: "12px" }}>
          Ready to order this? Confirm and I'll handle the rest — your payment details go directly encrypted, never through AI.
        </p>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={onConfirm}
            style={{
              flex:         1,
              padding:      "8px 0",
              background:   "rgba(34,197,94,0.1)",
              border:       "1px solid rgba(34,197,94,0.3)",
              borderRadius: "6px",
              color:        "#22c55e",
              fontSize:     "12px",
              fontWeight:   600,
              cursor:       "pointer",
              transition:   "background 0.15s",
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(34,197,94,0.18)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(34,197,94,0.1)")}
          >
            ✓ Buy it
          </button>
          <button
            onClick={onCancel}
            style={{
              padding:      "8px 16px",
              background:   "rgba(255,255,255,0.03)",
              border:       "1px solid #2a2a2a",
              borderRadius: "6px",
              color:        "#8a8a8a",
              fontSize:     "12px",
              cursor:       "pointer",
              transition:   "background 0.15s",
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)")}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function ProductGrid({ products, onBuy }: { products: Product[]; onBuy: (p: Product) => void }) {
  return (
    <div
      style={{
        display:               "grid",
        gridTemplateColumns:   "repeat(2, 1fr)",
        gap:                   "10px",
        marginTop:             "10px",
      }}
    >
      {products.map((p) => (
        <div
          key={p.name}
          style={{
            background:   "#111111",
            border:       "1px solid #1f1f1f",
            borderRadius: "10px",
            overflow:     "hidden",
            transition:   "border-color 0.15s",
            cursor:       "default",
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "#2a2a2a")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "#1f1f1f")}
        >
          {p.image_url && (
            <div style={{ height: "140px", overflow: "hidden", background: "#0a0a0a" }}>
              <img
                src={p.image_url}
                alt={p.name}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            </div>
          )}
          <div style={{ padding: "10px 12px" }}>
            <p style={{ fontSize: "12px", fontWeight: 600, color: "#ededed", marginBottom: "2px" }}>
              {p.name}
            </p>
            <p style={{ fontFamily: "monospace", fontSize: "12px", color: "#22c55e", marginBottom: "4px" }}>
              ${p.price.toFixed(2)}
            </p>
            {p.description && (
              <p style={{ fontSize: "10px", color: "#8a8a8a", lineHeight: 1.4, marginBottom: "8px" }}>
                {p.description}
              </p>
            )}
            <button
              onClick={() => onBuy(p)}
              style={{
                width:        "100%",
                padding:      "6px 0",
                background:   "rgba(255,255,255,0.04)",
                border:       "1px solid #2a2a2a",
                borderRadius: "6px",
                color:        "#ededed",
                fontSize:     "11px",
                fontWeight:   500,
                cursor:       "pointer",
                transition:   "background 0.15s, border-color 0.15s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "rgba(34,197,94,0.08)";
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(34,197,94,0.3)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)";
                (e.currentTarget as HTMLElement).style.borderColor = "#2a2a2a";
              }}
            >
              Buy this →
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function StateBar({ state, loading }: { state: string; loading: boolean }) {
  if (!loading && state === "idle") return null;
  const stateLabels: Record<string, { label: string; color: string }> = {
    negotiating:      { label: "Connecting to business agent…", color: "#60a5fa" },
    policy_check:     { label: "Policy review required",         color: "#f59e0b" },
    awaiting_confirm: { label: "Awaiting confirmation",          color: "#f59e0b" },
    complete:         { label: "Booking complete",               color: "#22c55e" },
    idle:             { label: "Ready",                          color: "#8a8a8a" },
  };
  const cfg = stateLabels[state] ?? { label: state, color: "#8a8a8a" };
  return (
    <div
      style={{
        padding:      "6px 20px",
        borderBottom: "1px solid #1a1a1a",
        display:      "flex",
        alignItems:   "center",
        gap:          "6px",
        background:   "#0a0a0a",
      }}
    >
      {loading && (
        <>
          <span
            className="pulse-dot"
            style={{
              width:        "6px",
              height:       "6px",
              borderRadius: "50%",
              background:   cfg.color,
              display:      "inline-block",
              flexShrink:   0,
            }}
          />
          <span style={{ fontFamily: "monospace", fontSize: "10px", color: cfg.color }}>
            {cfg.label}
          </span>
        </>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ChatWindow() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role:    "agent",
      content: "Hey! I'm your Pact agent 👋 I can book, reserve, or order anything for you — and I keep your personal info encrypted the whole time. Your name, email, card, and address never pass through any AI model.\n\nTry something like:\n• \"Book me a day pass at SHACK15\"\n• \"I want to buy shoes\" (I'll show you what's in stock!)\n• \"Tell me my shoe size\" if you've set it in your Profile",
    },
  ]);
  const [input, setInput]           = useState("");
  const [loading, setLoading]       = useState(false);
  const [agentState, setAgentState] = useState("idle");
  const [placeholder]               = useState(
    () => PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)]
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const sessionId = useRef(
    typeof window !== "undefined"
      ? (localStorage.getItem("pact_session_id") ??
         (() => {
           const id = "s-" + Math.random().toString(36).slice(2, 10);
           localStorage.setItem("pact_session_id", id);
           return id;
         })())
      : "default"
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // ── Send user message ──────────────────────────────────────────────────────
  const send = async (directMessage?: string) => {
    const text = directMessage ?? input.trim();
    if (!text || loading) return;
    if (!directMessage) setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setLoading(true);
    setAgentState("negotiating");

    try {
      const res  = await fetch(`${API}/api/chat`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ message: text, session_id: sessionId.current }),
      });
      const data = await res.json();

      if (data.sensitive_warning && !data.sensitive_warning.clean) {
        setMessages((m) => [
          ...m,
          { role: "agent", content: data.sensitive_warning.warning, isSensitiveWarning: true },
        ]);
        setAgentState("idle");
        setLoading(false);
        return;
      }

      setAgentState(data.state || "idle");
      setMessages((m) => [
        ...m,
        {
          role:             "agent",
          content:          data.response || "",
          state:            data.state,
          policyResult:     data.policy_check_result,
          sessionToken:     data.session_token,
          businessName:     data.business_name,
          confirmationCode: data.confirmation_code,
          handshakeEvents:  data.handshake_events || [],
          products:         data.products || [],
          storeInfo:        data.store_info || undefined,
        },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "agent", content: "Can't reach Pact backend — is it running on :8000?" },
      ]);
      setAgentState("idle");
    } finally {
      setLoading(false);
    }
  };

  // ── Confirm booking (inline — no modal) ───────────────────────────────────
  const handleConfirm = async (msgIndex: number, token: string) => {
    // Mark the policy card as "confirming" (show spinner)
    setMessages((m) =>
      m.map((msg, i) => (i === msgIndex ? { ...msg, confirming: true } : msg))
    );
    setAgentState("negotiating");
    setLoading(true);

    try {
      const res  = await fetch(`${API}/api/confirm`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ session_token: token, approved: true }),
      });
      const data = await res.json();

      setAgentState(data.state || "complete");

      // Transition the policy card to confirmed state
      setMessages((m) =>
        m.map((msg, i) =>
          i === msgIndex
            ? {
                ...msg,
                confirming:        false,
                confirmed:         true,
                confirmationCode:  data.confirmation_code || msg.confirmationCode,
              }
            : msg
        )
      );

      // Add the agent's confirmation text as a new message
      if (data.response) {
        setMessages((m) => [
          ...m,
          {
            role:             "agent",
            content:          data.response,
            state:            data.state,
            confirmationCode: data.confirmation_code,
          },
        ]);
      }
    } catch {
      setMessages((m) =>
        m.map((msg, i) =>
          i === msgIndex ? { ...msg, confirming: false } : msg
        )
      );
      setMessages((m) => [
        ...m,
        { role: "agent", content: "Confirmation failed — please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // ── Cancel booking ─────────────────────────────────────────────────────────
  const handleCancel = async (msgIndex: number, token: string | undefined) => {
    setAgentState("idle");
    // Remove the policy card from this message
    setMessages((m) =>
      m.map((msg, i) =>
        i === msgIndex ? { ...msg, policyResult: null, state: "idle" } : msg
      )
    );
    if (token) {
      await fetch(`${API}/api/confirm`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ session_token: token, approved: false }),
      }).catch(() => {});
    }
    setMessages((m) => [
      ...m,
      { role: "agent", content: "Booking cancelled. What else can I help you with?" },
    ]);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        display:       "flex",
        flexDirection: "column",
        height:        "calc(100vh - 44px)",
        background:    "#0a0a0a",
      }}
    >
      <StateBar state={agentState} loading={loading} />

      {/* Messages */}
      <div
        style={{
          flex:          1,
          overflowY:     "auto",
          padding:       "20px",
          display:       "flex",
          flexDirection: "column",
          gap:           "16px",
        }}
      >
        {/* Message list */}
        {messages.map((msg, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>

            {/* ── Bubble row ─────────────────────────────────────────────── */}
            <div
              style={{
                display:        "flex",
                justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                alignItems:     "flex-start",
                gap:            "10px",
              }}
            >
              {msg.role === "agent" && <AgentAvatar />}

              <div style={{ maxWidth: "78%", display: "flex", flexDirection: "column", gap: "8px" }}>
                {/* Chat bubble */}
                <div
                  style={{
                    padding:      "10px 14px",
                    borderRadius: msg.role === "user" ? "12px 12px 2px 12px" : "2px 12px 12px 12px",
                    background:   msg.isSensitiveWarning ? "#1a0a0a" : msg.role === "user" ? "#1a1a1a" : "#111111",
                    border:       `1px solid ${msg.isSensitiveWarning ? "#7f1d1d" : msg.role === "user" ? "#2a2a2a" : "#1a1a1a"}`,
                    fontSize:     "13px",
                    color:        msg.isSensitiveWarning ? "#fca5a5" : "#ededed",
                    lineHeight:   1.6,
                  }}
                >
                  {msg.content}
                  {/* Inline confirmation code (non-policy messages) */}
                  {msg.confirmationCode && !msg.policyResult && (
                    <div
                      style={{
                        marginTop:  "8px",
                        paddingTop: "8px",
                        borderTop:  "1px solid #1f1f1f",
                        fontFamily: "monospace",
                        fontSize:   "11px",
                        color:      "#22c55e",
                      }}
                    >
                      ✓ {msg.confirmationCode}
                    </div>
                  )}
                </div>

                {/* Store card — shown when an e-commerce agent was matched */}
                {msg.storeInfo && (
                  <StoreCard store={msg.storeInfo} />
                )}

                {/* Product grid — shown for e-commerce browse responses */}
                {msg.products && msg.products.length > 0 && (
                  <ProductGrid
                    products={msg.products}
                    onBuy={(p) => {
                      setMessages((m) => [
                        ...m,
                        {
                          role:              "agent",
                          content:           `Great pick! Here's a summary before I place the order:`,
                          preConfirmProduct: p,
                        },
                      ]);
                      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
                    }}
                  />
                )}

                {/* Pre-confirm card — shown when user taps "Buy this" on a product */}
                {msg.preConfirmProduct && (
                  <PreConfirmCard
                    product={msg.preConfirmProduct}
                    onConfirm={() => send(`I'd like to order the ${msg.preConfirmProduct!.name}`)}
                    onCancel={() =>
                      setMessages((m) => m.filter((_, idx) => idx !== i))
                    }
                  />
                )}

              </div>
            </div>

            {/* ── Handshake panel — full-width, truly centered ──────────── */}
            {msg.handshakeEvents && msg.handshakeEvents.length > 0 && (
              <HandshakePanel events={msg.handshakeEvents} />
            )}

            {/* ── Policy card — shown after handshake ───────────────────── */}
            {msg.policyResult && (
              <div
                style={{
                  display:        "flex",
                  justifyContent: "flex-start",
                  paddingLeft:    "34px", // align with bubble (avatar width + gap)
                }}
              >
                <div style={{ maxWidth: "78%" }}>
                  <PolicyCard
                    businessName={msg.businessName || "the business"}
                    policyResult={msg.policyResult}
                    confirming={msg.confirming}
                    confirmed={msg.confirmed}
                    confirmationCode={msg.confirmationCode}
                    onConfirm={() => msg.sessionToken && handleConfirm(i, msg.sessionToken)}
                    onCancel={() => handleCancel(i, msg.sessionToken)}
                  />
                </div>
              </div>
            )}

          </div>
        ))}

        {/* Typing indicator */}
        {loading && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
            <AgentAvatar />
            <div
              style={{
                padding:      "10px 14px",
                borderRadius: "2px 12px 12px 12px",
                background:   "#111111",
                border:       "1px solid #1a1a1a",
              }}
            >
              <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                {[0, 0.2, 0.4].map((delay) => (
                  <span
                    key={delay}
                    style={{
                      width:        "5px",
                      height:       "5px",
                      borderRadius: "50%",
                      background:   "#8a8a8a",
                      display:      "inline-block",
                      animation:    `pulse-dot 1.2s ease-in-out ${delay}s infinite`,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div
        style={{
          borderTop:  "1px solid #1a1a1a",
          padding:    "14px 20px",
          background: "#0a0a0a",
          display:    "flex",
          gap:        "10px",
          alignItems: "center",
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          placeholder={placeholder}
          disabled={loading}
          style={{
            flex:         1,
            height:       "36px",
            padding:      "0 14px",
            background:   "#111111",
            border:       "1px solid #1f1f1f",
            borderRadius: "6px",
            color:        "#ededed",
            fontSize:     "13px",
            outline:      "none",
            transition:   "border-color 0.15s",
          }}
          onFocus={(e) => (e.target.style.borderColor = "#2a2a2a")}
          onBlur={(e)  => (e.target.style.borderColor = "#1f1f1f")}
        />
        <button
          onClick={() => send()}
          disabled={loading || !input.trim()}
          style={{
            height:       "36px",
            padding:      "0 18px",
            background:   "#ededed",
            border:       "none",
            borderRadius: "6px",
            color:        "#0a0a0a",
            fontSize:     "13px",
            fontWeight:   500,
            cursor:       loading || !input.trim() ? "not-allowed" : "pointer",
            opacity:      loading || !input.trim() ? 0.35 : 1,
            transition:   "opacity 0.15s",
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
