import { Trash2, X } from "lucide-react";
import { useEffect } from "react";

interface ConfirmationModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  isLoading?: boolean;
}

/**
 * Confirmation dialog for destructive actions.
 * Handles Escape key and click-outside to close (when not loading).
 */
export function ConfirmationModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = "Delete",
  cancelText = "Cancel",
  isLoading = false,
}: ConfirmationModalProps) {
  useEffect(() => {
    if (open) {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === "Escape" && !isLoading) {
          onClose();
        }
      };
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [open, onClose, isLoading]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[360px] rounded-[32px] border border-border/80 bg-surface shadow-[0_40px_80px_rgba(15,23,42,0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-danger/10 text-danger">
              <Trash2 className="h-4 w-4" />
            </div>
            <p className="text-base font-semibold text-foreground">{title}</p>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:text-foreground disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4">
          <p className="text-sm text-muted leading-relaxed">{description}</p>

          <div className="mt-5 flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 rounded-lg border border-border/70 bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface/80 disabled:opacity-50"
            >
              {cancelText}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isLoading}
              className="flex-1 rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {isLoading ? "Deleting..." : confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
