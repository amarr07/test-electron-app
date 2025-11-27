import { Input } from "@/components/ui/input";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Link2,
  Star,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

interface CreateReminderModalProps {
  onClose: () => void;
  onSave?: (reminder: {
    title: string;
    dueDate: string;
    description: string;
    important: boolean;
  }) => void;
  defaultValues?: {
    title?: string;
    dueDate?: string;
    description?: string;
    important?: boolean;
  };
  linkedMemoryTitle?: string;
  containerClassName?: string;
}

/**
 * Modal for creating/editing reminders.
 * Features: inline calendar date picker, importance toggle, and validation.
 */
export function CreateReminderModal({
  onClose,
  onSave,
  defaultValues,
  linkedMemoryTitle,
  containerClassName,
}: CreateReminderModalProps) {
  const [title, setTitle] = useState(defaultValues?.title ?? "");
  const [dueDate, setDueDate] = useState(defaultValues?.dueDate ?? "");
  const [description, setDescription] = useState(
    defaultValues?.description ?? "",
  );
  const [important, setImportant] = useState(defaultValues?.important ?? false);
  const [saving, setSaving] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const datePickerRef = useRef<HTMLDivElement | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    if (dueDate) {
      const date = new Date(dueDate);
      if (!Number.isNaN(date.getTime())) {
        return new Date(date.getFullYear(), date.getMonth(), 1);
      }
    }
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  useEscapeKey(onClose);

  const handleSave = async () => {
    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();
    setSaving(true);
    try {
      onSave?.({
        title: trimmedTitle,
        dueDate,
        description: trimmedDescription,
        important,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!datePickerOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (
        datePickerRef.current &&
        !datePickerRef.current.contains(event.target as Node)
      ) {
        setDatePickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [datePickerOpen]);

  /**
   * Generates 42-day calendar grid starting from Monday of the week containing month start.
   */
  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const start = new Date(firstDay);
    start.setDate(start.getDate() - ((firstDay.getDay() + 6) % 7));

    return Array.from({ length: 42 }).map((_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [calendarMonth]);

  const isSameDay = (dateA: Date, dateB: Date) =>
    dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate();

  const selectedDate = useMemo(() => {
    if (!dueDate) return null;
    const parsed = new Date(dueDate);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, [dueDate]);

  const formatDueDate = () => {
    if (!dueDate) return null;
    try {
      const date = new Date(dueDate);
      return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
    } catch {
      return null;
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 ${containerClassName ?? ""}`}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[520px] rounded-[32px] border border-border/80 bg-surface shadow-[0_40px_80px_rgba(15,23,42,0.18)] overflow-visible"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/70 px-6 py-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted">
              {defaultValues?.title ? "Edit reminder" : "New reminder"}
            </p>
            <p className="mt-1 text-lg font-semibold text-foreground">
              {defaultValues?.title
                ? "Update reminder details"
                : "Capture a quick follow-up"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-muted transition hover:text-foreground"
            aria-label="Close reminder modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">
              Title
            </label>
            <div className="rounded-2xl border border-border/80 bg-surface/80 px-3 py-2 focus-within:border-[#0f8b54] focus-within:shadow-[0_0_0_1px_rgba(15,139,84,0.35)] transition">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Untitled reminder"
                className="h-9 border-none bg-transparent px-0 text-base font-semibold text-foreground placeholder:text-muted focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>
            {linkedMemoryTitle && (
              <div className="flex items-center gap-1.5 mt-1.5">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-[#0f8b54]/10 px-2.5 py-1 text-xs text-[#0f8b54]">
                  <Link2 className="h-3 w-3" />
                  <span className="font-semibold">{linkedMemoryTitle}</span>
                </div>
              </div>
            )}
          </div>

          <div className="relative flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/80 bg-surface px-4 py-3 text-sm text-muted">
            <div className="relative">
              <button
                type="button"
                onClick={() => setDatePickerOpen((prev) => !prev)}
                className="inline-flex items-center gap-2 rounded-full border border-border/80 px-3 py-1.5 font-semibold text-foreground transition hover:border-[#d0d0d0] dark:hover:border-border"
              >
                <CalendarPlus className="h-4 w-4" />
                {formatDueDate() || "Add due date"}
              </button>

              {datePickerOpen && (
                <div
                  ref={datePickerRef}
                  className="absolute right-0 top-full z-50 mt-3 w-72 rounded-2xl border border-[#d0d0d0] dark:border-border/80 bg-surface p-4 shadow-[0_12px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_30px_rgba(0,0,0,0.35)]"
                >
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() =>
                        setCalendarMonth(
                          new Date(
                            calendarMonth.getFullYear(),
                            calendarMonth.getMonth() - 1,
                            1,
                          ),
                        )
                      }
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:bg-surface/80 hover:text-foreground"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <p className="text-sm font-semibold text-foreground">
                      {calendarMonth.toLocaleString(undefined, {
                        month: "long",
                        year: "numeric",
                      })}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        setCalendarMonth(
                          new Date(
                            calendarMonth.getFullYear(),
                            calendarMonth.getMonth() + 1,
                            1,
                          ),
                        )
                      }
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:bg-surface/80 hover:text-foreground"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-7 text-center text-xs font-semibold uppercase tracking-wide text-muted">
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                      (day) => (
                        <span key={day}>{day}</span>
                      ),
                    )}
                  </div>

                  <div className="mt-2 grid grid-cols-7 gap-1 text-sm">
                    {calendarDays.map((date) => {
                      const isCurrentMonth =
                        date.getMonth() === calendarMonth.getMonth();
                      const isSelected =
                        selectedDate && isSameDay(date, selectedDate);
                      return (
                        <button
                          key={date.toISOString()}
                          type="button"
                          onClick={() => {
                            setDueDate(date.toISOString());
                            setDatePickerOpen(false);
                          }}
                          className={`h-9 rounded-full text-center transition ${
                            isSelected
                              ? "bg-[#0f8b54] text-white shadow"
                              : isCurrentMonth
                                ? "text-foreground hover:bg-surface/80"
                                : "text-muted hover:bg-surface/40"
                          }`}
                        >
                          {date.getDate()}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setImportant((prev) => !prev)}
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-semibold transition ${
                important
                  ? "bg-[#0f8b54]/10 text-[#0f8b54]"
                  : "border border-border/80 text-muted hover:text-foreground"
              }`}
            >
              <Star
                className={`h-4 w-4 ${
                  important ? "fill-current" : "text-muted"
                }`}
              />
              {important ? "Marked important" : "Mark important"}
            </button>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">
              Details
            </label>
            <div className="rounded-2xl border border-border/80 bg-surface/80 focus-within:border-[#0f8b54] focus-within:shadow-[0_0_0_1px_rgba(15,139,84,0.35)] transition">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add description"
                className="h-32 w-full resize-none rounded-2xl border-none bg-transparent px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-border/70 bg-surface/80 px-6 py-5">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-full border border-border px-5 py-2 text-sm font-semibold text-muted hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={title.trim().length < 3 || saving}
            className="inline-flex items-center justify-center rounded-full bg-[#0f8b54] px-6 py-2 text-sm font-semibold text-white transition hover:bg-[#0d6b42] disabled:cursor-not-allowed disabled:bg-muted/30 disabled:text-white/70"
          >
            {saving
              ? "Saving..."
              : defaultValues?.title
                ? "Update reminder"
                : "Save reminder"}
          </button>
        </div>
      </div>
    </div>
  );
}
