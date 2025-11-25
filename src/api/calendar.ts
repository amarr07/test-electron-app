import { storage } from "@/lib/storage";

export interface CalendarEvent {
  id: string;
  summary: string;
  start: {
    dateTime?: string;
    date?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
  };
  description?: string;
  location?: string;
  attendees?: {
    email?: string;
    displayName?: string;
    responseStatus?: string;
  }[];
  hangoutLink?: string;
  htmlLink?: string;
}

export interface CalendarEventsByDate {
  date: string;
  dateLabel: string;
  events: CalendarEvent[];
}

/**
 * Service for fetching and organizing Google Calendar events.
 */
class CalendarService {
  private calendarId: string = "primary";

  /**
   * Fetches calendar events from Google Calendar API.
   * Defaults to 7 days past and 7 days future if time range not specified.
   */
  async getEvents(
    timeMin?: string,
    timeMax?: string,
  ): Promise<CalendarEvent[]> {
    const token = await storage.getGoogleAccessToken();

    if (!token) {
      throw new Error(
        "Calendar access requires Google sign-in with calendar permissions.",
      );
    }

    try {
      const baseUrl = "https://www.googleapis.com/calendar/v3/calendars";
      const calendarUrl = `${baseUrl}/${this.calendarId}/events`;
      const now = Date.now();
      const defaultTimeMin =
        timeMin || new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
      const defaultTimeMax =
        timeMax || new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();

      const params = new URLSearchParams({
        timeMin: defaultTimeMin,
        timeMax: defaultTimeMax,
        maxResults: "50",
        singleEvents: "true",
        orderBy: "startTime",
      });

      const response = await fetch(`${calendarUrl}?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          await storage.clearGoogleAccessToken();
          throw new Error("Authentication required. Sign in again.");
        }
        const errorText = await response.text();
        throw new Error(
          `Failed to fetch calendar events: ${response.statusText} - ${errorText}`,
        );
      }

      const data = await response.json();
      return data.items || [];
    } catch (error: any) {
      throw error;
    }
  }

  /**
   * Groups events by date: "Coming up" (today + 7 days) and past 7 days.
   * Events outside this window are excluded.
   */
  groupEventsByDate(events: CalendarEvent[]): CalendarEventsByDate[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const pastWindowStart = new Date(today);
    pastWindowStart.setDate(pastWindowStart.getDate() - 7);
    const futureWindowEnd = new Date(today);
    futureWindowEnd.setDate(futureWindowEnd.getDate() + 7);

    const pastGrouped: Record<string, CalendarEvent[]> = {};
    const upcomingEvents: CalendarEvent[] = [];

    events.forEach((event) => {
      const eventDate = event.start.dateTime
        ? new Date(event.start.dateTime)
        : event.start.date
          ? new Date(event.start.date)
          : null;

      if (!eventDate) return;

      const eventDay = new Date(eventDate);
      eventDay.setHours(0, 0, 0, 0);

      if (eventDay >= today && eventDay <= futureWindowEnd) {
        upcomingEvents.push(event);
        return;
      }

      if (eventDay >= pastWindowStart && eventDay < today) {
        const dateKey = eventDay.toISOString().split("T")[0];
        if (!pastGrouped[dateKey]) {
          pastGrouped[dateKey] = [];
        }
        pastGrouped[dateKey].push(event);
      }
    });

    const result: CalendarEventsByDate[] = [];

    if (upcomingEvents.length > 0) {
      result.push({
        date: today.toISOString().split("T")[0],
        dateLabel: "Coming up",
        events: upcomingEvents.sort((a, b) => {
          const timeA = a.start.dateTime
            ? new Date(a.start.dateTime).getTime()
            : 0;
          const timeB = b.start.dateTime
            ? new Date(b.start.dateTime).getTime()
            : 0;
          return timeA - timeB;
        }),
      });
    }

    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    const pastGroups = Object.entries(pastGrouped)
      .map(([dateKey, groupedEvents]) => {
        const date = new Date(dateKey);
        const label = `${dayNames[date.getDay()]}, ${
          monthNames[date.getMonth()]
        } ${date.getDate()}`;
        return {
          date: dateKey,
          dateLabel: label,
          events: groupedEvents.sort((a, b) => {
            const timeA = a.start.dateTime
              ? new Date(a.start.dateTime).getTime()
              : 0;
            const timeB = b.start.dateTime
              ? new Date(b.start.dateTime).getTime()
              : 0;
            return timeA - timeB;
          }),
        };
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return [...result, ...pastGroups];
  }

  /**
   * Formats event start time for display.
   * Returns "All day" for all-day events.
   */
  formatEventTime(event: CalendarEvent): string {
    if (event.start.dateTime) {
      const start = new Date(event.start.dateTime);
      return start.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } else if (event.start.date) {
      return "All day";
    }
    return "";
  }
}

export const calendarService = new CalendarService();
