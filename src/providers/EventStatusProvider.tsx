import { subscribeToUserEvents, type UserEventRecord } from "@/lib/firestore";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuthContext } from "./AuthProvider";
import { useToast } from "./ToastProvider";

interface EventStatusContextValue {
  isTranscribing: boolean;
  isMemoryProcessing: boolean;
  memoryRefreshVersion: number;
}

const EventStatusContext = createContext<EventStatusContextValue | undefined>(
  undefined,
);

const TRANSCRIBING_EVENT_TTL_MS = 5 * 60 * 1000;
const PROCESSING_TIMEOUT_MS = 10 * 60 * 1000;

function isStaleEvent(event: UserEventRecord, ttlMs: number) {
  return Date.now() - event.updatedAt.getTime() > ttlMs;
}

export function EventStatusProvider({ children }: { children: ReactNode }) {
  const { user } = useAuthContext();
  const { toast } = useToast();
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isMemoryProcessing, setIsMemoryProcessing] = useState(false);
  const [memoryRefreshVersion, setMemoryRefreshVersion] = useState(0);
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const transcribingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const processedEventIdsRef = useRef<Set<string>>(new Set());
  const wasProcessingRef = useRef<boolean>(false);

  const clearTranscribingTimeout = useCallback(() => {
    if (transcribingTimeoutRef.current) {
      clearTimeout(transcribingTimeoutRef.current);
      transcribingTimeoutRef.current = null;
    }
  }, []);

  const enableTranscribing = useCallback(() => {
    setIsTranscribing(true);
    clearTranscribingTimeout();
    transcribingTimeoutRef.current = setTimeout(() => {
      setIsTranscribing(false);
      transcribingTimeoutRef.current = null;
    }, TRANSCRIBING_EVENT_TTL_MS);
  }, [clearTranscribingTimeout]);

  const disableTranscribing = useCallback(() => {
    setIsTranscribing(false);
    clearTranscribingTimeout();
  }, [clearTranscribingTimeout]);

  const clearProcessingTimeout = useCallback(() => {
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
      processingTimeoutRef.current = null;
    }
  }, []);

  const enableProcessing = useCallback(() => {
    setIsMemoryProcessing(true);
    wasProcessingRef.current = true;
    clearProcessingTimeout();
    processingTimeoutRef.current = setTimeout(() => {
      setIsMemoryProcessing(false);
      processingTimeoutRef.current = null;
    }, PROCESSING_TIMEOUT_MS);
  }, [clearProcessingTimeout]);

  const disableProcessing = useCallback(() => {
    setIsMemoryProcessing(false);
    clearProcessingTimeout();
  }, [clearProcessingTimeout]);

  const handleEvent = useCallback(
    (event: UserEventRecord) => {
      const eventKey = `${event.id}-${event.event}`;
      const shouldShowToast = !processedEventIdsRef.current.has(eventKey);

      processedEventIdsRef.current.add(eventKey);

      if (processedEventIdsRef.current.size > 100) {
        const idsArray = Array.from(processedEventIdsRef.current);
        processedEventIdsRef.current = new Set(idsArray.slice(-50));
      }

      switch (event.event) {
        case "in_progress": {
          if (!isStaleEvent(event, TRANSCRIBING_EVENT_TTL_MS)) {
            enableTranscribing();
          }
          break;
        }
        case "not_transcribing": {
          if (!isStaleEvent(event, TRANSCRIBING_EVENT_TTL_MS)) {
            disableTranscribing();
          }
          break;
        }
        case "processing": {
          enableProcessing();
          disableTranscribing();
          break;
        }
        case "completed": {
          const wasProcessing = wasProcessingRef.current;
          wasProcessingRef.current = false;
          disableProcessing();
          disableTranscribing();
          setMemoryRefreshVersion((version) => version + 1);
          if (shouldShowToast && wasProcessing) {
            toast({
              title: "Memory created",
              description: "We're updating your timeline.",
            });
          }
          break;
        }
        case "post_completed": {
          const wasProcessing = wasProcessingRef.current;
          wasProcessingRef.current = false;
          disableProcessing();
          disableTranscribing();
          setMemoryRefreshVersion((version) => version + 1);
          if (shouldShowToast && wasProcessing) {
            toast({
              title: "Memory updated",
              description: "Enhancements are ready.",
            });
          }
          break;
        }
        case "failed": {
          wasProcessingRef.current = false;
          disableProcessing();
          disableTranscribing();
          if (shouldShowToast) {
            toast({
              title: "Memory processing failed",
              description: "Try recording again.",
              variant: "destructive",
            });
          }
          break;
        }
        default: {
          if (event.event.includes("archived")) {
            setMemoryRefreshVersion((version) => version + 1);
            if (shouldShowToast) {
              toast({
                title: "Memory archived",
                description: "Your list has been updated.",
              });
            }
          }
        }
      }
    },
    [
      disableProcessing,
      disableTranscribing,
      enableProcessing,
      enableTranscribing,
      toast,
    ],
  );

  useEffect(() => {
    if (!user?.uid) {
      disableTranscribing();
      disableProcessing();
      return;
    }

    const unsubscribe = subscribeToUserEvents(user.uid, (events) => {
      events.forEach(handleEvent);
    });

    return () => {
      unsubscribe();
      clearProcessingTimeout();
      clearTranscribingTimeout();
    };
  }, [
    user?.uid,
    handleEvent,
    disableProcessing,
    disableTranscribing,
    clearProcessingTimeout,
    clearTranscribingTimeout,
  ]);

  const value = useMemo(
    () => ({
      isTranscribing,
      isMemoryProcessing,
      memoryRefreshVersion,
    }),
    [isTranscribing, isMemoryProcessing, memoryRefreshVersion],
  );

  return (
    <EventStatusContext.Provider value={value}>
      {children}
    </EventStatusContext.Provider>
  );
}

export function useEventStatus() {
  const context = useContext(EventStatusContext);
  if (context === undefined) {
    throw new Error("useEventStatus must be used within EventStatusProvider");
  }
  return context;
}
