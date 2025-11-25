import { useEffect } from "react";

/**
 * Hook that listens for Escape key presses and calls the handler.
 * Automatically cleans up event listener on unmount.
 */
export function useEscapeKey(
  handler: () => void,
  enabled: boolean = true,
): void {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handler();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [handler, enabled]);
}
