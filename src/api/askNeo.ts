import { authorizedFetch } from "@/api/httpClient";
import { config } from "@/lib/electron";
import { getFirebaseAuth } from "@/lib/firebase";
import {
  getChatMessages as getChatMessagesFromFirestore,
  getChatSessions as getChatSessionsFromFirestore,
} from "@/lib/firestore";

export interface ChatSession {
  id: string;
  MemoryId?: string;
  Title: string;
  Type?: string;
  CreatedAt: number;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  metadata?: {
    sources?: MessageSource[];
  };
}

export interface MessageSource {
  memory_id?: string;
  title?: string;
  created_at?: string;
}

interface MetadataData {
  user_message_id: string;
  assistant_message_id: string;
  chat_id: string;
  citations?: Record<
    string,
    {
      score: number;
      title: string;
      timestamp: string;
    }
  >;
}

type StreamedMessageEvent =
  | { event: "answer"; data: string }
  | { event: "metadata"; data: MetadataData }
  | { event: "end"; data: string }
  | { event: "error"; data: string | { message?: string } };

/**
 * Fetches all chat sessions from Firestore for current user.
 */
export async function getChatSessions(): Promise<ChatSession[]> {
  const auth = getFirebaseAuth();
  const currentUser = auth?.currentUser;

  if (!currentUser) {
    throw new Error("User not authenticated");
  }

  try {
    const sessions = await getChatSessionsFromFirestore(currentUser.uid);
    return sessions.map((session) => ({
      id: session.id,
      MemoryId: session.MemoryId,
      Title: session.Title,
      Type: session.Type,
      CreatedAt: session.CreatedAt.toMillis() / 1000,
    }));
  } catch (error: any) {
    console.error("Error fetching chat sessions:", error);
    throw new Error(
      `Failed to fetch chat sessions: ${error?.message || "Unknown error"}`,
    );
  }
}

/**
 * Loads all messages for a specific chat session from Firestore.
 */
export async function loadChatMessages(chatId: string): Promise<ChatMessage[]> {
  const auth = getFirebaseAuth();
  const currentUser = auth?.currentUser;

  if (!currentUser) {
    throw new Error("User not authenticated");
  }

  try {
    const messages = await getChatMessagesFromFirestore(
      currentUser.uid,
      chatId,
    );
    return messages.map((msg) => ({
      id: msg.id,
      chatId: msg.chat_id,
      role: msg.role,
      content: msg.content,
      createdAt: msg.created_at.toMillis() / 1000,
      metadata: msg.metadata,
    }));
  } catch (error: any) {
    console.error("Error loading chat messages:", error);
    throw new Error(
      `Failed to load chat messages: ${error?.message || "Unknown error"}`,
    );
  }
}

export interface MemoryChatIdResponse {
  chat_id: string;
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    sources?: MessageSource[];
  }>;
}

/**
 * Gets chat ID and messages associated with a specific memory.
 * Returns null if no chat exists for the memory.
 */
export async function getMemoryChatIdAndMessages(
  memoryId: string,
): Promise<MemoryChatIdResponse | null> {
  const backendUrl = config.BACKEND_URL;
  if (!backendUrl) {
    throw new Error("Backend URL is not configured.");
  }

  try {
    const response = await authorizedFetch(
      `${backendUrl}/ask-neo/get_memory_chat_id?memory_id=${encodeURIComponent(memoryId)}`,
      {
        method: "GET",
      },
      { purpose: "get memory chat ID and messages" },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Failed to get memory chat: ${text || response.statusText}`,
      );
    }

    const parsed = (await response.json()) as Array<{
      chat_id: string;
      messages: Array<{
        id?: string;
        IsUser?: boolean;
        Text?: string;
        role?: "user" | "assistant";
        content?: string;
        CreatedAt?: number;
        created_at?: number;
        Citations?: Record<string, any>;
        metadata?: { sources?: MessageSource[] };
      }>;
    }>;

    if (!Array.isArray(parsed) || parsed.length === 0) {
      return null;
    }

    const result = parsed[0];
    if (!result.chat_id) {
      return null;
    }

    type MessageWithTimestamp = {
      id: string;
      role: "user" | "assistant";
      content: string;
      sources?: MessageSource[];
      createdAt: number;
    };

    const formattedMessages: MessageWithTimestamp[] = (
      result.messages || []
    ).map<MessageWithTimestamp>((msg, idx) => {
      const isUser =
        msg.IsUser !== undefined ? msg.IsUser : msg.role === "user";
      const text = msg.Text || msg.content || "";

      let createdAt: number;
      if (typeof msg.CreatedAt === "number") {
        createdAt = msg.CreatedAt;
      } else if (typeof msg.created_at === "number") {
        createdAt = msg.created_at;
      } else {
        createdAt = idx;
      }

      let sources: MessageSource[] | undefined;
      if (msg.Citations && typeof msg.Citations === "object") {
        sources = Object.entries(msg.Citations).map(
          ([key, citation]: [string, any]) => ({
            memory_id: key,
            title: citation?.title || citation?.Title,
            created_at: citation?.timestamp
              ? typeof citation.timestamp === "string"
                ? citation.timestamp
                : new Date(citation.timestamp).toISOString()
              : citation?.created_at,
          }),
        );
      } else if (msg.metadata?.sources) {
        sources = msg.metadata.sources;
      }

      const role: "user" | "assistant" = isUser ? "user" : "assistant";
      return {
        id: msg.id || `msg_${idx}`,
        role,
        content: text,
        sources,
        createdAt,
      };
    });

    const hasProperTimestamps = formattedMessages.some(
      (msg) => msg.createdAt > 100,
    );

    let sortedMessages = formattedMessages;

    if (!hasProperTimestamps && formattedMessages.length > 1) {
      const firstIsAssistant = formattedMessages[0].role === "assistant";
      const secondIsUser =
        formattedMessages.length > 1 && formattedMessages[1].role === "user";

      if (firstIsAssistant && secondIsUser) {
        sortedMessages = [...formattedMessages].reverse();
      }
    } else if (hasProperTimestamps) {
      sortedMessages = [...formattedMessages].sort(
        (a, b) => a.createdAt - b.createdAt,
      );
    }

    const finalMessages = sortedMessages.map(
      ({ createdAt: _ignored, ...rest }) => rest,
    );

    return {
      chat_id: result.chat_id,
      messages: finalMessages,
    };
  } catch (error: any) {
    console.error("Error fetching memory chat ID and messages:", error);
    throw new Error(
      `Failed to get memory chat: ${error?.message || "Unknown error"}`,
    );
  }
}

/**
 * Creates a new chat session, optionally linked to memory IDs.
 * Returns existing chat ID if memory already has a chat.
 */
export async function createChatSession(
  memoryIds: string[] = [],
): Promise<string> {
  const backendUrl = config.BACKEND_URL;
  if (!backendUrl) {
    throw new Error("Backend URL is not configured.");
  }

  if (memoryIds.length > 0) {
    const response = await authorizedFetch(
      `${backendUrl}/ask-neo/get_memory_chat_id?memory_id=${memoryIds[0]}`,
      undefined,
      { purpose: "create a chat" },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to get chat: ${text || response.statusText}`);
    }

    const parsed = await response.json();
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed[0].chat_id;
    }
  }

  return `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Sends message to Neo and streams response via SSE.
 * Returns abort function to cancel stream.
 * Events: "answer" (text chunks), "metadata" (citations), "end", "error".
 */
export async function sendStreamMessage({
  message,
  chatId,
  memoryIds = [],
  onChunk,
  onComplete,
  onError,
  onMetadata,
}: {
  message: string;
  chatId: string;
  memoryIds?: string[];
  onChunk: (chunk: string) => void;
  onComplete: (sources?: MessageSource[]) => void;
  onError: (error: Error) => void;
  onMetadata?: (metadata: MetadataData) => void;
}): Promise<() => void> {
  const backendUrl = config.BACKEND_URL;
  if (!backendUrl) {
    onError(new Error("Backend URL is not configured."));
    return () => {};
  }

  const userMessageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const controller = new AbortController();

  const sanitizedMemoryIds = (memoryIds || [])
    .map((id) => id?.trim())
    .filter((id): id is string => Boolean(id && id.length > 0));

  let requestMemoryId: string | string[] | undefined;
  if (sanitizedMemoryIds.length === 1) {
    requestMemoryId = sanitizedMemoryIds[0];
  } else if (sanitizedMemoryIds.length > 1) {
    requestMemoryId = sanitizedMemoryIds;
  }

  const body: Record<string, unknown> = {
    user_query: message,
    chat_id: chatId,
    message_id: userMessageId,
    is_v1: false,
  };

  if (requestMemoryId) {
    body.memory_id = requestMemoryId;
  }

  const requestConfig: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  };

  (async () => {
    try {
      const response = await authorizedFetch(
        `${backendUrl}/ask-neo/query_request`,
        requestConfig,
        {
          purpose: "chat with Neo",
        },
      );

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Server error: ${text || response.statusText}`);
      }

      if (!response.body) {
        await handleNonStreamResponse(response, onChunk, onComplete);
        return;
      }

      await consumeJsonEventStream(response.body, {
        onChunk,
        onComplete,
        onMetadata,
      });
    } catch (error: any) {
      if (controller.signal.aborted || error?.name === "AbortError") {
        return;
      }

      const normalizedError =
        error instanceof Error
          ? error
          : new Error("Neo was unable to respond. Try again.");
      onError(normalizedError);
    }
  })();

  return () => controller.abort();
}

/**
 * Handles non-streaming response by parsing JSON and extracting answer/sources.
 */
async function handleNonStreamResponse(
  response: Response,
  onChunk: (chunk: string) => void,
  onComplete: (sources?: MessageSource[]) => void,
) {
  const raw = await response.text();
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Neo returned an empty response.");
  }

  let parsed: any = trimmed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {}

  const answer = extractAnswer(parsed, trimmed);
  if (answer) {
    onChunk(answer);
  }

  const sources = extractSources(parsed);
  onComplete(sources);
}

/**
 * Consumes SSE stream and emits events as JSON objects are parsed.
 * Handles partial JSON objects split across chunks.
 */
async function consumeJsonEventStream(
  stream: ReadableStream<Uint8Array>,
  handlers: {
    onChunk: (chunk: string) => void;
    onComplete: (sources?: MessageSource[]) => void;
    onMetadata?: (metadata: MetadataData) => void;
  },
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let hasCompleted = false;
  let latestSources: MessageSource[] | undefined;

  const emitEvent = (payload: string) => {
    const event = JSON.parse(payload) as StreamedMessageEvent;
    switch (event.event) {
      case "answer": {
        if (typeof event.data === "string" && event.data.trim().length > 0) {
          handlers.onChunk(event.data);
        }
        break;
      }
      case "metadata": {
        handlers.onMetadata?.(event.data);
        latestSources = extractSources(event.data);
        break;
      }
      case "end": {
        hasCompleted = true;
        handlers.onComplete(latestSources);
        break;
      }
      case "error": {
        const message =
          typeof event.data === "string"
            ? event.data
            : event.data?.message || "Neo was unable to respond.";
        throw new Error(message);
      }
      default:
        break;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    buffer = drainJsonBuffer(buffer, emitEvent);
  }

  const remaining = buffer.trim();
  if (remaining) {
    try {
      emitEvent(remaining);
    } catch {}
  }

  if (!hasCompleted) {
    handlers.onComplete(latestSources);
  }
}

/**
 * Parses stream buffer to extract complete JSON objects.
 * Handles partial JSON split across chunks by tracking depth/escaping.
 */
function drainJsonBuffer(
  buffer: string,
  emit: (payload: string) => void,
): string {
  let startIndex = -1;
  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < buffer.length; i += 1) {
    const char = buffer[i];

    if (startIndex === -1) {
      if (char === "{") {
        startIndex = i;
        depth = 1;
      }
      continue;
    }

    if (inString) {
      if (escapeNext) {
        escapeNext = false;
      } else if (char === "\\") {
        escapeNext = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        const jsonChunk = buffer.slice(startIndex, i + 1);
        emit(jsonChunk);

        buffer = buffer.slice(i + 1);
        i = -1;
        startIndex = -1;
        depth = 0;
        inString = false;
        escapeNext = false;
      }
    }
  }

  if (startIndex > 0) {
    return buffer.slice(startIndex);
  }

  const nextStart = buffer.indexOf("{");
  if (nextStart > 0) {
    return buffer.slice(nextStart);
  }

  return buffer;
}

/**
 * Extracts answer text from various response payload formats.
 */
function extractAnswer(payload: any, fallback: string): string {
  if (payload == null) {
    return fallback;
  }

  if (typeof payload === "string") {
    return payload;
  }

  const candidate =
    payload.answer ??
    payload.message ??
    payload.data?.answer ??
    payload.data?.message ??
    payload.response ??
    null;

  if (typeof candidate === "string" && candidate.trim()) {
    return candidate;
  }

  return fallback;
}

/**
 * Extracts citation sources from response payload.
 * Handles both array and object citation formats.
 */
function extractSources(payload: any) {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const rawCitations =
    payload.citations ??
    payload.data?.citations ??
    payload.metadata?.citations ??
    null;

  if (!rawCitations) {
    return undefined;
  }

  if (Array.isArray(rawCitations)) {
    return rawCitations.map((citation) => ({
      memory_id: citation?.memory_id,
      title: citation?.title,
      created_at: citation?.timestamp,
    }));
  }

  if (typeof rawCitations === "object") {
    return Object.entries(rawCitations).map(([key, citation]) => ({
      memory_id: key,
      title: (citation as any)?.title,
      created_at: (citation as any)?.timestamp,
    }));
  }

  return undefined;
}

export interface DynamicPrompt {
  id: string;
  text: string;
}

interface DynamicPromptsResponse {
  success: boolean;
  data: DynamicPrompt[];
}

/**
 * Fetches dynamic prompts from backend for chat suggestions.
 */
export async function getDynamicPrompts(): Promise<DynamicPrompt[]> {
  const backendUrl = config.BACKEND_URL;
  if (!backendUrl) {
    throw new Error("Backend URL is not configured.");
  }

  try {
    const response = await authorizedFetch(`${backendUrl}/prompts`, undefined, {
      purpose: "get dynamic prompts",
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to get prompts: ${text || response.statusText}`);
    }

    const parsed = (await response.json()) as DynamicPromptsResponse;
    if (parsed.success && Array.isArray(parsed.data)) {
      return parsed.data;
    }
    return [];
  } catch (error: any) {
    console.error("Error fetching dynamic prompts:", error);
    return [];
  }
}

/**
 * Marks a dynamic prompt as used to track usage analytics.
 */
export async function markDynamicPromptAsUsed(promptId: string): Promise<void> {
  const backendUrl = config.BACKEND_URL;
  if (!backendUrl) {
    throw new Error("Backend URL is not configured.");
  }

  try {
    const response = await authorizedFetch(
      `${backendUrl}/prompts/used?prompt_id=${encodeURIComponent(promptId)}`,
      {
        method: "PATCH",
      },
      { purpose: "mark prompt as used" },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Failed to mark prompt as used: ${text || response.statusText}`,
      );
    }
  } catch (error: any) {
    console.error("Error marking prompt as used:", error);
  }
}
