import { Loader2 } from "lucide-react";

export type StatusTone = "default" | "warning" | "danger" | "success";

export interface StatusPillDescriptor {
  key: string;
  label: string;
  tone?: StatusTone;
  showSpinner?: boolean;
}

const TONE_CLASS_MAP: Record<StatusTone, string> = {
  default:
    "bg-[#edf7f1] text-[#0f8b54] border border-[#0f8b54]/20 dark:bg-[#0f8b54]/10 dark:text-[#7ef7c1] dark:border-[#0f8b54]/50",
  warning:
    "bg-amber-50 text-amber-900 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:border-amber-500/40",
  danger:
    "bg-red-50 text-red-800 border border-red-200 dark:bg-red-500/10 dark:text-red-200 dark:border-red-500/40",
  success:
    "bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:border-emerald-500/40",
};

/**
 * Renders a horizontal list of status pills for ongoing operations.
 */
export function StatusPills({
  statuses,
}: {
  statuses: StatusPillDescriptor[];
}) {
  if (!statuses.length) {
    return null;
  }

  return (
    <div className="px-8 pb-2">
      <div className="flex flex-wrap gap-2">
        {statuses.map((status) => (
          <span
            key={status.key}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold tracking-wide shadow-sm transition ${TONE_CLASS_MAP[status.tone ?? "default"]}`}
          >
            {status.showSpinner && (
              <Loader2
                className="h-3.5 w-3.5 animate-spin"
                aria-hidden="true"
              />
            )}
            {status.label}
          </span>
        ))}
      </div>
    </div>
  );
}
