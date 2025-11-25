import type { RecordingState } from "@/hooks/useRecorder";
import { formatElapsed } from "@/lib/time";
import { Pause, Play, Square } from "lucide-react";

interface RecordingDockProps {
  status: RecordingState;
  elapsed: number;
  message?: string;
  onStart: () => Promise<unknown>;
  onPause: () => Promise<unknown>;
  onResume: () => Promise<unknown>;
  onStop: () => Promise<unknown>;
}

/**
 * Recording dock component for audio recording controls.
 * Displays timer, start/pause/resume button, and stop button.
 * Shows temporary success message after recording stops.
 */
export function RecordingDock({
  status,
  elapsed,
  message,
  onStart,
  onPause,
  onResume,
  onStop,
}: RecordingDockProps) {
  const isIdle = status === "idle";
  const isRecording = status === "recording";
  const isPaused = status === "paused";

  const handlePrimaryAction = () => {
    if (isIdle) {
      void onStart();
    } else if (isRecording) {
      void onPause();
    } else {
      void onResume();
    }
  };

  const handleStop = () => {
    if (!isIdle) {
      void onStop();
    }
  };

  const primaryLabel = isIdle ? "Start" : isRecording ? "Pause" : "Resume";

  const primaryIcon = isRecording ? (
    <Pause className="w-4 h-4" />
  ) : (
    <Play className="w-4 h-4" />
  );

  const timerColor = isRecording
    ? "text-red-500"
    : isPaused
      ? "text-amber-500"
      : "text-foreground";

  return (
    <div className="relative flex items-center px-8 py-4 gap-6">
      <div className="flex-1 flex items-center">
        <p className={`text-4xl font-semibold ${timerColor} tabular-nums`}>
          {formatElapsed(elapsed)}
        </p>
      </div>
      <div className="flex items-center gap-3 ml-auto">
        <button
          type="button"
          onClick={handleStop}
          disabled={isIdle}
          className="h-11 w-11 rounded-full border border-border/70 text-muted hover:text-foreground hover:border-foreground/40 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center bg-surface"
          aria-label="Stop recording"
        >
          <Square className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handlePrimaryAction}
          className={`h-11 px-6 rounded-full font-semibold text-sm flex items-center gap-2 transition ${
            isRecording
              ? "bg-danger text-white hover:bg-danger/90"
              : isPaused
                ? "bg-amber-400 text-white hover:bg-amber-400/90"
                : "bg-primary text-white hover:bg-primary/90"
          }`}
          aria-label={primaryLabel}
        >
          {primaryIcon}
          <span>{primaryLabel}</span>
        </button>
      </div>
      {message && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="px-4 py-1 text-sm font-semibold rounded-full shadow-sm inline-flex items-center justify-center min-w-[160px] text-foreground bg-surface/90 backdrop-blur opacity-100">
            {message}
          </span>
        </div>
      )}
    </div>
  );
}
