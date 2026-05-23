"use client";

interface ConfirmationModalProps {
  sessionToken: string;
  businessName: string;
  onConfirm: (token: string) => void;
  onCancel: () => void;
}

export default function ConfirmationModal({
  sessionToken,
  businessName,
  onConfirm,
  onCancel,
}: ConfirmationModalProps) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
        <h2 className="text-lg font-semibold text-white">Confirm Reservation</h2>
        <p className="text-neutral-400 text-sm">
          Your agent is ready to complete the reservation at{" "}
          <span className="text-green-400 font-medium">{businessName}</span>.
          Encrypted contact details will be sent directly — the AI will never see them.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => onConfirm(sessionToken)}
            className="flex-1 bg-green-600 hover:bg-green-500 text-white py-2 rounded-xl font-semibold transition-colors"
          >
            Approve
          </button>
          <button
            onClick={onCancel}
            className="flex-1 bg-neutral-700 hover:bg-neutral-600 text-neutral-200 py-2 rounded-xl font-semibold transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
