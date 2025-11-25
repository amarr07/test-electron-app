import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Timer hook that tracks elapsed time with pause/resume support.
 * Accumulates time across multiple start/pause cycles.
 */
export function useTimer(isActive: boolean) {
  const [elapsed, setElapsed] = useState(0);
  const [accumulatedTime, setAccumulatedTime] = useState(0);
  const runStartedAtRef = useRef<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isActive) {
      if (runStartedAtRef.current === null) {
        runStartedAtRef.current = Date.now();
      }

      intervalRef.current = setInterval(() => {
        if (runStartedAtRef.current) {
          setElapsed(accumulatedTime + (Date.now() - runStartedAtRef.current));
        }
      }, 200);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      const start = runStartedAtRef.current;
      if (start) {
        const now = Date.now();
        setAccumulatedTime((prev) => prev + (now - start));
        runStartedAtRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isActive, accumulatedTime]);

  /**
   * Resets timer to zero and clears all accumulated time.
   */
  const reset = useCallback(() => {
    setElapsed(0);
    setAccumulatedTime(0);
    runStartedAtRef.current = null;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const pause = useCallback(() => {
    const start = runStartedAtRef.current;
    if (start) {
      const now = Date.now();
      setAccumulatedTime((prev) => prev + (now - start));
      runStartedAtRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const resume = useCallback(() => {
    runStartedAtRef.current = Date.now();
  }, []);

  return {
    elapsed,
    reset,
    pause,
    resume,
  };
}
