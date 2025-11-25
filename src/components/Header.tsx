import { useThemeContext } from "@/providers/ThemeProvider";
import { Sun } from "lucide-react";
import logo from "../../assets/logo.svg";

/**
 * App header with logo and theme toggle button.
 */
export function Header() {
  const { toggleTheme } = useThemeContext();

  return (
    <header className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        <img src={logo} alt="NeoSapien" className="w-8 h-8" />
        <div>
          <h1 className="text-base font-semibold text-foreground">NeoSapien</h1>
          <p className="text-xs text-muted">Your second brain</p>
        </div>
      </div>
      <button
        onClick={toggleTheme}
        className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-transparent border-none text-foreground opacity-80 hover:opacity-100 transition-all duration-300 hover:scale-105 active:scale-95"
        aria-label="Toggle theme"
      >
        <Sun className="w-4 h-4" />
      </button>
    </header>
  );
}
