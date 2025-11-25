import { Button } from "@/components/ui/button";
import type { RecordingState } from "@/hooks/useRecorder";
import { Pause, Play, Square } from "lucide-react";

interface RecordingControlsProps {
  status: RecordingState;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

/**
 * Recording control buttons (start/pause/resume/stop).
 * Primary button changes based on recording state.
 */
export function RecordingControls({
  status,
  onStart,
  onPause,
  onResume,
  onStop,
}: RecordingControlsProps) {
  const handlePrimaryAction = () => {
    if (status === "idle") {
      onStart();
    } else if (status === "recording") {
      onPause();
    } else if (status === "paused") {
      onResume();
    }
  };

  const getPrimaryIcon = () => {
    if (status === "idle") {
      return <Play className="w-4 h-4" />;
    } else if (status === "recording") {
      return <Pause className="w-4 h-4" />;
    } else {
      return <Play className="w-4 h-4" />;
    }
  };

  const getPrimaryTitle = () => {
    if (status === "idle") return "Start recording";
    if (status === "recording") return "Pause";
    return "Resume";
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      <Button
        variant="outline"
        className="w-full"
        disabled={status === "idle"}
        onClick={onStop}
      >
        <Square className="w-4 h-4" />
      </Button>
      <Button
        variant="default"
        className="w-full"
        onClick={handlePrimaryAction}
        title={getPrimaryTitle()}
      >
        {getPrimaryIcon()}
      </Button>
    </div>
  );
}
