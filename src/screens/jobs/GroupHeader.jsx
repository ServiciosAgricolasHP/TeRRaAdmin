import { useState } from "react";
import ConfirmDialog from "../../components/ConfirmDialog";
import { useValuesChanged } from "../../hooks/useValuesChanged";
import { ColorPalette } from "./ColorPalette";

export function GroupHeader({ group, count, editable, isUngrouped, collapsed, onToggleCollapsed, onUpdate, onRemove }) {
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(group.name);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);

  if (useValuesChanged([group.name])) setName(group.name);

  const commitName = () => {
    setEditingName(false);
    if (name.trim() && name.trim() !== group.name) onUpdate({ name: name.trim() });
    else setName(group.name);
  };

  return (
    <div className="mb-3 flex items-center justify-between gap-2 border-b border-[var(--color-border)] pb-2">
      <div className="flex items-center gap-2 min-w-0">
        <button
          type="button"
          onClick={onToggleCollapsed}
          title={collapsed ? "Expandir grupo" : "Colapsar grupo"}
          className="shrink-0 rounded px-1 text-sm text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)]"
        >
          {collapsed ? "▸" : "▾"}
        </button>
        {group.color && (
          <span
            aria-hidden
            className="h-3 w-3 flex-shrink-0 rounded-sm"
            style={{ backgroundColor: group.color }}
          />
        )}
        {editable && !isUngrouped && editingName ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitName();
              if (e.key === "Escape") { setEditingName(false); setName(group.name); }
            }}
            autoFocus
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-xl font-bold text-[var(--color-accent)] outline-none focus:border-[var(--color-accent)]"
          />
        ) : (
          <h2
            onClick={() => editable && !isUngrouped && setEditingName(true)}
            className={`text-xl font-bold text-[var(--color-accent)] ${editable && !isUngrouped ? "cursor-pointer hover:opacity-80" : ""}`}
          >
            {group.name}
          </h2>
        )}
        <span className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[10px] text-[var(--color-muted)]">
          {count}
        </span>
      </div>
      {editable && (
        <div className="flex items-center gap-1">
          <div className="relative">
            <button
              onClick={() => setPickerOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)]"
              title="Color del grupo"
            >
              <span
                className="inline-block h-3.5 w-3.5 rounded-full ring-1 ring-inset ring-black/10"
                style={{
                  background: group.color
                    ? group.color
                    : "conic-gradient(from 0deg, #ef4444, #f59e0b, #facc15, #22c55e, #06b6d4, #6366f1, #a855f7, #ec4899, #ef4444)",
                }}
              />
              <span>color</span>
            </button>
            {pickerOpen && (
              <ColorPalette
                selected={group.color}
                onPick={(c) => { onUpdate({ color: c }); setPickerOpen(false); }}
                onClose={() => setPickerOpen(false)}
              />
            )}
          </div>
          {!isUngrouped && (
            <button
              onClick={() => {
                if (count > 0) setConfirmRemoveOpen(true);
                else onRemove();
              }}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]"
            >
              ✕
            </button>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirmRemoveOpen}
        title="Quitar grupo"
        confirmLabel="Quitar"
        danger
        message={`Quitar el grupo "${group.name}"? Las ${count} faena(s) volverán a "Sin grupo".`}
        onCancel={() => setConfirmRemoveOpen(false)}
        onConfirm={() => { setConfirmRemoveOpen(false); onRemove(); }}
      />
    </div>
  );
}
