import {
  deleteMemories,
  deleteMemory,
  getMemories,
  getMemoriesByIds,
  getMemoriesMetadata,
  MEMORIES_PAGE_SIZE,
  MemoryRecord,
  mergeMemories,
  TranscriptSegment,
  updateMemory,
} from "@/api/memories";
import {
  createTask,
  getTasks,
  Task,
  TaskStatus,
  updateTask,
} from "@/api/reminders";
import { CreateReminderModal } from "@/components/CreateReminderModal";
import { MemoryChatInterface } from "@/components/MemoryChatInterface";
import { MarkdownText } from "@/components/ui/markdown";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { highlightText } from "@/lib/highlightText";
import { useToast } from "@/providers/ToastProvider";
import {
  Archive,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  Circle,
  Clock,
  Copy,
  CornerUpRight,
  Edit,
  FileCode,
  FileText,
  Filter,
  GitMerge,
  ListChecks,
  Loader2,
  MoreHorizontal,
  Plus,
  Scroll,
  Search,
  Share2,
  Sparkles,
  Star,
  Twitter,
  UserPlus,
  X,
} from "lucide-react";
import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/**
 * Wrapper component for page sections with consistent layout.
 */
function SectionShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full w-full flex-col pt-0 pb-4">
      <div className="flex-1 flex flex-col min-h-0">{children}</div>
    </div>
  );
}

/**
 * Main memories view component with search, filtering, pagination, and memory management.
 * Features: search with highlighting, filters (topics/participants/domains/date), bulk operations,
 * merge memories, edit/delete/share, memory detail view, transcript viewer, and reminder creation.
 */
export function MemoriesView({
  searchQuery: _legacySearchQuery,
  searchResults: externalSearchResults,
  refreshToken,
  onLoadingChange,
  onMemoryDetailChange,
  memoryToOpen,
  onMemoryOpened,
  onMergeStateChange,
}: {
  searchQuery: string;
  searchResults?: MemoryRecord[];
  refreshToken?: number;
  onLoadingChange?: (loading: boolean) => void;
  onMemoryDetailChange?: (isOpen: boolean, onClose: () => void) => void;
  memoryToOpen?: string | null;
  onMemoryOpened?: () => void;
  onMergeStateChange?: (isMerging: boolean) => void;
}) {
  const { toast } = useToast();

  const [memories, setMemories] = useState<MemoryRecord[]>(() => {
    try {
      const cached = localStorage.getItem("memories_cache");
      if (cached) {
        const { memories: cachedMemories, timestamp } = JSON.parse(cached);
        if (
          Date.now() - timestamp < 5 * 60 * 1000 &&
          cachedMemories.length > 0
        ) {
          return cachedMemories;
        }
      }
    } catch (error) {}
    return [];
  });

  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submittedSearchQuery, setSubmittedSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MemoryRecord[]>([]);
  const [isInitialLoad, setIsInitialLoad] = useState(memories.length === 0);
  const [cacheChecked, setCacheChecked] = useState(false);

  useEffect(() => {
    setCacheChecked(true);
  }, []);

  useEffect(() => {
    if (externalSearchResults !== undefined) {
      const seenIds = new Set<string>();
      const dedupedResults = externalSearchResults.filter((memory) => {
        if (seenIds.has(memory.id)) return false;
        seenIds.add(memory.id);
        return true;
      });
      setSearchResults(dedupedResults);
      setSubmittedSearchQuery(_legacySearchQuery);
    }
  }, [externalSearchResults, _legacySearchQuery]);
  const [selectedMemory, setSelectedMemory] = useState<MemoryRecord | null>(
    null,
  );
  const [selectedMemoryFull, setSelectedMemoryFull] =
    useState<MemoryRecord | null>(null);
  const [editingMemory, setEditingMemory] = useState<MemoryRecord | null>(null);
  const [shareMemory, setShareMemory] = useState<MemoryRecord | null>(null);
  const [memoryToDelete, setMemoryToDelete] = useState<MemoryRecord | null>(
    null,
  );
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const filterMenuRef = useRef<HTMLDivElement | null>(null);
  const [mode, setMode] = useState<"select" | "merge" | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
  const [mergeLoading, setMergeLoading] = useState(false);
  const [viewArchived, setViewArchived] = useState(false);
  const [availableTopics, setAvailableTopics] = useState<string[]>([]);
  const [availableParticipants, setAvailableParticipants] = useState<string[]>(
    [],
  );
  const [availableDomains, setAvailableDomains] = useState<string[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>(
    [],
  );
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [topicSearch, setTopicSearch] = useState("");
  const [participantSearch, setParticipantSearch] = useState("");
  const [domainSearch, setDomainSearch] = useState("");
  const [selectedDateRange, setSelectedDateRange] = useState<{
    start?: string;
    end?: string;
  }>({});
  const [metadataRange, setMetadataRange] = useState<{
    min?: string | null;
    max?: string | null;
  }>({});
  const [filteredMemoryIds, setFilteredMemoryIds] = useState<string[]>([]);
  const [filtersApplied, setFiltersApplied] = useState(false);
  const [filterApplying, setFilterApplying] = useState(false);
  const pageCursorsRef = useRef<(string | null)[]>([null]);
  const latestRequestRef = useRef(0);
  const [currentPage, setCurrentPage] = useState(1);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [searchVisibleCount, setSearchVisibleCount] = useState(10);
  const [searchLoadingMore, setSearchLoadingMore] = useState(false);
  const normalizedSearchQuery = submittedSearchQuery.trim().toLowerCase();

  const filtersActive =
    filtersApplied &&
    (selectedTopics.length > 0 ||
      selectedParticipants.length > 0 ||
      selectedDomains.length > 0 ||
      selectedDateRange.start ||
      selectedDateRange.end ||
      filteredMemoryIds.length > 0);
  const activeFiltersCount =
    selectedTopics.length +
    selectedParticipants.length +
    selectedDomains.length +
    (selectedDateRange.start || selectedDateRange.end ? 1 : 0);

  /**
   * Loads memories with pagination, search, and filtering support.
   * Handles cursor-based pagination and filter-based memory ID filtering.
   */
  const loadMemories = useCallback(
    async ({
      targetPage = 1,
      cursorOverride,
      memoryIdsOverride,
      filtersEnabledOverride,
    }: {
      targetPage?: number;
      cursorOverride?: string | null;
      memoryIdsOverride?: string[];
      filtersEnabledOverride?: boolean;
    } = {}) => {
      latestRequestRef.current += 1;
      const requestId = latestRequestRef.current;

      const cursorParam =
        cursorOverride !== undefined
          ? cursorOverride
          : (pageCursorsRef.current[targetPage - 1] ?? null);

      setLoading(true);
      onLoadingChange?.(true);
      try {
        let records: MemoryRecord[] = [];
        let nextCursor: string | null = null;
        let more = false;

        const useFilters = filtersEnabledOverride ?? filtersActive;
        const idsToUse = memoryIdsOverride ?? filteredMemoryIds;

        if (useFilters) {
          if (idsToUse.length === 0) {
            records = [];
            nextCursor = null;
            more = false;
          } else {
            const filtered = await getMemoriesByIds({
              memoryIds: idsToUse,
              cursor: cursorParam,
              pageSize: MEMORIES_PAGE_SIZE,
            });
            records = filtered.records;
            nextCursor = filtered.nextCursor;
            more = filtered.hasMore;
          }
        } else {
          const result = await getMemories({
            cursor: cursorParam,
            archived: viewArchived || undefined,
          });
          records = result.records;
          nextCursor = result.nextCursor;
          more = result.hasMore;
          setAvailableTopics((prev) => {
            const base = targetPage === 1 ? new Set<string>() : new Set(prev);
            records.forEach((record) =>
              (record.topics ?? []).forEach((topic) => {
                const normalized = topic.trim();
                if (normalized) base.add(normalized);
              }),
            );
            return Array.from(base).sort((a, b) => a.localeCompare(b));
          });
          setAvailableParticipants((prev) => {
            const base = targetPage === 1 ? new Set<string>() : new Set(prev);
            records.forEach((record) =>
              (record.entities ?? record.participants ?? []).forEach(
                (participant) => {
                  const normalized = participant.trim();
                  if (normalized) base.add(normalized);
                },
              ),
            );
            return Array.from(base).sort((a, b) => a.localeCompare(b));
          });
          setAvailableDomains((prev) => {
            const base = targetPage === 1 ? new Set<string>() : new Set(prev);
            records.forEach((record) => {
              const domain = record.domain?.trim();
              if (domain) base.add(domain);
            });
            return Array.from(base).sort((a, b) => a.localeCompare(b));
          });
        }
        if (latestRequestRef.current !== requestId) {
          return;
        }

        setMemories((prev) => {
          let finalMemories: MemoryRecord[];

          if (targetPage === 1 && prev.length > 0 && !isInitialLoad) {
            const existingIds = new Set(prev.map((m) => m.id));
            const newRecords = records.filter((r) => !existingIds.has(r.id));
            finalMemories =
              newRecords.length > 0 ? [...newRecords, ...prev] : prev;
          } else {
            finalMemories = targetPage === 1 ? records : [...prev, ...records];
          }

          const seenIds = new Set<string>();
          finalMemories = finalMemories.filter((memory) => {
            if (seenIds.has(memory.id)) return false;
            seenIds.add(memory.id);
            return true;
          });

          if (targetPage === 1) {
            try {
              localStorage.setItem(
                "memories_cache",
                JSON.stringify({
                  memories: finalMemories,
                  timestamp: Date.now(),
                }),
              );
            } catch (error) {}
          }

          return finalMemories;
        });

        setHasMore(more);
        setCurrentPage(targetPage);
        pageCursorsRef.current = [
          ...pageCursorsRef.current.slice(0, targetPage),
          nextCursor ?? null,
        ];
        setIsInitialLoad(false);
      } catch (error: any) {
        if (latestRequestRef.current !== requestId) {
          return;
        }
        setMemories([]);
        setHasMore(false);
        toast({
          title: "Unable to load memories",
          description: error?.message || "Try again.",
          variant: "destructive",
        });
      } finally {
        if (latestRequestRef.current === requestId) {
          setLoading(false);
          onLoadingChange?.(false);
        }
      }
    },
    [
      filtersActive,
      filteredMemoryIds,
      onLoadingChange,
      toast,
      viewArchived,
      isInitialLoad,
    ],
  );

  useEffect(() => {
    if (submittedSearchQuery.length > 0 && searchResults.length > 0) {
      const seenIds = new Set<string>();
      const dedupedResults = searchResults.filter((memory) => {
        if (seenIds.has(memory.id)) return false;
        seenIds.add(memory.id);
        return true;
      });
      setMemories(dedupedResults);
      setHasMore(false);
      setCurrentPage(1);
      pageCursorsRef.current = [null];
      setSearchVisibleCount(10);
      setLoading(false);
      onLoadingChange?.(false);
    } else if (
      submittedSearchQuery.length === 0 &&
      searchResults.length === 0
    ) {
      pageCursorsRef.current = [null];
      loadMemories({ targetPage: 1, cursorOverride: null });
    }
  }, [searchResults, submittedSearchQuery, onLoadingChange, loadMemories]);

  useEffect(() => {
    if (submittedSearchQuery.length === 0) {
      pageCursorsRef.current = [null];
      loadMemories({ targetPage: 1, cursorOverride: null });
      setSearchVisibleCount(10);
    }
  }, [filtersActive, viewArchived, loadMemories, submittedSearchQuery]);

  useEffect(() => {
    if (refreshToken !== undefined) {
      pageCursorsRef.current = [null];
      loadMemories({ targetPage: 1, cursorOverride: null });
      setSearchVisibleCount(10);
    }
  }, [refreshToken, loadMemories]);

  useEffect(() => {
    onMergeStateChange?.(mergeLoading);
  }, [mergeLoading, onMergeStateChange]);

  useEffect(() => {
    if (submittedSearchQuery.length > 0) {
      setCurrentPage(1);
      pageCursorsRef.current = [null];
      setSearchVisibleCount(10);
    }
  }, [submittedSearchQuery]);

  useEffect(() => {
    if (!filterMenuOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (
        filterMenuRef.current &&
        !filterMenuRef.current.contains(event.target as Node)
      ) {
        setFilterMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [filterMenuOpen]);

  useEffect(() => {
    if (!filterMenuOpen) return;
    let cancelled = false;
    const fetchMetadata = async () => {
      try {
        const timezone =
          Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
        const meta = await getMemoriesMetadata({
          searchQuery: submittedSearchQuery || undefined,
          tags: selectedTopics,
          entities: selectedParticipants,
          domains: selectedDomains,
          startDate: selectedDateRange.start,
          endDate: selectedDateRange.end,
          timezone,
        });
        if (cancelled) return;
        setAvailableTopics(meta.tags ?? []);
        setAvailableParticipants(meta.entities ?? []);
        setAvailableDomains(meta.domains ?? []);
        setMetadataRange({ min: meta.minStartedAt, max: meta.maxStartedAt });
      } catch (error) {
        console.error("Failed to fetch memory metadata", error);
      }
    };
    fetchMetadata();
    return () => {
      cancelled = true;
    };
  }, [
    filterMenuOpen,
    submittedSearchQuery,
    selectedDomains,
    selectedParticipants,
    selectedTopics,
    selectedDateRange.end,
    selectedDateRange.start,
  ]);

  useEffect(() => {
    if (!filterMenuOpen) {
      setTopicSearch("");
      setParticipantSearch("");
      setDomainSearch("");
    }
  }, [filterMenuOpen]);

  useEffect(() => {
    if (!actionsMenuOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (
        actionsMenuRef.current &&
        !actionsMenuRef.current.contains(event.target as Node)
      ) {
        setActionsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [actionsMenuOpen]);
  const selectionMode = mode !== null;
  const selectMode = mode === "select";
  const mergeMode = mode === "merge";
  const selectedChatKey = useMemo(
    () => selectedIds.slice().sort().join("|"),
    [selectedIds],
  );
  useEffect(() => {
    if (!selectMode || selectedIds.length === 0) {
      setBulkDeleteModalOpen(false);
    }
  }, [selectMode, selectedIds.length]);

  const handleApplyFilters = async () => {
    const timezone =
      (typeof Intl !== "undefined" &&
        Intl.DateTimeFormat().resolvedOptions().timeZone) ||
      undefined;
    setFilterApplying(true);
    try {
      const meta = await getMemoriesMetadata({
        searchQuery: submittedSearchQuery || undefined,
        tags: selectedTopics,
        entities: selectedParticipants,
        domains: selectedDomains,
        startDate: selectedDateRange.start,
        endDate: selectedDateRange.end,
        timezone,
      });
      setAvailableTopics(meta.tags ?? []);
      setAvailableParticipants(meta.entities ?? []);
      setAvailableDomains(meta.domains ?? []);
      setMetadataRange({ min: meta.minStartedAt, max: meta.maxStartedAt });
      setFilteredMemoryIds(meta.memoryIds ?? []);
      setFiltersApplied(
        (meta.memoryIds?.length ?? 0) > 0 ||
          activeFiltersCount > 0 ||
          Boolean(selectedDateRange.start || selectedDateRange.end),
      );
      pageCursorsRef.current = [null];
      setFilterMenuOpen(false);
      await loadMemories({
        targetPage: 1,
        cursorOverride: null,
        memoryIdsOverride: meta.memoryIds ?? [],
        filtersEnabledOverride: true,
      });
    } catch (error: any) {
      toast({
        title: "Unable to apply filters",
        description: error?.message || "Try again.",
        variant: "destructive",
      });
    } finally {
      setFilterApplying(false);
    }
  };

  const handleClearFilters = async () => {
    setSelectedTopics([]);
    setSelectedParticipants([]);
    setSelectedDomains([]);
    setSelectedDateRange({});
    setFilteredMemoryIds([]);
    setFiltersApplied(false);
    pageCursorsRef.current = [null];
    setFilterMenuOpen(false);
    await loadMemories({
      targetPage: 1,
      cursorOverride: null,
      filtersEnabledOverride: false,
      memoryIdsOverride: [],
    });
  };

  useEffect(() => {
    if (selectedMemory) {
      getMemoriesByIds({ memoryIds: [selectedMemory.id], pageSize: 1 })
        .then(({ records }) => {
          const fullMemory = records[0];
          if (fullMemory) {
            setSelectedMemoryFull(fullMemory);
          } else {
            setSelectedMemoryFull(selectedMemory);
          }
        })
        .catch((error: any) => {
          toast({
            title: "Unable to load memory details",
            description: error?.message || "Try again.",
            variant: "destructive",
          });
          setSelectedMemoryFull(selectedMemory);
        });
    } else {
      setSelectedMemoryFull(null);
    }
  }, [selectedMemory, toast]);

  useEffect(() => {
    if (onMemoryDetailChange) {
      const handleClose = () => {
        setSelectedMemory(null);
        setSelectedMemoryFull(null);
      };
      if (selectedMemory) {
        onMemoryDetailChange(true, handleClose);
      } else {
        onMemoryDetailChange(false, () => {});
      }
    }
  }, [selectedMemory, onMemoryDetailChange]);

  useEffect(() => {
    if (memoryToOpen) {
      getMemoriesByIds({ memoryIds: [memoryToOpen], pageSize: 1 })
        .then(({ records }) => {
          const memory = records[0];
          if (memory) {
            setSelectedMemory(memory);
            onMemoryOpened?.();
          }
        })
        .catch((error: any) => {
          console.error("Failed to open memory:", error);
          onMemoryOpened?.();
        });
    }
  }, [memoryToOpen, onMemoryOpened]);

  const filteredTopics = useMemo(() => {
    if (!topicSearch.trim()) {
      return availableTopics;
    }
    const needle = topicSearch.toLowerCase().trim();
    return availableTopics.filter((topic) =>
      topic.toLowerCase().includes(needle),
    );
  }, [availableTopics, topicSearch]);

  const filteredParticipants = useMemo(() => {
    if (!participantSearch.trim()) {
      return availableParticipants;
    }
    const needle = participantSearch.toLowerCase().trim();
    return availableParticipants.filter((participant) =>
      participant.toLowerCase().includes(needle),
    );
  }, [availableParticipants, participantSearch]);

  const filteredDomains = useMemo(() => {
    if (!domainSearch.trim()) {
      return availableDomains;
    }
    const needle = domainSearch.toLowerCase().trim();
    return availableDomains.filter((domain) =>
      domain.toLowerCase().includes(needle),
    );
  }, [availableDomains, domainSearch]);

  const handleSelectMemory = (memoryId: string) => {
    if (!selectionMode) return;
    setSelectedIds((prev) =>
      prev.includes(memoryId)
        ? prev.filter((id) => id !== memoryId)
        : [...prev, memoryId],
    );
  };

  const handleToggleGroupSelection = (memoryIds: string[]) => {
    if (!selectionMode || memoryIds.length === 0) return;
    setSelectedIds((prev) => {
      const allSelected = memoryIds.every((id) => prev.includes(id));
      if (allSelected) {
        return prev.filter((id) => !memoryIds.includes(id));
      }
      const next = new Set(prev);
      memoryIds.forEach((id) => next.add(id));
      return Array.from(next);
    });
  };

  const exitSelectionMode = () => {
    setMode(null);
    setSelectedIds([]);
    setMergeLoading(false);
  };

  const handleMergeConfirm = async () => {
    if (selectedIds.length < 2 || mergeLoading) return;
    setMergeLoading(true);
    try {
      await mergeMemories(selectedIds);
      toast({
        title: "Memories merged",
        description: "Refreshing the timeline...",
      });
      exitSelectionMode();
      await loadMemories({ targetPage: 1, cursorOverride: null });
    } catch (error: any) {
      toast({
        title: "Unable to merge memories",
        description: error?.message || "Try again.",
        variant: "destructive",
      });
    } finally {
      setMergeLoading(false);
    }
  };

  const toggleArchivedView = () => {
    setViewArchived((prev) => !prev);
    setActionsMenuOpen(false);
    exitSelectionMode();
    pageCursorsRef.current = [null];
  };

  const filteredMemories = useMemo(() => {
    if (submittedSearchQuery.length > 0 && searchResults.length > 0) {
      return searchResults.slice(0, searchVisibleCount);
    }
    if (filtersActive) {
      return memories;
    }
    if (submittedSearchQuery.length > 0) {
      return searchResults;
    }
    return memories.filter((memory) => {
      const haystacks = [
        memory.title,
        memory.summary,
        memory.mom,
        memory.domain,
        memory.tags?.join(" "),
        memory.topics?.join(" "),
        memory.entities?.join(" "),
      ];
      const matchesSearch =
        !normalizedSearchQuery ||
        haystacks.some((text) =>
          text?.toLowerCase().includes(normalizedSearchQuery),
        );
      return matchesSearch;
    });
  }, [
    filtersActive,
    memories,
    normalizedSearchQuery,
    submittedSearchQuery,
    searchResults,
    searchVisibleCount,
  ]);

  const groupedMemories = useMemo(() => {
    if (!filteredMemories.length) return [];

    const seenIds = new Set<string>();
    const dedupedFiltered = filteredMemories.filter((memory) => {
      if (seenIds.has(memory.id)) return false;
      seenIds.add(memory.id);
      return true;
    });

    const sorted = [...dedupedFiltered].sort((a, b) => {
      const aTime = getMemorySortTimestamp(a);
      const bTime = getMemorySortTimestamp(b);
      return bTime - aTime;
    });
    const map = new Map<
      string,
      { key: string; label: string; items: MemoryRecord[] }
    >();
    for (const record of sorted) {
      const key = getMemoryDateKey(record);
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: formatMemoryGroupLabel(key),
          items: [],
        });
      }
      map.get(key)!.items.push(record);
    }
    return Array.from(map.values());
  }, [filteredMemories]);

  const noMatches =
    cacheChecked &&
    !loading &&
    memories.length > 0 &&
    filteredMemories.length === 0;
  const hasSearchResults =
    submittedSearchQuery.length > 0 && filteredMemories.length > 0;
  const isSearchMode = submittedSearchQuery.trim().length > 0;
  const contentSpacing = hasSearchResults ? "space-y-3" : "space-y-6";

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry.isIntersecting) return;

        if (isSearchMode) {
          if (searchVisibleCount < searchResults.length && !searchLoadingMore) {
            setSearchLoadingMore(true);
            setTimeout(() => {
              setSearchVisibleCount((prev) =>
                Math.min(prev + 10, searchResults.length),
              );
              setSearchLoadingMore(false);
            }, 150);
          }
        } else if (hasMore && !loading) {
          loadMemories({ targetPage: currentPage + 1 });
        }
      },
      {
        root: null,
        rootMargin: "200px",
        threshold: 0.1,
      },
    );

    observer.observe(sentinel);
    return () => {
      observer.disconnect();
    };
  }, [
    currentPage,
    hasMore,
    isSearchMode,
    loading,
    loadMemories,
    searchResults.length,
    searchVisibleCount,
    searchLoadingMore,
  ]);

  const shouldShowEmptyState =
    cacheChecked && !loading && memories.length === 0;

  if (shouldShowEmptyState) {
    if (filtersActive || filtersApplied) {
      return (
        <SectionShell>
          <div className="flex flex-1 items-center justify-center text-center px-6">
            <div className="space-y-3 max-w-sm">
              <div className="flex justify-center">
                <Search className="h-7 w-7 text-[#0f8b54]" />
              </div>
              <p className="text-base font-semibold text-foreground">
                No memories match your filters
              </p>
              <p className="text-sm text-muted">
                Adjust the filters to see more memories.
              </p>
              <div className="flex items-center justify-center">
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="inline-flex items-center justify-center rounded-full border border-border px-4 py-1.5 text-xs font-semibold text-foreground/80 hover:border-foreground"
                >
                  Clear filters
                </button>
              </div>
            </div>
          </div>
        </SectionShell>
      );
    }
    return (
      <SectionShell>
        <div className="flex flex-1 items-center justify-center text-center">
          <div className="space-y-3">
            <div className="flex justify-center">
              <Sparkles className="h-7 w-7 text-[#0f8b54]" />
            </div>
            <p className="text-base font-semibold text-foreground">
              No memories yet
            </p>
            <p className="text-sm text-muted">
              Start a recording to capture your next idea.
            </p>
          </div>
        </div>
      </SectionShell>
    );
  }

  if (noMatches) {
    return (
      <SectionShell>
        <div className="flex flex-1 items-center justify-center text-center px-6">
          <div className="space-y-3 max-w-sm">
            <div className="flex justify-center">
              <Search className="h-7 w-7 text-[#0f8b54]" />
            </div>
            <p className="text-base font-semibold text-foreground">
              {submittedSearchQuery
                ? `No memories found for "${submittedSearchQuery}"`
                : "No memories found"}
            </p>
            {filtersApplied && (
              <div className="flex items-center justify-center">
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="inline-flex items-center justify-center rounded-full border border-border px-4 py-1.5 text-xs font-semibold text-foreground/80 hover:border-foreground"
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
        </div>
      </SectionShell>
    );
  }

  if (selectedMemory) {
    return (
      <>
        <SectionShell>
          <MemoryDetailView
            memory={selectedMemoryFull || selectedMemory}
            onEdit={(memory) => {
              setEditingMemory(memory);
            }}
            availableTopics={availableTopics}
            availableParticipants={availableParticipants}
            onMemoryUpdate={(updatedMemory) => {
              if (selectedMemoryFull) {
                setSelectedMemoryFull(updatedMemory);
              }
              setSelectedMemory(updatedMemory);
              setMemories((prev) =>
                prev.map((record) =>
                  record.id === updatedMemory.id ? updatedMemory : record,
                ),
              );
            }}
            onOpenMemory={(memoryId) => {
              getMemoriesByIds({ memoryIds: [memoryId], pageSize: 1 })
                .then(({ records }) => {
                  const memory = records[0];
                  if (memory) {
                    setSelectedMemory(memory);
                  }
                })
                .catch((error: any) => {
                  toast({
                    title: "Unable to open memory",
                    description: error?.message || "Try again.",
                    variant: "destructive",
                  });
                });
            }}
          />
        </SectionShell>
        {editingMemory && (
          <EditNotesModal
            memory={editingMemory}
            onClose={() => setEditingMemory(null)}
            onSave={(memoryId, updatedNotes) => {
              setMemories((prev) =>
                prev.map((record) =>
                  record.id === memoryId
                    ? {
                        ...record,
                        mom: updatedNotes,
                        summary: updatedNotes,
                      }
                    : record,
                ),
              );
              if (selectedMemoryFull && selectedMemoryFull.id === memoryId) {
                setSelectedMemoryFull({
                  ...selectedMemoryFull,
                  mom: updatedNotes,
                  summary: updatedNotes,
                });
              }
              setSelectedMemory((prev) => {
                if (prev && prev.id === memoryId) {
                  return {
                    ...prev,
                    mom: updatedNotes,
                    summary: updatedNotes,
                  };
                }
                return prev;
              });
              toast({
                title: "Notes updated",
                description: "Changes saved for this memory.",
              });
              setEditingMemory(null);
            }}
          />
        )}
      </>
    );
  }

  return (
    <SectionShell>
      <div className="w-full max-w-4xl mx-auto flex-1 flex flex-col min-h-0">
        <div
          className={`${contentSpacing} flex-1 pr-1 ${
            selectionMode && selectedIds.length > 0 ? "pb-24" : ""
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[11px] uppercase tracking-[0.25em] text-muted/80">
              {mergeMode
                ? `Merging ${selectedIds.length} ${
                    selectedIds.length === 1 ? "memory" : "memories"
                  }`
                : selectMode
                  ? `Selecting ${selectedIds.length} ${
                      selectedIds.length === 1 ? "memory" : "memories"
                    }`
                  : viewArchived
                    ? "Archived Memories"
                    : "Memories"}
            </p>
            <div className="flex items-center gap-2">
              {selectionMode ? (
                <>
                  {mergeMode && (
                    <button
                      type="button"
                      onClick={handleMergeConfirm}
                      disabled={selectedIds.length < 2 || mergeLoading}
                      className="inline-flex items-center gap-2 rounded-full bg-[#0f8b54] px-4 py-1.5 text-xs font-semibold text-white shadow-[0_8px_18px_rgba(0,0,0,0.22)] disabled:opacity-60"
                    >
                      {mergeLoading
                        ? "Merging..."
                        : `Merge (${selectedIds.length || 0})`}
                    </button>
                  )}
                  {selectMode && (
                    <button
                      type="button"
                      onClick={() => setBulkDeleteModalOpen(true)}
                      disabled={selectedIds.length === 0}
                      className="inline-flex items-center gap-2 rounded-full bg-danger px-4 py-1.5 text-xs font-semibold text-white shadow-[0_10px_20px_rgba(239,68,68,0.2)] disabled:opacity-60"
                    >
                      {selectedIds.length > 0
                        ? `Delete (${selectedIds.length})`
                        : "Delete"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={exitSelectionMode}
                    className="inline-flex items-center gap-2 rounded-full border border-border/80 px-4 py-1.5 text-xs font-semibold text-danger hover:border-danger/80"
                    disabled={mergeLoading}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <div className="relative" ref={filterMenuRef}>
                    <button
                      type="button"
                      onClick={() => setFilterMenuOpen((prev) => !prev)}
                      className={`inline-flex items-center gap-2 rounded-full border border-border/80 px-4 py-1.5 text-xs font-semibold ${
                        filtersApplied && activeFiltersCount > 0
                          ? "text-[#0f8b54] border-[#0f8b54]/40"
                          : "text-foreground/80"
                      } hover:border-foreground`}
                    >
                      <Filter className="w-3.5 h-3.5" />
                      Filter
                      {activeFiltersCount > 0 && (
                        <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-blue-50/70 dark:bg-[#1f1f1f] border border-blue-200/40 dark:border-[#2a2a2a] px-2 text-[11px] font-semibold text-foreground shadow-sm">
                          {activeFiltersCount}
                        </span>
                      )}
                    </button>
                    {filterMenuOpen && (
                      <div className="absolute right-0 top-12 z-20 w-72 rounded-2xl border border-border/70 bg-surface shadow-xl overflow-hidden flex flex-col max-h-[600px]">
                        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/60 bg-surface/95">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted">
                            Filters
                          </p>
                          <div className="flex items-center gap-2">
                            {activeFiltersCount > 0 && (
                              <button
                                type="button"
                                onClick={handleClearFilters}
                                className="text-[11px] font-semibold text-muted hover:text-foreground transition"
                                disabled={filterApplying}
                              >
                                Clear
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={handleApplyFilters}
                              disabled={filterApplying}
                              className="inline-flex items-center gap-1.5 rounded-full bg-[#0f8b54] px-3.5 py-1.5 text-[11px] font-semibold text-white shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              {filterApplying ? (
                                <>
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  Applying...
                                </>
                              ) : (
                                "Apply"
                              )}
                            </button>
                          </div>
                        </div>

                        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                          <details className="group rounded-xl border border-border/60 bg-surface/50 overflow-hidden">
                            <summary className="flex items-center justify-between gap-2 px-3 py-2.5 cursor-pointer list-none">
                              <div className="flex items-center gap-2">
                                <Clock className="w-3.5 h-3.5 text-muted" />
                                <span className="text-xs font-semibold text-foreground">
                                  Date
                                </span>
                                {selectedDateRange.start ||
                                selectedDateRange.end ? (
                                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#0f8b54]/10 text-[10px] font-semibold text-[#0f8b54]">
                                    1
                                  </span>
                                ) : null}
                              </div>
                              <ChevronDown className="w-3.5 h-3.5 text-muted transition-transform duration-200 group-open:rotate-180 flex-shrink-0" />
                            </summary>
                            <div className="px-3 pb-3 space-y-2.5 border-t border-border/60 pt-2.5">
                              <div className="flex flex-wrap gap-1.5">
                                {[
                                  { label: "Today", days: 0 },
                                  { label: "Yesterday", days: 1 },
                                  { label: "7 days", days: 6 },
                                  { label: "30 days", days: 29 },
                                ].map((preset) => {
                                  const today = new Date();
                                  const start = new Date(
                                    today.getFullYear(),
                                    today.getMonth(),
                                    today.getDate() - preset.days,
                                  );
                                  const end = new Date(
                                    today.getFullYear(),
                                    today.getMonth(),
                                    today.getDate(),
                                  );
                                  const isActive =
                                    selectedDateRange.start ===
                                      start.toISOString().split("T")[0] &&
                                    selectedDateRange.end ===
                                      end.toISOString().split("T")[0];
                                  return (
                                    <button
                                      key={preset.label}
                                      type="button"
                                      onClick={() =>
                                        setSelectedDateRange({
                                          start: start
                                            .toISOString()
                                            .split("T")[0],
                                          end: end.toISOString().split("T")[0],
                                        })
                                      }
                                      className={`rounded-full px-2.5 py-1 text-[10px] font-semibold border transition ${
                                        isActive
                                          ? "border-[#0f8b54] bg-[#0f8b54]/10 text-[#0f8b54]"
                                          : "border-border/60 text-muted hover:border-[#0f8b54]/50 hover:text-foreground"
                                      }`}
                                    >
                                      {preset.label}
                                    </button>
                                  );
                                })}
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <input
                                  type="date"
                                  value={selectedDateRange.start || ""}
                                  max={selectedDateRange.end || undefined}
                                  onChange={(e) =>
                                    setSelectedDateRange((prev) => ({
                                      ...prev,
                                      start: e.target.value || undefined,
                                    }))
                                  }
                                  className="w-full rounded-lg border border-border/60 bg-surface px-2.5 py-1.5 text-[11px] text-foreground placeholder-muted focus:outline-none focus:border-[#0f8b54] focus:ring-1 focus:ring-[#0f8b54]/20"
                                />
                                <input
                                  type="date"
                                  value={selectedDateRange.end || ""}
                                  min={selectedDateRange.start || undefined}
                                  onChange={(e) =>
                                    setSelectedDateRange((prev) => ({
                                      ...prev,
                                      end: e.target.value || undefined,
                                    }))
                                  }
                                  className="w-full rounded-lg border border-border/60 bg-surface px-2.5 py-1.5 text-[11px] text-foreground placeholder-muted focus:outline-none focus:border-[#0f8b54] focus:ring-1 focus:ring-[#0f8b54]/20"
                                />
                              </div>
                              {(metadataRange.min || metadataRange.max) && (
                                <p className="text-[10px] text-muted/80">
                                  Range:{" "}
                                  {metadataRange.min?.split("T")[0] ?? "–"} to{" "}
                                  {metadataRange.max?.split("T")[0] ?? "–"}
                                </p>
                              )}
                            </div>
                          </details>

                          <details className="group rounded-xl border border-border/60 bg-surface/50 overflow-hidden">
                            <summary className="flex items-center justify-between gap-2 px-3 py-2.5 cursor-pointer list-none">
                              <div className="flex items-center gap-2">
                                <FileText className="w-3.5 h-3.5 text-muted" />
                                <span className="text-xs font-semibold text-foreground">
                                  Domains
                                </span>
                                {selectedDomains.length > 0 && (
                                  <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/40 dark:border-slate-700/40 px-1.5 text-[10px] font-semibold text-foreground">
                                    {selectedDomains.length}
                                  </span>
                                )}
                              </div>
                              <ChevronDown className="w-3.5 h-3.5 text-muted transition-transform duration-200 group-open:rotate-180 flex-shrink-0" />
                            </summary>
                            <div className="px-3 pb-3 space-y-2 border-t border-border/60 pt-2.5">
                              {selectedDomains.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                  {selectedDomains.map((domain) => (
                                    <span
                                      key={domain}
                                      className="inline-flex items-center gap-1 rounded-full bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/40 dark:border-slate-700/40 px-2 py-0.5 text-[10px] font-semibold text-foreground shadow-sm"
                                    >
                                      {domain}
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setSelectedDomains((prev) =>
                                            prev.filter(
                                              (item) => item !== domain,
                                            ),
                                          )
                                        }
                                        className="hover:bg-slate-100/50 dark:hover:bg-slate-800/40 rounded-full p-0.5 transition"
                                      >
                                        <X className="w-2.5 h-2.5" />
                                      </button>
                                    </span>
                                  ))}
                                </div>
                              )}
                              <input
                                type="text"
                                value={domainSearch}
                                onChange={(e) =>
                                  setDomainSearch(e.target.value)
                                }
                                placeholder={
                                  availableDomains.length
                                    ? "Search domains..."
                                    : "No domains yet"
                                }
                                className="w-full rounded-lg border border-border/60 bg-surface px-2.5 py-1.5 text-[11px] text-foreground placeholder-muted focus:outline-none focus:border-[#0f8b54] focus:ring-1 focus:ring-[#0f8b54]/20"
                              />
                              <div className="max-h-28 overflow-y-auto space-y-0.5">
                                {filteredDomains.length === 0 ? (
                                  <div className="rounded-lg bg-surface/60 px-2.5 py-2 text-[10px] text-muted text-center">
                                    {domainSearch.trim()
                                      ? "No matches"
                                      : "None available"}
                                  </div>
                                ) : (
                                  filteredDomains.map((domain) => {
                                    const selected =
                                      selectedDomains.includes(domain);
                                    return (
                                      <button
                                        key={domain}
                                        type="button"
                                        onClick={() =>
                                          setSelectedDomains((prev) =>
                                            prev.includes(domain)
                                              ? prev.filter(
                                                  (item) => item !== domain,
                                                )
                                              : [...prev, domain],
                                          )
                                        }
                                        className={`w-full rounded-lg px-2.5 py-1.5 text-left text-[11px] transition ${
                                          selected
                                            ? "bg-[#0f8b54]/10 text-[#0f8b54] font-semibold"
                                            : "text-foreground hover:bg-surface/80"
                                        }`}
                                      >
                                        {domain}
                                      </button>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          </details>

                          <details className="group rounded-xl border border-border/60 bg-surface/50 overflow-hidden">
                            <summary className="flex items-center justify-between gap-2 px-3 py-2.5 cursor-pointer list-none">
                              <div className="flex items-center gap-2">
                                <Sparkles className="w-3.5 h-3.5 text-muted" />
                                <span className="text-xs font-semibold text-foreground">
                                  Topics
                                </span>
                                {selectedTopics.length > 0 && (
                                  <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-purple-50/70 dark:bg-[#1f1f1f] border border-purple-200/40 dark:border-[#2a2a2a] px-1.5 text-[10px] font-semibold text-foreground">
                                    {selectedTopics.length}
                                  </span>
                                )}
                              </div>
                              <ChevronDown className="w-3.5 h-3.5 text-muted transition-transform duration-200 group-open:rotate-180 flex-shrink-0" />
                            </summary>
                            <div className="px-3 pb-3 space-y-2 border-t border-border/60 pt-2.5">
                              {selectedTopics.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                  {selectedTopics.map((topic) => (
                                    <span
                                      key={topic}
                                      className="inline-flex items-center gap-1 rounded-full bg-purple-50/70 dark:bg-[#1f1f1f] border border-purple-200/40 dark:border-[#2a2a2a] px-2 py-0.5 text-[10px] font-semibold text-foreground shadow-sm"
                                    >
                                      {topic}
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setSelectedTopics((prev) =>
                                            prev.filter(
                                              (item) => item !== topic,
                                            ),
                                          )
                                        }
                                        className="hover:bg-purple-100/50 dark:hover:bg-[#2a2a2a] rounded-full p-0.5 transition"
                                      >
                                        <X className="w-2.5 h-2.5" />
                                      </button>
                                    </span>
                                  ))}
                                </div>
                              )}
                              <input
                                type="text"
                                value={topicSearch}
                                onChange={(e) => setTopicSearch(e.target.value)}
                                placeholder={
                                  availableTopics.length
                                    ? "Search topics..."
                                    : "No topics yet"
                                }
                                disabled={!availableTopics.length}
                                className="w-full rounded-lg border border-border/60 bg-surface px-2.5 py-1.5 text-[11px] text-foreground placeholder-muted focus:outline-none focus:border-[#0f8b54] focus:ring-1 focus:ring-[#0f8b54]/20 disabled:opacity-50"
                              />
                              <div className="max-h-28 overflow-y-auto space-y-0.5">
                                {filteredTopics.length === 0 ? (
                                  <div className="rounded-lg bg-surface/60 px-2.5 py-2 text-[10px] text-muted text-center">
                                    {topicSearch.trim()
                                      ? "No matches"
                                      : "None available"}
                                  </div>
                                ) : (
                                  filteredTopics.map((topic) => {
                                    const selected =
                                      selectedTopics.includes(topic);
                                    return (
                                      <button
                                        key={topic}
                                        type="button"
                                        onClick={() =>
                                          setSelectedTopics((prev) =>
                                            prev.includes(topic)
                                              ? prev.filter(
                                                  (item) => item !== topic,
                                                )
                                              : [...prev, topic],
                                          )
                                        }
                                        className={`w-full rounded-lg px-2.5 py-1.5 text-left text-[11px] transition ${
                                          selected
                                            ? "bg-[#0f8b54]/10 text-[#0f8b54] font-semibold"
                                            : "text-foreground hover:bg-surface/80"
                                        }`}
                                      >
                                        {topic}
                                      </button>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          </details>

                          <details className="group rounded-xl border border-border/60 bg-surface/50 overflow-hidden">
                            <summary className="flex items-center justify-between gap-2 px-3 py-2.5 cursor-pointer list-none">
                              <div className="flex items-center gap-2">
                                <UserPlus className="w-3.5 h-3.5 text-muted" />
                                <span className="text-xs font-semibold text-foreground">
                                  Participants
                                </span>
                                {selectedParticipants.length > 0 && (
                                  <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-blue-50/70 dark:bg-[#1f1f1f] border border-blue-200/40 dark:border-[#2a2a2a] px-1.5 text-[10px] font-semibold text-foreground">
                                    {selectedParticipants.length}
                                  </span>
                                )}
                              </div>
                              <ChevronDown className="w-3.5 h-3.5 text-muted transition-transform duration-200 group-open:rotate-180 flex-shrink-0" />
                            </summary>
                            <div className="px-3 pb-3 space-y-2 border-t border-border/60 pt-2.5">
                              {selectedParticipants.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                  {selectedParticipants.map((participant) => (
                                    <span
                                      key={participant}
                                      className="inline-flex items-center gap-1 rounded-full bg-blue-50/70 dark:bg-[#1f1f1f] border border-blue-200/40 dark:border-[#2a2a2a] px-2 py-0.5 text-[10px] font-semibold text-foreground shadow-sm"
                                    >
                                      {participant}
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setSelectedParticipants((prev) =>
                                            prev.filter(
                                              (item) => item !== participant,
                                            ),
                                          )
                                        }
                                        className="hover:bg-blue-100/50 dark:hover:bg-[#2a2a2a] rounded-full p-0.5 transition"
                                      >
                                        <X className="w-2.5 h-2.5" />
                                      </button>
                                    </span>
                                  ))}
                                </div>
                              )}
                              <input
                                type="text"
                                value={participantSearch}
                                onChange={(e) =>
                                  setParticipantSearch(e.target.value)
                                }
                                placeholder={
                                  availableParticipants.length
                                    ? "Search participants..."
                                    : "No participants yet"
                                }
                                disabled={!availableParticipants.length}
                                className="w-full rounded-lg border border-border/60 bg-surface px-2.5 py-1.5 text-[11px] text-foreground placeholder-muted focus:outline-none focus:border-[#0f8b54] focus:ring-1 focus:ring-[#0f8b54]/20 disabled:opacity-50"
                              />
                              <div className="max-h-28 overflow-y-auto space-y-0.5">
                                {filteredParticipants.length === 0 ? (
                                  <div className="rounded-lg bg-surface/60 px-2.5 py-2 text-[10px] text-muted text-center">
                                    {participantSearch.trim()
                                      ? "No matches"
                                      : "None available"}
                                  </div>
                                ) : (
                                  filteredParticipants.map((participant) => {
                                    const selected =
                                      selectedParticipants.includes(
                                        participant,
                                      );
                                    return (
                                      <button
                                        key={participant}
                                        type="button"
                                        onClick={() =>
                                          setSelectedParticipants((prev) =>
                                            prev.includes(participant)
                                              ? prev.filter(
                                                  (item) =>
                                                    item !== participant,
                                                )
                                              : [...prev, participant],
                                          )
                                        }
                                        className={`w-full rounded-lg px-2.5 py-1.5 text-left text-[11px] transition ${
                                          selected
                                            ? "bg-[#0f8b54]/10 text-[#0f8b54] font-semibold"
                                            : "text-foreground hover:bg-surface/80"
                                        }`}
                                      >
                                        {participant}
                                      </button>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          </details>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="relative" ref={actionsMenuRef}>
                    <button
                      type="button"
                      onClick={() => setActionsMenuOpen((prev) => !prev)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted hover:text-foreground hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f8b54]/30"
                      aria-label="Open memories actions"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                    {actionsMenuOpen && (
                      <div className="absolute right-0 top-11 z-20 w-52 rounded-2xl border border-[#d0d0d0] dark:border-border/80 bg-surface shadow-[0_12px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_30px_rgba(0,0,0,0.35)] p-1.5">
                        {[
                          {
                            label: "Select memories",
                            icon: CheckCircle2,
                            action: () => {
                              setMode("select");
                              setSelectedIds([]);
                            },
                          },
                          {
                            label: "Merge memories",
                            icon: GitMerge,
                            action: () => {
                              setMode("merge");
                              setSelectedIds([]);
                            },
                          },
                          {
                            label: viewArchived
                              ? "View active"
                              : "View archived",
                            icon: Archive,
                            action: toggleArchivedView,
                          },
                        ].map((item) => {
                          const Icon = item.icon;
                          return (
                            <button
                              key={item.label}
                              type="button"
                              onClick={() => {
                                setActionsMenuOpen(false);
                                item.action();
                              }}
                              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-foreground hover:bg-surface/80"
                            >
                              <Icon className="w-4 h-4 text-muted" />
                              {item.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
          {hasSearchResults && (
            <div className="flex items-center rounded-2xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground/90">
              {searchResults.length}{" "}
              {searchResults.length === 1 ? "Memory" : "Memories"} found
            </div>
          )}
          {groupedMemories.map((group, index) => (
            <div
              key={group.key}
              className={`space-y-3 ${index > 0 ? "pt-6" : ""}`}
            >
              {(() => {
                const groupIds = group.items.map((item) => item.id);
                const selectedCount = groupIds.filter((id) =>
                  selectedIds.includes(id),
                ).length;
                const allSelected =
                  selectedCount === groupIds.length && groupIds.length > 0;

                if (submittedSearchQuery.length > 0) {
                  return null;
                }

                return (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">
                      {group.label}
                    </p>
                    {selectionMode && (
                      <button
                        type="button"
                        onClick={() => handleToggleGroupSelection(groupIds)}
                        className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-muted transition ${
                          groupIds.length === 0
                            ? "opacity-40 cursor-not-allowed"
                            : ""
                        } ${
                          allSelected
                            ? "bg-[#0f8b54]/10 text-[#0f8b54]"
                            : "hover:bg-surface/80 hover:text-foreground"
                        }`}
                        aria-label={`Toggle select all memories from ${group.label}`}
                        title="Select all in this group"
                        disabled={groupIds.length === 0}
                      >
                        {allSelected ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : (
                          <Circle className="h-4 w-4" />
                        )}
                      </button>
                    )}
                  </div>
                );
              })()}
              <div className="grid grid-cols-1 gap-4">
                {group.items.map((memory) => (
                  <MemoryCard
                    key={memory.id}
                    memory={memory}
                    onSelect={() => setSelectedMemory(memory)}
                    selectionMode={selectionMode}
                    selected={selectedIds.includes(memory.id)}
                    onToggleSelect={() => handleSelectMemory(memory.id)}
                    highlightQuery={submittedSearchQuery || undefined}
                  />
                ))}
              </div>
            </div>
          ))}
          <div
            ref={loadMoreRef}
            className="flex items-center justify-center py-4"
          >
            {!isSearchMode && loading && hasMore && memories.length > 0 && (
              <Loader2 className="h-5 w-5 animate-spin text-[#0f8b54]" />
            )}
            {isSearchMode &&
              searchVisibleCount < searchResults.length &&
              searchLoadingMore && (
                <Loader2 className="h-5 w-5 animate-spin text-[#0f8b54]" />
              )}
          </div>
        </div>
      </div>
      {selectionMode && selectedIds.length > 0 && (
        <MemoryChatInterface
          key={`bulk-chat-${selectedChatKey || "none"}`}
          memoryId={selectedIds[0]}
          memoryIds={selectedIds}
          memoryTitle={`${selectedIds.length} selected ${
            selectedIds.length === 1 ? "memory" : "memories"
          }`}
          placeholder={
            selectedIds.length === 1
              ? "Ask Neo about this selected memory"
              : "Ask Neo about selected memories"
          }
          quickPrompts={[
            {
              label: "Summarize",
              value: "Summarize the selected memories",
              icon: FileText,
            },
            {
              label: "Get action items",
              value: "List action items from the selected memories",
              icon: ListChecks,
            },
          ]}
        />
      )}
      {editingMemory && (
        <EditNotesModal
          memory={editingMemory}
          onClose={() => setEditingMemory(null)}
          onSave={(memoryId, updatedNotes) => {
            setMemories((prev) =>
              prev.map((record) =>
                record.id === memoryId
                  ? {
                      ...record,
                      mom: updatedNotes,
                      summary: updatedNotes,
                    }
                  : record,
              ),
            );
            if (selectedMemoryFull && selectedMemoryFull.id === memoryId) {
              setSelectedMemoryFull({
                ...selectedMemoryFull,
                mom: updatedNotes,
                summary: updatedNotes,
              });
            }
            setSelectedMemory((prev) => {
              if (prev && prev.id === memoryId) {
                return {
                  ...prev,
                  mom: updatedNotes,
                  summary: updatedNotes,
                };
              }
              return prev;
            });
            toast({
              title: "Notes updated",
              description: "Changes saved for this memory.",
            });
            setEditingMemory(null);
          }}
        />
      )}
      {shareMemory && (
        <ShareMemoryModal
          memory={shareMemory}
          onClose={() => setShareMemory(null)}
        />
      )}
      {bulkDeleteModalOpen && selectMode && (
        <BulkDeleteModal
          ids={selectedIds}
          onClose={() => setBulkDeleteModalOpen(false)}
          onDeleted={(deletedIds) => {
            setMemories((prev) =>
              prev.filter((record) => !deletedIds.includes(record.id)),
            );
            setBulkDeleteModalOpen(false);
            exitSelectionMode();
          }}
        />
      )}
      {memoryToDelete && (
        <DeleteMemoryModal
          memory={memoryToDelete}
          onClose={() => setMemoryToDelete(null)}
          onDeleted={(memoryId) => {
            setMemories((prev) =>
              prev.filter((record) => record.id !== memoryId),
            );
            setMemoryToDelete(null);
          }}
        />
      )}
    </SectionShell>
  );
}

/**
 * Memory card component displaying memory preview with highlighting.
 * Supports selection mode for bulk operations and search query highlighting.
 */
function MemoryCard({
  memory,
  onSelect,
  selectionMode,
  selected,
  onToggleSelect,
  highlightQuery,
}: {
  memory: MemoryRecord;
  onSelect: () => void;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  highlightQuery?: string;
}) {
  const title = memory.title?.trim() || "Untitled Memory";
  const primaryText =
    memory.summary?.trim() ||
    memory.mom?.trim() ||
    "We couldn't capture a summary for this memory.";
  const createdMeta = buildMemoryMeta(memory);
  const matchedTopic = highlightQuery
    ? memory.topics?.find((topic) =>
        topic.trim().toLowerCase().includes(highlightQuery.toLowerCase()),
      )
    : undefined;
  const matchedParticipant = highlightQuery
    ? (memory.entities ?? memory.participants ?? []).find((entity) =>
        entity.trim().toLowerCase().includes(highlightQuery.toLowerCase()),
      )
    : undefined;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        if (selectionMode) {
          onToggleSelect();
        } else {
          onSelect();
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (selectionMode) {
            onToggleSelect();
          } else {
            onSelect();
          }
        }
      }}
      className={`relative cursor-pointer rounded-3xl border ${
        selected ? "border-[#0f8b54]" : "border-[#d0d0d0] dark:border-border/60"
      } bg-surface/95 p-5 text-left transition hover:border-[#0f8b54] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0f8b54]/30`}
    >
      {selectionMode && (
        <div className="absolute top-4 right-4">
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-full ${
              selected ? "text-[#0f8b54]" : "text-muted"
            }`}
          >
            {selected ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <Circle className="h-4 w-4" />
            )}
          </span>
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>{createdMeta}</span>
          {memory.is_merged && <MergedBadge />}
          {memory.tasks_count != null && memory.tasks_count > 0 && (
            <ReminderBadge count={memory.tasks_count} />
          )}
        </div>
      </div>
      <h3 className="text-base font-semibold text-foreground">
        {highlightQuery ? highlightText(title, highlightQuery) : title}
      </h3>
      <p className="mt-2 text-sm text-muted/90 leading-relaxed line-clamp-3">
        {highlightQuery
          ? highlightText(primaryText, highlightQuery, "text-muted/90")
          : primaryText}
      </p>
      {(matchedTopic || matchedParticipant) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {matchedTopic && (
            <span className="inline-flex items-center rounded-full bg-[#5F4396]/20 px-2 py-0.5 text-xs text-[#5F4396]">
              {highlightQuery
                ? highlightText(matchedTopic, highlightQuery)
                : matchedTopic}
            </span>
          )}
          {matchedParticipant && (
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${
                highlightQuery
                  ? "bg-[#5F4396] text-white border border-[#5F4396] shadow-sm"
                  : "bg-[#5F4396]/20 text-[#5F4396]"
              }`}
            >
              {matchedParticipant}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Detailed memory view modal with tabs (summary/reminders).
 * Features: edit title, add participants/topics, view transcript, share, manage reminders.
 */
function MemoryDetailView({
  memory,
  onEdit,
  onMemoryUpdate,
  onOpenMemory,
  availableTopics = [],
  availableParticipants = [],
}: {
  memory: MemoryRecord;
  onEdit: (memory: MemoryRecord) => void;
  onMemoryUpdate?: (updatedMemory: MemoryRecord) => void;
  onOpenMemory?: (memoryId: string) => void;
  availableTopics?: string[];
  availableParticipants?: string[];
}) {
  const [activeTab, setActiveTab] = useState<"summary" | "reminders">(
    "summary",
  );
  const { toast } = useToast();
  const [memoryReminders, setMemoryReminders] = useState<Task[]>([]);
  const [remindersInitialized, setRemindersInitialized] = useState(false);
  const [createReminderModalOpen, setCreateReminderModalOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Task | null>(null);
  const [addParticipantModalOpen, setAddParticipantModalOpen] = useState(false);
  const [addTopicModalOpen, setAddTopicModalOpen] = useState(false);
  const [shareMoMMenuOpen, setShareMoMMenuOpen] = useState(false);
  const [shareRemindersMenuOpen, setShareRemindersMenuOpen] = useState(false);
  const [localMemory, setLocalMemory] = useState<MemoryRecord>(memory);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [transcriptModalOpen, setTranscriptModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [domainDropdownOpen, setDomainDropdownOpen] = useState(false);
  const [selectedBrainstormQuestion, setSelectedBrainstormQuestion] = useState<
    string | undefined
  >(undefined);
  const shareMoMMenuRef = useRef<HTMLDivElement | null>(null);
  const shareRemindersMenuRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const domainDropdownRef = useRef<HTMLDivElement | null>(null);

  const title = localMemory.title?.trim() || "Untitled Memory";
  const momText = localMemory.mom?.trim();

  const metadata = buildMemoryMeta(localMemory);
  const topics = localMemory.topics || [];

  const brainstormCardClass =
    "flex-shrink-0 min-w-[220px] max-w-xs rounded-2xl border border-[#d0d0d0] dark:border-[#404040] bg-surface px-3.5 py-3 text-left text-sm font-medium text-foreground shadow-sm transition hover:border-[#0f8b54] focus:outline-none whitespace-normal break-words";

  const loadMemoryReminders = useCallback(async () => {
    try {
      const { groupedTasks, nonMemoryTasks } = await getTasks();
      const linked: Task[] = [];
      const seen = new Set<string>();
      const normalize = (value?: string) =>
        value ? value.toLowerCase().trim() : "";
      const memoryId = normalize(memory.id);

      const pushTask = (task: Task) => {
        if (!task?.id || seen.has(task.id)) return;
        linked.push(task);
        seen.add(task.id);
      };

      const taskMatchesMemory = (task: Task) => {
        if (!memoryId || !task) return false;
        const detailsMatch = task.memory_details?.some(
          (detail) => normalize(detail.id) === memoryId,
        );
        const sourceMatch = task.source_memory_ids?.some(
          (id) => normalize(id) === memoryId,
        );
        return detailsMatch || sourceMatch;
      };

      groupedTasks.forEach((group) => {
        const groupMatches =
          memoryId && normalize(group.memory_id) === memoryId;
        group.tasks.forEach((task) => {
          if (groupMatches) {
            pushTask(task);
            return;
          }
          if (taskMatchesMemory(task)) {
            pushTask(task);
          }
        });
      });

      nonMemoryTasks.forEach((task) => {
        if (taskMatchesMemory(task)) {
          pushTask(task);
        }
      });

      setMemoryReminders(linked);
      setRemindersInitialized(true);
    } catch (error: any) {
      toast({
        title: "Unable to load reminders",
        description: error?.message || "Try again.",
        variant: "destructive",
      });
    }
  }, [memory.id, toast]);

  useEffect(() => {
    if (activeTab === "reminders" && !remindersInitialized) {
      loadMemoryReminders();
    }
  }, [activeTab, remindersInitialized, loadMemoryReminders]);

  const handleCreateLinkedReminder = async (reminder: {
    title: string;
    dueDate: string;
    description: string;
    important: boolean;
  }) => {
    const safeTitle = reminder.title.trim();
    const safeDescription = reminder.description.trim();
    try {
      await createTask({
        task_name: safeTitle,
        details: safeDescription ? safeDescription : undefined,
        priority: "medium",
        due_date: reminder.dueDate || undefined,
        important: reminder.important,
        source_memory_ids: [memory.id],
      });
      toast({
        title: "Reminder created",
        description: `Linked to "${title}".`,
      });
      await loadMemoryReminders();
    } catch (error: any) {
      toast({
        title: "Unable to create reminder",
        description: error?.message || "Try again.",
        variant: "destructive",
      });
    }
  };

  const handleUpdateReminder = async (reminder: {
    title: string;
    dueDate: string;
    description: string;
    important: boolean;
  }) => {
    if (!editingReminder) return;

    const safeTitle = reminder.title.trim();
    const safeDescription = reminder.description.trim();
    try {
      await updateTask({
        id: editingReminder.id,
        task_name: safeTitle,
        details: safeDescription ? safeDescription : undefined,
        due_date: reminder.dueDate || undefined,
        important: reminder.important,
      });
      toast({
        title: "Reminder updated",
        description: "Changes saved for this reminder.",
      });
      setEditingReminder(null);
      await loadMemoryReminders();
    } catch (error: any) {
      toast({
        title: "Unable to update reminder",
        description: error?.message || "Try again.",
        variant: "destructive",
      });
    }
  };

  const handleToggleReminderStatus = async (task: Task) => {
    const newStatus: TaskStatus =
      task.status === "completed" ? "pending" : "completed";
    const completedAt =
      newStatus === "completed" ? new Date().toISOString() : undefined;

    setMemoryReminders((prev) =>
      prev.map((reminder) =>
        reminder.id === task.id
          ? { ...reminder, status: newStatus, completed_at: completedAt }
          : reminder,
      ),
    );

    try {
      await updateTask({
        id: task.id,
        status: newStatus,
        completed_at: completedAt,
      });
    } catch (error: any) {
      setMemoryReminders((prev) =>
        prev.map((reminder) => (reminder.id === task.id ? task : reminder)),
      );
      toast({
        title: "Unable to update reminder",
        description: error?.message || "Try again.",
        variant: "destructive",
      });
    }
  };

  const handleToggleReminderImportant = async (task: Task) => {
    const newImportant = !task.important;

    setMemoryReminders((prev) =>
      prev.map((reminder) =>
        reminder.id === task.id
          ? { ...reminder, important: newImportant }
          : reminder,
      ),
    );

    try {
      await updateTask({
        id: task.id,
        important: newImportant,
      });
    } catch (error: any) {
      setMemoryReminders((prev) =>
        prev.map((reminder) => (reminder.id === task.id ? task : reminder)),
      );
      toast({
        title: "Unable to update reminder",
        description: error?.message || "Try again.",
        variant: "destructive",
      });
    }
  };

  const formatReminderDueDate = (dueDate?: string) => {
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

  const handleDeleteTopic = async (topicToDelete: string) => {
    const updatedTopics = (localMemory.topics || []).filter(
      (t) => t !== topicToDelete,
    );

    setLocalMemory({
      ...localMemory,
      topics: updatedTopics,
    });

    try {
      await updateMemory({
        memory_id: localMemory.id,
        mom: localMemory.mom || "",
        entities: localMemory.entities || [],
        title: localMemory.title || "",
        tags: localMemory.tags || [],
        topics: updatedTopics,
        domain: localMemory.domain || "",
        summary: localMemory.summary || "",
        should_detect_corrections: false,
        correction_to_save: [],
      });

      const { records } = await getMemoriesByIds({
        memoryIds: [localMemory.id],
        pageSize: 1,
      });
      if (records[0]) {
        setLocalMemory(records[0]);
        onMemoryUpdate?.(records[0]);
      }

      toast({
        title: "Topic removed",
        description: `"${topicToDelete}" has been removed.`,
      });
    } catch (error: any) {
      setLocalMemory(memory);
      toast({
        title: "Unable to remove topic",
        description: error?.message || "Try again.",
        variant: "destructive",
      });
    }
  };

  const handleUpdateDomain = async (newDomain: string) => {
    if (newDomain === localMemory.domain) {
      setDomainDropdownOpen(false);
      return;
    }

    setLocalMemory({
      ...localMemory,
      domain: newDomain,
    });

    try {
      await updateMemory({
        memory_id: localMemory.id,
        mom: localMemory.mom || "",
        entities: localMemory.entities || [],
        title: localMemory.title || "",
        tags: localMemory.tags || [],
        topics: localMemory.topics || [],
        domain: newDomain,
        summary: localMemory.summary || "",
        should_detect_corrections: false,
        correction_to_save: [],
      });

      const { records } = await getMemoriesByIds({
        memoryIds: [localMemory.id],
        pageSize: 1,
      });
      if (records[0]) {
        setLocalMemory(records[0]);
        onMemoryUpdate?.(records[0]);
      }

      toast({
        title: "Domain updated",
        description: `Domain set to "${newDomain}".`,
      });
      setDomainDropdownOpen(false);
    } catch (error: any) {
      setLocalMemory(memory);
      toast({
        title: "Unable to update domain",
        description: error?.message || "Try again.",
        variant: "destructive",
      });
    }
  };

  const commonDomains = [
    "Accounting",
    "Admin",
    "AI & ML",
    "Business Strategy",
    "Career",
    "Casual / Social",
    "Client Relations",
    "Content Creation",
    "Corporate Finance",
    "Counseling & Therapy",
    "Data & Analytics",
    "Education",
    "Entrepreneurship",
    "Event Management",
    "Family",
    "Food & Beverage",
    "Fundraising",
    "Hardware",
    "Health & Wellness",
    "Healthcare",
    "Hobbies",
    "Household",
    "Investment",
    "Journaling",
    "Legal & Compliance",
    "Lifestyle",
    "Manufacturing",
    "Marketing",
    "Mentorship",
    "Networking",
    "Operations",
    "Parenting",
    "Partnerships",
    "Personal Development",
    "Personal Finance",
    "Philosophy",
    "Product Management",
    "Project Management",
    "Real Estate",
    "Recruitment",
    "Religion & Spirituality",
    "Reminders",
    "Sales",
    "Self Note",
    "Software Development",
    "Supply Chain",
    "Teaching & Training",
    "Team Management",
    "Travel",
    "UI/UX Design",
    "Others",
  ];

  const handleAddTopic = async (topicName: string) => {
    const trimmedName = topicName.trim();
    if (!trimmedName) return;

    const currentTopics = localMemory.topics || [];

    if (
      currentTopics.some((t) => t.toLowerCase() === trimmedName.toLowerCase())
    ) {
      toast({
        title: "Topic already exists",
        description: `"${trimmedName}" is already added to this memory.`,
        variant: "destructive",
      });
      return;
    }

    const updatedTopics = [...currentTopics, trimmedName];

    setLocalMemory({
      ...localMemory,
      topics: updatedTopics,
    });

    try {
      await updateMemory({
        memory_id: localMemory.id,
        mom: localMemory.mom || "",
        entities: localMemory.entities || [],
        title: localMemory.title || "",
        tags: localMemory.tags || [],
        topics: updatedTopics,
        domain: localMemory.domain || "",
        summary: localMemory.summary || "",
        should_detect_corrections: false,
        correction_to_save: [],
      });

      const { records } = await getMemoriesByIds({
        memoryIds: [localMemory.id],
        pageSize: 1,
      });
      if (records[0]) {
        setLocalMemory(records[0]);
        onMemoryUpdate?.(records[0]);
      }

      toast({
        title: "Topic added",
        description: `"${trimmedName}" has been added.`,
      });
      setAddTopicModalOpen(false);
    } catch (error: any) {
      setLocalMemory(memory);
      toast({
        title: "Unable to add topic",
        description: error?.message || "Try again.",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    setLocalMemory(memory);
    setEditedTitle(memory.title?.trim() || "");
  }, [memory]);

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  useEffect(() => {
    if (!domainDropdownOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (
        domainDropdownRef.current &&
        !domainDropdownRef.current.contains(event.target as Node)
      ) {
        setDomainDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [domainDropdownOpen]);

  const handleStartEditTitle = () => {
    setEditedTitle(localMemory.title?.trim() || "");
    setIsEditingTitle(true);
  };

  const handleCancelEditTitle = () => {
    setEditedTitle(localMemory.title?.trim() || "");
    setIsEditingTitle(false);
  };

  const handleSaveTitle = async () => {
    const trimmedTitle = editedTitle.trim();
    if (!trimmedTitle) {
      toast({
        title: "Title required",
        description: "Enter a title for this memory.",
        variant: "destructive",
      });
      return;
    }

    if (trimmedTitle === localMemory.title?.trim()) {
      setIsEditingTitle(false);
      return;
    }

    setLocalMemory({
      ...localMemory,
      title: trimmedTitle,
    });

    try {
      const payload = {
        memory_id: localMemory.id,
        mom: localMemory.mom || "",
        entities: localMemory.entities || [],
        title: trimmedTitle,
        tags: localMemory.tags || [],
        topics: localMemory.topics || [],
        domain: localMemory.domain || "",
        summary: localMemory.summary || "",
        should_detect_corrections: false,
        correction_to_save: [],
      } as any;

      await updateMemory(payload);

      const { records } = await getMemoriesByIds({
        memoryIds: [localMemory.id],
        pageSize: 1,
      });
      if (records[0]) {
        setLocalMemory(records[0]);
        onMemoryUpdate?.(records[0]);
      }

      toast({
        title: "Title updated",
        description: "Memory title has been updated.",
      });
      setIsEditingTitle(false);
    } catch (error: any) {
      setLocalMemory(memory);
      toast({
        title: "Unable to update title",
        description: error?.message || "Try again.",
        variant: "destructive",
      });
    }
  };

  const allParticipants = (localMemory.entities || []).filter(
    (p) => p && p.trim(),
  );

  const handleRemoveParticipant = async (participantToRemove: string) => {
    const updatedEntities = (localMemory.entities || []).filter(
      (p) => p !== participantToRemove,
    );

    setLocalMemory({
      ...localMemory,
      entities: updatedEntities,
    });

    try {
      await updateMemory({
        memory_id: localMemory.id,
        mom: localMemory.mom || "",
        entities: updatedEntities,
        title: localMemory.title || "",
        tags: localMemory.tags || [],
        topics: localMemory.topics || [],
        domain: localMemory.domain || "",
        summary: localMemory.summary || "",
        should_detect_corrections: false,
        correction_to_save: [],
      });

      const { records } = await getMemoriesByIds({
        memoryIds: [localMemory.id],
        pageSize: 1,
      });
      if (records[0]) {
        setLocalMemory(records[0]);
        onMemoryUpdate?.(records[0]);
      }

      toast({
        title: "Participant removed",
        description: `"${participantToRemove}" has been removed.`,
      });
    } catch (error: any) {
      setLocalMemory(memory);
      toast({
        title: "Unable to remove participant",
        description: error?.message || "Try again.",
        variant: "destructive",
      });
    }
  };

  const handleAddParticipant = async (participantName: string) => {
    const trimmedName = participantName.trim();
    if (!trimmedName) return;

    if (
      allParticipants.some((p) => p.toLowerCase() === trimmedName.toLowerCase())
    ) {
      toast({
        title: "Participant already exists",
        description: `"${trimmedName}" is already added to this memory.`,
        variant: "destructive",
      });
      return;
    }

    const updatedEntities = [trimmedName, ...(localMemory.entities || [])];

    setLocalMemory({
      ...localMemory,
      entities: updatedEntities,
    });

    try {
      await updateMemory({
        memory_id: localMemory.id,
        mom: localMemory.mom || "",
        entities: updatedEntities,
        title: localMemory.title || "",
        tags: localMemory.tags || [],
        topics: localMemory.topics || [],
        domain: localMemory.domain || "",
        summary: localMemory.summary || "",
        should_detect_corrections: false,
        correction_to_save: [],
      });

      const { records } = await getMemoriesByIds({
        memoryIds: [localMemory.id],
        pageSize: 1,
      });
      if (records[0]) {
        const refreshedMemory = records[0];
        setLocalMemory(refreshedMemory);
        onMemoryUpdate?.(refreshedMemory);
      }

      toast({
        title: "Participant added",
        description: `"${trimmedName}" has been added.`,
      });
      setAddParticipantModalOpen(false);
    } catch (error: any) {
      setLocalMemory(memory);
      toast({
        title: "Unable to add participant",
        description: error?.message || "Try again.",
        variant: "destructive",
      });
    }
  };

  const handleCopyMoM = () => {
    const signature = "\n\nCreated by Neo AI\nhttps://neosapien.xyz";
    const momContent = getMoMContent();
    if (!momContent) {
      toast({
        title: "No content available",
        description: "There is nothing to copy.",
        variant: "destructive",
      });
      return;
    }
    const titleSection = localMemory.title
      ? `${localMemory.title.trim()}\n\n`
      : "";
    const plainText = stripMarkdownToPlainText(momContent);
    const textContent = `${titleSection}${plainText}`.trim();
    navigator.clipboard.writeText(`${textContent}${signature}`);
    toast({
      title: "Copied to clipboard",
      description: "Content ready to share.",
    });
  };

  const handleShareMoM = () => {
    setShareMoMMenuOpen((prev) => !prev);
  };

  const handleCopyMarkdownMoM = async () => {
    const signature = "\n\nCreated by Neo AI\nhttps://neosapien.xyz";
    const markdown = formatMoMAsMarkdown();
    if (!markdown) {
      toast({
        title: "No content available",
        description: "There is nothing to copy.",
        variant: "destructive",
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(`${markdown}${signature}`);
      toast({
        title: "Markdown copied",
        description: "Summary copied with formatting.",
      });
    } catch (error) {
      toast({
        title: "Unable to copy",
        description: "Please try again or copy manually.",
        variant: "destructive",
      });
    }
    setShareMoMMenuOpen(false);
  };

  const handleShareMoMToX = () => {
    const momContent = getMoMContent();
    if (!momContent) {
      toast({
        title: "No content available",
        description: "There is nothing to share.",
        variant: "destructive",
      });
      return;
    }

    const plainText = stripMarkdownToPlainText(momContent);
    const prefix = localMemory.title ? `${localMemory.title} — ` : "";
    const tweetText = truncateForX(`${prefix}${plainText}`.trim());
    const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
      tweetText,
    )}`;
    window.open(xUrl, "_blank");
    toast({
      title: "Opening X",
      description: "Share summary on X.",
    });
    setShareMoMMenuOpen(false);
  };

  useEffect(() => {
    if (!shareMoMMenuOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (
        shareMoMMenuRef.current &&
        !shareMoMMenuRef.current.contains(event.target as Node)
      ) {
        setShareMoMMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [shareMoMMenuOpen]);

  useEffect(() => {
    if (!shareRemindersMenuOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (
        shareRemindersMenuRef.current &&
        !shareRemindersMenuRef.current.contains(event.target as Node)
      ) {
        setShareRemindersMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [shareRemindersMenuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const handleMenuAction = (action: string) => {
    setMenuOpen(false);
    switch (action) {
      case "show_transcript":
        setTranscriptModalOpen(true);
        break;
      case "edit_title":
        handleStartEditTitle();
        break;
      case "edit_summary":
        onEdit(localMemory);
        break;
      case "share_summary":
        handleShareMoM();
        break;
      case "share_reminders":
        if (activeTab !== "reminders") {
          setActiveTab("reminders");
          setTimeout(() => {
            setShareRemindersMenuOpen(true);
          }, 100);
        } else {
          handleShareReminders();
        }
        setMenuOpen(false);
        break;
    }
  };

  const getMoMContent = () =>
    (localMemory.mom?.trim() || localMemory.summary?.trim() || "").trim();

  const formatMoMAsMarkdown = () => {
    const momContent = getMoMContent();
    if (!momContent) return "";

    const titleSection = localMemory.title
      ? `# ${localMemory.title.trim()}\n\n`
      : "";
    const participantsSection =
      allParticipants.length > 0
        ? `**Participants:** ${allParticipants.join(", ")}\n\n`
        : "";

    return `${titleSection}${participantsSection}${momContent}`.trim();
  };

  const stripMarkdownToPlainText = (markdown: string) =>
    markdown
      .replace(/```[\s\S]*?```/g, "")
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/__(.*?)__/g, "$1")
      .replace(/\*(.*?)\*/g, "$1")
      .replace(/_(.*?)_/g, "$1")
      .replace(/`([^`]*)`/g, "$1")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/^>+\s?/gm, "")
      .replace(/^#+\s+/gm, "")
      .replace(/^\s*[-*+]\s+/gm, "• ")
      .trim();

  const truncateForX = (text: string, limit = 280) => {
    if (text.length <= limit) return text;
    return `${text.slice(0, limit - 1)}…`;
  };

  const formatRemindersAsText = (tasks: Task[]) => {
    if (tasks.length === 0) return "No reminders to share.";

    const pendingTasks = tasks.filter((task) => task.status !== "completed");
    const completedTasks = tasks.filter((task) => task.status === "completed");

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
    text += `Total: ${tasks.length} reminder${tasks.length !== 1 ? "s" : ""}\n`;
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

  const formatRemindersAsCSV = (tasks: Task[]) => {
    if (tasks.length === 0)
      return "CONTENT,DESCRIPTION,DATE,DEADLINE,IMPORTANT\n";

    const headers = "CONTENT,DESCRIPTION,DATE,DEADLINE,IMPORTANT\n";
    const rows = tasks.map((task) => {
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

  const handleCopyRemindersText = async () => {
    if (memoryReminders.length === 0) {
      toast({
        title: "No reminders available",
        description: "There are no reminders to copy.",
        variant: "destructive",
      });
      return;
    }

    const text = formatRemindersAsText(memoryReminders);
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied to clipboard",
        description: `${memoryReminders.length} reminder${
          memoryReminders.length !== 1 ? "s" : ""
        } copied.`,
      });
    } catch (error) {
      toast({
        title: "Unable to copy",
        description: "Please try again or copy manually.",
        variant: "destructive",
      });
    }
    setShareRemindersMenuOpen(false);
  };

  const handleWhatsAppShareReminders = () => {
    if (memoryReminders.length === 0) {
      toast({
        title: "No reminders available",
        description: "There are no reminders to share.",
        variant: "destructive",
      });
      return;
    }

    const text = formatRemindersAsText(memoryReminders);
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(whatsappUrl, "_blank");
    toast({
      title: "Opening WhatsApp",
      description: "Share reminders via WhatsApp.",
    });
    setShareRemindersMenuOpen(false);
  };

  const handleShareRemindersCSV = () => {
    if (memoryReminders.length === 0) {
      toast({
        title: "No reminders available",
        description: "There are no reminders to export.",
        variant: "destructive",
      });
      return;
    }

    const csv = formatRemindersAsCSV(memoryReminders);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reminders-${
      localMemory.title
        ?.toLowerCase()
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-+|-+$/g, "") || "memory"
    }-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({
      title: "CSV downloaded",
      description: `${memoryReminders.length} reminder${
        memoryReminders.length !== 1 ? "s" : ""
      } exported.`,
    });
    setShareRemindersMenuOpen(false);
  };

  const handleShareReminders = () => {
    setShareRemindersMenuOpen((prev) => !prev);
  };

  const handleShareRemindersToApps = async () => {
    if (memoryReminders.length === 0) {
      toast({
        title: "No reminders available",
        description: "There are no reminders to share.",
        variant: "destructive",
      });
      return;
    }

    if (!navigator.share) {
      toast({
        title: "Share unavailable",
        description: "Your device does not support sharing.",
        variant: "destructive",
      });
      return;
    }

    const text = formatRemindersAsText(memoryReminders);
    try {
      await navigator.share({
        title: localMemory.title || "Reminders",
        text,
      });
      toast({
        title: "Shared",
        description: "Sent using your installed apps.",
      });
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        toast({
          title: "Unable to share",
          description: "Try copying the text instead.",
          variant: "destructive",
        });
      }
    }
    setShareRemindersMenuOpen(false);
  };

  const handleShareRemindersToX = () => {
    if (memoryReminders.length === 0) {
      toast({
        title: "No reminders available",
        description: "There are no reminders to share.",
        variant: "destructive",
      });
      return;
    }

    const text = formatRemindersAsText(memoryReminders)
      .replace(/\s+/g, " ")
      .trim();
    const tweetText = truncateForX(text);
    const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
      tweetText,
    )}`;
    window.open(xUrl, "_blank");
    toast({
      title: "Opening X",
      description: "Share reminders on X.",
    });
    setShareRemindersMenuOpen(false);
  };

  const handleWhatsAppShareMoM = () => {
    const signature = "\n\nCreated by Neo AI\nhttps://neosapien.xyz";
    const momContent = getMoMContent();
    if (!momContent) {
      toast({
        title: "No content available",
        description: "There is nothing to share.",
        variant: "destructive",
      });
      return;
    }
    const titleSection = localMemory.title
      ? `${localMemory.title.trim()}\n\n`
      : "";
    const plainText = stripMarkdownToPlainText(momContent);
    const textContent = `${titleSection}${plainText}${signature}`.trim();
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(textContent)}`;
    window.open(whatsappUrl, "_blank");
    toast({
      title: "Opening WhatsApp",
      description: "Share content via WhatsApp.",
    });
    setShareMoMMenuOpen(false);
  };

  const handleCopyTextMoM = async () => {
    const signature = "\n\nCreated by Neo AI\nhttps://neosapien.xyz";
    const momContent = getMoMContent();
    if (!momContent) {
      toast({
        title: "No content available",
        description: "There is nothing to copy.",
        variant: "destructive",
      });
      return;
    }
    const titleSection = localMemory.title
      ? `${localMemory.title.trim()}\n\n`
      : "";
    const plainText = stripMarkdownToPlainText(momContent);
    const textContent = `${titleSection}${plainText}`.trim();
    try {
      await navigator.clipboard.writeText(`${textContent}${signature}`);
      toast({
        title: "Copied to clipboard",
        description: "Content ready to share.",
      });
    } catch (error) {
      toast({
        title: "Unable to copy",
        description: "Please try again or copy manually.",
        variant: "destructive",
      });
    }
    setShareMoMMenuOpen(false);
  };

  const handleShareToAppsMoM = async () => {
    const momText =
      localMemory.mom?.trim() ||
      localMemory.summary?.trim() ||
      "No content available.";

    if (!navigator.share) {
      toast({
        title: "Share unavailable",
        description: "Your device does not support sharing.",
        variant: "destructive",
      });
      return;
    }

    try {
      await navigator.share({
        title: localMemory.title || "Memory",
        text: momText,
      });
      toast({
        title: "Shared",
        description: "Sent using your installed apps.",
      });
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        toast({
          title: "Unable to share",
          description: "Try copying the text instead.",
          variant: "destructive",
        });
      }
    }
    setShareMoMMenuOpen(false);
  };

  return (
    <>
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto pr-1 pb-8">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-muted">{metadata}</p>
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-1 text-muted hover:text-foreground transition"
              aria-label="More options"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-12 w-56 rounded-2xl border border-[#d0d0d0] dark:border-border/80 bg-surface shadow-[0_12px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_30px_rgba(0,0,0,0.35)] p-2 z-50">
                {localMemory.transcript &&
                  localMemory.transcript.length > 0 && (
                    <button
                      type="button"
                      onClick={() => handleMenuAction("show_transcript")}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-foreground hover:bg-surface/80 transition"
                    >
                      <Scroll className="h-4 w-4" />
                      <span>Show transcript</span>
                    </button>
                  )}
                <button
                  type="button"
                  onClick={() => handleMenuAction("edit_title")}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-foreground hover:bg-surface/80 transition"
                >
                  <Edit className="h-4 w-4" />
                  <span>Edit title</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleMenuAction("edit_summary")}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-foreground hover:bg-surface/80 transition"
                >
                  <FileText className="h-4 w-4" />
                  <span>Edit summary</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleMenuAction("share_summary")}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-foreground hover:bg-surface/80 transition"
                >
                  <Share2 className="h-4 w-4" />
                  <span>Share summary</span>
                </button>
                {localMemory.tasks_count != null &&
                  localMemory.tasks_count > 0 && (
                    <button
                      type="button"
                      onClick={() => handleMenuAction("share_reminders")}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-foreground hover:bg-surface/80 transition"
                    >
                      <ListChecks className="h-4 w-4" />
                      <span>Share reminders</span>
                    </button>
                  )}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          {isEditingTitle ? (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <input
                ref={titleInputRef}
                type="text"
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSaveTitle();
                  } else if (e.key === "Escape") {
                    handleCancelEditTitle();
                  }
                }}
                onBlur={handleSaveTitle}
                className="flex-1 text-2xl font-semibold text-foreground bg-transparent border-b-2 border-primary focus:outline-none focus:border-primary/80"
                placeholder="Enter title"
              />
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-semibold text-foreground">
                {title}
              </h2>
              <button
                type="button"
                onClick={handleStartEditTitle}
                className="p-1 text-muted hover:text-foreground transition"
                aria-label="Edit title"
              >
                <Edit className="h-4 w-4" />
              </button>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-6">
          <button
            type="button"
            onClick={() => setAddTopicModalOpen(true)}
            className="flex items-center justify-center h-7 w-7 rounded-full border border-border text-muted hover:text-foreground hover:border-foreground transition"
            aria-label="Add topic"
          >
            <Plus className="h-4 w-4" />
          </button>
          <div className="relative" ref={domainDropdownRef}>
            <button
              type="button"
              onClick={() => setDomainDropdownOpen(!domainDropdownOpen)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium border transition ${
                localMemory.domain
                  ? "bg-blue-500/10 text-blue-600 border-blue-500/30 dark:bg-[#1f1f1f] dark:text-foreground dark:border-[#2a2a2a]"
                  : "bg-surface border-border text-muted hover:text-foreground hover:border-foreground"
              }`}
            >
              {localMemory.domain || "Set domain"}
              <ChevronDown
                className={`h-3 w-3 transition-transform duration-200 ${domainDropdownOpen ? "rotate-180" : ""}`}
              />
            </button>
            {domainDropdownOpen && (
              <div className="absolute left-0 top-full mt-1 z-50 w-56 rounded-2xl border border-[#d0d0d0] dark:border-border/80 bg-surface shadow-[0_12px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_30px_rgba(0,0,0,0.35)] overflow-hidden">
                <div className="max-h-64 overflow-y-auto p-1">
                  <button
                    type="button"
                    onClick={() => handleUpdateDomain("")}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition ${
                      !localMemory.domain
                        ? "bg-[#0f8b54]/10 text-[#0f8b54] font-semibold"
                        : "text-foreground hover:bg-surface/80"
                    }`}
                  >
                    No domain
                  </button>
                  {commonDomains.map((domain) => (
                    <button
                      key={domain}
                      type="button"
                      onClick={() => handleUpdateDomain(domain)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition ${
                        localMemory.domain === domain
                          ? "bg-[#0f8b54]/10 text-[#0f8b54] font-semibold"
                          : "text-foreground hover:bg-surface/80"
                      }`}
                    >
                      {domain}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {topics.map((topic) => (
            <span
              key={topic}
              className="inline-flex items-center gap-1.5 rounded-full bg-purple-50/70 dark:bg-[#1f1f1f] border border-purple-200/40 dark:border-[#2a2a2a] px-3 py-1 text-[11px] font-medium text-foreground shadow-sm"
            >
              {topic}
              <button
                type="button"
                onClick={() => handleDeleteTopic(topic)}
                className="hover:bg-purple-100/50 dark:hover:bg-slate-700/40 rounded-full p-0.5 transition"
                aria-label={`Remove topic ${topic}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>

        <div className="flex items-center justify-center mb-6">
          <div className="inline-flex rounded-full border border-border/80 bg-surface p-1">
            {[
              { key: "summary" as const, label: "Summary" },
              { key: "reminders" as const, label: "Reminders" },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  activeTab === tab.key
                    ? "bg-[#0f8b54] text-white shadow-[0_8px_18px_rgba(0,0,0,0.22)]"
                    : "text-muted"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1">
          {activeTab === "summary" ? (
            <div className="space-y-6 pb-16">
              {!localMemory.archived && (
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-muted mb-3">
                    Brainstorm with Neo AI
                  </p>
                  <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                    {localMemory.questions &&
                    localMemory.questions.length > 0 ? (
                      localMemory.questions.map((question, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => {
                            setSelectedBrainstormQuestion(question);
                          }}
                          className={brainstormCardClass}
                        >
                          {question}
                        </button>
                      ))
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedBrainstormQuestion(
                            "Tell me more about this memory",
                          );
                        }}
                        className={brainstormCardClass}
                      >
                        Tell me more about this memory
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted">
                    Participants
                  </p>
                  <div className="flex items-center gap-2 relative">
                    <button
                      type="button"
                      onClick={() => onEdit(localMemory)}
                      className="p-1.5 text-muted hover:text-foreground transition"
                      aria-label="Edit notes"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={handleCopyMoM}
                      className="p-1.5 text-muted hover:text-foreground transition"
                      aria-label="Copy MoM"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={handleShareMoM}
                        className="p-1.5 text-muted hover:text-foreground transition"
                        aria-label="Share"
                      >
                        <CornerUpRight className="h-4 w-4" />
                      </button>
                      {shareMoMMenuOpen && (
                        <div
                          ref={shareMoMMenuRef}
                          className="absolute right-0 top-12 w-72 rounded-2xl border border-[#d0d0d0] dark:border-border/80 bg-surface shadow-[0_12px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_30px_rgba(0,0,0,0.35)] p-3 z-50"
                        >
                          <p className="text-[11px] uppercase tracking-[0.25em] text-muted mb-3">
                            Share Summary
                          </p>
                          <div className="grid grid-cols-3 gap-2">
                            <button
                              type="button"
                              onClick={handleWhatsAppShareMoM}
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
                              onClick={handleCopyTextMoM}
                              className="inline-flex flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-[12px] font-semibold text-foreground hover:bg-surface/80 transition text-center"
                              title="Copy MoM as text"
                            >
                              <Copy className="h-5 w-5" />
                              Copy text
                            </button>
                            <button
                              type="button"
                              onClick={handleShareToAppsMoM}
                              className="inline-flex flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-[12px] font-semibold text-foreground hover:bg-surface/80 transition text-center"
                              title="Share to apps"
                            >
                              <CornerUpRight className="h-5 w-5" />
                              Share to...
                            </button>
                            <button
                              type="button"
                              onClick={handleCopyMarkdownMoM}
                              className="inline-flex flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-[12px] font-semibold text-foreground hover:bg-surface/80 transition text-center"
                              title="Copy as Markdown"
                            >
                              <FileCode className="h-5 w-5" />
                              Copy markdown
                            </button>
                            <button
                              type="button"
                              onClick={handleShareMoMToX}
                              className="inline-flex flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-[12px] font-semibold text-foreground hover:bg-surface/80 transition text-center"
                              title="Post summary to X"
                            >
                              <Twitter className="h-5 w-5" />
                              Post to X
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {allParticipants.length > 0 ? (
                    allParticipants.map((participant) => (
                      <span
                        key={participant}
                        className="inline-flex items-center gap-1.5 rounded-full bg-blue-50/70 dark:bg-[#1f1f1f] border border-blue-200/40 dark:border-[#2a2a2a] px-3 py-1 text-[11px] font-medium text-foreground shadow-sm"
                      >
                        {participant}
                        <button
                          type="button"
                          onClick={() => handleRemoveParticipant(participant)}
                          className="hover:bg-blue-100/50 dark:hover:bg-slate-700/40 rounded-full p-0.5 transition"
                          aria-label={`Remove participant ${participant}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-muted">No participants</span>
                  )}
                  <button
                    type="button"
                    onClick={() => setAddParticipantModalOpen(true)}
                    className="flex items-center justify-center h-7 w-7 rounded-full border border-border text-muted hover:text-foreground hover:border-foreground transition"
                    aria-label="Add participant"
                  >
                    <UserPlus className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {momText && (
                <div>
                  <MarkdownText content={momText} />
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              {!remindersInitialized ? null : memoryReminders.length === 0 ? (
                <div className="flex min-h-[240px] flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-surface/50 px-6 py-10 text-center">
                  <div className="mb-4 flex items-center justify-center">
                    <CheckSquare className="h-7 w-7 text-[#0f8b54]" />
                  </div>
                  <p className="text-base font-semibold text-foreground">
                    No reminders found
                  </p>
                  <button
                    type="button"
                    onClick={() => setCreateReminderModalOpen(true)}
                    className="mt-6 inline-flex items-center justify-center rounded-full bg-[#0f8b54] px-6 py-2 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(0,0,0,0.24)] transition hover:bg-[#0d6b42]"
                  >
                    Create reminder
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-end gap-2 mb-2">
                    <button
                      type="button"
                      onClick={handleCopyRemindersText}
                      className="p-1.5 text-muted hover:text-foreground transition rounded-full hover:bg-surface/50"
                      aria-label="Copy reminders"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    <div className="relative" ref={shareRemindersMenuRef}>
                      <button
                        type="button"
                        onClick={handleShareReminders}
                        className="p-1.5 text-muted hover:text-foreground transition rounded-full hover:bg-surface/50"
                        aria-label="Share reminders"
                      >
                        <CornerUpRight className="h-4 w-4" />
                      </button>
                      {shareRemindersMenuOpen && (
                        <div className="absolute right-0 bottom-full mb-2 w-64 rounded-2xl border border-[#d0d0d0] dark:border-border/80 bg-surface/95 backdrop-blur-md shadow-[0_12px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_30px_rgba(0,0,0,0.35)] p-4 z-50">
                          <p className="text-xs font-semibold text-muted mb-3 uppercase tracking-wider">
                            Share Reminders
                          </p>
                          <div className="grid grid-cols-3 gap-2">
                            <button
                              type="button"
                              onClick={handleWhatsAppShareReminders}
                              className="inline-flex flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-[12px] font-semibold text-foreground hover:bg-surface/80 transition text-center"
                              title="Share via WhatsApp"
                            >
                              <svg
                                className="h-5 w-5"
                                fill="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                              </svg>
                              WhatsApp
                            </button>
                            <button
                              type="button"
                              onClick={handleCopyRemindersText}
                              className="inline-flex flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-[12px] font-semibold text-foreground hover:bg-surface/80 transition text-center"
                              title="Copy reminders as text"
                            >
                              <Copy className="h-5 w-5" />
                              Copy text
                            </button>
                            <button
                              type="button"
                              onClick={handleShareRemindersCSV}
                              className="inline-flex flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-[12px] font-semibold text-foreground hover:bg-surface/80 transition text-center"
                              title="Share as CSV"
                            >
                              <FileText className="h-5 w-5" />
                              Share CSV
                            </button>
                            <button
                              type="button"
                              onClick={handleShareRemindersToApps}
                              className="inline-flex flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-[12px] font-semibold text-foreground hover:bg-surface/80 transition text-center"
                              title="Share to apps"
                            >
                              <CornerUpRight className="h-5 w-5" />
                              Share to...
                            </button>
                            <button
                              type="button"
                              onClick={handleShareRemindersToX}
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
                  {memoryReminders.map((reminder) => {
                    const dueDateLabel = formatReminderDueDate(
                      reminder.due_date,
                    );
                    const isCompleted = reminder.status === "completed";

                    return (
                      <div
                        key={reminder.id}
                        onClick={() => setEditingReminder(reminder)}
                        className="group flex items-start gap-3 rounded-2xl bg-black/5 p-3 transition hover:bg-black/10 cursor-pointer"
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleReminderStatus(reminder);
                          }}
                          className="mt-0.5 shrink-0"
                          aria-label={
                            isCompleted
                              ? "Mark reminder as pending"
                              : "Mark reminder as complete"
                          }
                        >
                          {isCompleted ? (
                            <CheckCircle2 className="h-5 w-5 text-[#0f8b54]" />
                          ) : (
                            <Circle className="h-5 w-5 text-muted transition group-hover:text-[#0f8b54]" />
                          )}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-sm font-semibold leading-tight ${
                              isCompleted
                                ? "text-muted line-through"
                                : "text-foreground"
                            }`}
                          >
                            {reminder.task_name}
                          </p>
                          {reminder.details && (
                            <p className="mt-1 text-xs text-muted line-clamp-1">
                              {reminder.details}
                            </p>
                          )}
                          {dueDateLabel && (
                            <p className="mt-1 text-xs text-muted flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5 text-[#0f8b54]" />
                              {dueDateLabel}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleReminderImportant(reminder);
                          }}
                          className="shrink-0 mt-0.5"
                          aria-label={
                            reminder.important
                              ? "Remove from important"
                              : "Mark as important"
                          }
                        >
                          <Star
                            className={`h-5 w-5 transition ${
                              reminder.important
                                ? "fill-[#0f8b54] text-[#0f8b54]"
                                : "text-muted group-hover:text-[#0f8b54]"
                            }`}
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {activeTab === "summary" && (
        <MemoryChatInterface
          key={selectedBrainstormQuestion || "default"}
          memoryId={localMemory.id}
          memoryTitle={title}
          onOpenMemory={onOpenMemory}
          initialQuestion={selectedBrainstormQuestion}
        />
      )}
      {activeTab === "reminders" && (
        <button
          type="button"
          onClick={() => setCreateReminderModalOpen(true)}
          className="fixed bottom-6 right-6 z-[1050] flex h-14 w-14 items-center justify-center rounded-full bg-[#0f8b54] text-white hover:bg-[#0d7449] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f8b54]/40"
          aria-label="Create reminder"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}
      {createReminderModalOpen && (
        <CreateReminderModal
          onClose={() => setCreateReminderModalOpen(false)}
          onSave={handleCreateLinkedReminder}
          linkedMemoryTitle={title}
          containerClassName="z-[1100]"
        />
      )}
      {editingReminder && (
        <CreateReminderModal
          onClose={() => setEditingReminder(null)}
          onSave={handleUpdateReminder}
          defaultValues={{
            title: editingReminder.task_name,
            dueDate: editingReminder.due_date || "",
            description: editingReminder.details || "",
            important: editingReminder.important || false,
          }}
          containerClassName="z-[1100]"
        />
      )}
      {addParticipantModalOpen && (
        <AddParticipantModal
          onClose={() => setAddParticipantModalOpen(false)}
          onAdd={handleAddParticipant}
          existingParticipants={allParticipants}
          onRemoveExisting={handleRemoveParticipant}
          metadataOptions={availableParticipants}
        />
      )}
      {addTopicModalOpen && (
        <AddTopicModal
          onClose={() => setAddTopicModalOpen(false)}
          onAdd={handleAddTopic}
          existingTopics={localMemory.topics || []}
          onRemoveExisting={handleDeleteTopic}
          metadataOptions={availableTopics}
        />
      )}
      {transcriptModalOpen && (
        <TranscriptModal
          isOpen={transcriptModalOpen}
          onClose={() => setTranscriptModalOpen(false)}
          memory={localMemory}
        />
      )}
    </>
  );
}

/**
 * Modal for viewing and sharing memory transcript.
 * Formats transcript segments with speaker labels and provides copy/share functionality.
 */
function TranscriptModal({
  isOpen,
  onClose,
  memory,
}: {
  isOpen: boolean;
  onClose: () => void;
  memory: MemoryRecord;
}) {
  const { toast } = useToast();
  const transcript = memory.transcript || [];
  const transcriptText = formatTranscript(transcript);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const shareMenuRef = useRef<HTMLDivElement | null>(null);

  useEscapeKey(onClose, isOpen);

  useEffect(() => {
    if (!shareMenuOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (
        shareMenuRef.current &&
        !shareMenuRef.current.contains(event.target as Node)
      ) {
        setShareMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [shareMenuOpen]);

  const handleCopyTranscript = async () => {
    if (!transcriptText) {
      toast({
        title: "No transcript available",
        description: "There is no transcript available to copy.",
        variant: "destructive",
      });
      return;
    }
    try {
      await navigator.clipboard.writeText(transcriptText);
      toast({
        title: "Copied to clipboard",
        description: "Content ready to share.",
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

  const handleWhatsAppShareTranscript = () => {
    if (!transcriptText) {
      toast({
        title: "No transcript available",
        description: "There is no transcript available to share.",
        variant: "destructive",
      });
      return;
    }
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(transcriptText)}`;
    window.open(whatsappUrl, "_blank");
    toast({
      title: "Opening WhatsApp",
      description: "Share content via WhatsApp.",
    });
    setShareMenuOpen(false);
  };

  const handleShareToAppsTranscript = async () => {
    if (!transcriptText) {
      toast({
        title: "No transcript available",
        description: "There is no transcript available to share.",
        variant: "destructive",
      });
      return;
    }

    if (!navigator.share) {
      toast({
        title: "Share unavailable",
        description: "Your device does not support sharing.",
        variant: "destructive",
      });
      return;
    }

    try {
      await navigator.share({
        title: `Transcript: ${memory.title || "Memory"}`,
        text: transcriptText,
      });
      toast({
        title: "Shared",
        description: "Sent using your installed apps.",
      });
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        toast({
          title: "Unable to share",
          description: "Try copying the text instead.",
          variant: "destructive",
        });
      }
    }
    setShareMenuOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[520px] rounded-[32px] border border-border/80 bg-surface shadow-[0_40px_80px_rgba(15,23,42,0.18)] overflow-hidden flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/70 px-6 py-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted">
              Transcript
            </p>
            <p className="mt-1 text-lg font-semibold text-foreground">
              {memory.title || "Untitled Memory"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyTranscript}
              className="p-2 text-muted hover:text-foreground transition rounded-full hover:bg-surface/50"
              aria-label="Copy transcript"
            >
              <Copy className="h-4 w-4" />
            </button>
            <div className="relative" ref={shareMenuRef}>
              <button
                type="button"
                onClick={() => setShareMenuOpen(!shareMenuOpen)}
                className="p-2 text-muted hover:text-foreground transition rounded-full hover:bg-surface/50"
                aria-label="Share transcript"
              >
                <CornerUpRight className="h-4 w-4" />
              </button>
              {shareMenuOpen && (
                <div className="absolute right-0 top-12 w-72 rounded-2xl border border-border/60 bg-surface shadow-[0_12px_30px_rgba(15,23,42,0.08)] p-3 z-50">
                  <p className="text-[11px] uppercase tracking-[0.25em] text-muted mb-3">
                    Share
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={handleWhatsAppShareTranscript}
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
                      onClick={handleCopyTranscript}
                      className="inline-flex flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-[12px] font-semibold text-foreground hover:bg-surface/80 transition text-center"
                      title="Copy transcript as text"
                    >
                      <Copy className="h-5 w-5" />
                      Copy text
                    </button>
                    <button
                      type="button"
                      onClick={handleShareToAppsTranscript}
                      className="inline-flex flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-[12px] font-semibold text-foreground hover:bg-surface/80 transition text-center"
                      title="Share to apps"
                    >
                      <span className="text-lg">↗</span>
                      Share to...
                    </button>
                  </div>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-muted transition hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {transcript.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <Scroll className="h-12 w-12 text-muted mb-4" />
              <p className="text-base font-semibold text-foreground mb-2">
                No transcript available
              </p>
              <p className="text-sm text-muted">
                This memory doesn't have a transcript.
              </p>
            </div>
          ) : (
            <div className="rounded-[28px] border border-border/60 bg-surface/50 p-4">
              <div className="whitespace-pre-wrap text-sm text-foreground leading-relaxed">
                {transcriptText}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Formats transcript segments into readable text with speaker labels.
 */
function formatTranscript(segments: TranscriptSegment[]): string {
  if (!segments || segments.length === 0) return "";
  return segments
    .map((segment) => {
      const speaker = segment.is_user
        ? "You"
        : segment.speaker || `Speaker ${segment.speaker_id || 1}`;
      return `${speaker}:\n${segment.text}`;
    })
    .join("\n\n");
}

/**
 * Modal for adding a participant to a memory.
 */
function AddParticipantModal({
  onClose,
  onAdd,
  existingParticipants = [],
  onRemoveExisting,
  metadataOptions = [],
}: {
  onClose: () => void;
  onAdd: (name: string) => void;
  existingParticipants?: string[];
  onRemoveExisting?: (name: string) => void;
  metadataOptions?: string[];
}) {
  const [participantName, setParticipantName] = useState("");
  const [showParticipantSuggestions, setShowParticipantSuggestions] =
    useState(false);
  const [saving, setSaving] = useState(false);
  const [localMetadataOptions, setLocalMetadataOptions] =
    useState<string[]>(metadataOptions);

  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const meta = await getMemoriesMetadata({});
        setLocalMetadataOptions(meta.entities ?? []);
      } catch (error) {
        setLocalMetadataOptions(metadataOptions);
      }
    };
    fetchMetadata();
  }, []);
  const { participantChips, participantSet } = useMemo(() => {
    const seen = new Set<string>();
    const chips = existingParticipants.reduce<string[]>((acc, raw) => {
      const trimmed = raw?.trim();
      if (!trimmed) return acc;
      const normalized = trimmed.toLowerCase();
      if (seen.has(normalized)) return acc;
      seen.add(normalized);
      acc.push(trimmed);
      return acc;
    }, []);
    return { participantChips: chips, participantSet: seen };
  }, [existingParticipants]);
  const highlightMatch = (text: string, query: string) => {
    if (!query) return text;
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerText.indexOf(lowerQuery);
    if (index === -1) return text;
    return (
      <span>
        {text.substring(0, index)}
        <span
          className="text-[#0f8b54] font-semibold"
          style={{ display: "inline" }}
        >
          {text.substring(index, index + query.length)}
        </span>
        {text.substring(index + query.length)}
      </span>
    );
  };

  const participantSuggestions = useMemo(() => {
    const options = localMetadataOptions.length
      ? localMetadataOptions
      : metadataOptions;
    if (!options.length) {
      return [];
    }
    const query = participantName.trim().toLowerCase();
    if (!query) {
      return [];
    }
    const seen = new Set<string>();
    return options
      .reduce<string[]>((acc, raw) => {
        const trimmed = raw?.trim();
        if (!trimmed) return acc;
        const normalized = trimmed.toLowerCase();
        if (seen.has(normalized) || participantSet.has(normalized)) return acc;
        seen.add(normalized);
        if (normalized.includes(query)) {
          acc.push(trimmed);
        }
        return acc;
      }, [])
      .slice(0, 8);
  }, [localMetadataOptions, metadataOptions, participantName, participantSet]);

  useEscapeKey(onClose, true);

  const handleSave = async () => {
    const trimmed = participantName.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await onAdd(trimmed);
      setParticipantName("");
      setShowParticipantSuggestions(false);
    } finally {
      setSaving(false);
    }
  };

  const handleSelectParticipantSuggestion = (suggestion: string) => {
    setParticipantName(suggestion);
    setShowParticipantSuggestions(false);
  };

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-w-md w-full rounded-3xl bg-surface shadow-2xl border border-border/60 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-border/60 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-foreground">
            Add Participant
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-foreground text-xl px-2"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="p-6 space-y-5">
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-muted">
              Already Added
            </p>
            <div className="rounded-2xl border border-border/70 bg-surface/70 px-3 py-3">
              {participantChips.length ? (
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto pr-1">
                  {participantChips.map((participant) => (
                    <span
                      key={participant}
                      className="inline-flex items-center gap-1 rounded-full bg-blue-50/70 dark:bg-[#1f1f1f] border border-blue-200/40 dark:border-[#2a2a2a] px-3 py-1 text-xs font-semibold text-foreground shadow-sm"
                    >
                      {participant}
                      {onRemoveExisting && (
                        <button
                          type="button"
                          onClick={() => onRemoveExisting(participant)}
                          className="rounded-full p-0.5 hover:bg-blue-100/50 dark:hover:bg-slate-700/40 transition"
                          aria-label={`Remove ${participant}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted">
                  No participants yet. Add the first one below.
                </p>
              )}
            </div>
          </div>
          <div className="space-y-2 relative">
            <label className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">
              Participant Name
            </label>
            <div className="rounded-2xl border border-border/80 bg-surface/80 px-3 py-2 focus-within:border-[#0f8b54] focus-within:shadow-[0_0_0_1px_rgba(15,139,84,0.35)] transition">
              <input
                type="text"
                value={participantName}
                onChange={(e) => {
                  const newValue = e.target.value;
                  setParticipantName(newValue);
                  if (newValue.trim().length > 0) {
                    setShowParticipantSuggestions(true);
                  } else {
                    setShowParticipantSuggestions(false);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !saving && participantName.trim()) {
                    handleSave();
                  }
                }}
                onBlur={() => {
                  setTimeout(() => setShowParticipantSuggestions(false), 100);
                }}
                placeholder="Enter participant name"
                className="w-full h-9 border-none bg-transparent px-0 text-base font-semibold text-foreground placeholder:text-muted focus:outline-none"
                autoFocus
              />
            </div>
            {showParticipantSuggestions &&
              participantSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-20 mt-2 rounded-2xl border border-border/70 bg-surface shadow-lg max-h-[200px] overflow-y-auto">
                  <p className="px-3 pt-3 text-[10px] font-semibold uppercase tracking-[0.3em] text-muted sticky top-0 bg-surface">
                    Suggestions
                  </p>
                  <div className="py-2">
                    {participantSuggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() =>
                          handleSelectParticipantSuggestion(suggestion)
                        }
                        className="flex w-full items-center justify-between px-4 py-2 text-sm text-left text-foreground hover:bg-[#0f8b54]/5"
                      >
                        {highlightMatch(suggestion, participantName.trim())}
                      </button>
                    ))}
                  </div>
                </div>
              )}
          </div>
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-border px-5 py-2 text-sm text-muted hover:text-foreground hover:border-foreground"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !participantName.trim()}
              className="rounded-full bg-[#0F8B54] px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-70"
            >
              {saving ? "Adding..." : "Add"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Modal for adding a topic to a memory.
 */
function AddTopicModal({
  onClose,
  onAdd,
  existingTopics = [],
  onRemoveExisting,
  metadataOptions = [],
}: {
  onClose: () => void;
  onAdd: (name: string) => void;
  existingTopics?: string[];
  onRemoveExisting?: (name: string) => void;
  metadataOptions?: string[];
}) {
  const [topicName, setTopicName] = useState("");
  const [showTopicSuggestions, setShowTopicSuggestions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [localMetadataOptions, setLocalMetadataOptions] =
    useState<string[]>(metadataOptions);

  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const meta = await getMemoriesMetadata({});
        setLocalMetadataOptions(meta.tags ?? []);
      } catch (error) {
        setLocalMetadataOptions(metadataOptions);
      }
    };
    fetchMetadata();
  }, []);
  const { topicChips, topicSet } = useMemo(() => {
    const seen = new Set<string>();
    const chips = existingTopics.reduce<string[]>((acc, raw) => {
      const trimmed = raw?.trim();
      if (!trimmed) return acc;
      const normalized = trimmed.toLowerCase();
      if (seen.has(normalized)) return acc;
      seen.add(normalized);
      acc.push(trimmed);
      return acc;
    }, []);
    return { topicChips: chips, topicSet: seen };
  }, [existingTopics]);
  const highlightMatch = (text: string, query: string) => {
    if (!query) return text;
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerText.indexOf(lowerQuery);
    if (index === -1) return text;
    return (
      <span>
        {text.substring(0, index)}
        <span
          className="text-[#0f8b54] font-semibold"
          style={{ display: "inline" }}
        >
          {text.substring(index, index + query.length)}
        </span>
        {text.substring(index + query.length)}
      </span>
    );
  };

  const topicSuggestions = useMemo(() => {
    const options = localMetadataOptions.length
      ? localMetadataOptions
      : metadataOptions;
    if (!options.length) {
      return [];
    }
    const query = topicName.trim().toLowerCase();
    if (!query) {
      return [];
    }
    const seen = new Set<string>();
    return options
      .reduce<string[]>((acc, raw) => {
        const trimmed = raw?.trim();
        if (!trimmed) return acc;
        const normalized = trimmed.toLowerCase();
        if (seen.has(normalized) || topicSet.has(normalized)) return acc;
        seen.add(normalized);
        if (normalized.includes(query)) {
          acc.push(trimmed);
        }
        return acc;
      }, [])
      .slice(0, 8);
  }, [localMetadataOptions, metadataOptions, topicName, topicSet]);

  useEscapeKey(onClose, true);

  const handleSave = async () => {
    const trimmed = topicName.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await onAdd(trimmed);
      setTopicName("");
      setShowTopicSuggestions(false);
    } catch (error) {
    } finally {
      setSaving(false);
    }
  };

  const handleSelectTopicSuggestion = (suggestion: string) => {
    setTopicName(suggestion);
    setShowTopicSuggestions(false);
  };

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-w-md w-full rounded-3xl bg-surface shadow-2xl border border-border/60 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-border/60 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-foreground">Add Topic</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-foreground text-xl px-2"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="p-6 space-y-5">
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-muted">
              Already Added
            </p>
            <div className="rounded-2xl border border-border/70 bg-surface/70 px-3 py-3">
              {topicChips.length ? (
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto pr-1">
                  {topicChips.map((topic) => (
                    <span
                      key={topic}
                      className="inline-flex items-center gap-1 rounded-full bg-purple-50/70 dark:bg-[#1f1f1f] border border-purple-200/40 dark:border-[#2a2a2a] px-3 py-1 text-xs font-semibold text-foreground shadow-sm"
                    >
                      {topic}
                      {onRemoveExisting && (
                        <button
                          type="button"
                          onClick={() => onRemoveExisting(topic)}
                          className="rounded-full p-0.5 hover:bg-purple-100/50 dark:hover:bg-[#2a2a2a] transition"
                          aria-label={`Remove ${topic}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted">
                  No topics added yet. Add one below to get started.
                </p>
              )}
            </div>
          </div>
          <div className="space-y-2 relative">
            <label className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">
              Topic Name
            </label>
            <div className="rounded-2xl border border-border/80 bg-surface/80 px-3 py-2 focus-within:border-[#0f8b54] focus-within:shadow-[0_0_0_1px_rgba(15,139,84,0.35)] transition">
              <input
                type="text"
                value={topicName}
                onChange={(e) => {
                  const newValue = e.target.value;
                  setTopicName(newValue);
                  if (newValue.trim().length > 0) {
                    setShowTopicSuggestions(true);
                  } else {
                    setShowTopicSuggestions(false);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !saving && topicName.trim()) {
                    handleSave();
                  }
                }}
                onBlur={() => {
                  setTimeout(() => setShowTopicSuggestions(false), 100);
                }}
                placeholder="Enter topic name"
                className="w-full h-9 border-none bg-transparent px-0 text-base font-semibold text-foreground placeholder:text-muted focus:outline-none"
                autoFocus
              />
            </div>
            {showTopicSuggestions && topicSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-20 mt-2 rounded-2xl border border-border/70 bg-surface shadow-lg max-h-[200px] overflow-y-auto">
                <p className="px-3 pt-3 text-[10px] font-semibold uppercase tracking-[0.3em] text-muted sticky top-0 bg-surface">
                  Suggestions
                </p>
                <div className="py-2">
                  {topicSuggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => handleSelectTopicSuggestion(suggestion)}
                      className="flex w-full items-center justify-between px-4 py-2 text-sm text-left text-foreground hover:bg-[#0f8b54]/5"
                    >
                      {highlightMatch(suggestion, topicName.trim())}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-border px-5 py-2 text-sm text-muted hover:text-foreground hover:border-foreground"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !topicName.trim()}
              className="rounded-full bg-[#0F8B54] px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-70"
            >
              {saving ? "Adding..." : "Add"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Modal for editing memory notes.
 */
function EditNotesModal({
  memory,
  onClose,
  onSave,
}: {
  memory: MemoryRecord;
  onClose: () => void;
  onSave: (memoryId: string, notes: string) => void;
}) {
  const initialNotes = memory.mom?.trim() || memory.summary?.trim() || "";
  const [notes, setNotes] = useState(initialNotes);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  useEscapeKey(onClose, true);

  const trimmedNotes = notes.trim();
  const initialTrimmedNotes = initialNotes.trim();
  const hasChanges =
    trimmedNotes.length > 0 && trimmedNotes !== initialTrimmedNotes;

  const handleSave = async () => {
    const sanitizedNotes = notes.trim();
    if (saving || !sanitizedNotes || sanitizedNotes === initialTrimmedNotes)
      return;
    setSaving(true);
    try {
      await updateMemory({
        memory_id: memory.id,
        mom: sanitizedNotes,
        entities: memory.entities ?? [],
        title: memory.title ?? "",
        tags: memory.tags ?? [],
        topics: memory.topics ?? [],
        domain: memory.domain ?? "",
        summary: sanitizedNotes,
        should_detect_corrections: true,
        correction_to_save: [],
      });
      onSave(memory.id, sanitizedNotes);
    } catch (error: any) {
      toast({
        title: "Unable to save notes",
        description: error?.message || "Try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[520px] rounded-[32px] border border-border/80 bg-surface shadow-[0_40px_80px_rgba(15,23,42,0.18)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/70 px-6 py-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted">
              Edit meeting notes
            </p>
            <p className="mt-1 text-lg font-semibold text-foreground">
              {memory.title?.trim() || "Untitled memory"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-muted transition hover:text-foreground"
            aria-label="Close edit notes"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">
              Notes
            </label>
            <div className="rounded-[28px] border border-border/60 bg-surface/50 p-4">
              <textarea
                className="w-full min-h-[240px] resize-none bg-transparent text-sm leading-relaxed text-foreground focus:outline-none placeholder:text-muted"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Enter meeting notes..."
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-border px-5 py-2 text-sm text-muted hover:text-foreground hover:border-foreground"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className="rounded-full bg-[#0F8B54] px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-70"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Modal for sharing memory (copy text or share via system share sheet).
 */
function ShareMemoryModal({
  memory,
  onClose,
}: {
  memory: MemoryRecord;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const shareLink = `${window.location.origin}/memories/${memory.id}`;
  const preview =
    memory.summary?.trim() ||
    memory.mom?.trim() ||
    "Nothing to preview just yet.";
  useEscapeKey(onClose, true);

  const shareText = `${memory.title || "Memory"}\n\n${preview}\n\n${shareLink}`;

  const handleWhatsAppShare = () => {
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
    window.open(whatsappUrl, "_blank");
    toast({
      title: "Opening WhatsApp",
      description: "Share content via WhatsApp.",
    });
  };

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      toast({
        title: "Copied to clipboard",
        description: "Content ready to share.",
      });
    } catch (error) {
      toast({
        title: "Unable to copy",
        description: "Please try again or copy manually.",
        variant: "destructive",
      });
    }
  };

  const shareToApps = async () => {
    if (!navigator.share) {
      toast({
        title: "Share unavailable",
        description: "Your device does not support sharing.",
        variant: "destructive",
      });
      return;
    }

    try {
      await navigator.share({
        title: memory.title || "Memory",
        text: shareText,
        url: shareLink,
      });
      toast({
        title: "Shared",
        description: "Sent using your installed apps.",
      });
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        toast({
          title: "Unable to share",
          description: "Try copying the text instead.",
          variant: "destructive",
        });
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-w-2xl w-full rounded-[36px] bg-surface shadow-[0_30px_120px_rgba(15,30,44,0.16)] border border-[#e5efe8] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-10 pt-8 pb-6">
          <div className="space-y-1.5">
            <h2 className="text-2xl font-semibold text-foreground">
              Share memory
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-muted">
                {memory.title?.trim() || "Untitled memory"}
              </p>
              {memory.is_merged && <MergedBadge />}
              {memory.tasks_count && memory.tasks_count > 0 && (
                <ReminderBadge count={memory.tasks_count} />
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-foreground text-2xl leading-none"
            aria-label="Close share memory"
          >
            ×
          </button>
        </div>
        <div className="px-10">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">
            Preview
          </p>
          <div className="mt-3 rounded-[28px] border border-border/60 bg-surface/50 p-6 max-h-[250px] overflow-y-auto">
            <pre className="whitespace-pre-wrap font-sans text-sm text-foreground leading-relaxed">
              {preview}
            </pre>
          </div>
        </div>
        <div className="px-10 py-6 space-y-3">
          <button
            type="button"
            onClick={handleWhatsAppShare}
            className="flex w-full items-center gap-3 rounded-2xl bg-[#25D366] px-5 py-4 text-left text-sm font-semibold text-white hover:bg-[#20BA5A] transition"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-lg">
              💬
            </span>

            <div>
              <p>Share via WhatsApp</p>
              <p className="text-xs font-normal text-white/90">
                Open WhatsApp to share this memory.
              </p>
            </div>
          </button>
          <button
            type="button"
            onClick={handleCopyText}
            className="flex w-full items-center gap-3 rounded-2xl border border-[#E2E8E1] px-5 py-4 text-left text-sm font-semibold text-foreground hover:border-foreground/70"
          >
            <Copy className="h-5 w-5 text-muted" />
            <div>
              <p>Copy text</p>
              <p className="text-xs font-normal text-muted">
                Copy memory text to clipboard.
              </p>
            </div>
          </button>
          <button
            type="button"
            onClick={shareToApps}
            className="flex w-full items-center gap-3 rounded-2xl bg-[#E8F6EF] px-5 py-4 text-left text-sm font-semibold text-[#0F8B54] hover:bg-[#dff1e8]"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-lg">
              ↗
            </span>
            <div>
              <p>Share to...</p>
              <p className="text-xs font-normal text-[#0C7042]">
                Send via Mail, Messages, or other apps.
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Confirmation modal for bulk deleting multiple memories.
 */
function BulkDeleteModal({
  ids,
  onClose,
  onDeleted,
}: {
  ids: string[];
  onClose: () => void;
  onDeleted: (deletedIds: string[]) => void;
}) {
  const { toast } = useToast();
  const [deleting, setDeleting] = useState(false);
  const count = ids.length;

  useEscapeKey(() => {
    if (!deleting) {
      onClose();
    }
  }, !deleting);

  if (count === 0) {
    return null;
  }

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteMemories(ids);
      toast({
        title: count === 1 ? "Memory deleted" : "Memories deleted",
        description:
          count === 1
            ? "Removed from your archive."
            : `${count} memories removed from your archive.`,
      });
      onDeleted(ids);
    } catch (error: any) {
      toast({
        title: "Unable to delete memories",
        description: error?.message || "Try again.",
        variant: "destructive",
      });
      setDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-sm"
      onClick={() => {
        if (!deleting) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-[32px] border border-border bg-surface p-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-xl font-semibold text-foreground">
          Delete selected memories
        </h3>
        <p className="mt-3 text-sm text-muted">
          This will permanently remove{" "}
          <span className="font-semibold text-foreground">
            {count} {count === 1 ? "memory" : "memories"}
          </span>{" "}
          from your timeline. This action cannot be undone.
        </p>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="rounded-full border border-border px-4 py-2 text-sm text-muted hover:text-foreground hover:border-foreground disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-full bg-danger px-5 py-2 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(239,68,68,0.35)] disabled:opacity-70"
          >
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Confirmation modal for deleting a single memory.
 */
function DeleteMemoryModal({
  memory,
  onClose,
  onDeleted,
}: {
  memory: MemoryRecord;
  onClose: () => void;
  onDeleted: (memoryId: string) => void;
}) {
  const { toast } = useToast();
  const [deleting, setDeleting] = useState(false);
  useEscapeKey(() => {
    if (!deleting) {
      onClose();
    }
  }, !deleting);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteMemory(memory.id);
      toast({
        title: "Memory deleted",
        description: "Removed from your archive.",
      });
      onDeleted(memory.id);
    } catch (error: any) {
      toast({
        title: "Unable to delete memory",
        description: error?.message || "Try again.",
        variant: "destructive",
      });
      setDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-sm"
      onClick={() => {
        if (!deleting) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-[32px] border border-border bg-surface p-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-xl font-semibold text-foreground">Delete memory</h3>
        <p className="mt-3 text-sm text-muted">
          This will permanently remove{" "}
          <span className="font-semibold text-foreground">
            {memory.title?.trim() || "this memory"}
          </span>
          . This action cannot be undone.
        </p>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="rounded-full border border-border px-4 py-2 text-sm text-muted hover:text-foreground hover:border-foreground disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-full bg-danger px-5 py-2 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(239,68,68,0.35)] disabled:opacity-70"
          >
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Badge component indicating a merged memory.
 */
function MergedBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-[#E5F5EF] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#0f8b54] ${className}`}
      aria-label="Merged memory"
    >
      <GitMerge className="h-3.5 w-3.5" />
      <span>Merged</span>
    </span>
  );
}

/**
 * Badge component showing reminder count for a memory.
 */
function ReminderBadge({
  count,
  className = "",
}: {
  count: number;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full bg-background dark:bg-gray-700 border-2 border-gray-400 dark:border-gray-500 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-900 dark:text-gray-100 ${className}`}
      aria-label={`${count} reminder${count === 1 ? "" : "s"}`}
    >
      <span>
        {count} Reminder{count === 1 ? "" : "s"}
      </span>
    </span>
  );
}

/**
 * Builds formatted metadata string for memory (date, time, duration).
 */
function buildMemoryMeta(memory: MemoryRecord) {
  const startedAt = memory.started_at || memory.created_at;
  if (!startedAt) return "Date unknown";
  const date = new Date(startedAt);
  const day = date.getDate();
  const month = date.toLocaleDateString("en-US", { month: "short" });
  const dateLabel = `${day} ${month}`;
  const timeLabel = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  const duration = formatDuration(getDurationSeconds(memory));
  const parts = [dateLabel, timeLabel, duration].filter(
    (part) => part != null && part !== "" && String(part) !== "0",
  );
  return parts.join(" • ");
}

/**
 * Calculates memory duration in seconds from duration field or started_at/finished_at.
 */
function getDurationSeconds(memory: MemoryRecord): number | null {
  if (typeof memory.duration === "number" && memory.duration > 0) {
    return Math.round(memory.duration);
  }
  if (memory.started_at && memory.finished_at) {
    const finished = new Date(memory.finished_at).getTime();
    const started = new Date(memory.started_at).getTime();
    const diff = finished - started;
    if (diff > 0) {
      return Math.round(diff / 1000);
    }
  }
  return null;
}

/**
 * Formats duration in seconds as "Xm Ys" or "Ys" if less than a minute.
 */
function formatDuration(duration?: number | null) {
  if (duration == null) return null;
  const totalSeconds = Math.max(0, Math.round(duration));
  if (totalSeconds <= 0) return null;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

/**
 * Gets timestamp for sorting memories (started_at or created_at).
 */
function getMemorySortTimestamp(memory: MemoryRecord): number {
  const value = memory.started_at || memory.created_at;
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

/**
 * Gets ISO date string key for grouping memories by date.
 */
function getMemoryDateKey(memory: MemoryRecord): string {
  const value = memory.started_at || memory.created_at;
  if (!value) return "unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toISOString().split("T")[0];
}

/**
 * Formats date key as readable label (e.g., "15 Jan - Today", "14 Jan - Yesterday", or "15 Jan" for older dates).
 */
function formatMemoryGroupLabel(key: string): string {
  if (key === "unknown") return "Unknown date";
  const date = new Date(key);
  if (Number.isNaN(date.getTime())) return "Unknown date";

  const day = date.getDate();
  const month = date.toLocaleDateString("en-US", { month: "short" });
  const year = date.getFullYear();
  const currentYear = new Date().getFullYear();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const memoryDate = new Date(date);
  memoryDate.setHours(0, 0, 0, 0);

  if (memoryDate.getTime() === today.getTime()) {
    return `${day} ${month} - Today`;
  }

  if (memoryDate.getTime() === yesterday.getTime()) {
    return `${day} ${month} - Yesterday`;
  }

  if (year !== currentYear) {
    return `${day} ${month} ${year}`;
  }

  return `${day} ${month}`;
}
