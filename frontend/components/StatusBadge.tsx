"use client";

type State = "idle" | "negotiating" | "policy_check" | "awaiting_confirm" | "complete";

const labels: Record<State, string> = {
  idle: "Ready",
  negotiating: "Negotiating...",
  policy_check: "Policy Check",
  awaiting_confirm: "Awaiting Confirmation",
  complete: "Complete",
};

const colors: Record<State, string> = {
  idle: "bg-neutral-700 text-neutral-300",
  negotiating: "bg-yellow-900 text-yellow-300 animate-pulse",
  policy_check: "bg-blue-900 text-blue-300",
  awaiting_confirm: "bg-orange-900 text-orange-300",
  complete: "bg-green-900 text-green-300",
};

export default function StatusBadge({ state }: { state: State }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${colors[state]}`}>
      {state === "negotiating" && (
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-bounce" />
      )}
      {state === "complete" && <span>✓</span>}
      {labels[state]}
    </span>
  );
}
