import { type ReactNode } from "react";
import { Toaster, toast as hotToast } from "react-hot-toast";

type ToastVariant = "default" | "destructive";

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  durationMs?: number;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => void;
}

const toastImpl: ToastContextValue["toast"] = ({
  title,
  description,
  variant = "default",
  durationMs = 4000,
}) => {
  const content = (
    <div className="flex flex-col gap-1">
      <span
        className={`text-sm font-medium ${
          variant === "destructive" ? "text-danger" : "text-foreground"
        }`}
      >
        {title}
      </span>
      {description && (
        <span className="text-xs text-muted leading-relaxed">
          {description}
        </span>
      )}
    </div>
  );

  const toastId = `${title}-${description || ""}`;

  const commonOptions = {
    duration: durationMs,
    id: toastId,
  } as const;

  if (variant === "destructive") {
    hotToast.error(content, commonOptions);
  } else {
    hotToast.success(content, commonOptions);
  }
};

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Toaster
        position="bottom-right"
        toastOptions={{
          className:
            "rounded-2xl border border-border text-foreground shadow-[0_16px_40px_rgba(0,0,0,0.35)] px-4 py-3",
          style: {
            background: "var(--surface)",
          },
        }}
      />
    </>
  );
}

export function useToast(): ToastContextValue {
  return { toast: toastImpl };
}
