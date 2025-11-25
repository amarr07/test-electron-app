import { authorizedFetch } from "@/api/httpClient";
import { config } from "@/lib/electron";

const PAGE_SIZE = 10;

export interface TranscriptSegment {
  text: string;
  speaker?: string;
  speaker_id?: number;
  start: number;
  end: number;
  person_id?: string;
  is_user?: boolean;
}

export interface MemoryRecord {
  id: string;
  title?: string;
  summary?: string;
  mom?: string;
  topics?: string[];
  emotions?: string[];
  participants?: string[];
  entities?: string[];
  tags?: string[];
  questions?: string[];
  transcript?: TranscriptSegment[];
  created_at?: string;
  started_at?: string;
  finished_at?: string;
  duration?: number;
  status?: string;
  domain?: string;
  is_post_processed?: boolean;
  tasks_count?: number;
  updated_at?: string;
  is_merged?: boolean;
  archived?: boolean;
}

interface MemoriesResponse {
  success: boolean;
  data: MemoryRecord[];
  pagination?: {
    next_cursor?: string | null;
    has_more?: boolean;
  };
}

export interface MemoryMetadataParams {
  searchQuery?: string;
  tags?: string[];
  entities?: string[];
  domains?: string[];
  startDate?: string;
  endDate?: string;
  timezone?: string;
  searchMode?: "all" | "tags" | "entities" | "domains";
}

interface FetchParams {
  cursor?: string | null;
  search?: string;
  archived?: boolean;
  topic?: string;
  pageSize?: number;
  orderBy?: "asc" | "desc";
  sortBy?: "created_at" | "finished_at";
  direction?: "forward" | "backward";
}

/**
 * Fetches paginated memories with optional filtering/sorting.
 * Uses cursor-based pagination.
 */
export async function getMemories({
  cursor,
  search,
  archived,
  topic,
  pageSize,
  orderBy,
  sortBy,
  direction,
}: FetchParams): Promise<{
  records: MemoryRecord[];
  nextCursor: string | null;
  hasMore: boolean;
}> {
  const backendUrl = config.BACKEND_URL;
  if (!backendUrl) {
    throw new Error("Backend URL is not configured.");
  }

  const params = new URLSearchParams({
    page_size: (pageSize ?? PAGE_SIZE).toString(),
  });
  if (cursor) {
    params.set("cursor", cursor);
  }
  if (search) {
    params.set("search", search);
  }
  if (archived) {
    params.set("is_archived", "true");
  }
  if (topic) {
    params.set("topic", topic);
  }
  if (orderBy) {
    params.set("order_by", orderBy);
  }
  if (sortBy) {
    params.set("sort_by", sortBy);
  }
  if (direction) {
    params.set("direction", direction);
  }

  const response = await authorizedFetch(
    `${backendUrl}/memories?${params.toString()}`,
    undefined,
    { purpose: "view your memories" },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch memories: ${text || response.statusText}`);
  }

  const parsed = (await response.json()) as MemoriesResponse;
  if (!parsed.success) {
    throw new Error("Failed to load memories.");
  }

  const records = parsed.data ?? [];
  const pagination = parsed.pagination ?? {};
  return {
    records,
    nextCursor: pagination.next_cursor ?? null,
    hasMore: Boolean(pagination.has_more),
  };
}

interface UpdateMemoryPayload {
  memory_id: string;
  mom: string;
  entities: string[];
  title: string;
  tags: string[];
  topics: string[];
  domain: string;
  summary: string;
  participants?: string[];
  should_detect_corrections: boolean;
  correction_to_save: Array<{
    original_phrase: string;
    corrected_phrase: string;
    reason: string;
    context: string;
    part_of_speech: string;
  }>;
}

interface UpdateMemoryResponse {
  success: boolean;
  error?: string | null;
  message?: string | null;
  data?: {
    memory_id: string;
    correction_suggestions: Array<Record<string, unknown>>;
  };
}

/**
 * Updates memory metadata including title, summary, tags, entities, etc.
 * Supports correction detection and saving custom dictionary entries.
 */
export async function updateMemory(
  payload: UpdateMemoryPayload,
): Promise<UpdateMemoryResponse> {
  const backendUrl = config.BACKEND_URL;
  if (!backendUrl) {
    throw new Error("Backend URL is not configured.");
  }

  const apiPayload: Record<string, unknown> = {
    memory_id: payload.memory_id,
    mom: payload.mom,
    entities: payload.entities,
    title: payload.title,
    tags: payload.tags,
    topics: payload.topics,
    domain: payload.domain,
    summary: payload.summary,
    should_detect_corrections: payload.should_detect_corrections,
    correction_to_save: payload.correction_to_save,
  };

  if (payload.participants !== undefined) {
    apiPayload.participants = payload.participants;
  }

  const response = await authorizedFetch(
    `${backendUrl}/memories/update`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(apiPayload),
    },
    { purpose: "update memories" },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to update memory: ${text || response.statusText}`);
  }

  const parsed = (await response.json()) as UpdateMemoryResponse;
  if (!parsed.success) {
    throw new Error(parsed.error || "Failed to update memory.");
  }

  return parsed;
}

/**
 * Deletes multiple memories by their IDs.
 * No-op if empty array provided.
 */
export async function deleteMemories(memoryIds: string[]): Promise<void> {
  if (memoryIds.length === 0) {
    return;
  }
  const backendUrl = config.BACKEND_URL;
  if (!backendUrl) {
    throw new Error("Backend URL is not configured.");
  }

  const response = await authorizedFetch(
    `${backendUrl}/memories/delete`,
    {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(memoryIds),
    },
    { purpose: "delete memories" },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to delete memory: ${text || response.statusText}`);
  }

  const text = await response.text();
  if (text) {
    const parsed = JSON.parse(text) as { success?: boolean; error?: string };
    if (parsed && parsed.success === false) {
      throw new Error(parsed.error || "Failed to delete memory.");
    }
  }
}

/**
 * Deletes a single memory by ID.
 */
export async function deleteMemory(memoryId: string): Promise<void> {
  await deleteMemories([memoryId]);
}

/**
 * Merges multiple memories into a single memory record.
 * Returns empty array if no IDs provided.
 */
export async function mergeMemories(
  memoryIds: string[],
): Promise<MemoryRecord[]> {
  if (memoryIds.length === 0) return [];
  const backendUrl = config.BACKEND_URL;
  if (!backendUrl) {
    throw new Error("Backend URL is not configured.");
  }

  const response = await authorizedFetch(
    `${backendUrl}/memories/merge`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ memory_ids: memoryIds }),
    },
    { purpose: "merge memories" },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to merge memories: ${text || response.statusText}`);
  }

  const text = await response.text();
  if (!text) {
    return [];
  }

  const parsed = JSON.parse(text) as {
    success?: boolean;
    error?: string;
    data?: MemoryRecord[];
  };

  if (parsed && parsed.success === false) {
    throw new Error(parsed.error || "Failed to merge memories.");
  }

  return parsed.data ?? [];
}

interface MemoriesByIdsParams {
  memoryIds: string[];
  cursor?: string | null;
  pageSize?: number;
  sortBy?: "created_at" | "finished_at";
  orderBy?: "asc" | "desc";
  direction?: "forward" | "backward";
}

/**
 * Fetches specific memories by their IDs with pagination support.
 * Returns empty result if no IDs provided.
 */
export async function getMemoriesByIds({
  memoryIds,
  cursor,
  pageSize,
  sortBy,
  orderBy,
  direction,
}: MemoriesByIdsParams): Promise<{
  records: MemoryRecord[];
  nextCursor: string | null;
  hasMore: boolean;
}> {
  if (memoryIds.length === 0) {
    return { records: [], nextCursor: null, hasMore: false };
  }

  const backendUrl = config.BACKEND_URL;
  if (!backendUrl) {
    throw new Error("Backend URL is not configured.");
  }

  const params = new URLSearchParams({
    page_size: (pageSize ?? PAGE_SIZE).toString(),
  });

  if (cursor) {
    params.set("cursor", cursor);
  }
  if (sortBy) {
    params.set("sort_by", sortBy);
  }
  if (orderBy) {
    params.set("order_by", orderBy);
  }
  if (direction) {
    params.set("direction", direction);
  }

  const response = await authorizedFetch(
    `${backendUrl}/memories/by_ids?${params.toString()}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        memory_ids: memoryIds,
      }),
    },
    { purpose: "view your memories" },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch memories: ${text || response.statusText}`);
  }

  const parsed = (await response.json()) as MemoriesResponse;
  if (!parsed.success) {
    throw new Error("Failed to load memories.");
  }

  const records = parsed.data ?? [];
  const pagination = parsed.pagination ?? {};
  return {
    records,
    nextCursor: pagination.next_cursor ?? null,
    hasMore: Boolean(pagination.has_more),
  };
}

/**
 * Fetches aggregated metadata (tags, entities, domains) for filter dropdowns.
 * Returns available options based on current search/filter state.
 */
export async function getMemoriesMetadata({
  searchQuery,
  tags,
  entities,
  domains,
  startDate,
  endDate,
  timezone,
  searchMode,
}: MemoryMetadataParams): Promise<{
  tags: string[];
  entities: string[];
  domains: string[];
  minStartedAt?: string | null;
  maxStartedAt?: string | null;
  memoryIds: string[];
}> {
  const backendUrl = config.BACKEND_URL;
  if (!backendUrl) {
    throw new Error("Backend URL is not configured.");
  }

  const params = new URLSearchParams();
  if (searchQuery?.trim()) params.set("q", searchQuery.trim());
  const addList = (key: string, values?: string[]) => {
    values
      ?.filter((v) => v && v.trim())
      .forEach((value) => params.append(key, value.trim()));
  };
  addList("tags", tags);
  addList("entities", entities);
  addList("domains", domains);
  if (startDate) params.set("start_date", startDate);
  if (endDate) params.set("end_date", endDate);
  if (timezone) params.set("tz_info", timezone);
  if (searchMode) params.set("search_mode", searchMode);

  const response = await authorizedFetch(
    `${backendUrl}/memories/metadata/?${params.toString()}`,
    undefined,
    { purpose: "filter memories" },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to fetch memory metadata: ${text || response.statusText}`,
    );
  }

  const parsed = (await response.json()) as Record<string, unknown>;
  const payload = (() => {
    if (!parsed || typeof parsed !== "object") return null;
    if ("data" in parsed && parsed.data && typeof parsed.data === "object") {
      return parsed.data as Record<string, unknown>;
    }
    return parsed;
  })();

  if (!payload) {
    throw new Error("Failed to load memory metadata.");
  }

  const normalizeList = (value: unknown): string[] =>
    Array.isArray(value)
      ? value
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter(Boolean)
      : [];

  const normalizedTags = normalizeList(
    (payload as Record<string, unknown>)["tags"],
  );
  const normalizedEntities = normalizeList(
    (payload as Record<string, unknown>)["entities"],
  );
  const normalizedDomains = normalizeList(
    (payload as Record<string, unknown>)["domains"],
  );
  const minStartedAtRaw = (payload as Record<string, unknown>)[
    "min_started_at"
  ];
  const maxStartedAtRaw = (payload as Record<string, unknown>)[
    "max_started_at"
  ];
  const memoryIds = normalizeList(
    (payload as Record<string, unknown>)["memory_ids"],
  );

  return {
    tags: normalizedTags,
    entities: normalizedEntities,
    domains: normalizedDomains,
    minStartedAt: typeof minStartedAtRaw === "string" ? minStartedAtRaw : null,
    maxStartedAt: typeof maxStartedAtRaw === "string" ? maxStartedAtRaw : null,
    memoryIds,
  };
}

export { PAGE_SIZE as MEMORIES_PAGE_SIZE };
export type { UpdateMemoryPayload, UpdateMemoryResponse };

/**
 * Full-text search across memories. Returns up to PAGE_SIZE results.
 */
export async function searchMemories(query: string): Promise<MemoryRecord[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const backendUrl = config.BACKEND_URL;
  if (!backendUrl) {
    throw new Error("Backend URL is not configured.");
  }

  const params = new URLSearchParams({
    q: trimmed,
    page_size: PAGE_SIZE.toString(),
  });

  const response = await authorizedFetch(
    `${backendUrl}/memories/search?${params.toString()}`,
    undefined,
    { purpose: "search your memories" },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to search memories: ${text || response.statusText}`,
    );
  }

  const parsed = (await response.json()) as MemoriesResponse;
  if (!parsed.success) {
    throw new Error("Failed to search memories.");
  }

  return parsed.data ?? [];
}

/**
 * Gets autocomplete suggestions for memory search. Requires min 3 characters.
 */
export async function getMemorySearchAutosuggestions(
  query: string,
): Promise<string[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  const backendUrl = config.BACKEND_URL;
  if (!backendUrl) {
    throw new Error("Backend URL is not configured.");
  }

  const params = new URLSearchParams({ q: trimmed });
  const response = await authorizedFetch(
    `${backendUrl}/memories/search/autocomplete?${params.toString()}`,
    undefined,
    { purpose: "get memory search suggestions" },
  );

  if (!response.ok) {
    return [];
  }

  try {
    const parsed = (await response.json()) as {
      success?: boolean;
      data?: string[];
      suggestions?: string[];
    };
    const suggestions = parsed.data ?? parsed.suggestions ?? [];
    if (!Array.isArray(suggestions)) {
      return [];
    }
    return suggestions
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  } catch {
    return [];
  }
}
