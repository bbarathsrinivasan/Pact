"use client";

import { useState, useRef, useEffect } from "react";
import PolicyCard from "./PolicyCard";
import ConfirmationModal from "./ConfirmationModal";
import StatusBadge from "./StatusBadge";

const API = "http://localhost:8000";

interface Message {
  role: "user" | "agent";
  content: string;
  state?: string;
  policyResult?: any;
  sessionToken?: string;
  businessName?: string;
  confirmationCode?: string;
}

export default function ChatWindow() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "agent",
      content: "Hi! I'm your personal Pact agent. I can help you make reservations while keeping your private data safe. Try asking me to book a table somewhere.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [agentState, setAgentState] = useState<string>("idle");
  const [sensitiveWarning, setSensitiveWarning] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [pendingBusiness, setPendingBusiness] = useState<string>("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const sessionId = useRef("default");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setSensitiveWarning(null);
    setMessages((m) => [...m, { role: "user", content: text }]);
    setLoading(true);
    setAgentState("negotiating");

    try {
      const res = await fetch(`${API}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, session_id: sessionId.current }),
      });
      const data = await res.json();

      if (data.sensitive_warning && !data.sensitive_warning.clean) {
        setSensitiveWarning(data.sensitive_warning.warning);
        setAgentState("idle");
        setLoading(false);
        return;
      }

      setAgentState(data.state || "idle");

      const msg: Message = {
        role: "agent",
        content: data.response || "",
        state: data.state,
        policyResult: data.policy_check_result,
        sessionToken: data.session_token,
        businessName: data.business_name,
        confirmationCode: data.confirmation_code,
      };

      setMessages((m) => [...m, msg]);

      if (data.state === "awaiting_confirm" && data.session_token) {
        setPendingToken(data.session_token);
        setPendingBusiness(data.business_name || "the business");
        setShowModal(true);
      }
    } catch (e) {
      setMessages((m) => [...m, { role: "agent", content: "Error contacting Pact backend. Is it running?" }]);
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
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_token: token, approved: true }),
      });
      const data = await res.json();
      setAgentState(data.state || "complete");
      setMessages((m) => [
        ...m,
        {
          role: "agent",
          content: data.response || "Reservation confirmed!",
          state: data.state,
          confirmationCode: data.confirmation_code,
        },
      ]);
    } catch {
      setMessages((m) => [...m, { role: "agent", content: "Confirmation failed. Please try again." }]);
    } finally {
      setLoading(false);
    }
  };

  const handlePolicyConfirm = (token: string) => {
    setPendingToken(token);
    setShowModal(true);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-53px)]">
      {showModal && pendingToken && (
        <ConfirmationModal
          sessionToken={pendingToken}
          businessName={pendingBusiness}
          onConfirm={handleConfirm}
          onCancel={() => { setShowModal(false); setAgentState("idle"); }}
        />
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {sensitiveWarning && (
          <div className="bg-red-950 border border-red-700 text-red-300 rounded-xl px-4 py-3 text-sm flex items-start gap-2">
            <span className="text-red-400 mt-0.5">⚠</span>
            <div className="flex-1">{sensitiveWarning}</div>
            <button onClick={() => setSensitiveWarning(null)} className="text-red-400 hover:text-red-200 ml-2">✕</button>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] space-y-2`}>
              <div
                className={`rounded-2xl px-4 py-2.5 text-sm ${
                  msg.role === "user"
                    ? "bg-green-700 text-white rounded-br-sm"
                    : "bg-neutral-800 text-neutral-100 rounded-bl-sm"
                }`}
              >
                {msg.content}
                {msg.confirmationCode && (
                  <div className="mt-2 text-green-400 font-mono text-xs">
                    ✓ Confirmation: {msg.confirmationCode}
                  </div>
                )}
              </div>
              {msg.policyResult && msg.state === "policy_check" && (
                <PolicyCard
                  businessName={msg.businessName || "the business"}
                  policyResult={msg.policyResult}
                  onConfirm={() => msg.sessionToken && handlePolicyConfirm(msg.sessionToken)}
                  onCancel={() => setAgentState("idle")}
                />
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-neutral-800 rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm text-neutral-400 animate-pulse">
              {agentState === "negotiating" ? "Contacting business agent..." : "Thinking..."}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-neutral-800 p-4 flex gap-2 items-center">
        <div className="flex-1 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Book a table for 2 on Friday..."
            className="flex-1 bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-2.5 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-green-500 transition-colors"
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            className="bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
          >
            Send
          </button>
        </div>
        <StatusBadge state={agentState as any} />
      </div>
    </div>
  );
}
