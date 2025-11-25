import { formatTime } from "@/lib/utils";

interface TimerProps {
  elapsed: number;
}

/**
 * Displays formatted elapsed time.
 */
export function Timer({ elapsed }: TimerProps) {
  return <div className="timer-display">{formatTime(elapsed)}</div>;
}
