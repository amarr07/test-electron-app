import { storage } from "@/lib/storage";
import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

/**
 * Hook for managing theme (light/dark) with persistence.
 * Applies theme classes to document root and syncs with storage.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>("light");
  const [loading, setLoading] = useState(true);

  /**
   * Applies theme classes to document root for CSS styling.
   */
  const applyThemeClasses = (nextTheme: Theme) => {
    const root = document.documentElement;
    root.classList.toggle("dark", nextTheme === "dark");
    root.setAttribute("data-theme", nextTheme);
  };

  useEffect(() => {
    const loadTheme = async () => {
      const savedTheme = await storage.getTheme();
      setTheme(savedTheme);
      setLoading(false);

      applyThemeClasses(savedTheme);
    };

    loadTheme();
  }, []);

  const toggleTheme = async () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    applyThemeClasses(newTheme);
    await storage.setTheme(newTheme);
  };

  return {
    theme,
    loading,
    toggleTheme,
  };
}
