import { hasAnyPairedDevice } from "@/api/device";
import { getValidAuthToken } from "@/api/httpClient";
import { uploadManager } from "@/api/upload";
import { audioRecorder, type RecordingStatus } from "@/lib/recorder";
import { useAuthContext } from "@/providers/AuthProvider";
import { useCallback, useEffect, useRef, useState } from "react";

export type RecordingState = "idle" | "recording" | "paused";

/**
 * Hook for managing audio recording (mic + system audio).
 * Handles start, pause, resume, stop operations and uploads chunks to backend.
 */
export function useRecorder() {
  const { user } = useAuthContext();
  const [status, setStatus] = useState<RecordingState>("idle");
  const [error, setError] = useState<string | null>(null);
  const recordingStatusRef = useRef<RecordingStatus | null>(null);

  /**
   * Handles audio chunk uploads to backend.
   */
  const handleChunk = useCallback(async (chunkData: any) => {
    if (chunkData.type !== "chunk") {
      return;
    }
    try {
      const token = await getValidAuthToken({ purpose: "record audio" });
      await uploadManager.uploadChunk(chunkData, token);
    } catch {}
  }, []);

  const handleError = useCallback((errorMessage: string) => {
    setError(errorMessage);
  }, []);

  const start = useCallback(async () => {
    try {
      await getValidAuthToken({ purpose: "start recording" });

      // Check if user has any paired device (device_id) before starting recording
      const hasDevice = await hasAnyPairedDevice();
      if (!hasDevice) {
        const errorMsg =
          "No device ID found. Please pair a device before recording.";
        setError(errorMsg);
        throw new Error(errorMsg);
      }

      const result = await audioRecorder.start({
        includeMic: true,
        includeSystem: true,
        onChunk: handleChunk,
        onError: handleError,
        onComplete: () => {},
      });

      recordingStatusRef.current = audioRecorder.getStatus();
      setStatus("recording");
      setError(null);
      return result;
    } catch (err: any) {
      setError(err.message || "Failed to start recording");
      throw err;
    }
  }, [handleChunk, handleError]);

  const pause = useCallback(async () => {
    try {
      await audioRecorder.pause();
      recordingStatusRef.current = audioRecorder.getStatus();
      setStatus("paused");
    } catch (err: any) {
      setError(err.message || "Failed to pause recording");
      throw err;
    }
  }, []);

  const resume = useCallback(async () => {
    try {
      await audioRecorder.resume();
      recordingStatusRef.current = audioRecorder.getStatus();
      setStatus("recording");
    } catch (err: any) {
      setError(err.message || "Failed to resume recording");
      throw err;
    }
  }, []);

  /**
   * Stops recording and sends end event to backend.
   * Silently handles auth errors during event sending.
   */
  const stop = useCallback(async () => {
    try {
      await audioRecorder.stop();
      recordingStatusRef.current = audioRecorder.getStatus();
      setStatus("idle");

      try {
        const token = await getValidAuthToken({ purpose: "record audio" });
        await uploadManager.sendEvent(
          {
            timestamp: Date.now(),
            event: "end",
          },
          token,
        );
      } catch (error: any) {
        if (
          typeof error?.message === "string" &&
          error.message.includes("sign in")
        ) {
          return;
        }
        throw error;
      }
    } catch (err: any) {
      setError(err.message || "Failed to stop recording");
      throw err;
    }
  }, []);

  /**
   * Stops recording immediately when user logs out.
   * Ensures mic is released even if logout happens during recording.
   */
  useEffect(() => {
    if (!user && (status === "recording" || status === "paused")) {
      audioRecorder
        .forceCleanup()
        .then(() => {
          recordingStatusRef.current = audioRecorder.getStatus();
          setStatus("idle");
        })
        .catch(() => {
          recordingStatusRef.current = audioRecorder.getStatus();
          setStatus("idle");
        });
    }
  }, [user, status]);

  return {
    status,
    error,
    start,
    pause,
    resume,
    stop,
    getStatus: () => audioRecorder.getStatus(),
  };
}
