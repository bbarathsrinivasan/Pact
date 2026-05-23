"use client";

import { useEffect, useState } from "react";

const API = "http://localhost:8000";

// ── Types ─────────────────────────────────────────────────────────────────────

type FieldPolicy = "ok" | "encrypt" | "never" | "confirm";

interface FieldDef {
  label:       string;
  category:    "Identity" | "Booking" | "Payment";
  description: string;
  default:     FieldPolicy;
}

const FIELDS: Record<string, FieldDef> = {
  full_name:       { label: "Full Name",         category: "Identity", description: "Your legal name", default: "encrypt" },
  email:           { label: "Email Address",     category: "Identity", description: "Contact email",   default: "encrypt" },
  phone:           { label: "Phone Number",      category: "Identity", description: "Mobile / landline", default: "encrypt" },
  address:         { label: "Home Address",      category: "Identity", description: "Street address",  default: "confirm" },
  payment_method:  { label: "Payment Method",    category: "Payment",  description: "Card / bank info", default: "never"   },
  ssn:             { label: "SSN / Gov ID",      category: "Payment",  description: "Government identifier", default: "never" },
  date:            { label: "Booking Date",      category: "Booking",  description: "Reservation date", default: "ok"    },
  time:            { label: "Booking Time",      category: "Booking",  description: "Reservation time", default: "ok"    },
  party_size:      { label: "Party Size",        category: "Booking",  description: "Number of guests", default: "ok"    },
  dietary_needs:   { label: "Dietary Needs",     category: "Booking",  description: "Restrictions / allergies", default: "ok" },
  special_requests:{ label: "Special Requests",  category: "Booking",  description: "Notes for the business", default: "ok" },
  budget_range:    { label: "Budget Range",      category: "Booking",  description: "Spending preference", default: "ok"  },
};

const POLICY_OPTIONS: { value: FieldPolicy; label: string; color: string; icon: string; desc: string }[] = [
  { value: "ok",      label: "Share through AI",   color: "#22c55e", icon: "✓", desc: "Passed to business via AI assistant" },
  { value: "encrypt", label: "Always encrypt",      color: "#f59e0b", icon: "🔒", desc: "Sent encrypted, AI never sees it" },
  { value: "confirm", label: "Ask me each time",    color: "#60a5fa", icon: "⚠", desc: "Requires your approval per booking" },
  { value: "never",   label: "Never share",         color: "#ef4444", icon: "⊘", desc: "Blocked — never leaves your device" },
];

// ── Parser / serialiser ───────────────────────────────────────────────────────

function parseContext(raw: string): Record<string, FieldPolicy> {
  const policies: Record<string, FieldPolicy> = {};

  // Start with defaults
  for (const [key, def] of Object.entries(FIELDS)) {
    policies[key] = def.default;
  }

  const sectionMap: Record<string, FieldPolicy> = {
    "ok to share":         "ok",
    "always encrypt":      "encrypt",
    "never share":         "never",
    "requires my approval":"confirm",
  };

  let currentPolicy: FieldPolicy | null = null;
  for (const rawLine of raw.split("\n")) {
    const line = rawLine.trim().toLowerCase();

    for (const [kw, pol] of Object.entries(sectionMap)) {
      if (line.includes(kw)) { currentPolicy = pol; break; }
    }

    if (currentPolicy && (line.startsWith("- ") || line.startsWith("* "))) {
      const field = line.slice(2).trim();
      if (field in policies) {
        policies[field] = currentPolicy;
      }
    }
  }

  return policies;
}

function buildContextSection(policies: Record<string, FieldPolicy>, existingRaw: string): string {
  // Keep the identity lines (Name:, Email:, etc.) unchanged
  const identityLines = existingRaw
    .split("\n")
    .filter((l) => /^(Name|Email|Phone|Address):/i.test(l.trim()))
    .join("\n");

  const buckets: Record<FieldPolicy, string[]> = { ok: [], encrypt: [], never: [], confirm: [] };
  for (const [field, pol] of Object.entries(policies)) {
    buckets[pol].push(field);
  }

  const sections: string[] = [];
  if (buckets.ok.length)      sections.push(`## OK to Share\n${buckets.ok.map((f) => `- ${f}`).join("\n")}`);
  if (buckets.encrypt.length) sections.push(`## Always Encrypt\n${buckets.encrypt.map((f) => `- ${f}`).join("\n")}`);
  if (buckets.never.length)   sections.push(`## Never Share\n${buckets.never.map((f) => `- ${f}`).join("\n")}`);
  if (buckets.confirm.length) sections.push(`## Requires My Approval\n${buckets.confirm.map((f) => `- ${f}`).join("\n")}`);

  return [identityLines, ...sections].filter(Boolean).join("\n\n");
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PolicySelect({
  value,
  onChange,
}: {
  value: FieldPolicy;
  onChange: (v: FieldPolicy) => void;
}) {
  const opt = POLICY_OPTIONS.find((o) => o.value === value)!;
  return (
    <div style={{ position: "relative" }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as FieldPolicy)}
        style={{
          height: "24px",
          padding: "0 24px 0 8px",
          background: "#0a0a0a",
          border: `1px solid ${opt.color}33`,
          borderRadius: "4px",
          color: opt.color,
          fontFamily: "monospace",
          fontSize: "10px",
          cursor: "pointer",
          outline: "none",
          appearance: "none",
          WebkitAppearance: "none",
        }}
      >
        {POLICY_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.icon} {o.label}
          </option>
        ))}
      </select>
      <span
        style={{
          position: "absolute",
          right: "6px",
          top: "50%",
          transform: "translateY(-50%)",
          fontSize: "8px",
          color: opt.color,
          pointerEvents: "none",
        }}
      >
        ▼
      </span>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div
      style={{
        padding: "8px 16px 4px",
        borderBottom: "1px solid #1a1a1a",
        marginBottom: "2px",
      }}
    >
      <span
        style={{
          fontFamily: "monospace",
          fontSize: "9px",
          color: "#8a8a8a",
          textTransform: "uppercase",
          letterSpacing: "2px",
        }}
      >
        {title}
      </span>
    </div>
  );
}

function FieldRow({
  fieldKey,
  def,
  policy,
  onChange,
}: {
  fieldKey: string;
  def: FieldDef;
  policy: FieldPolicy;
  onChange: (v: FieldPolicy) => void;
}) {
  const opt = POLICY_OPTIONS.find((o) => o.value === policy)!;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "8px 16px",
        gap: "10px",
        borderBottom: "1px solid #111111",
      }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "#0d0d0d")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
    >
      {/* Color dot */}
      <span
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          background: opt.color,
          flexShrink: 0,
          boxShadow: `0 0 4px ${opt.color}66`,
        }}
      />

      {/* Label + description */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: "monospace", fontSize: "11px", color: "#ededed", lineHeight: 1 }}>
          {def.label}
        </p>
        <p style={{ fontFamily: "monospace", fontSize: "9px", color: "#8a8a8a", marginTop: "2px" }}>
          {def.description}
        </p>
      </div>

      {/* Select */}
      <PolicySelect value={policy} onChange={onChange} />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PrivacyTab() {
  const [rawContext, setRawContext] = useState("");
  const [policies, setPolicies] = useState<Record<string, FieldPolicy>>(() =>
    Object.fromEntries(Object.entries(FIELDS).map(([k, d]) => [k, d.default]))
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [requireConfirm, setRequireConfirm] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/context`)
      .then((r) => r.json())
      .then((d) => {
        const ctx = d.context || "";
        setRawContext(ctx);
        setPolicies(parseContext(ctx));
        setRequireConfirm(ctx.toLowerCase().includes("requires my approval"));
      })
      .catch(() => {});
  }, []);

  const update = (field: string, val: FieldPolicy) => {
    setPolicies((prev) => ({ ...prev, [field]: val }));
  };

  const save = async () => {
    setSaving(true);
    const newRaw = buildContextSection(policies, rawContext);
    try {
      await fetch(`${API}/api/context`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: newRaw }),
      });
      setRawContext(newRaw);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  const categories = ["Identity", "Payment", "Booking"] as const;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div
        style={{
          padding: "12px 16px 10px",
          borderBottom: "1px solid #1f1f1f",
          flexShrink: 0,
        }}
      >
        <p
          style={{
            fontFamily: "monospace",
            fontSize: "9px",
            color: "#8a8a8a",
            textTransform: "uppercase",
            letterSpacing: "2px",
            marginBottom: "4px",
          }}
        >
          Field Privacy Rules
        </p>
        <p style={{ fontSize: "11px", color: "#8a8a8a", lineHeight: 1.5 }}>
          Control exactly what each agent can access per field.
        </p>
      </div>

      {/* Legend */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "8px",
          padding: "10px 16px",
          borderBottom: "1px solid #1a1a1a",
          flexShrink: 0,
        }}
      >
        {POLICY_OPTIONS.map((o) => (
          <span
            key={o.value}
            style={{
              fontFamily: "monospace",
              fontSize: "9px",
              color: o.color,
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <span
              style={{
                width: "5px",
                height: "5px",
                borderRadius: "50%",
                background: o.color,
                display: "inline-block",
              }}
            />
            {o.label}
          </span>
        ))}
      </div>

      {/* Field list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {categories.map((cat) => {
          const catFields = Object.entries(FIELDS).filter(([, d]) => d.category === cat);
          return (
            <div key={cat}>
              <SectionHeader title={cat} />
              {catFields.map(([key, def]) => (
                <FieldRow
                  key={key}
                  fieldKey={key}
                  def={def}
                  policy={policies[key] ?? def.default}
                  onChange={(v) => update(key, v)}
                />
              ))}
            </div>
          );
        })}

        {/* Global toggle */}
        <div style={{ padding: "12px 16px", borderTop: "1px solid #1f1f1f", marginTop: "4px" }}>
          <p
            style={{
              fontFamily: "monospace",
              fontSize: "9px",
              color: "#8a8a8a",
              textTransform: "uppercase",
              letterSpacing: "2px",
              marginBottom: "10px",
            }}
          >
            Global
          </p>

          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {/* Toggle */}
            <button
              onClick={() => setRequireConfirm((v) => !v)}
              style={{
                width: "32px",
                height: "18px",
                borderRadius: "9px",
                border: "none",
                background: requireConfirm ? "#22c55e" : "#1f1f1f",
                cursor: "pointer",
                position: "relative",
                flexShrink: 0,
                transition: "background 0.2s",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: "2px",
                  left: requireConfirm ? "16px" : "2px",
                  width: "14px",
                  height: "14px",
                  borderRadius: "50%",
                  background: "#ededed",
                  transition: "left 0.15s",
                }}
              />
            </button>
            <div>
              <p style={{ fontFamily: "monospace", fontSize: "11px", color: "#ededed" }}>
                Confirm before every booking
              </p>
              <p style={{ fontFamily: "monospace", fontSize: "9px", color: "#8a8a8a", marginTop: "2px" }}>
                Show policy review screen before data is sent
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Save bar */}
      <div
        style={{
          padding: "12px 16px",
          borderTop: "1px solid #1f1f1f",
          flexShrink: 0,
        }}
      >
        <button
          onClick={save}
          disabled={saving}
          style={{
            width: "100%",
            height: "30px",
            background: saved ? "#0a1a0a" : "#ededed",
            border: saved ? "1px solid #166534" : "none",
            borderRadius: "4px",
            color: saved ? "#22c55e" : "#0a0a0a",
            fontFamily: "monospace",
            fontSize: "12px",
            cursor: saving ? "not-allowed" : "pointer",
            transition: "all 0.2s",
          }}
        >
          {saving ? "Saving…" : saved ? "✓ Saved" : "Apply Changes"}
        </button>
      </div>
    </div>
  );
}
