import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useState,
} from "react";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Array<{
    memory_id?: string;
    title?: string;
    created_at?: string;
  }>;
}

interface ChatContextType {
  currentChatId: string | null;
  messages: Message[];
  isStreaming: boolean;
  setCurrentChat: (chatId: string | null) => void;
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  updateLastMessage: (updater: (message: Message) => Message) => void;
  setIsStreaming: (isStreaming: boolean) => void;
  startNewChat: () => void;
  getChatMessages: (chatId: string) => Message[] | undefined;
  saveChatMessages: (chatId: string, messages: Message[]) => void;
}

/**
 * Context for chat sessions and messages.
 */
const ChatContext = createContext<ChatContextType | undefined>(undefined);

/**
 * Provider for chat state management.
 * Manages multiple chat sessions, message history, and streaming state.
 * Handles pending messages for new chats before chatId is assigned.
 */
export function ChatProvider({ children }: { children: ReactNode }) {
  const [chatHistory, setChatHistory] = useState<Record<string, Message[]>>({});
  const [currentChatId, setCurrentChatIdState] = useState<string | null>(null);
  const [isStreaming, setIsStreamingState] = useState(false);
  const messages =
    currentChatId && chatHistory[currentChatId]
      ? chatHistory[currentChatId]
      : [];

  /**
   * Sets active chat and migrates pending messages to the chat if switching.
   */
  const setCurrentChat = useCallback((chatId: string | null) => {
    setCurrentChatIdState((prevChatId) => {
      if (chatId && chatId !== prevChatId) {
        setChatHistory((prev) => {
          const pendingMessages = prev["__pending__"] || [];
          const existingMessages = prev[chatId] || [];
          const allMessages = [...existingMessages, ...pendingMessages];
          const updated = { ...prev };
          if (allMessages.length > 0) {
            updated[chatId] = allMessages;
          } else if (!updated[chatId]) {
            updated[chatId] = [];
          }
          if (pendingMessages.length > 0) {
            delete updated["__pending__"];
          }
          return updated;
        });
      }
      return chatId;
    });
  }, []);

  const setMessages = useCallback(
    (newMessages: Message[]) => {
      if (!currentChatId) return;
      setChatHistory((prev) => ({
        ...prev,
        [currentChatId]: newMessages,
      }));
    },
    [currentChatId],
  );

  /**
   * Adds message to current chat or pending queue if no active chat.
   */
  const addMessage = useCallback(
    (message: Message) => {
      setChatHistory((prev) => {
        if (!currentChatId) {
          const pendingKey = "__pending__";
          return {
            ...prev,
            [pendingKey]: [...(prev[pendingKey] || []), message],
          };
        }
        return {
          ...prev,
          [currentChatId]: [...(prev[currentChatId] || []), message],
        };
      });
    },
    [currentChatId],
  );

  /**
   * Updates the last assistant message (used for streaming).
   * Only updates if last message is from assistant.
   */
  const updateLastMessage = useCallback(
    (updater: (message: Message) => Message) => {
      if (!currentChatId) return;
      setChatHistory((prev) => {
        const chatMessages = prev[currentChatId] || [];
        if (chatMessages.length === 0) return prev;

        const lastIndex = chatMessages.length - 1;
        const lastMessage = chatMessages[lastIndex];
        if (lastMessage.role !== "assistant") return prev;

        const updated = updater(lastMessage);
        if (updated === lastMessage) return prev;

        const updatedMessages = [...chatMessages];
        updatedMessages[lastIndex] = updated;

        return {
          ...prev,
          [currentChatId]: updatedMessages,
        };
      });
    },
    [currentChatId],
  );

  const setIsStreaming = useCallback((streaming: boolean) => {
    setIsStreamingState(streaming);
  }, []);

  const startNewChat = useCallback(() => {
    setCurrentChatIdState(null);
    setIsStreamingState(false);
  }, []);

  const getChatMessages = useCallback(
    (chatId: string): Message[] | undefined => {
      return chatHistory[chatId];
    },
    [chatHistory],
  );

  const saveChatMessages = useCallback(
    (chatId: string, messages: Message[]) => {
      setChatHistory((prev) => ({
        ...prev,
        [chatId]: messages,
      }));
    },
    [],
  );

  return (
    <ChatContext.Provider
      value={{
        currentChatId,
        messages,
        isStreaming,
        setCurrentChat,
        setMessages,
        addMessage,
        updateLastMessage,
        setIsStreaming,
        startNewChat,
        getChatMessages,
        saveChatMessages,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

/**
 * Hook to access chat context.
 * Throws error if used outside ChatProvider.
 */
export function useChatContext() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error("useChatContext must be used within a ChatProvider");
  }
  return context;
}
