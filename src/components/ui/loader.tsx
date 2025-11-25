import { cn } from "@/lib/utils";

interface LoaderProps {
  label?: string;
  className?: string;
}

/**
 * Loading spinner with optional label text.
 */
export function Loader({ label = "Loading...", className }: LoaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 text-center",
        className,
      )}
    >
      <span className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      <p className="text-xs font-medium text-muted">{label}</p>
    </div>
  );
}
