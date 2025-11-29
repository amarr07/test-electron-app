import { getMemoriesByIds } from "@/api/memories";
import {
  Task,
  TaskStatus,
  createTask,
  deleteTask,
  getTasks,
  updateTask,
} from "@/api/reminders";
import { CreateReminderModal } from "@/components/CreateReminderModal";
import { useToast } from "@/providers/ToastProvider";
import {
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Copy,
  CornerUpRight,
  FileText,
  MoreHorizontal,
  Plus,
  Star,
  Twitter,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";

interface TaskGroup {
  title: string;
  tasks: Task[];
  memoryId?: string;
  type?: "memory" | "manual";
  memoryCreatedAt?: string;
}

interface TaskSection {
  key: "today" | "yesterday" | "earlier";
  title: string;
  groups: TaskGroup[];
}

interface RemindersSectionProps {
  refreshToken?: number;
  onLoadingChange?: (loading: boolean) => void;
}

type ShareTimeRange = "today" | "yesterday" | "earlier" | "all";

const SHARE_OPTIONS: { key: ShareTimeRange; label: string }[] = [
  { key: "today", label: "Today's reminders" },
  { key: "yesterday", label: "Yesterday's reminders" },
  { key: "earlier", label: "Earlier reminders" },
  { key: "all", label: "All reminders" },
];

/**
 * Normalizes date string to local date (midnight) for consistent categorization.
 */
function normalizeToLocalDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return null;

  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    return new Date(year, month, day);
  }

  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Gets date for task categorization (today/yesterday/earlier).
 * Prioritizes memory creation date, then due date, then task creation date.
 */
function getTaskCategorizationDate(task: Task, todayStart: Date): Date {
  const dateSources = [
    task.memory_details?.[0]?.created_at,
    task.due_date,
    task.created_at,
  ];

  for (const dateStr of dateSources) {
    if (!dateStr) continue;
    const normalized = normalizeToLocalDate(dateStr);
    if (normalized) return normalized;
  }

  return todayStart;
}

/**
 * Gets original timestamp for task display (memory date, due date, or created date).
 */
function getTaskOriginalTimestamp(task: Task): Date | null {
  const memoryDate = task.memory_details?.[0]?.created_at;
  const sourceDate = memoryDate ?? task.due_date ?? task.created_at;
  if (!sourceDate) return null;

  const parsed = new Date(sourceDate);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

/**
 * Formats date with ordinal suffix (1st, 2nd, 3rd, etc.).
 */
function formatDateWithSuffix(date: Date): string {
  const day = date.getDate();
  const suffix =
    day % 10 === 1 && day !== 11
      ? "st"
      : day % 10 === 2 && day !== 12
        ? "nd"
        : day % 10 === 3 && day !== 13
          ? "rd"
          : "th";
  const month = date.toLocaleDateString("en-US", { month: "short" });
  return `${day}${suffix} ${month}`;
}

/**
 * Formats time as HH:MM AM/PM.
 */
function formatTimeLabel(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Resolves task date for sharing/filtering (memory date, due date, or created date).
 */
function resolveTaskDate(task: Task): Date | null {
  const memoryDate = task.memory_details?.[0]?.created_at;
  const sourceDate = memoryDate ?? task.due_date ?? task.created_at;
  if (!sourceDate) return null;

  const parsed = new Date(sourceDate);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

/**
 * Inline date picker component for task due dates.
 * Renders calendar picker with smart positioning (above/below button).
 */
function EditableDueDate({
  task,
  onUpdate,
}: {
  task: Task;
  onUpdate: (dueDate: string) => void;
}) {
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    if (task.due_date) {
      const date = new Date(task.due_date);
      if (!Number.isNaN(date.getTime())) {
        return new Date(date.getFullYear(), date.getMonth(), 1);
      }
    }
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  useEffect(() => {
    if (!datePickerOpen) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      const pickerContains = pickerRef.current?.contains(target);
      const buttonContains = buttonRef.current?.contains(target);
      if (!pickerContains && !buttonContains) {
        setDatePickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [datePickerOpen]);

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

  const formatDueDate = () => {
    if (!task.due_date) return "";
    const date = new Date(task.due_date);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const handleDateSelect = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();
    const selectedDate = new Date(year, month, day);
    onUpdate(selectedDate.toISOString());
    setDatePickerOpen(false);
  };

  const handleOpenPicker = () => {
    setDatePickerOpen(true);
  };

  const updatePickerPosition = useCallback(() => {
    if (!datePickerOpen || !pickerRef.current || !buttonRef.current) return;

    const buttonRect = buttonRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const pickerHeight = 400;
    const pickerWidth = 288;
    const padding = 8;
    const minSpaceFromEdge = 16;

    const spaceBelow = viewportHeight - buttonRect.bottom;
    const spaceAbove = buttonRect.top;

    let top = buttonRect.bottom + window.scrollY + padding;
    let maxHeight = pickerHeight;

    if (spaceBelow < pickerHeight + minSpaceFromEdge) {
      if (spaceAbove > spaceBelow && spaceAbove >= minSpaceFromEdge) {
        top =
          buttonRect.top +
          window.scrollY -
          Math.min(pickerHeight, spaceAbove - minSpaceFromEdge) -
          padding;
        maxHeight = Math.min(pickerHeight, spaceAbove - minSpaceFromEdge);
      } else {
        top = buttonRect.bottom + window.scrollY + padding;
        maxHeight = Math.max(
          200,
          Math.min(pickerHeight, spaceBelow - minSpaceFromEdge),
        );
      }
    } else {
      maxHeight = Math.min(pickerHeight, spaceBelow - minSpaceFromEdge);
    }

    const minTop = window.scrollY + minSpaceFromEdge;
    if (top < minTop) {
      top = minTop;
      const availableHeight =
        viewportHeight - (top - window.scrollY) - minSpaceFromEdge;
      maxHeight = Math.max(200, Math.min(pickerHeight, availableHeight));
    }

    let left = buttonRect.left + window.scrollX;
    if (left + pickerWidth > viewportWidth + window.scrollX) {
      left = viewportWidth + window.scrollX - pickerWidth - minSpaceFromEdge;
    }
    if (left < window.scrollX + minSpaceFromEdge) {
      left = window.scrollX + minSpaceFromEdge;
    }

    pickerRef.current.style.top = `${top}px`;
    pickerRef.current.style.left = `${left}px`;
    pickerRef.current.style.maxHeight = `${maxHeight}px`;
  }, [datePickerOpen]);

  useEffect(() => {
    if (!datePickerOpen) return;
    updatePickerPosition();

    const handleScrollOrResize = () => {
      updatePickerPosition();
    };

    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);

    return () => {
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [datePickerOpen, updatePickerPosition]);

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  return (
    <div className="mt-1.5">
      {!task.due_date ? (
        <button
          ref={buttonRef}
          type="button"
          className="text-xs text-muted hover:text-foreground transition flex items-center gap-1"
          onClick={handleOpenPicker}
        >
          <Plus className="h-3 w-3" />
          Due Date
        </button>
      ) : (
        <button
          ref={buttonRef}
          type="button"
          className="text-xs text-muted hover:text-foreground transition flex items-center gap-1"
          onClick={handleOpenPicker}
        >
          {formatDueDate()}
        </button>
      )}

      {datePickerOpen &&
        createPortal(
          <div
            ref={pickerRef}
            className="fixed z-[90] w-72 rounded-2xl border border-border bg-surface p-4 shadow-xl overflow-y-auto"
            style={{
              top: "0px",
              left: "0px",
              maxHeight: "400px",
            }}
          >
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  const prevMonth = new Date(calendarMonth);
                  prevMonth.setMonth(prevMonth.getMonth() - 1);
                  setCalendarMonth(prevMonth);
                }}
                className="p-1 hover:bg-surface/70 rounded-lg transition"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-semibold">
                {calendarMonth.toLocaleDateString("en-US", {
                  month: "long",
                  year: "numeric",
                })}
              </span>
              <button
                type="button"
                onClick={() => {
                  const nextMonth = new Date(calendarMonth);
                  nextMonth.setMonth(nextMonth.getMonth() + 1);
                  setCalendarMonth(nextMonth);
                }}
                className="p-1 hover:bg-surface/70 rounded-lg transition"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1 mt-4">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                <span key={day} className="text-xs text-center text-muted py-2">
                  {day}
                </span>
              ))}
              {calendarDays.map((date) => {
                const isCurrentMonth =
                  date.getMonth() === calendarMonth.getMonth();
                const isToday = date.getTime() === today.getTime();
                const isSelected =
                  task.due_date &&
                  (() => {
                    const dueDate = new Date(task.due_date);
                    dueDate.setHours(0, 0, 0, 0);
                    const compareDate = new Date(date);
                    compareDate.setHours(0, 0, 0, 0);
                    return dueDate.getTime() === compareDate.getTime();
                  })();

                return (
                  <button
                    key={date.toISOString()}
                    type="button"
                    onClick={() => handleDateSelect(date)}
                    className={`text-xs py-2 rounded-lg transition ${
                      !isCurrentMonth
                        ? "text-muted/30"
                        : isSelected
                          ? "bg-[#0f8b54] text-white"
                          : isToday
                            ? "bg-[#0f8b54]/10 text-[#0f8b54] font-semibold"
                            : "hover:bg-surface/70 text-foreground"
                    }`}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

/**
 * Reminders section component displaying tasks grouped by date (today/yesterday/earlier).
 * Features: filtering (all/important), show/hide completed, create/edit/delete tasks,
 * share reminders (text/CSV/WhatsApp), and date-based categorization.
 */
export function RemindersSection({
  refreshToken,
  onLoadingChange,
}: RemindersSectionProps) {
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<"all" | "important">("all");
  const [showCompleted, setShowCompleted] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [categorizedSections, setCategorizedSections] = useState<TaskSection[]>(
    () => {
      try {
        const cached = localStorage.getItem("reminders_cache");
        if (cached) {
          const { sections: cachedSections, timestamp } = JSON.parse(cached);
          if (
            Date.now() - timestamp < 5 * 60 * 1000 &&
            cachedSections.length > 0
          ) {
            return cachedSections;
          }
        }
      } catch (error) {}
      return [];
    },
  );

  const [isInitialLoad, setIsInitialLoad] = useState(
    categorizedSections.length === 0,
  );
  const [allTasksData, setAllTasksData] = useState<TaskGroup[]>(() => {
    try {
      const cached = localStorage.getItem("reminders_cache");
      if (cached) {
        const { allTasks: cachedAllTasks, timestamp } = JSON.parse(cached);
        if (
          Date.now() - timestamp < 5 * 60 * 1000 &&
          cachedAllTasks.length > 0
        ) {
          return cachedAllTasks;
        }
      }
    } catch (error) {}
    return [];
  });
  const [cacheChecked, setCacheChecked] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    try {
      const cached = localStorage.getItem("reminders_cache");
      if (cached) {
        const { sections: cachedSections, timestamp } = JSON.parse(cached);
        if (
          Date.now() - timestamp < 5 * 60 * 1000 &&
          cachedSections.length > 0
        ) {
          const allGroupKeys = new Set<string>();
          cachedSections.forEach((section: TaskSection) => {
            section.groups.forEach((_, groupIdx) => {
              allGroupKeys.add(`${section.key}-${groupIdx}`);
            });
          });
          return allGroupKeys;
        }
      }
    } catch (error) {}
    return new Set();
  });
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [shareTimeRange, setShareTimeRange] = useState<ShareTimeRange>("today");
  const [groupShareMenuKey, setGroupShareMenuKey] = useState<string | null>(
    null,
  );

  const actionsMenuRef = useRef<HTMLDivElement | null>(null);
  const actionsMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const shareMenuRef = useRef<HTMLDivElement | null>(null);
  const shareMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const groupShareMenuRef = useRef<HTMLDivElement | null>(null);

  const todayStart = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  useEffect(() => {
    setCacheChecked(true);
  }, []);

  /**
   * Loads tasks, fetches memory metadata for memory-linked tasks, and categorizes by date.
   */
  const loadTasks = useCallback(async () => {
    setLoading(true);
    onLoadingChange?.(true);

    try {
      const { groupedTasks, nonMemoryTasks } = await getTasks({
        importantOnly: false,
      });

      const memoryMetadataMap = new Map<
        string,
        { title: string; created_at?: string }
      >();
      const memoryIdsToFetch = new Set<string>();

      groupedTasks.forEach((group) => {
        if (group.memory_id) {
          if (group.memory_title?.trim()) {
            memoryMetadataMap.set(group.memory_id, {
              title: group.memory_title,
              created_at: group.memory_created_at,
            });
          } else {
            memoryIdsToFetch.add(group.memory_id);
            memoryMetadataMap.set(group.memory_id, {
              title: "",
              created_at: group.memory_created_at,
            });
          }
        }
      });

      groupedTasks.forEach((group) => {
        group.tasks.forEach((task) => {
          const memoryId = task.source_memory_ids?.[0];
          if (memoryId && !memoryMetadataMap.has(memoryId)) {
            memoryIdsToFetch.add(memoryId);
            memoryMetadataMap.set(memoryId, {
              title: "",
              created_at: undefined,
            });
          }
        });
      });

      if (memoryIdsToFetch.size > 0) {
        try {
          const { records } = await getMemoriesByIds({
            memoryIds: Array.from(memoryIdsToFetch),
            pageSize: memoryIdsToFetch.size,
          });

          records.forEach((memory) => {
            if (memory.id && memory.title) {
              const existing = memoryMetadataMap.get(memory.id);
              memoryMetadataMap.set(memory.id, {
                title: memory.title,
                created_at: existing?.created_at || memory.created_at,
              });
            }
          });
        } catch (error) {}
      }

      const allTasks: Task[] = [];

      groupedTasks.forEach((group) => {
        const memoryMeta = memoryMetadataMap.get(group.memory_id || "");
        const memoryTitle = group.memory_title || memoryMeta?.title || "";

        group.tasks.forEach((task) => {
          allTasks.push({
            ...task,
            memory_details: [
              {
                id: group.memory_id,
                title: memoryTitle,
                created_at:
                  memoryMeta?.created_at ||
                  group.memory_created_at ||
                  task.memory_details?.[0]?.created_at,
              },
            ],
          });
        });
      });

      allTasks.push(...nonMemoryTasks);

      const todayTasks = allTasks.filter((task) => {
        const date = getTaskCategorizationDate(task, todayStart);
        return date.getTime() === todayStart.getTime();
      });

      const yesterdayTasks = allTasks.filter((task) => {
        const date = getTaskCategorizationDate(task, todayStart);
        const yesterday = new Date(todayStart);
        yesterday.setDate(yesterday.getDate() - 1);
        return date.getTime() === yesterday.getTime();
      });

      const earlierTasks = allTasks.filter((task) => {
        const date = getTaskCategorizationDate(task, todayStart);
        const yesterday = new Date(todayStart);
        yesterday.setDate(yesterday.getDate() - 1);
        return date.getTime() < yesterday.getTime();
      });

      const groupTasksByMemory = (
        tasks: Task[],
        memoryMetaMap: Map<string, { title: string; created_at?: string }>,
      ): TaskGroup[] => {
        const memoryGroups = new Map<string, Task[]>();
        const tasksWithoutMemory: Task[] = [];

        tasks.forEach((task) => {
          const memoryId =
            task.memory_details?.[0]?.id || task.source_memory_ids?.[0];
          if (memoryId) {
            if (!memoryGroups.has(memoryId)) {
              memoryGroups.set(memoryId, []);
            }
            memoryGroups.get(memoryId)!.push(task);
          } else {
            tasksWithoutMemory.push(task);
          }
        });

        const groups: TaskGroup[] = [];

        if (tasksWithoutMemory.length > 0) {
          groups.push({
            title: "Manual reminders",
            tasks: tasksWithoutMemory,
            type: "manual",
          });
        }

        memoryGroups.forEach((memoryTasks, memoryId) => {
          const firstTask = memoryTasks[0];
          const memoryMeta = memoryMetaMap.get(memoryId);
          const memoryTitle =
            firstTask.memory_details?.[0]?.title || memoryMeta?.title || "";
          const memoryCreatedAt =
            firstTask.memory_details?.[0]?.created_at || memoryMeta?.created_at;

          if (memoryTitle.trim()) {
            groups.push({
              title: memoryTitle,
              tasks: memoryTasks,
              memoryId,
              type: "memory",
              memoryCreatedAt,
            });
          }
        });

        return groups;
      };

      const sections: TaskSection[] = [];

      if (todayTasks.length > 0) {
        sections.push({
          key: "today",
          title: `${formatDateWithSuffix(todayStart)} - Today`,
          groups: groupTasksByMemory(todayTasks, memoryMetadataMap),
        });
      }

      if (yesterdayTasks.length > 0) {
        const yesterday = new Date(todayStart);
        yesterday.setDate(yesterday.getDate() - 1);
        sections.push({
          key: "yesterday",
          title: `${formatDateWithSuffix(yesterday)} - Yesterday`,
          groups: groupTasksByMemory(yesterdayTasks, memoryMetadataMap),
        });
      }

      if (earlierTasks.length > 0) {
        sections.push({
          key: "earlier",
          title: "Earlier",
          groups: groupTasksByMemory(earlierTasks, memoryMetadataMap),
        });
      }

      setCategorizedSections((prevSections) => {
        let finalSections: TaskSection[];

        if (isInitialLoad || prevSections.length === 0) {
          finalSections = sections;
        } else {
          const existingSectionMap = new Map(
            prevSections.map((s) => [s.key, s]),
          );
          const mergedSections: TaskSection[] = [];

          sections.forEach((newSection) => {
            const existing = existingSectionMap.get(newSection.key);
            if (existing) {
              const existingGroupMap = new Map<string, TaskGroup>(
                existing.groups.map((g) => [g.memoryId || g.title || "", g]),
              );
              const mergedGroups: TaskGroup[] = [];

              newSection.groups.forEach((newGroup) => {
                const groupKey = newGroup.memoryId || newGroup.title || "";
                const existingGroup = existingGroupMap.get(groupKey);
                if (existingGroup) {
                  const existingTaskIds = new Set(
                    existingGroup.tasks.map((t) => t.id),
                  );
                  const newTasks = newGroup.tasks.filter(
                    (t) => !existingTaskIds.has(t.id),
                  );
                  mergedGroups.push({
                    ...existingGroup,
                    tasks: [...newTasks, ...existingGroup.tasks],
                  });
                } else {
                  mergedGroups.push(newGroup);
                }
              });

              existing.groups.forEach((existingGroup) => {
                const groupKey =
                  existingGroup.memoryId || existingGroup.title || "";
                if (
                  !newSection.groups.some(
                    (g) => (g.memoryId || g.title || "") === groupKey,
                  )
                ) {
                  mergedGroups.push(existingGroup);
                }
              });

              mergedSections.push({
                ...existing,
                groups: mergedGroups,
              });
            } else {
              mergedSections.push(newSection);
            }
          });

          prevSections.forEach((existingSection) => {
            if (!sections.some((s) => s.key === existingSection.key)) {
              mergedSections.push(existingSection);
            }
          });

          finalSections = mergedSections;
        }

        setAllTasksData(finalSections.flatMap((section) => section.groups));

        try {
          localStorage.setItem(
            "reminders_cache",
            JSON.stringify({
              sections: finalSections,
              allTasks: finalSections.flatMap((section) => section.groups),
              timestamp: Date.now(),
            }),
          );
        } catch (error) {}

        const allGroupKeys = new Set<string>();
        finalSections.forEach((section) => {
          section.groups.forEach((_, groupIdx) => {
            allGroupKeys.add(`${section.key}-${groupIdx}`);
          });
        });
        setCollapsedGroups(allGroupKeys);
        setIsInitialLoad(false);

        return finalSections;
      });
    } catch (error: any) {
      toast({
        title: "Unable to load reminders",
        description: error?.message || "Try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      onLoadingChange?.(false);
    }
  }, [toast, onLoadingChange, todayStart, isInitialLoad]);

  /**
   * Updates task in both categorized sections and all tasks data.
   */
  const updateTaskInAllStates = useCallback(
    (taskId: string, updater: (task: Task) => Task) => {
      const updateGroups = (groups: TaskGroup[]): TaskGroup[] =>
        groups.map((group) => ({
          ...group,
          tasks: group.tasks.map((t) => (t.id === taskId ? updater(t) : t)),
        }));

      const updateSections = (sections: TaskSection[]): TaskSection[] =>
        sections.map((section) => ({
          ...section,
          groups: section.groups.map((group) => ({
            ...group,
            tasks: group.tasks.map((t) => (t.id === taskId ? updater(t) : t)),
          })),
        }));

      setAllTasksData(updateGroups);
      setCategorizedSections(updateSections);
    },
    [],
  );

  const revertTaskInAllStates = useCallback(
    (originalTask: Task) => {
      updateTaskInAllStates(originalTask.id, () => originalTask);
    },
    [updateTaskInAllStates],
  );

  const handleToggleComplete = async (task: Task) => {
    const newStatus: TaskStatus =
      task.status === "completed" ? "pending" : "completed";
    const updatedTask = {
      ...task,
      status: newStatus,
      completed_at:
        newStatus === "completed" ? new Date().toISOString() : undefined,
    };

    updateTaskInAllStates(task.id, () => updatedTask);

    try {
      await updateTask({
        id: task.id,
        status: newStatus,
        completed_at:
          newStatus === "completed" ? new Date().toISOString() : undefined,
      });
    } catch (error: any) {
      revertTaskInAllStates(task);
      toast({
        title: "Unable to update reminder",
        description: error?.message || "Try again.",
        variant: "destructive",
      });
    }
  };

  const handleToggleImportant = async (task: Task) => {
    const newImportant = !task.important;
    updateTaskInAllStates(task.id, (t) => ({ ...t, important: newImportant }));

    try {
      await updateTask({ id: task.id, important: newImportant });
    } catch (error: any) {
      revertTaskInAllStates(task);
      toast({
        title: "Unable to update reminder",
        description: error?.message || "Try again.",
        variant: "destructive",
      });
    }
  };

  const handleUpdateDueDate = async (task: Task, newDueDate: string) => {
    updateTaskInAllStates(task.id, (t) => ({ ...t, due_date: newDueDate }));

    try {
      await updateTask({ id: task.id, due_date: newDueDate });
    } catch (error: any) {
      revertTaskInAllStates(task);
      toast({
        title: "Unable to update due date",
        description: error?.message || "Try again.",
        variant: "destructive",
      });
    }
  };

  const handleCreateTask = async (
    taskName: string,
    details?: string,
    important?: boolean,
    dueDate?: string,
  ) => {
    try {
      await createTask({
        task_name: taskName.trim(),
        details: details?.trim() || undefined,
        priority: "medium",
        important: important ?? false,
        due_date: dueDate || undefined,
      });
      await loadTasks();
      setCreateModalOpen(false);
    } catch (error: any) {
      toast({
        title: "Unable to create reminder",
        description: error?.message || "Try again.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteSection = useCallback(
    async (sectionKey: "today" | "yesterday" | "earlier") => {
      const section = categorizedSections.find((s) => s.key === sectionKey);
      const sectionTasks =
        section?.groups.flatMap((group) => group.tasks) || [];

      if (sectionTasks.length === 0) {
        toast({
          title: "No reminders to delete",
          description: "There are no reminders in this section.",
        });
        return;
      }

      try {
        await Promise.all(sectionTasks.map((task) => deleteTask(task.id)));
        await loadTasks();
        toast({
          title: "Reminders deleted",
          description: `${sectionTasks.length} reminder${sectionTasks.length !== 1 ? "s" : ""} removed.`,
        });
      } catch (error: any) {
        toast({
          title: "Unable to delete reminders",
          description: error?.message || "Try again.",
          variant: "destructive",
        });
      }
    },
    [categorizedSections, loadTasks, toast],
  );

  const toggleGroupCollapse = (groupKey: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  const getFilteredTasks = useCallback(
    (timeRange: ShareTimeRange) => {
      const allTasks = allTasksData.flatMap((group) => group.tasks);
      const today = new Date(todayStart);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      return allTasks.filter((task) => {
        const taskDate = resolveTaskDate(task);
        if (!taskDate) return timeRange === "all";

        switch (timeRange) {
          case "today":
            return taskDate.getTime() === today.getTime();
          case "yesterday":
            return taskDate.getTime() === yesterday.getTime();
          case "earlier":
            return taskDate.getTime() < yesterday.getTime();
          case "all":
            return true;
          default:
            return false;
        }
      });
    },
    [allTasksData, todayStart],
  );

  const truncateForX = (text: string, limit = 280) =>
    text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;

  /**
   * Formats tasks as plain text for sharing (grouped by date).
   */
  const formatTasksAsText = (tasksToFormat: Task[]) => {
    if (tasksToFormat.length === 0) return "No reminders to share.";

    const pendingTasks = tasksToFormat.filter(
      (task) => task.status !== "completed",
    );
    const completedTasks = tasksToFormat.filter(
      (task) => task.status === "completed",
    );

    let text = "My Reminders\n\n";

    if (pendingTasks.length > 0) {
      text += "Pending Reminders\n\n";
      pendingTasks.forEach((task, index) => {
        text += `${index + 1}. ${task.task_name}\n`;
      });
      text += "\n";
    }

    if (completedTasks.length > 0) {
      text += "Completed Reminders\n\n";
      completedTasks.forEach((task, index) => {
        text += `${index + 1}. ${task.task_name}\n`;
      });
      text += "\n";
    }

    text += "Summary\n\n";
    text += `Total: ${tasksToFormat.length} reminder${
      tasksToFormat.length !== 1 ? "s" : ""
    }\n`;
    text += `Pending: ${pendingTasks.length}\n`;
    if (completedTasks.length > 0) {
      text += `Completed: ${completedTasks.length}\n`;
    }

    const now = new Date();
    const dateStr = now.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const timeStr = now.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    text += `\nGenerated on ${dateStr} at ${timeStr}`;

    return text;
  };

  /**
   * Formats tasks as CSV for export.
   */
  const formatTasksAsCSV = (tasksToFormat: Task[]) => {
    if (tasksToFormat.length === 0)
      return "CONTENT,DESCRIPTION,DATE,DEADLINE,IMPORTANT\n";

    const headers = "CONTENT,DESCRIPTION,DATE,DEADLINE,IMPORTANT\n";
    const rows = tasksToFormat.map((task) => {
      const content = `"${task.task_name.replace(/"/g, '""')}"`;
      const description = task.details
        ? `"${task.details.replace(/"/g, '""')}"`
        : "";
      const date = task.created_at
        ? new Date(task.created_at).toISOString().replace("T", " ").slice(0, 19)
        : "";
      const deadline = task.due_date
        ? new Date(task.due_date).toISOString().replace("T", " ").slice(0, 19)
        : "";
      const important = task.important ? "Yes" : "No";
      return `${content},${description},${date},${deadline},${important}`;
    });
    return headers + rows.join("\n");
  };

  const handleCopyText = async () => {
    const filteredTasks = getFilteredTasks(shareTimeRange);
    const text = formatTasksAsText(filteredTasks);
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied to clipboard",
        description: `${filteredTasks.length} reminder${filteredTasks.length !== 1 ? "s" : ""} copied.`,
      });
    } catch (error) {
      toast({
        title: "Unable to copy",
        description: "Please try again or copy manually.",
        variant: "destructive",
      });
    }
    setShareMenuOpen(false);
  };

  const handleCopyGroup = async (group: TaskGroup, closeMenu = false) => {
    if (!group.tasks.length) return;
    const text = formatTasksAsText(group.tasks);
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied to clipboard",
        description: `${group.tasks.length} reminder${group.tasks.length !== 1 ? "s" : ""} from "${group.title}" copied.`,
      });
    } catch (error) {
      toast({
        title: "Unable to copy",
        description: "Please try again or copy manually.",
        variant: "destructive",
      });
    }
    if (closeMenu) {
      setGroupShareMenuKey(null);
    }
  };

  const handleShareCSV = () => {
    const filteredTasks = getFilteredTasks(shareTimeRange);
    const csv = formatTasksAsCSV(filteredTasks);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reminders-${shareTimeRange}-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({
      title: "CSV downloaded",
      description: `${filteredTasks.length} reminder${filteredTasks.length !== 1 ? "s" : ""} exported.`,
    });
    setShareMenuOpen(false);
  };

  const handleShareGroupCSV = (group: TaskGroup, closeMenu = false) => {
    if (!group.tasks.length) return;
    const csv = formatTasksAsCSV(group.tasks);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeTitle =
      group.title
        ?.toLowerCase()
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-+|-+$/g, "") || "reminders";
    a.href = url;
    a.download = `reminders-${safeTitle}-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({
      title: "CSV downloaded",
      description: `${group.tasks.length} reminder${group.tasks.length !== 1 ? "s" : ""} from "${group.title}" exported.`,
    });
    if (closeMenu) {
      setGroupShareMenuKey(null);
    }
  };

  const handleShareGroupWhatsApp = (group: TaskGroup) => {
    if (!group.tasks.length) return;
    const text = formatTasksAsText(group.tasks);
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(whatsappUrl, "_blank");
    toast({
      title: "Opening WhatsApp",
      description: "Share reminders via WhatsApp.",
    });
    setGroupShareMenuKey(null);
  };

  const handleShareWhatsApp = () => {
    const filteredTasks = getFilteredTasks(shareTimeRange);
    const text = formatTasksAsText(filteredTasks);
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(whatsappUrl, "_blank");
    toast({
      title: "Opening WhatsApp",
      description: "Share reminders via WhatsApp.",
    });
    setShareMenuOpen(false);
  };

  const handleShareToApps = () => {
    const filteredTasks = getFilteredTasks(shareTimeRange);
    if (filteredTasks.length === 0) {
      toast({
        title: "No reminders available",
        description: "There are no reminders to share.",
        variant: "destructive",
      });
      return;
    }

    const worksheetData = filteredTasks.map((task) => ({
      CONTENT: task.task_name,
      DESCRIPTION: task.details || "",
      DATE: task.created_at
        ? new Date(task.created_at).toISOString().replace("T", " ").slice(0, 19)
        : "",
      DEADLINE: task.due_date
        ? new Date(task.due_date).toISOString().replace("T", " ").slice(0, 19)
        : "",
      IMPORTANT: task.important ? "Yes" : "No",
    }));

    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Reminders");

    const xlsxBuffer = XLSX.write(workbook, {
      type: "array",
      bookType: "xlsx",
    });
    const blob = new Blob([xlsxBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reminders-${shareTimeRange}-${new Date().toISOString().split("T")[0]}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "XLSX downloaded",
      description: `${filteredTasks.length} reminder${filteredTasks.length !== 1 ? "s" : ""} exported.`,
    });
    setShareMenuOpen(false);
  };

  const handleShareToX = () => {
    const filteredTasks = getFilteredTasks(shareTimeRange);
    if (filteredTasks.length === 0) {
      toast({
        title: "No reminders available",
        description: "There are no reminders to share.",
        variant: "destructive",
      });
      return;
    }

    const text = formatTasksAsText(filteredTasks).replace(/\s+/g, " ").trim();
    const tweetText = truncateForX(text);
    const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
      tweetText,
    )}`;
    window.open(xUrl, "_blank");
    toast({
      title: "Opening X",
      description: "Share reminders on X.",
    });
    setShareMenuOpen(false);
  };

  const handleShareGroupToApps = (group: TaskGroup) => {
    if (!group.tasks.length) return;

    const worksheetData = group.tasks.map((task) => ({
      CONTENT: task.task_name,
      DESCRIPTION: task.details || "",
      DATE: task.created_at
        ? new Date(task.created_at).toISOString().replace("T", " ").slice(0, 19)
        : "",
      DEADLINE: task.due_date
        ? new Date(task.due_date).toISOString().replace("T", " ").slice(0, 19)
        : "",
      IMPORTANT: task.important ? "Yes" : "No",
    }));

    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Reminders");

    const xlsxBuffer = XLSX.write(workbook, {
      type: "array",
      bookType: "xlsx",
    });
    const blob = new Blob([xlsxBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeTitle = (group.title || "reminders")
      .replace(/[^a-z0-9]/gi, "-")
      .toLowerCase();
    a.download = `reminders-${safeTitle}-${new Date().toISOString().split("T")[0]}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "XLSX downloaded",
      description: `${group.tasks.length} reminder${group.tasks.length !== 1 ? "s" : ""} from "${group.title}" exported.`,
    });
    setGroupShareMenuKey(null);
  };

  const handleShareGroupToX = (group: TaskGroup) => {
    if (!group.tasks.length) return;

    const text = formatTasksAsText(group.tasks).replace(/\s+/g, " ").trim();
    const tweetText = truncateForX(text);
    const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
      tweetText,
    )}`;
    window.open(xUrl, "_blank");
    toast({
      title: "Opening X",
      description: "Share reminders on X.",
    });
    setGroupShareMenuKey(null);
  };

  const filteredSections = useMemo(() => {
    let sections = categorizedSections;

    if (!showCompleted) {
      sections = sections
        .map((section) => ({
          ...section,
          groups: section.groups
            .map((group) => ({
              ...group,
              tasks: group.tasks.filter((task) => task.status !== "completed"),
            }))
            .filter((group) => group.tasks.length > 0),
        }))
        .filter((section) => section.groups.length > 0);
    }

    if (activeTab === "important") {
      sections = sections
        .map((section) => ({
          ...section,
          groups: section.groups
            .map((group) => ({
              ...group,
              tasks: group.tasks.filter((task) => task.important),
            }))
            .filter((group) => group.tasks.length > 0),
        }))
        .filter((section) => section.groups.length > 0);
    }

    return sections;
  }, [activeTab, categorizedSections, showCompleted]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    if (refreshToken !== undefined && refreshToken > 0) {
      loadTasks();
    }
  }, [refreshToken, loadTasks]);

  useEffect(() => {
    if (!actionsMenuOpen) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (actionsMenuButtonRef.current?.contains(target)) {
        return;
      }
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(target)) {
        setActionsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [actionsMenuOpen]);

  useEffect(() => {
    if (!shareMenuOpen) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (shareMenuButtonRef.current?.contains(target)) {
        return;
      }
      if (shareMenuRef.current && !shareMenuRef.current.contains(target)) {
        setShareMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [shareMenuOpen]);

  useEffect(() => {
    if (!groupShareMenuKey) return;
    const handleClick = (event: MouseEvent) => {
      if (
        groupShareMenuRef.current &&
        !groupShareMenuRef.current.contains(event.target as Node)
      ) {
        setGroupShareMenuKey(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [groupShareMenuKey]);

  const renderReminderSection = (
    sectionKey: "today" | "yesterday" | "earlier",
    title: string,
    groups: TaskGroup[],
  ) => {
    if (groups.length === 0) return null;

    const sectionPendingCount = groups.reduce(
      (acc, group) =>
        acc + group.tasks.filter((task) => task.status === "pending").length,
      0,
    );

    return (
      <div key={sectionKey} className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <div className="flex flex-col">
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            <p className="text-xs text-muted mt-0.5">
              {sectionPendingCount} Pending Reminder
              {sectionPendingCount !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleDeleteSection(sectionKey)}
            className="inline-flex items-center gap-2 rounded-full border border-red-500/50 px-3 py-1.5 text-xs font-semibold text-red-500 transition hover:bg-red-500/10"
            aria-label={`Delete all reminders in ${title}`}
          >
            Delete all
          </button>
        </div>

        <div className="space-y-3">
          {groups.map((group, groupIdx) => {
            const collapseKey = `${sectionKey}-${groupIdx}`;
            const isCollapsed = collapsedGroups.has(collapseKey);
            const groupPendingCount = group.tasks.filter(
              (t) => t.status === "pending",
            ).length;
            const groupDate = group.tasks.length
              ? resolveTaskDate(group.tasks[0])
              : null;
            const originalTimestamp = group.tasks.length
              ? getTaskOriginalTimestamp(group.tasks[0])
              : null;

            let displayDate = groupDate;
            if (group.memoryCreatedAt) {
              const memDate = new Date(group.memoryCreatedAt);
              if (!Number.isNaN(memDate.getTime())) {
                displayDate = new Date(
                  memDate.getFullYear(),
                  memDate.getMonth(),
                  memDate.getDate(),
                );
              }
            }

            const metaParts = [];
            if (displayDate) {
              metaParts.push(formatDateWithSuffix(displayDate));
              if (group.memoryCreatedAt) {
                const memDate = new Date(group.memoryCreatedAt);
                if (!Number.isNaN(memDate.getTime())) {
                  metaParts.push(formatTimeLabel(memDate));
                }
              } else if (originalTimestamp) {
                metaParts.push(formatTimeLabel(originalTimestamp));
              }
            }
            metaParts.push(
              `${groupPendingCount} Pending Reminder${groupPendingCount !== 1 ? "s" : ""}`,
            );

            return (
              <div
                key={collapseKey}
                className="rounded-2xl border border-border/50 bg-surface/50 backdrop-blur-sm overflow-visible transition-all"
              >
                <div
                  className="w-full px-4 py-3 hover:bg-surface/70 transition cursor-pointer"
                  onClick={() => toggleGroupCollapse(collapseKey)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-muted">
                        {metaParts.join(" \u00b7 ")}
                      </p>
                      {group.type === "memory" && group.title?.trim() ? (
                        <p className="text-sm font-semibold text-foreground mt-1">
                          {group.title}
                        </p>
                      ) : group.type === "manual" ? (
                        <p className="text-sm font-semibold text-foreground mt-1">
                          {group.title}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!isCollapsed && (
                        <div
                          className="flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => handleCopyGroup(group)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:text-foreground hover:bg-surface/70"
                            aria-label="Copy reminders in this group"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() =>
                                setGroupShareMenuKey((prev) =>
                                  prev === collapseKey ? null : collapseKey,
                                )
                              }
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:text-foreground hover:bg-surface/70"
                              aria-label="Share reminders in this group"
                            >
                              <CornerUpRight className="h-4 w-4" />
                            </button>
                            {groupShareMenuKey === collapseKey && (
                              <div
                                ref={groupShareMenuRef}
                                className="absolute right-0 top-10 z-30 w-72 rounded-2xl border border-border/60 bg-surface shadow-[0_12px_30px_rgba(15,23,42,0.08)] p-3 z-50"
                              >
                                <p className="text-[11px] uppercase tracking-[0.25em] text-muted mb-3">
                                  Share reminders
                                </p>
                                <div className="grid grid-cols-3 gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleShareGroupWhatsApp(group)
                                    }
                                    className="inline-flex flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-[12px] font-semibold text-foreground hover:bg-surface/80 transition text-center"
                                    title="Share via WhatsApp"
                                  >
                                    <svg
                                      className="h-5 w-5"
                                      viewBox="0 0 24 24"
                                      fill="currentColor"
                                    >
                                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                                    </svg>
                                    WhatsApp
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleCopyGroup(group, true)}
                                    className="inline-flex flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-[12px] font-semibold text-foreground hover:bg-surface/80 transition text-center"
                                    title="Copy reminders as text"
                                  >
                                    <Copy className="h-5 w-5" />
                                    Copy text
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleShareGroupCSV(group, true)
                                    }
                                    className="inline-flex flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-[12px] font-semibold text-foreground hover:bg-surface/80 transition text-center"
                                    title="Download reminders as CSV"
                                  >
                                    <FileText className="h-5 w-5" />
                                    Share CSV
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleShareGroupToApps(group)
                                    }
                                    className="inline-flex flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-[12px] font-semibold text-foreground hover:bg-surface/80 transition text-center"
                                    title="Share via installed apps"
                                  >
                                    <CornerUpRight className="h-5 w-5" />
                                    Share to...
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleShareGroupToX(group)}
                                    className="inline-flex flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-[12px] font-semibold text-foreground hover:bg-surface/80 transition text-center"
                                    title="Post reminders to X"
                                  >
                                    <Twitter className="h-5 w-5" />
                                    Post to X
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      <ChevronDown
                        className={`h-4 w-4 text-[#0f8b54] transition-transform shrink-0 ${
                          isCollapsed ? "-rotate-90" : ""
                        }`}
                      />
                    </div>
                  </div>
                </div>

                {!isCollapsed && (
                  <div className="px-4 pb-4 space-y-2 border-t border-border/30 pt-3">
                    {group.tasks.map((task) => (
                      <div
                        key={`${collapseKey}-${task.id}`}
                        className="group flex items-start gap-3 rounded-xl bg-black/5 p-3 transition hover:bg-black/10"
                      >
                        <button
                          type="button"
                          onClick={() => handleToggleComplete(task)}
                          className="mt-0.5 shrink-0"
                          aria-label={
                            task.status === "completed"
                              ? "Mark as pending"
                              : "Mark as complete"
                          }
                        >
                          {task.status === "completed" ? (
                            <CheckCircle2 className="h-5 w-5 text-[#0f8b54]" />
                          ) : (
                            <Circle className="h-5 w-5 text-muted transition group-hover:text-[#0f8b54]" />
                          )}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-sm font-medium ${
                              task.status === "completed"
                                ? "text-muted line-through"
                                : "text-foreground"
                            }`}
                          >
                            {task.task_name}
                          </p>
                          {task.details && (
                            <p className="mt-1 text-xs text-muted line-clamp-2">
                              {task.details}
                            </p>
                          )}
                          <EditableDueDate
                            task={task}
                            onUpdate={(newDueDate) =>
                              handleUpdateDueDate(task, newDueDate)
                            }
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => handleToggleImportant(task)}
                          className="shrink-0 mt-0.5"
                          aria-label={
                            task.important
                              ? "Remove from important"
                              : "Mark as important"
                          }
                        >
                          <Star
                            className={`h-5 w-5 transition ${
                              task.important
                                ? "fill-[#0f8b54] text-[#0f8b54]"
                                : "text-muted group-hover:text-[#0f8b54]"
                            }`}
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const allTasks = allTasksData.flatMap((group) => group.tasks);
  const allCount = allTasks.filter(
    (task) => task.status !== "completed",
  ).length;
  const importantCount = allTasks.filter(
    (task) => task.important && task.status !== "completed",
  ).length;

  return (
    <>
      <div className="flex h-full w-full flex-col pt-0 pb-4">
        <div className="w-full max-w-4xl mx-auto flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[11px] uppercase tracking-[0.3em] text-muted">
              Reminders
            </p>
            <div className="relative flex items-center gap-2">
              <div className="relative flex items-center gap-2">
                <button
                  ref={shareMenuButtonRef}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShareMenuOpen((prev) => !prev);
                  }}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted transition hover:border-foreground hover:text-foreground"
                  aria-label="Share reminders"
                >
                  <CornerUpRight className="h-4 w-4" />
                </button>
                {shareMenuOpen && (
                  <div
                    ref={shareMenuRef}
                    className="absolute right-0 top-12 w-72 rounded-2xl border border-border/60 bg-surface shadow-[0_12px_30px_rgba(15,23,42,0.08)] p-3 z-50"
                  >
                    <p className="text-[11px] uppercase tracking-[0.25em] text-muted mb-1">
                      Share reminders
                    </p>
                    <div className="space-y-1 mb-4 mt-2">
                      {SHARE_OPTIONS.map((option) => (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() => setShareTimeRange(option.key)}
                          aria-pressed={shareTimeRange === option.key}
                          className={`w-full text-left rounded-xl px-2.5 py-1.5 text-[13px] font-semibold transition ${
                            shareTimeRange === option.key
                              ? "bg-[#0f8b54] text-white shadow-[0_8px_18px_rgba(0,0,0,0.18)]"
                              : "text-foreground hover:bg-surface/70"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border/30">
                      <button
                        type="button"
                        onClick={handleShareWhatsApp}
                        className="inline-flex flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-[12px] font-semibold text-foreground hover:bg-surface/80 transition text-center"
                        title="Share via WhatsApp"
                      >
                        <svg
                          className="h-5 w-5"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                        >
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                        </svg>
                        WhatsApp
                      </button>
                      <button
                        type="button"
                        onClick={handleCopyText}
                        className="inline-flex flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-[12px] font-semibold text-foreground hover:bg-surface/80 transition text-center"
                        title="Copy reminders as text"
                      >
                        <Copy className="h-5 w-5" />
                        Copy text
                      </button>
                      <button
                        type="button"
                        onClick={handleShareCSV}
                        className="inline-flex flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-[12px] font-semibold text-foreground hover:bg-surface/80 transition text-center"
                        title="Download reminders as CSV"
                      >
                        <FileText className="h-5 w-5" />
                        Share CSV
                      </button>
                      <button
                        type="button"
                        onClick={handleShareToApps}
                        className="inline-flex flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-[12px] font-semibold text-foreground hover:bg-surface/80 transition text-center"
                        title="Share via installed apps"
                      >
                        <CornerUpRight className="h-5 w-5" />
                        Share to...
                      </button>
                      <button
                        type="button"
                        onClick={handleShareToX}
                        className="inline-flex flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-[12px] font-semibold text-foreground hover:bg-surface/80 transition text-center"
                        title="Post reminders to X"
                      >
                        <Twitter className="h-5 w-5" />
                        Post to X
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <button
                ref={actionsMenuButtonRef}
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted transition hover:border-foreground hover:text-foreground"
                aria-label="Reminders actions"
                onClick={(e) => {
                  e.stopPropagation();
                  setActionsMenuOpen((prev) => !prev);
                }}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {actionsMenuOpen && (
                <div
                  ref={actionsMenuRef}
                  className="absolute right-0 top-12 w-56 rounded-2xl border border-border/60 bg-surface shadow-[0_12px_30px_rgba(15,23,42,0.08)] p-1.5 z-10"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setShowCompleted((prev) => !prev);
                      setActionsMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-[13px] font-medium text-foreground transition hover:bg-surface/70"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0f8b54]/12 text-[#0f8b54]">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    <span className="flex-1 text-left tracking-tight">
                      {showCompleted ? "Hide" : "Show"} completed reminders
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="mt-1 flex items-center justify-center">
            <div className="inline-flex rounded-full border border-border/80 bg-surface p-1">
              {[
                { key: "all" as const, label: "All", count: allCount },
                {
                  key: "important" as const,
                  label: "Important",
                  count: importantCount,
                },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold transition flex items-center gap-2 ${
                    activeTab === tab.key
                      ? "bg-[#0f8b54] text-white shadow-[0_8px_18px_rgba(0,0,0,0.22)]"
                      : "text-muted"
                  }`}
                >
                  <span
                    className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                      activeTab === tab.key
                        ? "bg-white/20 text-white"
                        : "bg-[#0f8b54]/12 text-[#0f8b54]"
                    }`}
                  >
                    {tab.count}
                  </span>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {cacheChecked && filteredSections.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <div className="mb-4 flex items-center justify-center">
                {activeTab === "important" ? (
                  <Star className="h-7 w-7 text-[#0f8b54]" />
                ) : (
                  <CheckSquare className="h-7 w-7 text-[#0f8b54]" />
                )}
              </div>
              <p className="text-base font-semibold text-foreground">
                {activeTab === "important"
                  ? "No important reminders"
                  : "No reminders found"}
              </p>
              <p className="mt-2 text-sm text-muted max-w-sm">
                {activeTab === "important" ? (
                  <>
                    Click on the <Star className="inline h-4 w-4 mx-0.5" /> icon
                    to mark a reminder as important
                  </>
                ) : (
                  "They'll show up here as you create memories!"
                )}
              </p>
              {activeTab === "all" && (
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(true)}
                  className="mt-6 inline-flex items-center justify-center rounded-full bg-[#0f8b54] px-6 py-2 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(0,0,0,0.24)] transition hover:bg-[#0d6b42]"
                >
                  Create reminder
                </button>
              )}
            </div>
          ) : (
            <div className="flex-1 mt-6 space-y-6 min-h-0">
              {filteredSections.map((section) => {
                const rendered = renderReminderSection(
                  section.key,
                  section.title,
                  section.groups,
                );
                return rendered ? (
                  <div key={section.key}>{rendered}</div>
                ) : null;
              })}
            </div>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setCreateModalOpen(true)}
        className="fixed bottom-8 right-8 z-30 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#0f8b54] text-white shadow-[0_10px_24px_rgba(0,0,0,0.3)] transition hover:-translate-y-0.5 hover:bg-[#0d6b42] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:translate-y-0"
        aria-label="Add reminder"
      >
        <Plus className="h-5 w-5" />
      </button>
      {createModalOpen && (
        <CreateReminderModal
          onClose={() => setCreateModalOpen(false)}
          onSave={(reminder) => {
            handleCreateTask(
              reminder.title,
              reminder.description,
              reminder.important,
              reminder.dueDate,
            );
          }}
        />
      )}
    </>
  );
}
