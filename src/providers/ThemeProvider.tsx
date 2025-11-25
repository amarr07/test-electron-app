import { useTheme, type Theme } from "@/hooks/useTheme";
import { createContext, ReactNode, useContext } from "react";

interface ThemeContextType {
  theme: Theme;
  loading: boolean;
  toggleTheme: () => Promise<void>;
}

/**
 * Context for theme (light/dark) state and toggle.
 */
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/**
 * Provides theme context to the app.
 * Wraps useTheme hook and exposes theme methods to children.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useTheme();

  return (
    <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
  );
}

/**
 * Hook to access theme context.
 * Throws error if used outside ThemeProvider.
 */
export function useThemeContext() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useThemeContext must be used within ThemeProvider");
  }
  return context;
}
