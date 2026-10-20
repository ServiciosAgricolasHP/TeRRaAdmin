import { useState } from "react";
import { ColorPalette } from "./ColorPalette";

export function ColorPickerButton({ value, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Color de la tarjeta"
        className="h-5 w-5 rounded-full ring-1 ring-inset ring-[var(--color-border)] transition hover:ring-[var(--color-accent)] hover:ring-2"
        style={{
          background: value
            ? value
            : "conic-gradient(from 0deg, #ef4444, #f59e0b, #facc15, #22c55e, #06b6d4, #6366f1, #a855f7, #ec4899, #ef4444)",
        }}
      />
      {open && (
        <ColorPalette
          selected={value}
          onPick={(c) => { onChange(c); setOpen(false); }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
