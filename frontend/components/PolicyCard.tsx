"use client";

interface PolicyResult {
  approved: string[];
  encrypt: string[];
  blocked: string[];
  requires_confirmation: boolean;
}

interface PolicyCardProps {
  businessName: string;
  policyResult: PolicyResult;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function PolicyCard({ businessName, policyResult, onConfirm, onCancel }: PolicyCardProps) {
  return (
    <div className="rounded-xl border border-neutral-700 bg-neutral-900 p-4 text-sm space-y-3 max-w-md">
      <p className="font-semibold text-neutral-200">
        Your agent wants to share with <span className="text-green-400">{businessName}</span>
      </p>

      {policyResult.approved.length > 0 && (
        <div>
          <p className="text-neutral-400 mb-1">
            <span className="text-green-400">✅</span> Sharing with {businessName}:
          </p>
          <div className="flex flex-wrap gap-1">
            {policyResult.approved.map((f) => (
              <span key={f} className="bg-green-950 text-green-300 px-2 py-0.5 rounded text-xs">
                {f}
              </span>
            ))}
          </div>
        </div>
      )}

      {policyResult.encrypt.length > 0 && (
        <div>
          <p className="text-neutral-400 mb-1">
            <span>🔒</span> Encrypted direct (AI won&apos;t see):
          </p>
          <div className="flex flex-wrap gap-1">
            {policyResult.encrypt.map((f) => (
              <span key={f} className="bg-red-950 text-red-300 px-2 py-0.5 rounded text-xs">
                {f}
              </span>
            ))}
          </div>
        </div>
      )}

      {policyResult.blocked.length > 0 && (
        <div>
          <p className="text-neutral-400 mb-1">
            <span>🚫</span> Blocked (not sharing):
          </p>
          <div className="flex flex-wrap gap-1">
            {policyResult.blocked.map((f) => (
              <span key={f} className="bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded text-xs line-through">
                {f}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={onConfirm}
          className="flex-1 bg-green-600 hover:bg-green-500 text-white py-1.5 rounded-lg text-xs font-semibold transition-colors"
        >
          Confirm
        </button>
        <button
          onClick={onCancel}
          className="flex-1 bg-neutral-700 hover:bg-neutral-600 text-neutral-200 py-1.5 rounded-lg text-xs font-semibold transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
