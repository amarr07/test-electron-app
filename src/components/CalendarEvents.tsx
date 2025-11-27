import { authManager } from "@/api/auth";
import {
  calendarService,
  type CalendarEvent,
  type CalendarEventsByDate,
} from "@/api/calendar";
import { Loader } from "@/components/ui/loader";
import type { RecordingState } from "@/hooks/useRecorder";
import { useTimer } from "@/hooks/useTimer";
import { formatElapsed } from "@/lib/time";
import { useNotifications } from "@/providers/NotificationProvider";
import { useToast } from "@/providers/ToastProvider";
import { Pause, Play, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface CalendarEventsProps {
  searchQuery: string;
  onLoadingChange?: (loading: boolean) => void;
  externalRefreshToken?: number;
  recorderStatus?: RecordingState;
}

/**
 * Displays Google Calendar events grouped by date.
 * Features: event timers, calendar connection, and event filtering.
 * Timer conflicts with recording are prevented.
 */
export function CalendarEvents({
  searchQuery,
  onLoadingChange,
  externalRefreshToken,
  recorderStatus,
}: CalendarEventsProps) {
  const [eventsByDate, setEventsByDate] = useState<CalendarEventsByDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectingCalendar, setConnectingCalendar] = useState(false);
  const { toast } = useToast();
  const { registerEvents } = useNotifications();
  const timerStartTimeRef = useRef<number | null>(null);
  const timerAccumulatedTimeRef = useRef<number>(0);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [eventTimerState, setEventTimerState] = useState<
    "idle" | "running" | "paused"
  >("idle");
  const activeTimerRef = useRef<{
    id: string | null;
    state: "idle" | "running" | "paused";
  }>({ id: null, state: "idle" });
  const {
    reset: resetTimer,
    pause: pauseTimer,
    resume: resumeTimer,
  } = useTimer(eventTimerState === "running");

  const [elapsed, setElapsed] = useState(0);
  const autoStartCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const getManuallyStoppedEvents = useCallback((): Set<string> => {
    try {
      const stored = localStorage.getItem("manuallyStoppedEvents");
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  }, []);

  const setManuallyStoppedEvents = useCallback((events: Set<string>) => {
    try {
      localStorage.setItem(
        "manuallyStoppedEvents",
        JSON.stringify(Array.from(events)),
      );
    } catch {}
  }, []);

  const addManuallyStoppedEvent = useCallback(
    (eventId: string) => {
      const events = getManuallyStoppedEvents();
      events.add(eventId);
      setManuallyStoppedEvents(events);
    },
    [getManuallyStoppedEvents, setManuallyStoppedEvents],
  );

  const removeManuallyStoppedEvent = useCallback(
    (eventId: string) => {
      const events = getManuallyStoppedEvents();
      events.delete(eventId);
      setManuallyStoppedEvents(events);
    },
    [getManuallyStoppedEvents, setManuallyStoppedEvents],
  );

  const isManuallyStopped = useCallback(
    (eventId: string): boolean => {
      return getManuallyStoppedEvents().has(eventId);
    },
    [getManuallyStoppedEvents],
  );

  const getTimerState = useCallback((): {
    activeEventId: string | null;
    state: "idle" | "running" | "paused";
    accumulatedTime: number;
    startTime: number | null;
  } => {
    try {
      const stored = localStorage.getItem("eventTimerState");
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          activeEventId: parsed.activeEventId || null,
          state: parsed.state || "idle",
          accumulatedTime: parsed.accumulatedTime || 0,
          startTime: parsed.startTime || null,
        };
      }
    } catch {}
    return {
      activeEventId: null,
      state: "idle",
      accumulatedTime: 0,
      startTime: null,
    };
  }, []);

  const saveTimerState = useCallback(
    (
      eventId: string | null,
      state: "idle" | "running" | "paused",
      accumulatedTime: number,
      startTime: number | null,
    ) => {
      try {
        localStorage.setItem(
          "eventTimerState",
          JSON.stringify({
            activeEventId: eventId,
            state,
            accumulatedTime,
            startTime,
          }),
        );
      } catch {}
    },
    [],
  );

  const restoreTimerState = useCallback(() => {
    if (activeEventId) {
      return;
    }
    const saved = getTimerState();
    if (saved.activeEventId && saved.state !== "idle") {
      if (saved.state === "running" && saved.startTime) {
        const now = Date.now();
        const elapsedSinceStart = now - saved.startTime;
        const totalElapsed = (saved.accumulatedTime || 0) + elapsedSinceStart;

        timerAccumulatedTimeRef.current = totalElapsed;
        timerStartTimeRef.current = now;
        setElapsed(totalElapsed);
        setActiveEventId(saved.activeEventId);
        setEventTimerState("running");
        activeTimerRef.current = {
          id: saved.activeEventId,
          state: "running",
        };
        resumeTimer();
        saveTimerState(saved.activeEventId, "running", totalElapsed, now);
      } else if (saved.state === "paused") {
        timerAccumulatedTimeRef.current = saved.accumulatedTime || 0;
        timerStartTimeRef.current = null;
        setElapsed(timerAccumulatedTimeRef.current);
        setActiveEventId(saved.activeEventId);
        setEventTimerState("paused");
        activeTimerRef.current = {
          id: saved.activeEventId,
          state: "paused",
        };
      }
    }
  }, [activeEventId, getTimerState, resumeTimer, saveTimerState]);

  /**
   * Loads calendar events and registers them for notifications.
   */
  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    onLoadingChange?.(true);
    try {
      const events = await calendarService.getEvents();
      registerEvents(events || []);
      const grouped = calendarService.groupEventsByDate(events || []);
      setEventsByDate(grouped);
    } catch (err: any) {
      const message = err?.message || "Unable to load calendar events.";
      setEventsByDate([]);
      setError(message);
      toast({
        title: "Unable to sync calendar",
        description: message || "Try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      onLoadingChange?.(false);
    }
  }, [onLoadingChange, registerEvents, toast]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents, externalRefreshToken]);

  useEffect(() => {
    const saved = getTimerState();
    if (saved.activeEventId && saved.state !== "idle" && !activeEventId) {
      restoreTimerState();
    }
  }, [activeEventId, getTimerState, restoreTimerState]);

  const getAllEvents = useCallback((): CalendarEvent[] => {
    return eventsByDate.flatMap((group) => group.events);
  }, [eventsByDate]);

  const isEventActive = useCallback((event: CalendarEvent): boolean => {
    if (!event.start.dateTime || !event.end.dateTime) {
      return false;
    }
    const now = new Date();
    const startTime = new Date(event.start.dateTime);
    const endTime = new Date(event.end.dateTime);
    return now >= startTime && now <= endTime;
  }, []);

  const findActiveEvent = useCallback((): CalendarEvent | null => {
    const allEvents = getAllEvents();
    return allEvents.find((event) => isEventActive(event)) || null;
  }, [getAllEvents, isEventActive]);

  const startEventTimer = useCallback(
    (eventId: string) => {
      if (activeEventId !== eventId) {
        resetTimer();
        timerAccumulatedTimeRef.current = 0;
        setElapsed(0);
      }
      const now = Date.now();
      timerStartTimeRef.current = now;
      setActiveEventId(eventId);
      resumeTimer();
      setEventTimerState("running");
      activeTimerRef.current = { id: eventId, state: "running" };
      saveTimerState(eventId, "running", timerAccumulatedTimeRef.current, now);
    },
    [activeEventId, resetTimer, resumeTimer, saveTimerState],
  );

  useEffect(() => {
    if (
      eventTimerState === "running" &&
      timerStartTimeRef.current &&
      activeEventId
    ) {
      const updateElapsed = () => {
        if (timerStartTimeRef.current && activeEventId) {
          const newElapsed =
            timerAccumulatedTimeRef.current +
            (Date.now() - timerStartTimeRef.current);
          setElapsed(newElapsed);
        }
      };

      updateElapsed();
      const interval = setInterval(updateElapsed, 200);

      const saveInterval = setInterval(() => {
        if (activeEventId && timerStartTimeRef.current) {
          saveTimerState(
            activeEventId,
            "running",
            timerAccumulatedTimeRef.current,
            timerStartTimeRef.current,
          );
        }
      }, 1000);

      return () => {
        clearInterval(interval);
        clearInterval(saveInterval);
        if (activeEventId && timerStartTimeRef.current) {
          saveTimerState(
            activeEventId,
            "running",
            timerAccumulatedTimeRef.current,
            timerStartTimeRef.current,
          );
        }
      };
    } else if (eventTimerState === "paused" && activeEventId) {
      setElapsed(timerAccumulatedTimeRef.current);
    } else if (eventTimerState === "idle") {
      setElapsed(0);
    }
  }, [activeEventId, eventTimerState, saveTimerState]);

  const stopEventTimer = useCallback(
    (eventId: string) => {
      if (activeEventId !== eventId) {
        return;
      }
      pauseTimer();
      resetTimer();
      timerStartTimeRef.current = null;
      timerAccumulatedTimeRef.current = 0;
      setElapsed(0);
      setActiveEventId(null);
      setEventTimerState("idle");
      activeTimerRef.current = { id: null, state: "idle" };
      saveTimerState(null, "idle", 0, null);
    },
    [activeEventId, pauseTimer, resetTimer, saveTimerState],
  );

  const handleAutoStart = useCallback(
    (event: CalendarEvent) => {
      if (activeEventId === event.id && eventTimerState !== "idle") {
        return;
      }
      if (recorderStatus && recorderStatus !== "idle") {
        return;
      }
      if (isManuallyStopped(event.id)) {
        return;
      }
      startEventTimer(event.id);
    },
    [
      activeEventId,
      eventTimerState,
      isManuallyStopped,
      recorderStatus,
      startEventTimer,
    ],
  );

  const handleAutoStop = useCallback(
    (eventId: string) => {
      if (activeEventId !== eventId) {
        return;
      }
      stopEventTimer(eventId);
    },
    [activeEventId, stopEventTimer],
  );

  useEffect(() => {
    const checkEvents = () => {
      const activeEvent = findActiveEvent();
      if (activeEvent) {
        if (
          (activeEventId !== activeEvent.id || eventTimerState === "idle") &&
          (!recorderStatus || recorderStatus === "idle")
        ) {
          handleAutoStart(activeEvent);
        }
      } else {
        if (activeEventId && eventTimerState !== "idle") {
          handleAutoStop(activeEventId);
        }
        const allEvents = getAllEvents();
        allEvents.forEach((event) => {
          if (!isEventActive(event)) {
            removeManuallyStoppedEvent(event.id);
          }
        });
      }
      if (activeEventId) {
        const allEvents = getAllEvents();
        const currentEvent = allEvents.find((e) => e.id === activeEventId);
        if (currentEvent && !isEventActive(currentEvent)) {
          handleAutoStop(activeEventId);
          removeManuallyStoppedEvent(activeEventId);
        }
      }
    };

    checkEvents();
    autoStartCheckIntervalRef.current = setInterval(checkEvents, 10000);

    return () => {
      if (autoStartCheckIntervalRef.current) {
        clearInterval(autoStartCheckIntervalRef.current);
      }
    };
  }, [
    activeEventId,
    eventTimerState,
    findActiveEvent,
    getAllEvents,
    handleAutoStart,
    handleAutoStop,
    isEventActive,
    recorderStatus,
    removeManuallyStoppedEvent,
  ]);

  useEffect(() => {
    if (activeEventId === null && eventTimerState !== "idle") {
      pauseTimer();
      resetTimer();
      setEventTimerState("idle");
      activeTimerRef.current = { id: null, state: "idle" };
    }
  }, [activeEventId, eventTimerState, pauseTimer, resetTimer]);

  useEffect(() => {
    if (!recorderStatus || recorderStatus === "idle") {
      return;
    }
    if (activeTimerRef.current.state !== "idle") {
      pauseTimer();
      resetTimer();
      setActiveEventId(null);
      setEventTimerState("idle");
      activeTimerRef.current = { id: null, state: "idle" };
      toast({
        title: "Recording active",
        description: "Stop the mic recording before using the event timer.",
      });
    }
  }, [recorderStatus, pauseTimer, resetTimer, toast]);

  const filteredEvents = eventsByDate
    .map((group) => ({
      ...group,
      events: group.events.filter((event) =>
        event.summary.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    }))
    .filter((group) => group.events.length > 0);

  const formatDateBadge = (dateString?: string) => {
    const safeDate = dateString ? new Date(dateString) : new Date();
    const date = safeDate;
    const month = date
      .toLocaleDateString("en-US", { month: "short" })
      .toUpperCase();
    const day = date.getDate().toString().padStart(2, "0");
    return { month, day };
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader label="Syncing your calendar..." />
      </div>
    );
  }

  const needsCalendarPermission =
    error &&
    (error.includes("Calendar access requires") ||
      error.includes("Authentication required"));

  const friendlyError = needsCalendarPermission
    ? "We need permission to read your Google Calendar. Connect your Google account and grant calendar access."
    : error;

  const handleConnectCalendar = async () => {
    try {
      setConnectingCalendar(true);
      // Use connectGoogleCalendar instead of signInWithGoogle to avoid overwriting user profile
      await authManager.connectGoogleCalendar();
      toast({
        title: "Google Calendar connected",
        description: "Syncing upcoming events...",
      });
      await loadEvents();
    } catch (err: any) {
      const message = err?.message || "Unable to connect to Google Calendar.";
      setError(message);
      toast({
        title: "Unable to connect calendar",
        description: message || "Try again.",
        variant: "destructive",
      });
    } finally {
      setConnectingCalendar(false);
    }
  };

  /**
   * Starts timer for a calendar event. Prevents conflicts with recording.
   */
  const handleStart = (eventId: string) => {
    if (recorderStatus && recorderStatus !== "idle") {
      toast({
        title: "Recording in progress",
        description: "Stop the recording before starting the timer.",
        variant: "destructive",
      });
      return;
    }
    const { id: currentId, state } = activeTimerRef.current;
    if (currentId && currentId !== eventId && state !== "idle") {
      toast({
        title: "Timer already running",
        description: "Stop the current timer before starting another.",
        variant: "destructive",
      });
      return;
    }

    removeManuallyStoppedEvent(eventId);
    if (activeEventId !== eventId) {
      resetTimer();
      timerAccumulatedTimeRef.current = 0;
      setElapsed(0);
    }
    const now = Date.now();
    timerStartTimeRef.current = now;
    setActiveEventId(eventId);
    resumeTimer();
    setEventTimerState("running");
    activeTimerRef.current = { id: eventId, state: "running" };
    saveTimerState(eventId, "running", timerAccumulatedTimeRef.current, now);
  };

  const handlePause = (eventId: string) => {
    if (activeEventId !== eventId || eventTimerState !== "running") {
      return;
    }
    if (timerStartTimeRef.current) {
      const now = Date.now();
      timerAccumulatedTimeRef.current += now - timerStartTimeRef.current;
      timerStartTimeRef.current = null;
      setElapsed(timerAccumulatedTimeRef.current);
    }
    pauseTimer();
    setEventTimerState("paused");
    activeTimerRef.current = { id: eventId, state: "paused" };
    saveTimerState(eventId, "paused", timerAccumulatedTimeRef.current, null);
  };

  const handleStop = (eventId: string, summary?: string) => {
    if (activeEventId !== eventId || eventTimerState === "idle") {
      return;
    }
    stopEventTimer(eventId);
    addManuallyStoppedEvent(eventId);
    toast({
      title: "Timer stopped",
      description: summary
        ? `Stopped tracking "${summary}".`
        : "Stopped tracking this event.",
    });
  };

  if (friendlyError) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 h-64 text-center px-6">
        <div className="text-danger text-sm max-w-sm">{friendlyError}</div>
        {needsCalendarPermission && (
          <button
            type="button"
            onClick={handleConnectCalendar}
            disabled={connectingCalendar}
            className="rounded-full bg-primary text-white px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {connectingCalendar ? "Connecting..." : "Connect Google Calendar"}
          </button>
        )}
      </div>
    );
  }

  if (filteredEvents.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted/60 text-sm">
          {searchQuery ? "No events found" : "No upcoming events"}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {filteredEvents.map((group, index) => (
        <section
          key={group.date}
          className={index > 0 ? "pt-4 border-t border-border/70" : ""}
        >
          <h2 className="text-base font-semibold text-foreground tracking-tight">
            {group.dateLabel}
          </h2>

          <div className="mt-2 space-y-1">
            {group.events.map((event) => {
              const time = calendarService.formatEventTime(event);
              const badgeSource =
                event.start.dateTime ?? event.start.date ?? group.date;
              const dateBadge = formatDateBadge(badgeSource);
              const isOtherTimerActive =
                activeEventId &&
                activeEventId !== event.id &&
                eventTimerState !== "idle";
              const isRunningThisEvent =
                activeEventId === event.id && eventTimerState === "running";
              const showActions =
                group.dateLabel?.toLowerCase() === "coming up";
              return (
                <article
                  key={event.id}
                  className="group flex items-center justify-between gap-4 rounded-2xl px-2 py-2 transition-colors hover:bg-surface/70"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 flex-col items-center justify-center rounded-2xl bg-[#dffce9] text-[#0f8b54] shadow-inner">
                      <span className="text-[10px] font-semibold tracking-[0.18em]">
                        {dateBadge.month}
                      </span>
                      <span className="text-base font-semibold leading-tight">
                        {dateBadge.day}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground leading-tight">
                        {event.summary}
                      </p>
                      <p className="mt-0.5 text-xs text-muted/80">{time}</p>
                      {activeEventId === event.id &&
                        eventTimerState !== "idle" && (
                          <p
                            className={`mt-1 text-xs font-mono ${
                              eventTimerState === "running"
                                ? "text-red-500"
                                : "text-amber-500"
                            }`}
                          >
                            {formatElapsed(elapsed)}
                          </p>
                        )}
                    </div>
                  </div>

                  {showActions && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleStart(event.id)}
                        disabled={isRunningThisEvent}
                        aria-disabled={isOtherTimerActive || undefined}
                        className={`h-8 w-8 rounded-full border border-border/70 text-muted hover:text-foreground transition bg-surface ${
                          (isOtherTimerActive || isRunningThisEvent) &&
                          "opacity-50 cursor-not-allowed"
                        }`}
                        aria-label="Start timer"
                      >
                        <Play className="w-4 h-4 mx-auto" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePause(event.id)}
                        disabled={!isRunningThisEvent}
                        className="h-8 w-8 rounded-full border border-border/70 text-muted hover:text-foreground transition bg-surface disabled:opacity-50"
                        aria-label="Pause timer"
                      >
                        <Pause className="w-4 h-4 mx-auto" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStop(event.id, event.summary)}
                        disabled={
                          activeEventId !== event.id ||
                          eventTimerState === "idle"
                        }
                        className="h-8 w-8 rounded-full border border-border/70 text-muted hover:text-foreground transition bg-surface disabled:opacity-50"
                        aria-label="Stop timer"
                      >
                        <Square className="w-4 h-4 mx-auto" />
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
