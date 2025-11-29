import {
  createChatSession,
  getMemoryChatIdAndMessages,
  sendStreamMessage,
} from "@/api/askNeo";
import { getMemoriesByIds, MemoryRecord } from "@/api/memories";
import { MarkdownText } from "@/components/ui/markdown";
import { useToast } from "@/providers/ToastProvider";
import {
  ArrowUp,
  Loader2,
  MessageCircle,
  X,
  type LucideIcon,
} from "lucide-react";
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

interface MemoryChatInterfaceProps {
  memoryId: string;
  memoryIds?: string[];
  memoryTitle?: string;
  onOpenMemory?: (memoryId: string) => void;
  initialQuestion?: string;
  placeholder?: string;
  label?: string;
  quickPrompts?: Array<{ label: string; value: string; icon?: LucideIcon }>;
}

/**
 * Chat interface for asking questions about a specific memory.
 * Features: streaming responses, message history, source citations,
 * drag-to-dismiss sheet, and memory preview on citation click.
 */
export function MemoryChatInterface({
  memoryId,
  memoryIds,
  memoryTitle,
  onOpenMemory,
  initialQuestion,
  placeholder,
  label,
  quickPrompts,
}: MemoryChatInterfaceProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [memoryCache, setMemoryCache] = useState<Record<string, MemoryRecord>>(
    {},
  );
  const [memoryPreview, setMemoryPreview] = useState<MemoryPreviewState | null>(
    null,
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const cancelStreamRef = useRef<(() => void) | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayInputRef = useRef<HTMLInputElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(0);
  const dragCurrentY = useRef(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const activeMemoryIds = useMemo(
    () =>
      (memoryIds && memoryIds.length > 0
        ? Array.from(new Set(memoryIds.filter(Boolean)))
        : [memoryId]
      ).filter((id): id is string => Boolean(id && id.length > 0)),
    [memoryId, memoryIds],
  );
  const primaryMemoryId = activeMemoryIds[0];
  const allowHistory = activeMemoryIds.length === 1 && Boolean(primaryMemoryId);
  const memoryContextKey = activeMemoryIds.join("|");

  /**
   * Scrolls to bottom of messages, only if user is near bottom (within 100px).
   * Use force=true to always scroll (e.g., on new message).
   */
  const scrollToBottom = useCallback((force = false) => {
    const container = messagesContainerRef.current;
    if (!container) return;

    if (!force) {
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      const threshold = 100;
      if (distanceFromBottom > threshold) {
        return;
      }
    }

    requestAnimationFrame(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
      }
    });
  }, []);

  const loadExistingChat = useCallback(async () => {
    if (isLoadingChat || !allowHistory || !primaryMemoryId) return;

    setIsLoadingChat(true);
    try {
      const result = await getMemoryChatIdAndMessages(primaryMemoryId);
      if (result && result.chat_id) {
        setCurrentChatId(result.chat_id);
        if (result.messages && result.messages.length > 0) {
          const formattedMessages: Message[] = result.messages.map((msg) => ({
            id: msg.id,
            role: msg.role,
            content: msg.content,
            sources: msg.sources,
          }));
          setMessages(formattedMessages);
          setTimeout(() => {
            scrollToBottom(true);
          }, 100);
        }
      }
    } catch (error: any) {
    } finally {
      setIsLoadingChat(false);
    }
  }, [allowHistory, primaryMemoryId, scrollToBottom, isLoadingChat]);

  useEffect(() => {
    if (isOpen && !currentChatId && !isLoadingChat) {
      loadExistingChat();
    }
  }, [isOpen, currentChatId, isLoadingChat, loadExistingChat]);

  useEffect(() => {
    if (isOpen && messages.length > 0) {
      setTimeout(() => scrollToBottom(), 100);
    }
  }, [messages.length, isOpen, scrollToBottom]);

  useEffect(() => {
    if (isOpen && overlayInputRef.current && prompt.trim().length > 0) {
      setTimeout(() => {
        overlayInputRef.current?.focus();
        if (overlayInputRef.current) {
          const length = overlayInputRef.current.value.length;
          overlayInputRef.current.setSelectionRange(length, length);
        }
      }, 100);
    }
  }, [isOpen, prompt]);

  const lastInitialQuestionRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      cancelStreamRef.current?.();
      cancelStreamRef.current = null;
    };
  }, []);
  useEffect(() => {
    setMessages([]);
    setCurrentChatId(null);
    setPrompt("");
    setIsStreaming(false);
    lastInitialQuestionRef.current = null;
    cancelStreamRef.current?.();
    cancelStreamRef.current = null;
  }, [memoryContextKey]);

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

  const closeMemoryPreview = useCallback(() => {
    setMemoryPreview(null);
  }, []);

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

  const handleSend = async (overridePrompt?: string) => {
    const textToSend = overridePrompt ?? prompt;
    const trimmedPrompt = textToSend.trim();
    if (!trimmedPrompt || isStreaming) return;

    if (!isOpen) {
      setIsOpen(true);
      setIsAnimating(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsAnimating(false);
          setTimeout(() => {
            overlayInputRef.current?.focus();
          }, 50);
        });
      });
    }

    cancelStreamRef.current?.();
    cancelStreamRef.current = null;

    setPrompt("");
    setIsStreaming(true);

    try {
      let chatId = currentChatId;

      if (!chatId && !isLoadingChat && allowHistory && primaryMemoryId) {
        try {
          const result = await getMemoryChatIdAndMessages(primaryMemoryId);
          if (result && result.chat_id) {
            chatId = result.chat_id;
            setCurrentChatId(chatId);

            if (result.messages && result.messages.length > 0) {
              const formattedMessages: Message[] = result.messages.map(
                (msg) => ({
                  id: msg.id,
                  role: msg.role,
                  content: msg.content,
                  sources: msg.sources,
                }),
              );
              setMessages(formattedMessages);
            }
          }
        } catch (error) {}
      }

      if (!chatId) {
        const chatContextIds = allowHistory ? activeMemoryIds : [];
        chatId = await createChatSession(chatContextIds);
        setCurrentChatId(chatId);
      }

      const userMessage: Message = {
        id: `msg_${Date.now()}`,
        role: "user",
        content: trimmedPrompt,
      };

      setMessages((prev) => [...prev, userMessage]);

      const assistantMessage: Message = {
        id: `msg_${Date.now() + 1}`,
        role: "assistant",
        content: "",
      };

      setMessages((prev) => [...prev, assistantMessage]);

      cancelStreamRef.current = await sendStreamMessage({
        message: userMessage.content,
        chatId,
        memoryIds: activeMemoryIds,
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

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPrompt(e.target.value);
  };

  const handleInputClick = () => {
    if (!isOpen) {
      setIsOpen(true);
      setIsAnimating(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsAnimating(false);
          setTimeout(() => {
            overlayInputRef.current?.focus();
          }, 50);
        });
      });
    } else {
      setTimeout(() => {
        overlayInputRef.current?.focus();
      }, 50);
    }
  };
  const handleQuickPrompt = (promptText: string) => {
    if (!promptText.trim()) return;
    setPrompt(promptText);
    handleSend(promptText);
  };

  useEffect(() => {
    const trimmed = initialQuestion?.trim();
    if (!trimmed) return;

    if (lastInitialQuestionRef.current === trimmed) {
      return;
    }
    lastInitialQuestionRef.current = trimmed;
    handleQuickPrompt(trimmed);
  }, [initialQuestion]);

  const handleInputFocus = () => {
    if (!isOpen) {
      setIsOpen(true);
      setIsAnimating(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsAnimating(false);
          setTimeout(() => {
            overlayInputRef.current?.focus();
          }, 50);
        });
      });
    } else {
      setTimeout(() => {
        overlayInputRef.current?.focus();
      }, 50);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
  };
  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDragging(true);
    const clientY =
      "touches" in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    dragStartY.current = clientY;
    dragCurrentY.current = clientY;
  };

  const handleDragMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging) return;
    const clientY =
      "touches" in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    dragCurrentY.current = clientY;
    const deltaY = dragCurrentY.current - dragStartY.current;
    if (deltaY > 0 && sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${deltaY}px)`;
    }
  };

  const handleDragEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    const deltaY = dragCurrentY.current - dragStartY.current;
    if (deltaY > 100 && sheetRef.current) {
      handleClose();
      sheetRef.current.style.transform = "";
    } else if (sheetRef.current) {
      sheetRef.current.style.transform = "";
    }
  };

  const canSend = prompt.trim().length > 0 && !isStreaming;
  const placeholderText = placeholder || "Ask me about this memory";
  const labelText = label;

  return (
    <>
      <div
        className={`fixed bottom-0 left-56 bg-background right-0 ${isOpen ? "z-30" : "z-40"} px-4 pt-2`}
      >
        <div className="mx-auto">
          <div className="px-4 py-3 space-y-3">
            {labelText && (
              <div className="flex items-center justify-between px-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted">
                  {labelText}
                </p>
                {activeMemoryIds.length > 1 && (
                  <span className="text-[11px] text-muted">
                    {activeMemoryIds.length} selected
                  </span>
                )}
              </div>
            )}
            {quickPrompts && quickPrompts.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {quickPrompts.map((promptOption) => {
                  const Icon = promptOption.icon;
                  return (
                    <button
                      key={promptOption.label}
                      type="button"
                      onClick={() => handleQuickPrompt(promptOption.value)}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-border/60 bg-surface/95 px-3 py-2.5 text-sm font-semibold text-foreground shadow-[0_6px_14px_rgba(0,0,0,0.08)] transition hover:border-[#0f8b54]/70 hover:text-[#0f8b54]"
                    >
                      {Icon && <Icon className="h-4 w-4" />}
                      {promptOption.label}
                    </button>
                  );
                })}
              </div>
            )}
            <div
              className="flex items-center gap-2 rounded-full border border-border/60 bg-surface/95 px-4 py-3 transition cursor-text focus-within:border-[#0f8b54] focus-within:shadow-[0_0_0_1px_rgba(15,139,84,0.35)]"
              onClick={handleInputClick}
            >
              <input
                ref={inputRef}
                type="text"
                value={prompt}
                onChange={handleInputChange}
                onKeyPress={handleKeyPress}
                onClick={handleInputClick}
                onFocus={handleInputFocus}
                placeholder={placeholderText}
                readOnly={isStreaming}
                className="flex-1 h-8 border-none bg-transparent text-sm font-medium text-foreground placeholder:text-muted focus:outline-none cursor-text"
              />
              <button
                type="button"
                onClick={() => handleSend()}
                disabled={!canSend}
                className={`inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors flex-shrink-0 ${
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
        </div>
      </div>

      {isOpen && (
        <div
          className="fixed left-56 right-0 bottom-0 top-[320px] z-50 flex items-end pointer-events-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              handleClose();
            }
          }}
        >
          <div
            ref={sheetRef}
            className="relative w-full bg-surface rounded-t-3xl border-t border-border/60 shadow-2xl flex flex-col transition-all duration-300 ease-out"
            style={{
              height: "calc(100vh - 320px)",
              transform: isDragging
                ? `translateY(${dragCurrentY.current - dragStartY.current}px)`
                : isAnimating
                  ? "translateY(100%)"
                  : "translateY(0)",
              opacity: isAnimating ? 0 : 1,
            }}
            onMouseDown={handleDragStart}
            onMouseMove={handleDragMove}
            onMouseUp={handleDragEnd}
            onMouseLeave={handleDragEnd}
            onTouchStart={handleDragStart}
            onTouchMove={handleDragMove}
            onTouchEnd={handleDragEnd}
          >
            <div className="flex items-center justify-center pt-4 pb-2 cursor-grab active:cursor-grabbing">
              <div className="w-12 h-1.5 rounded-full bg-border/60" />
            </div>

            <div className="flex items-center justify-between px-6 pb-4 border-b border-border/60">
              <div>
                <p className="text-[11px] uppercase tracking-[0.3em] text-muted">
                  Ask Neo
                </p>
                <h3 className="text-lg font-semibold text-foreground mt-1">
                  {memoryTitle || "About this memory"}
                </h3>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/70 text-muted hover:text-foreground hover:border-foreground/60 transition"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div
              ref={messagesContainerRef}
              className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0"
            >
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <MessageCircle className="h-12 w-12 text-muted/50 mb-4" />
                  <p className="text-sm text-muted">
                    Ask me anything about this memory
                  </p>
                </div>
              ) : (
                messages.map((message, index) => {
                  const isLastAssistantThinking =
                    isStreaming &&
                    index === messages.length - 1 &&
                    message.role === "assistant" &&
                    !message.content;

                  return (
                    <div
                      key={message.id}
                      className={`flex gap-3 ${
                        message.role === "user"
                          ? "justify-end"
                          : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[85%] ${
                          message.role === "user"
                            ? "rounded-3xl rounded-br-md bg-primary px-5 py-3.5 text-primary-foreground"
                            : "px-1 py-1 text-foreground"
                        }`}
                      >
                        {message.role === "assistant" ? (
                          message.content ? (
                            <div className="prose prose-sm max-w-none prose-headings:text-foreground prose-p:text-foreground prose-strong:text-foreground prose-code:text-foreground">
                              <MarkdownText content={message.content} />
                            </div>
                          ) : isLastAssistantThinking ? (
                            <div className="flex items-center gap-2 text-muted">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span className="text-sm font-medium">
                                Thinking...
                              </span>
                            </div>
                          ) : null
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
                                    className="w-full text-left rounded-xl border border-border/60 bg-surface/70 px-3 py-2 text-xs text-muted transition hover:border-primary/60 hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-60"
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
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="px-6 py-4 border-t border-border/60 bg-surface">
              <div className="flex items-center gap-2 rounded-full border border-[#d0d0d0] dark:border-border/60 bg-transparent px-3 py-1.5 transition focus-within:border-[#0f8b54] focus-within:shadow-[0_0_0_1px_rgba(15,139,84,0.35)]">
                <input
                  ref={overlayInputRef}
                  type="text"
                  value={prompt}
                  onChange={handleInputChange}
                  onKeyPress={handleKeyPress}
                  placeholder={placeholderText}
                  readOnly={isStreaming}
                  className="flex-1 h-10 rounded-full border-none bg-transparent px-2 text-sm font-medium leading-tight text-foreground placeholder:text-muted focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleSend()}
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
          </div>
        </div>
      )}

      {memoryPreview && (
        <MemoryReferenceModal
          state={memoryPreview}
          onClose={closeMemoryPreview}
          onRetry={() => handleSourceClick(memoryPreview.memoryId)}
        />
      )}
    </>
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

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-3xl border border-border/70 bg-surface p-6 shadow-[0_35px_80px_rgba(15,23,42,0.25)]"
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
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/70 text-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 rounded-2xl bg-surface/60 p-4">
          {status === "loading" ? (
            <div className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading memory details…</span>
            </div>
          ) : (
            <p className="text-sm text-muted">{description}</p>
          )}
        </div>

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
