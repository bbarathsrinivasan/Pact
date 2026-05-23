"use client";

import { useState, useRef, useEffect } from "react";
import PolicyCard from "./PolicyCard";
import ConfirmationModal from "./ConfirmationModal";

const API = "http://localhost:8000";

interface Message {
  role:             "user" | "agent";
  content:          string;
  state?:           string;
  policyResult?:    any;
  sessionToken?:    string;
  businessName?:    string;
  confirmationCode?:string;
}

const PLACEHOLDERS = [
  "Book a table for 2 on Friday evening…",
  "Reserve a room at a hotel downtown…",
  "Get me a haircut appointment tomorrow…",
  "I'd like a table for 4 at an Italian restaurant…",
];

function AgentAvatar() {
  return (
    <div
      style={{
        width: "24px",
        height: "24px",
        borderRadius: "50%",
        background: "#111111",
        border: "1px solid #1f1f1f",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#525252",
      }}
    >
      ◈
    </div>
  );
}

function StateBar({ state, loading }: { state: string; loading: boolean }) {
  if (!loading && state === "idle") return null;

  const stateLabels: Record<string, { label: string; color: string }> = {
    negotiating:      { label: "Contacting business agent…", color: "#60a5fa" },
    policy_check:     { label: "Policy review required",     color: "#f59e0b" },
    awaiting_confirm: { label: "Awaiting your confirmation", color: "#f59e0b" },
    complete:         { label: "Booking complete",           color: "#22c55e" },
    idle:             { label: "Ready",                      color: "#525252" },
  };

  const cfg = stateLabels[state] ?? { label: state, color: "#525252" };

  return (
    <div
      style={{
        padding: "6px 20px",
        borderBottom: "1px solid #1a1a1a",
        display: "flex",
        alignItems: "center",
        gap: "6px",
        background: "#0a0a0a",
      }}
    >
      {loading ? (
        <>
          <span
            className="pulse-dot"
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: cfg.color,
              display: "inline-block",
              flexShrink: 0,
            }}
          />
          <span style={{ fontFamily: "monospace", fontSize: "10px", color: cfg.color }}>
            {cfg.label}
          </span>
        </>
      ) : null}
    </div>
  );
}

export default function ChatWindow() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "agent",
      content:
        "Hi, I'm your Pact agent. I handle bookings while keeping your PII private — your name, email, and phone are encrypted before any business sees them, and never pass through AI. Try asking me to book a table.",
    },
  ]);
  const [input, setInput]               = useState("");
  const [loading, setLoading]           = useState(false);
  const [agentState, setAgentState]     = useState("idle");
  const [sensitiveWarning, setSensitive] = useState<string | null>(null);
  const [showModal, setShowModal]        = useState(false);
  const [pendingToken, setPendingToken]  = useState<string | null>(null);
  const [pendingBiz, setPendingBiz]      = useState("");
  const [placeholder]                    = useState(
    () => PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)]
  );
  const bottomRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLInputElement>(null);
  const sessionId  = useRef(
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

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setSensitive(null);
    setMessages((m) => [...m, { role: "user", content: text }]);
    setLoading(true);
    setAgentState("negotiating");

    try {
      const res = await fetch(`${API}/api/chat`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ message: text, session_id: sessionId.current }),
      });
      const data = await res.json();

      if (data.sensitive_warning && !data.sensitive_warning.clean) {
        setSensitive(data.sensitive_warning.warning);
        setAgentState("idle");
        setLoading(false);
        return;
      }

      setAgentState(data.state || "idle");
      const msg: Message = {
        role:             "agent",
        content:          data.response || "",
        state:            data.state,
        policyResult:     data.policy_check_result,
        sessionToken:     data.session_token,
        businessName:     data.business_name,
        confirmationCode: data.confirmation_code,
      };
      setMessages((m) => [...m, msg]);

      if (data.state === "policy_check" && data.session_token) {
        setPendingToken(data.session_token);
        setPendingBiz(data.business_name || "the business");
        setShowModal(true);
      }
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

  const handleConfirm = async (token: string) => {
    setShowModal(false);
    setAgentState("negotiating");
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/confirm`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ session_token: token, approved: true }),
      });
      const data = await res.json();
      setAgentState(data.state || "complete");
      setMessages((m) => [
        ...m,
        {
          role:             "agent",
          content:          data.response || "Reservation confirmed!",
          state:            data.state,
          confirmationCode: data.confirmation_code,
        },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "agent", content: "Confirmation failed — please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    setShowModal(false);
    setAgentState("idle");
    if (pendingToken) {
      await fetch(`${API}/api/confirm`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ session_token: pendingToken, approved: false }),
      }).catch(() => {});
    }
    setMessages((m) => [
      ...m,
      { role: "agent", content: "Booking cancelled. What else can I help you with?" },
    ]);
  };

  return (
    <div
      style={{
        display:       "flex",
        flexDirection: "column",
        height:        "calc(100vh - 44px)",
        background:    "#0a0a0a",
      }}
    >
      {/* Modal */}
      {showModal && pendingToken && (
        <ConfirmationModal
          sessionToken={pendingToken}
          businessName={pendingBiz}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}

      {/* State indicator */}
      <StateBar state={agentState} loading={loading} />

      {/* Messages */}
      <div
        style={{
          flex:       1,
          overflowY:  "auto",
          padding:    "20px",
          display:    "flex",
          flexDirection: "column",
          gap:        "16px",
        }}
      >
        {/* Sensitive warning */}
        {sensitiveWarning && (
          <div
            style={{
              background:   "#1a0a0a",
              border:       "1px solid #7f1d1d",
              borderRadius: "6px",
              padding:      "10px 14px",
              display:      "flex",
              alignItems:   "flex-start",
              gap:          "10px",
            }}
          >
            <span style={{ color: "#ef4444", fontSize: "13px" }}>⚠</span>
            <p style={{ flex: 1, fontSize: "12px", color: "#ef4444", lineHeight: 1.5 }}>
              {sensitiveWarning}
            </p>
            <button
              onClick={() => setSensitive(null)}
              style={{
                background: "none",
                border:     "none",
                color:      "#7f1d1d",
                cursor:     "pointer",
                fontSize:   "13px",
              }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Message list */}
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display:        "flex",
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
              alignItems:     "flex-start",
              gap:            "10px",
            }}
          >
            {msg.role === "agent" && <AgentAvatar />}

            <div style={{ maxWidth: "75%", display: "flex", flexDirection: "column", gap: "8px" }}>
              {/* Bubble */}
              <div
                style={{
                  padding:      "10px 14px",
                  borderRadius: msg.role === "user" ? "12px 12px 2px 12px" : "2px 12px 12px 12px",
                  background:   msg.role === "user" ? "#1a1a1a" : "#111111",
                  border:       `1px solid ${msg.role === "user" ? "#2a2a2a" : "#1a1a1a"}`,
                  fontSize:     "13px",
                  color:        "#ededed",
                  lineHeight:   1.6,
                }}
              >
                {msg.content}
                {msg.confirmationCode && (
                  <div
                    style={{
                      marginTop:    "8px",
                      paddingTop:   "8px",
                      borderTop:    "1px solid #1f1f1f",
                      fontFamily:   "monospace",
                      fontSize:     "11px",
                      color:        "#22c55e",
                    }}
                  >
                    ✓ Confirmation: {msg.confirmationCode}
                  </div>
                )}
              </div>

              {/* Policy card inline */}
              {msg.policyResult && msg.state === "policy_check" && (
                <PolicyCard
                  businessName={msg.businessName || "the business"}
                  policyResult={msg.policyResult}
                  onConfirm={() => msg.sessionToken && (() => {
                    setPendingToken(msg.sessionToken!);
                    setPendingBiz(msg.businessName || "the business");
                    setShowModal(true);
                  })()}
                  onCancel={() => setAgentState("idle")}
                />
              )}
            </div>
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
                      width:     "5px",
                      height:    "5px",
                      borderRadius: "50%",
                      background: "#525252",
                      display:   "inline-block",
                      animation: `pulse-dot 1.2s ease-in-out ${delay}s infinite`,
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
          ref={inputRef}
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
          onBlur={(e) => (e.target.style.borderColor = "#1f1f1f")}
        />
        <button
          onClick={send}
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
