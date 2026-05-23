"use client";

import { useEffect, useState } from "react";

const API = "http://localhost:8000";

interface IdentityFields {
  name:    string;
  email:   string;
  phone:   string;
  address: string;
}

/** Parse Name/Email/Phone/Address out of user_context.md */
function parseIdentity(raw: string): IdentityFields {
  const get = (key: string) => {
    const m = raw.match(new RegExp(`^${key}:\\s*(.+)$`, "im"));
    return m ? m[1].trim() : "";
  };
  return {
    name:    get("Name"),
    email:   get("Email"),
    phone:   get("Phone"),
    address: get("Address"),
  };
}

/** Replace or insert a Key: value line */
function setLine(raw: string, key: string, value: string): string {
  const re = new RegExp(`^${key}:.*$`, "im");
  const line = value ? `${key}: ${value}` : "";
  if (re.test(raw)) {
    return value
      ? raw.replace(re, line)
      : raw.replace(re, "").replace(/\n{3,}/g, "\n\n");
  }
  // Prepend if not found and value is non-empty
  return value ? `${line}\n${raw}` : raw;
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div style={{ marginBottom: "14px" }}>
      <label
        style={{
          display: "block",
          fontFamily: "monospace",
          fontSize: "10px",
          color: "#8a8a8a",
          textTransform: "uppercase",
          letterSpacing: "1px",
          marginBottom: "5px",
        }}
      >
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          height: "30px",
          padding: "0 10px",
          background: "#0a0a0a",
          border: "1px solid #1f1f1f",
          borderRadius: "4px",
          color: "#ededed",
          fontFamily: "monospace",
          fontSize: "12px",
          outline: "none",
        }}
        onFocus={(e) => (e.target.style.borderColor = "#333")}
        onBlur={(e) => (e.target.style.borderColor = "#1f1f1f")}
      />
    </div>
  );
}

export default function ContextTab() {
  const [raw, setRaw] = useState("");
  const [identity, setIdentity] = useState<IdentityFields>({
    name: "", email: "", phone: "", address: "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/context`)
      .then((r) => r.json())
      .then((d) => {
        const ctx = d.context || "";
        setRaw(ctx);
        setIdentity(parseIdentity(ctx));
      })
      .catch(() => {});
  }, []);

  const updateField = (key: keyof IdentityFields, value: string) => {
    setIdentity((prev) => {
      const next = { ...prev, [key]: value };
      // Sync to raw
      let updated = raw;
      const labels: Record<keyof IdentityFields, string> = {
        name: "Name", email: "Email", phone: "Phone", address: "Address",
      };
      updated = setLine(updated, labels[key], value);
      setRaw(updated);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await fetch(`${API}/api/context`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: raw }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    if (!confirm("Delete all context? This cannot be undone.")) return;
    await fetch(`${API}/api/context`, { method: "DELETE" });
    setRaw("");
    setIdentity({ name: "", email: "", phone: "", address: "" });
  };

  return (
    <div style={{ padding: "16px", height: "100%", overflowY: "auto" }}>
      {/* Header */}
      <div style={{ marginBottom: "16px" }}>
        <p
          style={{
            fontFamily: "monospace",
            fontSize: "9px",
            color: "#8a8a8a",
            textTransform: "uppercase",
            letterSpacing: "2px",
            marginBottom: "6px",
          }}
        >
          Your Profile
        </p>
        <p style={{ fontSize: "11px", color: "#8a8a8a", lineHeight: 1.5 }}>
          Stored locally. Never sent to AI — only your agent reads this.
        </p>
      </div>

      {/* Identity fields */}
      <Input
        label="Full Name"
        value={identity.name}
        onChange={(v) => updateField("name", v)}
        placeholder="Jane Smith"
      />
      <Input
        label="Email"
        type="email"
        value={identity.email}
        onChange={(v) => updateField("email", v)}
        placeholder="jane@example.com"
      />
      <Input
        label="Phone"
        type="tel"
        value={identity.phone}
        onChange={(v) => updateField("phone", v)}
        placeholder="+1 415 555 0100"
      />
      <Input
        label="Address"
        value={identity.address}
        onChange={(v) => updateField("address", v)}
        placeholder="123 Main St, San Francisco CA"
      />

      <div style={{ borderTop: "1px solid #1f1f1f", margin: "16px 0" }} />

      {/* Raw editor toggle */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "8px",
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
          Raw Context
        </span>
        <button
          onClick={() => setShowRaw((v) => !v)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontFamily: "monospace",
            fontSize: "10px",
            color: "#8a8a8a",
            padding: 0,
          }}
        >
          {showRaw ? "▲ hide" : "▼ edit"}
        </button>
      </div>

      {showRaw && (
        <textarea
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            setIdentity(parseIdentity(e.target.value));
          }}
          rows={10}
          style={{
            width: "100%",
            background: "#0a0a0a",
            border: "1px solid #1f1f1f",
            borderRadius: "4px",
            color: "#9a9a9a",
            fontFamily: "monospace",
            fontSize: "11px",
            padding: "10px",
            resize: "vertical",
            outline: "none",
            lineHeight: 1.6,
          }}
          onFocus={(e) => (e.target.style.borderColor = "#333")}
          onBlur={(e) => (e.target.style.borderColor = "#1f1f1f")}
          placeholder={`Name: Jane Smith\nEmail: jane@example.com\nPhone: +1 415 555 0100\nAddress: 123 Main St\n\n## Always Encrypt\n- full_name\n- email\n- phone\n\n## OK to Share\n- date\n- party_size`}
        />
      )}

      <div style={{ marginTop: "14px", display: "flex", gap: "8px" }}>
        <button
          onClick={save}
          disabled={saving}
          style={{
            flex: 1,
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
          {saving ? "Saving…" : saved ? "✓ Saved" : "Save"}
        </button>
        <button
          onClick={clear}
          style={{
            height: "30px",
            padding: "0 12px",
            background: "none",
            border: "1px solid #2a0a0a",
            borderRadius: "4px",
            color: "#7f1d1d",
            fontFamily: "monospace",
            fontSize: "11px",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#ef4444")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#7f1d1d")}
        >
          Clear
        </button>
      </div>
    </div>
  );
}
