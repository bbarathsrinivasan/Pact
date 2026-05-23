"use client";

import { useState } from "react";
import ChatWindow from "../components/ChatWindow";
import ContextTab  from "../components/ContextTab";
import PrivacyTab  from "../components/PrivacyTab";
import HistoryTab  from "../components/HistoryTab";

// ── Tab definitions ───────────────────────────────────────────────────────────

type TabId = "context" | "privacy" | "history";

const TABS: {
  id: TabId;
  icon: string;
  label: string;
  tooltip: string;
}[] = [
  { id: "context", icon: "◈",  label: "Profile",  tooltip: "Your Context" },
  { id: "privacy", icon: "🔒", label: "Privacy",   tooltip: "Privacy Controls" },
  { id: "history", icon: "⊟",  label: "History",   tooltip: "Interaction History" },
];

// ── Activity bar icon button ──────────────────────────────────────────────────

function ActivityButton({
  tab,
  active,
  onClick,
}: {
  tab: (typeof TABS)[0];
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      title={tab.tooltip}
      onClick={onClick}
      style={{
        width: "44px",
        height: "44px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "2px",
        background: "none",
        border: "none",
        borderLeft: active
          ? "2px solid #22c55e"
          : "2px solid transparent",
        cursor: "pointer",
        color: active ? "#ededed" : "#525252",
        transition: "color 0.15s, border-color 0.15s",
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.color = "#737373";
      }}
      onMouseLeave={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.color = "#525252";
      }}
    >
      <span style={{ fontSize: "16px", lineHeight: 1 }}>{tab.icon}</span>
      <span
        style={{
          fontFamily: "monospace",
          fontSize: "8px",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          lineHeight: 1,
        }}
      >
        {tab.label}
      </span>
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId | null>(null);

  const toggleTab = (id: TabId) =>
    setActiveTab((prev) => (prev === id ? null : id));

  const activeTabDef = TABS.find((t) => t.id === activeTab);

  return (
    <div
      style={{
        display: "flex",
        height: "calc(100vh - 44px)",
        overflow: "hidden",
        background: "#0a0a0a",
      }}
    >
      {/* ── Activity bar ─────────────────────────────────────────── */}
      <div
        style={{
          width: "48px",
          flexShrink: 0,
          borderRight: "1px solid #1a1a1a",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: "8px",
          gap: "2px",
          background: "#0a0a0a",
        }}
      >
        {TABS.map((tab) => (
          <ActivityButton
            key={tab.id}
            tab={tab}
            active={activeTab === tab.id}
            onClick={() => toggleTab(tab.id)}
          />
        ))}

        {/* Spacer + help icon at bottom */}
        <div style={{ flex: 1 }} />
        <button
          title="Pact — Privacy-preserving AI agents"
          style={{
            width: "44px",
            height: "44px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "none",
            border: "none",
            cursor: "default",
            color: "#2a2a2a",
            fontFamily: "monospace",
            fontSize: "16px",
            marginBottom: "8px",
          }}
        >
          ?
        </button>
      </div>

      {/* ── Side panel ───────────────────────────────────────────── */}
      {activeTab && (
        <div
          style={{
            width: "288px",
            flexShrink: 0,
            borderRight: "1px solid #1a1a1a",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            background: "#0f0f0f",
          }}
        >
          {/* Panel header */}
          <div
            style={{
              height: "36px",
              borderBottom: "1px solid #1a1a1a",
              padding: "0 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontFamily: "monospace",
                fontSize: "9px",
                color: "#525252",
                textTransform: "uppercase",
                letterSpacing: "2px",
              }}
            >
              {activeTabDef?.tooltip}
            </span>
            <button
              onClick={() => setActiveTab(null)}
              style={{
                background: "none",
                border: "none",
                color: "#525252",
                cursor: "pointer",
                fontFamily: "monospace",
                fontSize: "14px",
                lineHeight: 1,
                padding: "0 2px",
              }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLElement).style.color = "#737373")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLElement).style.color = "#525252")
              }
            >
              ✕
            </button>
          </div>

          {/* Panel body */}
          <div style={{ flex: 1, overflow: "hidden" }}>
            {activeTab === "context" && <ContextTab />}
            {activeTab === "privacy" && <PrivacyTab />}
            {activeTab === "history" && <HistoryTab />}
          </div>
        </div>
      )}

      {/* ── Chat area ────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        <ChatWindow />
      </div>
    </div>
  );
}
