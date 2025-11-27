import { getChatSessions, type ChatSession } from "@/api/askNeo";
import { getMemories, MemoryRecord } from "@/api/memories";
import { getTasks, Task } from "@/api/reminders";
import { useNotifications } from "@/providers/NotificationProvider";
import {
  ArrowLeft,
  Bell,
  Clock,
  FileText,
  ListChecks,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface TopBarProps {
  onSearch?: (query: string) => void;
  onBack?: () => void;
  hideSearch?: boolean;
  customSearchBar?: React.ReactNode;
  onSelectMemory?: (id: string) => void;
  onSelectReminder?: (id: string) => void;
  onSelectSession?: (id: string) => void;
}

/**
 * Top navigation bar with workspace search and notifications.
 * Supports custom search bar (e.g., MemorySearchBar) or default workspace search.
 * Workspace search uses relevance scoring to prioritize results.
 */
export function TopBar({
  onSearch,
  onBack,
  hideSearch = false,
  customSearchBar,
  onSelectMemory,
  onSelectReminder,
  onSelectSession,
}: TopBarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [resultsOpen, setResultsOpen] = useState(false);
  const [loadingResults, setLoadingResults] = useState(false);
  const [resultsError, setResultsError] = useState<string | null>(null);
  const [results, setResults] = useState<{
    memories: MemoryRecord[];
    reminders: Task[];
    sessions: ChatSession[];
  }>({ memories: [], reminders: [], sessions: [] });
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationMenuRef = useRef<HTMLDivElement | null>(null);
  const notificationButtonRef = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const requestIdRef = useRef(0);
  const { notifications, unreadCount, markAllRead } = useNotifications();

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    onSearch?.(value);
  };

  useEffect(() => {
    if (!notificationsOpen) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (notificationButtonRef.current?.contains(target)) {
        return;
      }
      if (
        notificationMenuRef.current &&
        !notificationMenuRef.current.contains(target)
      ) {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [notificationsOpen]);

  const handleToggleNotifications = useCallback(() => {
    setNotificationsOpen((prev) => !prev);
  }, []);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        setResultsOpen(false);
      }
    };
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setResultsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setResults({ memories: [], reminders: [], sessions: [] });
      setResultsError(null);
      return;
    }

    const handle = setTimeout(async () => {
      requestIdRef.current += 1;
      const requestId = requestIdRef.current;
      setLoadingResults(true);
      setResultsError(null);
      try {
        const query = searchQuery.trim();
        const [memoriesResp, tasksResp, sessionsResp] = await Promise.all([
          getMemories({ search: query, pageSize: 5 }),
          getTasks(),
          getChatSessions(),
        ]);

        if (requestId !== requestIdRef.current) return;

        const allTasks = [
          ...tasksResp.groupedTasks.flatMap((group) => group.tasks),
          ...tasksResp.nonMemoryTasks,
        ];

        const scoredMemories = filterAndScoreResults(
          query,
          memoriesResp.records,
          (memory) => {
            const parts = [memory.title, memory.summary, memory.mom].filter(
              Boolean,
            );
            return parts.join(" ");
          },
          5,
        );

        const scoredTasks = filterAndScoreResults(
          query,
          allTasks,
          (task) => task.task_name || "",
          5,
        );

        const scoredSessions = filterAndScoreResults(
          query,
          sessionsResp,
          (session) => session.Title || "",
          5,
        );

        setResults({
          memories: scoredMemories,
          reminders: scoredTasks,
          sessions: scoredSessions,
        });
      } catch (error: any) {
        if (requestId !== requestIdRef.current) return;
        setResults({ memories: [], reminders: [], sessions: [] });
        setResultsError(error?.message || "Search failed");
      } finally {
        if (requestId === requestIdRef.current) {
          setLoadingResults(false);
        }
      }
    }, 250);

    return () => clearTimeout(handle);
  }, [searchQuery]);

  const formatNotificationTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  /**
   * Calculates relevance score for search results.
   * Scores: 100 (exact phrase), 80 (all words), 50 (single word), 0 (no match).
   * Includes basic fuzzy matching for typos in words > 4 chars.
   */
  const calculateRelevanceScore = (
    query: string,
    searchableText: string,
  ): number => {
    if (!searchableText) return 0;

    const queryLower = query.toLowerCase().trim();
    const textLower = searchableText.toLowerCase();

    if (textLower.includes(queryLower)) {
      return 100;
    }

    const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 1);

    if (queryWords.length === 0) return 0;

    if (queryWords.length === 1) {
      return textLower.includes(queryWords[0]) ? 50 : 0;
    }

    const wordsInText = queryWords.filter((word) => {
      if (textLower.includes(word)) return true;
      if (word.length > 4) {
        const similar = Array.from(textLower.matchAll(/\b\w+/g))
          .map((m) => m[0])
          .some((textWord) => {
            const diff = Math.abs(word.length - textWord.length);
            if (diff > 2) return false;
            if (
              textWord.includes(word.substring(0, Math.min(4, word.length)))
            ) {
              return true;
            }
            if (
              word.includes(textWord.substring(0, Math.min(4, textWord.length)))
            ) {
              return true;
            }
            return false;
          });
        return similar;
      }
      return false;
    });

    if (wordsInText.length === queryWords.length) {
      return 80;
    }

    return 0;
  };

  /**
   * Filters and scores search results, returning top N by relevance.
   */
  const filterAndScoreResults = <T extends { id: string }>(
    query: string,
    results: T[],
    getSearchableText: (item: T) => string,
    limit: number = 5,
  ): T[] => {
    if (!query.trim()) return results.slice(0, limit);

    const scored = results
      .map((item) => {
        const searchableText = getSearchableText(item);
        const score = calculateRelevanceScore(query, searchableText);
        return { item, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ item }) => item);

    return scored;
  };

  return (
    <div className="h-14 flex flex-shrink-0 items-center gap-6 px-8 window-drag-region">
      <div className="flex items-center gap-3 flex-1 min-w-0 window-no-drag">
        <button
          type="button"
          onClick={onBack}
          disabled={!onBack}
          className="p-2 rounded-lg hover:bg-surface/60 text-muted hover:text-foreground transition-all duration-200 disabled:opacity-40"
          aria-label="Go back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        {customSearchBar ? (
          <div className="relative flex-1" ref={searchRef}>
            {customSearchBar}
          </div>
        ) : (
          !hideSearch && (
            <div className="relative flex-1" ref={searchRef}>
              <div className="relative w-full">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  onFocus={() => setResultsOpen(true)}
                  onClick={() => setResultsOpen(true)}
                  className="w-full bg-surface border border-[#d0d0d0] dark:border-[#404040] rounded-full pl-9 pr-4 py-2 text-xs text-foreground placeholder-muted/60 focus:outline-none focus:border-[#0f8b54] focus:shadow-[0_0_0_1px_rgba(15,139,84,0.35)] focus:bg-surface transition-colors duration-150 shadow-sm"
                />
              </div>
              {resultsOpen && (
                <div className="absolute left-0 right-0 top-11 z-30 rounded-2xl border border-border/60 bg-surface shadow-[0_20px_40px_rgba(15,23,42,0.16)] overflow-hidden backdrop-blur-sm">
                  <div className="px-5 py-4 border-b border-border/50">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted">
                        Search workspace
                      </p>
                      {loadingResults ? (
                        <span className="text-[11px] text-muted/70">
                          Searching...
                        </span>
                      ) : resultsError ? (
                        <span className="text-[11px] text-danger">
                          {resultsError}
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted/70">
                          {results.memories.length +
                            results.sessions.length +
                            results.reminders.length}{" "}
                          results
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted/70">
                      Find memories, reminders, and Ask Neo sessions
                    </p>
                  </div>
                  <div className="max-h-[480px] overflow-y-auto">
                    <div className="px-5 py-4 space-y-6">
                      {results.memories.length > 0 && (
                        <div className="space-y-2.5">
                          <div className="flex items-center gap-2">
                            <FileText className="w-3.5 h-3.5 text-muted/70" />
                            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
                              Memories
                            </p>
                            <span className="text-[11px] text-muted/60">
                              {results.memories.length}
                            </span>
                          </div>
                          <div className="space-y-1.5">
                            {results.memories.map((memory) => (
                              <button
                                key={memory.id}
                                type="button"
                                onClick={() => {
                                  setResultsOpen(false);
                                  onSelectMemory?.(memory.id);
                                  searchInputRef.current?.blur();
                                }}
                                className="group flex items-start gap-3 rounded-xl px-3 py-2.5 w-full text-left hover:bg-surface/60 transition-colors duration-150"
                              >
                                <div className="mt-0.5 flex-shrink-0">
                                  <div className="w-8 h-8 rounded-lg bg-[#f2f2f2] dark:bg-[#1f1f1f] flex items-center justify-center group-hover:bg-[#e0e0e0] dark:group-hover:bg-[#262626] transition-colors">
                                    <FileText className="w-4 h-4 text-[#4a4a4a] dark:text-white" />
                                  </div>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-semibold text-foreground leading-tight line-clamp-1">
                                    {memory.title || "Untitled memory"}
                                  </p>
                                  {memory.summary && (
                                    <p className="text-xs text-muted/80 line-clamp-1 mt-0.5">
                                      {memory.summary}
                                    </p>
                                  )}
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {results.sessions.length > 0 && (
                        <div className="space-y-2.5">
                          <div className="flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5 text-muted/70" />
                            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
                              Ask Neo
                            </p>
                            <span className="text-[11px] text-muted/60">
                              {results.sessions.length}
                            </span>
                          </div>
                          <div className="space-y-1.5">
                            {results.sessions.map((session) => (
                              <button
                                key={session.id}
                                type="button"
                                onClick={() => {
                                  setResultsOpen(false);
                                  onSelectSession?.(session.id);
                                  searchInputRef.current?.blur();
                                }}
                                className="group flex items-start gap-3 rounded-xl px-3 py-2.5 w-full text-left hover:bg-surface/60 transition-colors duration-150"
                              >
                                <div className="mt-0.5 flex-shrink-0">
                                  <div className="w-8 h-8 rounded-lg bg-muted/10 flex items-center justify-center group-hover:bg-muted/15 transition-colors">
                                    <Clock className="w-4 h-4 text-muted" />
                                  </div>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-semibold text-foreground leading-tight line-clamp-1 group-hover:text-foreground/90 transition-colors">
                                    {session.Title || "Session"}
                                  </p>
                                  <p className="text-xs text-muted/80 mt-0.5">
                                    {new Date(
                                      session.CreatedAt * 1000,
                                    ).toLocaleDateString()}
                                  </p>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {results.reminders.length > 0 && (
                        <div className="space-y-2.5">
                          <div className="flex items-center gap-2">
                            <ListChecks className="w-3.5 h-3.5 text-muted/70" />
                            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
                              Reminders
                            </p>
                            <span className="text-[11px] text-muted/60">
                              {results.reminders.length}
                            </span>
                          </div>
                          <div className="space-y-1.5">
                            {results.reminders.map((task) => (
                              <button
                                key={task.id}
                                type="button"
                                onClick={() => {
                                  setResultsOpen(false);
                                  onSelectReminder?.(task.id);
                                  searchInputRef.current?.blur();
                                }}
                                className="group flex items-start gap-3 rounded-xl px-3 py-2.5 w-full text-left hover:bg-surface/60 transition-colors duration-150"
                              >
                                <div className="mt-0.5 flex-shrink-0">
                                  <div className="w-8 h-8 rounded-lg bg-muted/10 flex items-center justify-center group-hover:bg-muted/15 transition-colors">
                                    <ListChecks className="w-4 h-4 text-muted" />
                                  </div>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-semibold text-foreground leading-tight line-clamp-1 group-hover:text-foreground/90 transition-colors">
                                    {task.task_name}
                                  </p>
                                  {task.due_date && (
                                    <p className="text-xs text-muted/80 mt-0.5">
                                      Due{" "}
                                      {new Date(
                                        task.due_date,
                                      ).toLocaleDateString()}
                                    </p>
                                  )}
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {!loadingResults &&
                        results.memories.length === 0 &&
                        results.sessions.length === 0 &&
                        results.reminders.length === 0 && (
                          <div className="py-8 text-center">
                            <div className="flex justify-center mb-3">
                              <div className="w-12 h-12 rounded-full bg-muted/10 flex items-center justify-center">
                                <Search className="w-5 h-5 text-muted/70" />
                              </div>
                            </div>
                            <p className="text-sm text-muted/70">
                              No results found
                            </p>
                          </div>
                        )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        )}
      </div>

      <div className="flex items-center gap-3 window-no-drag">
        <div className="relative">
          <button
            ref={notificationButtonRef}
            onClick={(e) => {
              e.stopPropagation();
              handleToggleNotifications();
            }}
            className="p-2 rounded-lg hover:bg-surface/60 text-muted hover:text-foreground transition-all duration-200 relative"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-danger text-white text-[10px] font-semibold flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>
          {notificationsOpen && (
            <div
              ref={notificationMenuRef}
              className="absolute right-0 top-12 w-64 rounded-2xl border border-border bg-surface shadow-lg p-3 space-y-3 z-50"
            >
              <div className="flex items-center justify-between text-xs text-muted">
                <span>Notifications</span>
                {notifications.length > 0 && (
                  <button
                    className="text-primary hover:text-primary/80 font-medium"
                    onClick={markAllRead}
                  >
                    Mark all as read
                  </button>
                )}
              </div>
              <div className="max-h-60 overflow-y-auto space-y-2">
                {notifications.length === 0 ? (
                  <div className="text-xs text-muted/70 py-6 text-center">
                    You're all caught up.
                  </div>
                ) : (
                  notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className="rounded-xl border border-border/70 px-3 py-2 text-left"
                    >
                      <p className="text-sm font-semibold text-foreground line-clamp-2">
                        {notification.title}
                      </p>
                      <p className="text-xs text-muted mt-1">
                        {notification.description}
                      </p>
                      <p className="text-[11px] text-muted mt-1">
                        {formatNotificationTime(notification.timestamp)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
