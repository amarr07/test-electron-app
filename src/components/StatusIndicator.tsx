type Status = "idle" | "recording" | "paused";

interface StatusIndicatorProps {
  status: Status;
}

const statusLabels: Record<Status, string> = {
  recording: "Recording",
  paused: "Paused",
  idle: "Idle",
};

/**
 * Visual status indicator with label for recording states.
 */
export function StatusIndicator({ status }: StatusIndicatorProps) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={`status-indicator status-indicator--${status}`} />
      <span className="text-foreground">{statusLabels[status]}</span>
    </div>
  );
}
