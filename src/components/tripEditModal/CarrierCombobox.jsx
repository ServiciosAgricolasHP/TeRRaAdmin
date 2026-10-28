import { useEffect, useMemo, useRef, useState } from "react";
import { useValuesChanged } from "../../hooks/useValuesChanged";

// Combobox con búsqueda para elegir transportista. Filtra por alias, nombre y
// alias de vehículos. Sin búsqueda muestra arriba los recientes de este ciclo
// y después el resto en orden alfabético. ↑/↓ y Enter eligen, Esc cierra, y
// "+ Nuevo transportista" llama a `onCreateNew`.
const normalize = (s) => String(s || "").toLowerCase();

// Si el transportista calza con la búsqueda (ya normalizada): por alias,
// nombre o alias de sus vehículos.
const matches = (c, q) => {
  if (!q) return true;
  const hay = [c.alias, c.name, ...(c.vehicles || []).map((v) => v.alias)]
    .map(normalize)
    .join(" ");
  return hay.includes(q);
};

export default function CarrierCombobox({ value, onChange, carriers, recentIds, onCreateNew, autoFocus = false }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const selected = useMemo(
    () => carriers.find((c) => c.id === value) || null,
    [carriers, value],
  );

  // Cierra al hacer click afuera.
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e) => {
      if (!wrapperRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const items = useMemo(() => {
    const q = normalize(query.trim());
    const byId = new Map(carriers.map((c) => [c.id, c]));
    if (!q) {
      // Sin query: recientes arriba, luego todos los demás alfabético.
      const recent = (recentIds || [])
        .map((id) => byId.get(id))
        .filter(Boolean);
      const recentSet = new Set(recent.map((c) => c.id));
      const rest = carriers
        .filter((c) => !recentSet.has(c.id))
        .sort((a, b) => normalize(a.alias).localeCompare(normalize(b.alias)));
      const out = [];
      if (recent.length > 0) {
        out.push({ kind: "header", label: "RECIENTES" });
        recent.forEach((c) => out.push({ kind: "item", carrier: c, recent: true }));
        if (rest.length > 0) out.push({ kind: "header", label: "TODOS" });
      }
      rest.forEach((c) => out.push({ kind: "item", carrier: c, recent: false }));
      return out;
    }
    // Con query: filtro plano sin secciones.
    return carriers
      .filter((c) => matches(c, q))
      .sort((a, b) => normalize(a.alias).localeCompare(normalize(b.alias)))
      .map((c) => ({ kind: "item", carrier: c, recent: false }));
  }, [carriers, recentIds, query]);

  const selectableIndexes = useMemo(
    () => items.map((it, i) => (it.kind === "item" ? i : -1)).filter((i) => i >= 0),
    [items],
  );

  if (useValuesChanged([query, open])) setFocusIndex(0);

  const scrollFocusedIntoView = (idx) => {
    const node = listRef.current?.querySelector(`[data-idx="${idx}"]`);
    if (node && typeof node.scrollIntoView === "function") {
      node.scrollIntoView({ block: "nearest" });
    }
  };

  const moveFocus = (dir) => {
    if (selectableIndexes.length === 0) return;
    const curPos = selectableIndexes.indexOf(focusIndex);
    let next;
    if (curPos === -1) next = selectableIndexes[0];
    else {
      const nextPos = (curPos + dir + selectableIndexes.length) % selectableIndexes.length;
      next = selectableIndexes[nextPos];
    }
    setFocusIndex(next);
    scrollFocusedIntoView(next);
  };

  const pick = (carrier) => {
    if (!carrier) return;
    onChange(carrier.id);
    setQuery("");
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); if (!open) setOpen(true); else moveFocus(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); moveFocus(-1); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const it = items[focusIndex];
      if (it?.kind === "item") pick(it.carrier);
    }
    else if (e.key === "Escape") { setOpen(false); }
  };

  const clearSelection = () => {
    onChange("");
    setQuery("");
    setOpen(true);
    inputRef.current?.focus();
  };

  // Label que se muestra cuando hay carrier elegido y el combobox está cerrado.
  const selectedLabel = selected
    ? `${selected.alias}${selected.name ? ` — ${selected.name}` : ""}${selected.type === "own" ? " (propio)" : ""}`
    : "";

  return (
    <label className="block" ref={wrapperRef}>
      <span className="mb-1 block text-sm text-[var(--color-muted)]">
        Transportista<span className="ml-0.5 text-[var(--color-danger)]">*</span>
      </span>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={open ? query : selectedLabel}
          placeholder={selected ? "" : "Buscar por alias, nombre o vehículo…"}
          onChange={(e) => { setQuery(e.target.value); if (!open) setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 pr-16 text-sm outline-none focus:border-[var(--color-accent)]"
        />
        <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
          {selected && (
            <button
              type="button"
              onClick={clearSelection}
              title="Limpiar"
              className="rounded px-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]"
            >
              ✕
            </button>
          )}
          <button
            type="button"
            onClick={() => { setOpen((v) => !v); inputRef.current?.focus(); }}
            className="rounded px-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]"
            tabIndex={-1}
          >
            ▾
          </button>
        </div>
        {open && (
          <div
            ref={listRef}
            className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-lg"
          >
            {items.length === 0 ? (
              <div className="px-3 py-3 text-center text-xs text-[var(--color-muted)]">
                Sin coincidencias.
              </div>
            ) : (
              items.map((it, i) => {
                if (it.kind === "header") {
                  return (
                    <div
                      key={`h${i}`}
                      className="px-3 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]"
                    >
                      {it.label}
                    </div>
                  );
                }
                const c = it.carrier;
                const isFocused = focusIndex === i;
                const isSelected = c.id === value;
                return (
                  <button
                    key={c.id}
                    type="button"
                    data-idx={i}
                    onMouseEnter={() => setFocusIndex(i)}
                    onClick={() => pick(c)}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                      isFocused ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]" : ""
                    } ${isSelected ? "font-medium" : ""}`}
                  >
                    {it.recent && <span className="text-[10px] opacity-70">🕒</span>}
                    <span className="truncate flex-1">
                      <span>{c.alias}</span>
                      {c.name && <span className="ml-1 text-[11px] text-[var(--color-muted)]">— {c.name}</span>}
                      {c.type === "own" && <span className="ml-1 text-[10px] text-[var(--color-muted)]">(propio)</span>}
                    </span>
                    {(c.vehicles?.length || 0) > 0 && (
                      <span className="text-[10px] text-[var(--color-muted)]">
                        {c.vehicles.length} veh.
                      </span>
                    )}
                  </button>
                );
              })
            )}
            <div className="border-t border-[var(--color-border)] pt-1">
              <button
                type="button"
                onClick={() => { setOpen(false); onCreateNew?.(); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]"
              >
                + Nuevo transportista
              </button>
            </div>
          </div>
        )}
      </div>
    </label>
  );
}
