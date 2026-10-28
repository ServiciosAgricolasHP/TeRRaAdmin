import { createContext, useContext } from "react";

// El tema de colores elegido. Lo provee `ThemeProvider`.
export const ThemeContext = createContext(null);

export const THEMES = [
  { key: "light", label: "Light", isDark: false },
  { key: "dark", label: "Dark", isDark: true },
  { key: "donDiego", label: "Don Diego", isDark: true },
  { key: "sheridan", label: "DarkViolet", isDark: true },
  { key: "aetiskViolet", label: "Aetisk Violet", isDark: false },
  { key: "aetiskPastel", label: "Aetisk Pastel", isDark: false },
];

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
