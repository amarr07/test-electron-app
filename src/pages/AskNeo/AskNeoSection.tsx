import {
  ChatSession,
  createChatSession,
  DynamicPrompt,
  getChatSessions,
  getDynamicPrompts,
  loadChatMessages,
  markDynamicPromptAsUsed,
  sendStreamMessage,
} from "@/api/askNeo";
import { getMemoriesByIds, MemoryRecord } from "@/api/memories";
import { MarkdownText } from "@/components/ui/markdown";
import { useToast } from "@/providers/ToastProvider";
import { ArrowUp, ChevronRight, History, Loader2, Plus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Array<{
    memory_id?: string;
    title?: string;
    created_at?: string;
  }>;
}

interface AskNeoSectionProps {
  sidebarCollapsed?: boolean;
  onOpenMemory?: (memoryId: string) => void;
  sessionToOpen?: string | null;
  onSessionOpened?: () => void;
}

/**
 * Ask Neo chat interface with streaming responses.
 * Features: dynamic prompts, chat history, message streaming with typing animation,
 * source references, memory preview modal, and smart auto-scroll.
 */
export function AskNeoSection({
  onOpenMemory,
  sessionToOpen,
  onSessionOpened,
}: AskNeoSectionProps) {
  const { toast } = useToast();
  const [memoryCache, setMemoryCache] = useState<Record<string, MemoryRecord>>(
    {},
  );
  const [memoryPreview, setMemoryPreview] = useState<MemoryPreviewState | null>(
    null,
  );
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [dynamicPrompts, setDynamicPrompts] = useState<DynamicPrompt[]>([]);
  const [loadingPrompts, setLoadingPrompts] = useState(false);
  const promptsLoadedRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const cancelStreamRef = useRef<(() => void) | null>(null);
  const historyRef = useRef<HTMLDivElement | null>(null);
  const isUserScrollingRef = useRef(false);
  const shouldAutoScrollRef = useRef(true);
  const scrollTimeoutRef = useRef<number | null>(null);
  const lastScrollTopRef = useRef(0);
  const userHasScrolledUpRef = useRef(false);
  const messageCountRef = useRef(0);

  /**
   * Updates the last assistant message (used for streaming text updates).
   */
  const updateLastAssistantMessage = useCallback(
    (updater: (message: Message) => Message) => {
      setMessages((prev) => {
        if (prev.length === 0) return prev;
        const lastIndex = prev.length - 1;
        const lastMessage = prev[lastIndex];
        if (lastMessage.role !== "assistant") {
          return prev;
        }
        const updated = updater(lastMessage);
        if (updated === lastMessage) {
          return prev;
        }
        const next = [...prev];
        next[lastIndex] = updated;
        return next;
      });
    },
    [],
  );

  const canSend = prompt.trim().length > 0 && !isStreaming;

  /**
   * Scrolls to bottom of messages, respecting user scroll position.
   * Only auto-scrolls if user is near bottom or force=true.
   */
  const scrollToBottom = useCallback((force = false) => {
    const container = messagesContainerRef.current;
    if (!container) return;

    if (!force) {
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      const threshold = 150;

      if (distanceFromBottom > threshold || userHasScrolledUpRef.current) {
        return;
      }

      if (isUserScrollingRef.current) {
        return;
      }
    }

    requestAnimationFrame(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: "auto" });
      }
    });
  }, []);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const threshold = 100;
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;

      const currentScrollTop = container.scrollTop;
      const scrolledUp = currentScrollTop > lastScrollTopRef.current;
      lastScrollTopRef.current = currentScrollTop;

      if (scrolledUp && distanceFromBottom > threshold) {
        userHasScrolledUpRef.current = true;
        shouldAutoScrollRef.current = false;
      }

      if (distanceFromBottom < threshold) {
        shouldAutoScrollRef.current = true;
        userHasScrolledUpRef.current = false;
        isUserScrollingRef.current = false;
      } else {
        shouldAutoScrollRef.current = false;
      }

      if (scrollTimeoutRef.current !== null) {
        window.clearTimeout(scrollTimeoutRef.current);
      }

      isUserScrollingRef.current = true;

      scrollTimeoutRef.current = window.setTimeout(() => {
        isUserScrollingRef.current = false;
        if (distanceFromBottom < threshold && !userHasScrolledUpRef.current) {
          scrollToBottom(true);
        }
      }, 200);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", handleScroll);
      if (scrollTimeoutRef.current !== null) {
        window.clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [scrollToBottom]);

  useEffect(() => {
    const currentMessageCount = messages.length;
    const isNewMessage = currentMessageCount !== messageCountRef.current;
    messageCountRef.current = currentMessageCount;

    if (
      isNewMessage &&
      !userHasScrolledUpRef.current &&
      !isUserScrollingRef.current
    ) {
      setTimeout(() => {
        scrollToBottom();
      }, 50);
    }
  }, [messages.length, scrollToBottom]);

  useEffect(() => {
    return () => {
      cancelStreamRef.current?.();
      cancelStreamRef.current = null;
      if (scrollTimeoutRef.current !== null) {
        window.clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!showHistory) return;
    const handleClick = (event: MouseEvent) => {
      if (
        historyRef.current &&
        !historyRef.current.contains(event.target as Node)
      ) {
        setShowHistory(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showHistory]);

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const data = await getChatSessions();
      setSessions(data);
    } catch (error: any) {
      setSessions([]);
    } finally {
      setLoadingSessions(false);
    }
  }, [toast]);

  useEffect(() => {
    if (messages.length === 0) {
      if (!promptsLoadedRef.current && !loadingPrompts) {
        promptsLoadedRef.current = true;
        setLoadingPrompts(true);
        getDynamicPrompts()
          .then((prompts) => {
            setDynamicPrompts(prompts);
          })
          .catch((error: any) => {
            console.error("Failed to load dynamic prompts:", error);
            setDynamicPrompts([]);
          })
          .finally(() => {
            setLoadingPrompts(false);
          });
      }
    } else {
      if (dynamicPrompts.length > 0) {
        setDynamicPrompts([]);
      }
      promptsLoadedRef.current = false;
    }
  }, [messages.length]);

  const closeMemoryPreview = useCallback(() => {
    setMemoryPreview(null);
  }, []);

  /**
   * Handles click on memory source reference.
   * Opens memory preview modal or calls onOpenMemory callback.
   */
  const handleSourceClick = useCallback(
    (memoryId?: string) => {
      if (!memoryId) return;
      if (onOpenMemory) {
        onOpenMemory(memoryId);
        return;
      }
      const cached = memoryCache[memoryId];
      if (cached) {
        setMemoryPreview({ status: "ready", memoryId, record: cached });
        return;
      }
      setMemoryPreview({ status: "loading", memoryId });
      getMemoriesByIds({ memoryIds: [memoryId], pageSize: 1 })
        .then(({ records }) => {
          const record = records[0];
          if (!record) {
            throw new Error("Memory not found.");
          }
          setMemoryCache((prev) => ({ ...prev, [memoryId]: record }));
          setMemoryPreview({ status: "ready", memoryId, record });
        })
        .catch((error: any) => {
          setMemoryPreview({
            status: "error",
            memoryId,
            error: error?.message || "Failed to load memory.",
          });
        });
    },
    [memoryCache, onOpenMemory],
  );

  /**
   * Handles dynamic prompt click, marks as used, and sends message.
   */
  const handlePromptClick = useCallback(
    async (promptText: string, promptId: string) => {
      await markDynamicPromptAsUsed(promptId);
      setPrompt(promptText);
      const trimmedPrompt = promptText.trim();
      if (!trimmedPrompt || isStreaming) return;

      cancelStreamRef.current?.();
      cancelStreamRef.current = null;

      const userMessage: Message = {
        id: `msg_${Date.now()}`,
        role: "user",
        content: trimmedPrompt,
      };

      setMessages((prev) => [...prev, userMessage]);
      setPrompt("");
      setIsStreaming(true);
      shouldAutoScrollRef.current = true;
      isUserScrollingRef.current = false;
      userHasScrolledUpRef.current = false;

      try {
        let chatId = currentChatId;
        if (!chatId) {
          chatId = await createChatSession([]);
          setCurrentChatId(chatId);
        }

        const assistantMessage: Message = {
          id: `msg_${Date.now() + 1}`,
          role: "assistant",
          content: "",
        };

        setMessages((prev) => [...prev, assistantMessage]);

        cancelStreamRef.current = await sendStreamMessage({
          message: userMessage.content,
          chatId,
          memoryIds: [],
          onChunk: (chunk) => {
            updateLastAssistantMessage((last) => ({
              ...last,
              content: (last.content || "") + chunk,
            }));
          },
          onComplete: (sources) => {
            if (sources && sources.length > 0) {
              updateLastAssistantMessage((last) => ({
                ...last,
                sources,
              }));
            }
            setIsStreaming(false);
            cancelStreamRef.current = null;
          },
          onError: (error) => {
            toast({
              title: "Unable to send message",
              description: error.message || "Try again.",
              variant: "destructive",
            });
            setMessages((prev) => prev.slice(0, -1));
            setIsStreaming(false);
            cancelStreamRef.current = null;
          },
          onMetadata: (metadata) => {
            if (metadata?.chat_id) {
              setCurrentChatId(metadata.chat_id);
            }
          },
        });
      } catch (error: any) {
        toast({
          title: "Unable to send message",
          description: error?.message || "Try again.",
          variant: "destructive",
        });
        setMessages((prev) => prev.slice(0, -1));
        setIsStreaming(false);
        cancelStreamRef.current = null;
      }
    },
    [isStreaming, currentChatId, toast, updateLastAssistantMessage],
  );

  /**
   * Sends user message and initiates streaming response.
   * Creates chat session if needed and handles streaming chunks.
   */
  const handleSend = async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || isStreaming) return;

    cancelStreamRef.current?.();
    cancelStreamRef.current = null;

    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      role: "user",
      content: trimmedPrompt,
    };

    setMessages((prev) => [...prev, userMessage]);
    setPrompt("");
    setIsStreaming(true);
    shouldAutoScrollRef.current = true;
    isUserScrollingRef.current = false;
    userHasScrolledUpRef.current = false;

    try {
      let chatId = currentChatId;
      if (!chatId) {
        chatId = await createChatSession([]);
        setCurrentChatId(chatId);
      }

      const assistantMessage: Message = {
        id: `msg_${Date.now() + 1}`,
        role: "assistant",
        content: "",
      };

      setMessages((prev) => [...prev, assistantMessage]);

      cancelStreamRef.current = await sendStreamMessage({
        message: userMessage.content,
        chatId,
        memoryIds: [],
        onChunk: (chunk) => {
          updateLastAssistantMessage((last) => ({
            ...last,
            content: (last.content || "") + chunk,
          }));
        },
        onComplete: (sources) => {
          if (sources && sources.length > 0) {
            updateLastAssistantMessage((last) => ({
              ...last,
              sources,
            }));
          }
          setIsStreaming(false);
          cancelStreamRef.current = null;
        },
        onError: (error) => {
          toast({
            title: "Unable to send message",
            description: error.message || "Try again.",
            variant: "destructive",
          });
          setMessages((prev) => prev.slice(0, -1));
          setIsStreaming(false);
          cancelStreamRef.current = null;
        },
        onMetadata: (metadata) => {
          if (metadata?.chat_id) {
            setCurrentChatId(metadata.chat_id);
          }
        },
      });
    } catch (error: any) {
      toast({
        title: "Unable to send message",
        description: error?.message || "Try again.",
        variant: "destructive",
      });
      setMessages((prev) => prev.slice(0, -1));
      setIsStreaming(false);
      cancelStreamRef.current = null;
    }
  };

  const handleNewChat = () => {
    cancelStreamRef.current?.();
    cancelStreamRef.current = null;
    setIsStreaming(false);
    setPrompt("");
    setCurrentChatId(null);
    setMessages([]);
    setShowHistory(false);
    shouldAutoScrollRef.current = true;
    isUserScrollingRef.current = false;
    userHasScrolledUpRef.current = false;
    messageCountRef.current = 0;
    promptsLoadedRef.current = false;
  };

  /**
   * Loads chat session messages and displays them.
   */
  const handleLoadSession = useCallback(
    async (session: ChatSession) => {
      try {
        setLoadingSessions(true);
        setCurrentChatId(session.id);
        setMessages([]);
        setShowHistory(false);

        const loadedMessages = await loadChatMessages(session.id);
        const formattedMessages: Message[] = loadedMessages.map((msg) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          sources: msg.metadata?.sources,
        }));

        setMessages(formattedMessages);

        setTimeout(() => {
          scrollToBottom(true);
        }, 100);
      } catch (error: any) {
        toast({
          title: "Unable to load session",
          description: error?.message || "Try again.",
          variant: "destructive",
        });
      } finally {
        setLoadingSessions(false);
      }
    },
    [toast, scrollToBottom],
  );

  useEffect(() => {
    if (!sessionToOpen) return;
    (async () => {
      try {
        setLoadingSessions(true);
        setCurrentChatId(sessionToOpen);
        setMessages([]);
        setShowHistory(false);

        const loadedMessages = await loadChatMessages(sessionToOpen);
        const formattedMessages: Message[] = loadedMessages.map((msg) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          sources: msg.metadata?.sources,
        }));

        setMessages(formattedMessages);
        setTimeout(() => {
          scrollToBottom(true);
        }, 100);
      } catch (error: any) {
        toast({
          title: "Unable to open session",
          description: error?.message || "Try again.",
          variant: "destructive",
        });
      } finally {
        setLoadingSessions(false);
        onSessionOpened?.();
      }
    })();
  }, [sessionToOpen, onSessionOpened, scrollToBottom, toast]);

  const groupedSessions = useMemo(() => {
    const groups: Record<string, ChatSession[]> = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    sessions.forEach((session) => {
      const sessionDate = new Date(session.CreatedAt * 1000);
      sessionDate.setHours(0, 0, 0, 0);

      let groupKey: string;
      if (sessionDate.getTime() === today.getTime()) {
        groupKey = "Today";
      } else if (sessionDate.getTime() === yesterday.getTime()) {
        groupKey = "Yesterday";
      } else {
        groupKey = sessionDate.toLocaleDateString("en-US", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
      }

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(session);
    });

    Object.keys(groups).forEach((key) => {
      groups[key].sort((a, b) => b.CreatedAt - a.CreatedAt);
    });

    Object.keys(groups).forEach((key) => {
      groups[key].sort((a, b) => b.CreatedAt - a.CreatedAt);
    });

    return groups;
  }, [sessions]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      <div className="w-full max-w-4xl mx-auto flex-1 flex flex-col min-h-0 overflow-y-auto px-4 sm:px-6 pb-24">
        <div className="flex items-center justify-between mb-1">
          <p className="text-[11px] uppercase tracking-[0.3em] text-muted">
            Ask Neo
          </p>
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowHistory(!showHistory);
                if (!showHistory) {
                  loadSessions();
                }
              }}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted transition hover:border-foreground hover:text-foreground"
              aria-label="View sessions"
            >
              <History className="h-4 w-4" />
            </button>
            {showHistory && (
              <div
                ref={historyRef}
                className="absolute right-0 top-12 w-80 max-h-96 overflow-y-auto rounded-2xl border border-[#d0d0d0] dark:border-[#404040] bg-surface shadow-[0_12px_30px_rgba(15,23,42,0.12)] p-3"
              >
                <div className="flex items-center justify-between mb-3 px-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    Sessions
                  </h3>
                  {currentChatId && (
                    <button
                      type="button"
                      onClick={handleNewChat}
                      className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                    >
                      <Plus className="h-3 w-3" />
                      New Chat
                    </button>
                  )}
                </div>
                {loadingSessions ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted" />
                  </div>
                ) : sessions.length === 0 ? (
                  <p className="text-center text-sm text-muted py-8">
                    No sessions yet
                  </p>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(groupedSessions).map(
                      ([groupKey, groupSessions]) => (
                        <div key={groupKey}>
                          <p className="text-xs font-semibold text-muted mb-2 px-2">
                            {groupKey}
                          </p>
                          <div className="space-y-1">
                            {groupSessions.map((session) => (
                              <button
                                key={session.id}
                                type="button"
                                onClick={() => handleLoadSession(session)}
                                className={`w-full group flex items-center justify-between rounded-xl px-3 py-2.5 transition hover:bg-slate-100/80 dark:hover:bg-[#1f1f1f] text-left ${
                                  currentChatId === session.id
                                    ? "bg-slate-100/60 dark:bg-[#1f1f1f]/60"
                                    : ""
                                }`}
                              >
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-foreground truncate">
                                    {session.Title || "New Chat"}
                                  </p>
                                  <p className="text-xs text-muted">
                                    {new Date(
                                      session.CreatedAt * 1000,
                                    ).toLocaleTimeString("en-US", {
                                      hour: "numeric",
                                      minute: "2-digit",
                                    })}
                                  </p>
                                </div>
                                <ChevronRight className="h-4 w-4 text-[#0f8b54] flex-shrink-0" />
                              </button>
                            ))}
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col">
          {messages.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center pb-10">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-semibold text-foreground/70 mb-6">
                  It's Great To
                  <br />
                  See You!
                </h2>
                {loadingPrompts ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted" />
                  </div>
                ) : dynamicPrompts.length > 0 ? (
                  <div className="w-full max-w-4xl px-4">
                    <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {dynamicPrompts.map((prompt) => (
                        <button
                          key={prompt.id}
                          type="button"
                          onClick={() =>
                            handlePromptClick(prompt.text, prompt.id)
                          }
                          className="group w-full rounded-lg border border-[#d0d0d0] dark:border-[#404040] bg-surface px-4 py-2.5 text-left text-sm font-medium text-foreground transition hover:border-[#0f8b54] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0f8b54]/40 shadow-sm"
                        >
                          <span className="block leading-relaxed">
                            {prompt.text}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div
              ref={messagesContainerRef}
              className="flex-1 w-full overflow-y-auto space-y-4 pr-1 pb-24"
            >
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[85%] ${
                      message.role === "user"
                        ? "rounded-3xl bg-primary px-5 py-3.5 text-primary-foreground"
                        : "px-1 py-1 text-foreground"
                    }`}
                  >
                    {message.role === "assistant" ? (
                      message.content ? (
                        <div className="prose prose-sm max-w-none prose-headings:text-foreground prose-p:text-foreground prose-strong:text-foreground prose-code:text-foreground">
                          <MarkdownText content={message.content} />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-muted">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="text-sm font-medium">
                            Thinking...
                          </span>
                        </div>
                      )
                    ) : (
                      <p className="text-sm leading-relaxed">
                        {message.content}
                      </p>
                    )}
                    {message.sources && message.sources.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-border/30">
                        <p className="mb-2 text-xs font-medium text-muted">
                          Sources:
                        </p>
                        <div className="space-y-1.5">
                          {(message.sources ?? [])
                            .slice(0, 3)
                            .map((source, idx) => (
                              <button
                                type="button"
                                key={`${source.memory_id ?? idx}-${idx}`}
                                onClick={() =>
                                  handleSourceClick(source.memory_id)
                                }
                                disabled={!source.memory_id}
                                className="w-full text-left rounded-xl border border-[#d0d0d0] dark:border-[#404040] bg-surface px-3 py-2 text-xs text-muted transition hover:border-primary/60 hover:bg-slate-100/80 dark:hover:bg-[#1f1f1f] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-60 shadow-sm"
                              >
                                <div className="flex items-start gap-2">
                                  <span
                                    aria-hidden="true"
                                    className="mt-1 inline-flex h-1.5 w-1.5 rounded-full bg-primary/60"
                                  />
                                  <div className="space-y-0.5">
                                    <p className="text-xs font-medium text-foreground">
                                      {source.title?.trim() ||
                                        `Memory ${source.memory_id}`}
                                    </p>
                                    {source.created_at && (
                                      <p className="text-[11px] text-muted/80">
                                        {new Date(
                                          source.created_at,
                                        ).toLocaleString()}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </button>
                            ))}
                          {(message.sources?.length ?? 0) > 3 && (
                            <p className="text-[11px] text-muted/70">
                              Showing top 3 of {message.sources.length}{" "}
                              references.
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      <div className="w-full max-w-4xl mx-auto sticky bg-transparent bottom-0 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3">
        <div className="flex items-center gap-2 rounded-full border border-[#d0d0d0] dark:border-[#404040] bg-surface px-4 py-2 transition focus-within:border-[#0f8b54] focus-within:shadow-[0_0_0_1px_rgba(15,139,84,0.35)] shadow-sm">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask me anything"
            disabled={isStreaming}
            className="flex-1 h-10 rounded-full border-none bg-transparent px-0 text-sm font-medium leading-tight text-foreground placeholder:text-muted focus:outline-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
              canSend
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted/30 text-muted cursor-not-allowed"
            }`}
            aria-label="Send question"
          >
            <ArrowUp
              className={`h-3.5 w-3.5 ${isStreaming ? "opacity-60" : ""}`}
            />
          </button>
        </div>
      </div>

      {memoryPreview && (
        <MemoryReferenceModal
          state={memoryPreview}
          onClose={closeMemoryPreview}
          onRetry={() => handleSourceClick(memoryPreview.memoryId)}
        />
      )}
    </div>
  );
}

type MemoryPreviewState =
  | { status: "loading"; memoryId: string }
  | { status: "ready"; memoryId: string; record: MemoryRecord }
  | { status: "error"; memoryId: string; error: string };

interface MemoryReferenceModalProps {
  state: MemoryPreviewState;
  onClose: () => void;
  onRetry: () => void;
}

/**
 * Modal for previewing memory referenced in chat response.
 * Displays memory title, summary, and metadata.
 */
function MemoryReferenceModal({
  state,
  onClose,
  onRetry,
}: MemoryReferenceModalProps) {
  const { status } = state;
  const memory = status === "ready" ? state.record : undefined;

  const title =
    status === "ready"
      ? memory?.title?.trim() || "Untitled memory"
      : status === "error"
        ? "Unable to open memory"
        : "Opening memory…";

  const description =
    status === "ready"
      ? memory?.summary?.trim() || "Neo hasn't summarized this memory yet."
      : status === "error"
        ? state.error
        : "Fetching the referenced memory details.";

  const metadata: Array<{ label: string; value: string }> = [];
  if (memory?.created_at) {
    metadata.push({
      label: "Captured",
      value: new Date(memory.created_at).toLocaleString(),
    });
  }
  if (memory?.domain) {
    metadata.push({ label: "Domain", value: memory.domain });
  }
  if (memory?.topics && memory.topics.length > 0) {
    metadata.push({ label: "Topics", value: memory.topics.join(", ") });
  }
  if (memory?.participants && memory.participants.length > 0) {
    metadata.push({
      label: "Participants",
      value: memory.participants.join(", "),
    });
  }
  if (memory?.tags && memory.tags.length > 0) {
    metadata.push({ label: "Tags", value: memory.tags.join(", ") });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-3xl border border-[#d0d0d0] dark:border-[#404040] bg-surface p-6 shadow-[0_35px_80px_rgba(15,23,42,0.25)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-muted">
              Referenced memory
            </p>
            <h3 className="text-xl font-semibold text-foreground">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#d0d0d0] dark:border-[#404040] text-muted hover:text-foreground shadow-sm"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-[#d0d0d0] dark:border-[#404040] bg-surface p-4 shadow-sm">
          {status === "loading" ? (
            <div className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading memory details…</span>
            </div>
          ) : (
            <p className="text-sm text-muted">{description}</p>
          )}
        </div>

        {status === "ready" && metadata.length > 0 && (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {metadata.map((item) => (
              <div
                key={`${item.label}-${item.value}`}
                className="rounded-2xl border border-[#d0d0d0] dark:border-[#404040] bg-surface px-3 py-2 shadow-sm"
              >
                <p className="text-[11px] uppercase tracking-[0.3em] text-muted">
                  {item.label}
                </p>
                <p className="text-sm font-medium text-foreground">
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        )}

        {status === "error" && (
          <div className="mt-4 flex items-center justify-between rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            <span>{state.error}</span>
            <button
              type="button"
              onClick={onRetry}
              className="text-xs font-semibold text-primary hover:underline"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
