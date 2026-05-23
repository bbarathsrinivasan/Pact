"use client";

import { useState, useEffect } from "react";
import ChatWindow from "../components/ChatWindow";

const API = "http://localhost:8000";

export default function Home() {
  const [context, setContext] = useState<string>("");
  const [showContext, setShowContext] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/context`)
      .then((r) => r.json())
      .then((d) => setContext(d.context || ""))
      .catch(() => {});
  }, []);

  const deleteData = async () => {
    if (!confirm("Delete all your context data? This cannot be undone.")) return;
    await fetch(`${API}/api/context`, { method: "DELETE" });
    setContext("");
  };

  const contextLines = context
    .split("\n")
    .filter((l) => l.trim())
    .slice(0, 8);

  return (
    <main className="flex h-[calc(100vh-53px)]">
      <div className="flex-1">
        <ChatWindow />
      </div>

      <aside className="w-72 border-l border-neutral-800 bg-neutral-950 flex flex-col p-4 gap-4 overflow-y-auto">
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Your Context</h2>
            <button
              onClick={() => setShowContext(!showContext)}
              className="text-xs text-neutral-500 hover:text-neutral-300"
            >
              {showContext ? "Hide" : "Show"}
            </button>
          </div>

          {showContext ? (
            <pre className="text-xs text-neutral-400 bg-neutral-900 rounded-lg p-3 whitespace-pre-wrap font-mono max-h-64 overflow-y-auto">
              {context || "No context loaded."}
            </pre>
          ) : (
            <div className="space-y-1">
              {contextLines.map((line, i) => (
                <p key={i} className="text-xs text-neutral-500 truncate">
                  {line}
                </p>
              ))}
              {!context && <p className="text-xs text-neutral-600 italic">No context loaded.</p>}
            </div>
          )}
        </div>

        <div className="border-t border-neutral-800 pt-4 space-y-2">
          <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Privacy Controls</h2>
          <div className="space-y-1.5 text-xs text-neutral-400">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              AI-safe fields shared through agent
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              Encrypted fields bypass AI entirely
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-neutral-600" />
              Blocked fields never leave device
            </div>
          </div>
        </div>

        <div className="mt-auto border-t border-neutral-800 pt-4">
          <button
            onClick={deleteData}
            className="w-full text-xs text-red-400 hover:text-red-300 border border-red-900 hover:border-red-700 rounded-lg py-2 transition-colors"
          >
            Delete My Data
          </button>
          <p className="text-xs text-neutral-600 mt-2 text-center">
            Clears all stored context and preferences.
          </p>
        </div>
      </aside>
    </main>
  );
}
