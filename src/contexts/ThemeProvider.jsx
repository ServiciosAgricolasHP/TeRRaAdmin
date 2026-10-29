import { useEffect, useState } from "react";
import { ThemeContext, THEMES } from "./ThemeContext";

const STORAGE_KEY = "af.theme";

const VALID = new Set(THEMES.map((t) => t.key));
const KEYS = THEMES.map((t) => `theme-${t.key}`);

function detectInitial() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && VALID.has(saved)) return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(detectInitial);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove(...KEYS);
    root.classList.add(`theme-${theme}`);
    const isDark = THEMES.find((t) => t.key === theme)?.isDark;
    root.classList.toggle("dark", !!isDark);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}
