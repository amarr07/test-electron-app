import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ToastVariant = "default" | "destructive";

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  durationMs?: number;
}

interface ToastMessage extends ToastOptions {
  id: number;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => void;
}

/**
 * Context for toast notifications.
 */
const ToastContext = createContext<ToastContextValue | undefined>(undefined);

/**
 * Provider for toast notifications.
 * Manages toast queue, auto-dismiss timers, and renders toast UI.
 * Toasts appear in bottom-right corner with configurable duration.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const timersRef = useRef<Record<number, NodeJS.Timeout>>({});

  /**
   * Removes toast from queue and clears its auto-dismiss timer.
   */
  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    if (timersRef.current[id]) {
      clearTimeout(timersRef.current[id]);
      delete timersRef.current[id];
    }
  }, []);

  /**
   * Creates and displays a toast notification.
   * Auto-dismisses after durationMs (default 4s).
   */
  const toast = useCallback(
    ({
      title,
      description,
      variant = "default",
      durationMs = 4000,
    }: ToastOptions) => {
      const id = Date.now() + Math.floor(Math.random() * 1000);
      const message: ToastMessage = {
        id,
        title,
        description,
        variant,
        durationMs,
      };
      setToasts((prev) => [...prev, message]);
      timersRef.current[id] = setTimeout(() => removeToast(id), durationMs);
    },
    [removeToast],
  );

  const contextValue = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-[10000] w-72">
        {toasts.map((toastMessage) => (
          <div
            key={toastMessage.id}
            className={`relative rounded-2xl border px-4 py-3 shadow-lg bg-surface ${
              toastMessage.variant === "destructive"
                ? "border-red-200"
                : "border-border"
            }`}
          >
            <div
              className={`text-sm font-semibold ${
                toastMessage.variant === "destructive"
                  ? "text-red-600"
                  : "text-foreground"
              }`}
            >
              {toastMessage.title}
            </div>
            {toastMessage.description && (
              <p className="text-xs text-muted mt-1">
                {toastMessage.description}
              </p>
            )}
            <button
              type="button"
              className="absolute top-2 right-2 text-muted hover:text-foreground"
              onClick={() => removeToast(toastMessage.id)}
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Hook to access toast context.
 * Throws error if used outside ToastProvider.
 */
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}
