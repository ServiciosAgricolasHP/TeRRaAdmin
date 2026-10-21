import { useEffect, useRef, useState } from "react";
import { useTheme } from "../../contexts/ThemeContext";

// El selector de tema del header.
export default function ThemePicker() {
  const { theme, setTheme, themes } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const current = themes.find((t) => t.key === theme) || themes[0];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] sm:px-3"
      >
        🎨 <span className="hidden sm:inline">{current.label}</span>
        <span className="text-[var(--color-muted)]">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-48 overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg">
          {themes.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setTheme(t.key);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-[var(--color-accent-soft)] ${
                t.key === theme
                  ? "font-medium text-[var(--color-accent)]"
                  : "text-[var(--color-text)]"
              }`}
            >
              <span>{t.label}</span>
              {t.key === theme && <span>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
