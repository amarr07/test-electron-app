type MessageType = "info" | "success" | "error";

interface MessageAreaProps {
  message: string | null;
  type?: MessageType;
}

/**
 * Displays styled message banner (info, success, error).
 */
export function MessageArea({ message, type = "info" }: MessageAreaProps) {
  if (!message) return null;

  const typeClasses = {
    info: "text-primary bg-primary/14 border-primary/25",
    success: "text-primary bg-primary/14 border-primary/25",
    error: "text-danger bg-danger/16 border-danger/30",
  };

  return (
    <div
      className={`min-h-6 flex items-center justify-center text-xs font-medium px-4 py-2 rounded-full border ${typeClasses[type]}`}
    >
      {message}
    </div>
  );
}
