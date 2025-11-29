import type { CalendarEvent } from "@/api/calendar";
import { storage } from "@/lib/storage";
import { useToast } from "@/providers/ToastProvider";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface ReminderMap {
  [eventId: string]: number;
}

interface NotificationItem {
  id: string;
  eventId: string;
  title: string;
  description: string;
  timestamp: number;
  read: boolean;
}

interface NotificationContextValue {
  reminderSettings: ReminderMap;
  notifications: NotificationItem[];
  unreadCount: number;
  registerEvents: (events: CalendarEvent[]) => void;
  setReminder: (eventId: string, minutes: number) => void;
  markAllRead: () => void;
  clearNotification: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextValue | undefined>(
  undefined,
);

/**
 * Default reminder time before calendar events (in minutes).
 */
export const DEFAULT_REMINDER_MINUTES = 2;

/**
 * Provider for calendar event notifications and reminders.
 * Schedules reminders based on event start times and reminder settings.
 * Manages notification state (read/unread) and triggers toast notifications.
 */
export function NotificationProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [reminderSettings, setReminderSettings] = useState<ReminderMap>({});
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const eventsRef = useRef<Record<string, CalendarEvent>>({});
  const timeoutsRef = useRef<Record<string, NodeJS.Timeout>>({});
  const triggeredRef = useRef<Set<string>>(new Set());
  const hasRequestedNativePermissionRef = useRef(false);

  useEffect(() => {
    storage
      .get("reminderSettings")
      .then((data) => {
        if (data) {
          setReminderSettings(data);
        }
      })
      .catch(() => {});
  }, []);

  /**
   * Clears reminder timer for a specific event.
   */
  const clearTimer = useCallback((eventId: string) => {
    if (timeoutsRef.current[eventId]) {
      clearTimeout(timeoutsRef.current[eventId]);
      delete timeoutsRef.current[eventId];
    }
  }, []);

  /**
   * Triggers notification and toast for upcoming event.
   */
  const triggerNotification = useCallback(
    (eventId: string, minutes: number) => {
      const event = eventsRef.current[eventId];
      if (!event) return;

      triggeredRef.current.add(eventId);
      setNotifications((prev) => [
        {
          id: `${eventId}-${Date.now()}`,
          eventId,
          title: event.summary || "Upcoming event",
          description: `Starting in ${minutes} minute${
            minutes === 1 ? "" : "s"
          }`,
          timestamp: Date.now(),
          read: false,
        },
        ...prev,
      ]);
      toast({
        title: event.summary || "Upcoming event",
        description: `Starting in ${minutes} minute${
          minutes === 1 ? "" : "s"
        }.`,
      });

      try {
        if (typeof window === "undefined" || typeof document === "undefined") {
          return;
        }
        const NotificationCtor: typeof Notification | undefined =
          window.Notification;
        if (!NotificationCtor) return;

        const isAppInBackground =
          document.hidden === true || document.hasFocus() === false;

        if (!isAppInBackground) {
          return;
        }

        const showNative = () => {
          const title = event.summary || "Upcoming event";
          const body = `Starting in ${minutes} minute${
            minutes === 1 ? "" : "s"
          }`;

          new NotificationCtor(title, {
            body,
          });
        };

        if (NotificationCtor.permission === "granted") {
          showNative();
        } else if (
          NotificationCtor.permission === "default" &&
          !hasRequestedNativePermissionRef.current
        ) {
          hasRequestedNativePermissionRef.current = true;
          NotificationCtor.requestPermission().then((permission) => {
            if (permission === "granted") {
              showNative();
            }
          });
        }
      } catch {}
    },
    [toast],
  );

  /**
   * Schedules reminder timer for event based on start time and reminder setting.
   * Only schedules if event is within 7 days and hasn't been triggered.
   */
  const scheduleReminder = useCallback(
    (eventId: string) => {
      const event = eventsRef.current[eventId];
      if (!event) {
        clearTimer(eventId);
        return;
      }

      clearTimer(eventId);

      const minutes = reminderSettings[eventId] ?? DEFAULT_REMINDER_MINUTES;
      const start = event.start.dateTime
        ? new Date(event.start.dateTime)
        : event.start.date
          ? new Date(event.start.date)
          : null;
      if (!start || triggeredRef.current.has(eventId)) {
        return;
      }

      const remindAt = start.getTime() - minutes * 60 * 1000;
      const now = Date.now();
      const sevenDaysAhead = now + 7 * 24 * 60 * 60 * 1000;
      if (remindAt <= now || start.getTime() > sevenDaysAhead) {
        return;
      }

      const delay = Math.min(remindAt - now, 2 ** 31 - 1);
      timeoutsRef.current[eventId] = setTimeout(() => {
        clearTimer(eventId);
        triggerNotification(eventId, minutes);
      }, delay);
    },
    [clearTimer, reminderSettings, triggerNotification],
  );

  /**
   * Registers calendar events and schedules reminders.
   * Cleans up timers for events that no longer exist.
   */
  const registerEvents = useCallback(
    (events: CalendarEvent[]) => {
      const map: Record<string, CalendarEvent> = {};
      events.forEach((event) => {
        if (event.id) {
          map[event.id] = event;
        }
      });

      eventsRef.current = map;

      Object.keys(timeoutsRef.current).forEach((eventId) => {
        if (!map[eventId]) {
          clearTimer(eventId);
        }
      });

      Object.keys(map).forEach((eventId) => scheduleReminder(eventId));
    },
    [clearTimer, scheduleReminder],
  );

  useEffect(() => {
    Object.keys(eventsRef.current).forEach((eventId) =>
      scheduleReminder(eventId),
    );
  }, [reminderSettings, scheduleReminder]);

  const setReminder = useCallback(
    (eventId: string, minutes: number) => {
      setReminderSettings((prev) => {
        const next = { ...prev, [eventId]: minutes };
        storage.set("reminderSettings", next);
        return next;
      });
      triggeredRef.current.delete(eventId);
      scheduleReminder(eventId);
    },
    [scheduleReminder],
  );

  const markAllRead = useCallback(() => {
    setNotifications((prev) => (prev.length ? [] : prev));
    setUnreadCount(0);
  }, []);

  const clearNotification = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.filter((notification) => notification.id !== id),
    );
  }, []);

  useEffect(() => {
    const count = notifications.filter(
      (notification) => !notification.read,
    ).length;
    setUnreadCount(count);
  }, [notifications]);

  const value = useMemo(
    () => ({
      reminderSettings,
      notifications,
      unreadCount,
      registerEvents,
      setReminder,
      markAllRead,
      clearNotification,
    }),
    [
      reminderSettings,
      notifications,
      unreadCount,
      registerEvents,
      setReminder,
      markAllRead,
      clearNotification,
    ],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

/**
 * Hook to access notification context.
 * Throws error if used outside NotificationProvider.
 */
export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error(
      "useNotifications must be used within NotificationProvider",
    );
  }
  return context;
}
