import { useState, useEffect } from "react";
import { getDayPiso } from "../../utils/cosechaCombos";
import { fmtCurrency } from "../../utils/format";

// Piso opcional por día. Sin piso configurado muestra solo el botón "+ piso",
// que abre la edición. Con piso, muestra el monto y las acciones editar,
// asignar a todos y quitar.
export function PisoDayRow({ labor, dayPrices, date, readOnly, onPersist, pendingCount = 0, onApplyAll }) {
  const dayPiso = getDayPiso(dayPrices, labor.id, date);
  const hasPiso = dayPiso != null && dayPiso > 0;
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState("");
  useEffect(() => {
    if (!editing) setLocal(hasPiso ? String(dayPiso) : "");
  }, [editing, dayPiso, hasPiso]);

  if (!hasPiso && !editing) {
    if (readOnly) return null;
    return (
      <button
        onClick={() => { setLocal(""); setEditing(true); }}
        className="self-start text-[var(--color-muted)] text-[10px] hover:text-[var(--color-accent)] hover:underline"
        title="Agregar bono piso para este día"
      >
        + piso
      </button>
    );
  }

  if (editing) {
    const commit = () => {
      const next = local === "" ? 0 : Number(local) || 0;
      onPersist(next);
      setEditing(false);
    };
    return (
      <div className="mt-1 flex items-center gap-1 rounded-md border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-2 py-1 text-[10px]">
        <span className="font-medium text-[var(--color-muted)]">🪙 Piso $</span>
        <input
          type="number" min="0" autoFocus disabled={readOnly}
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
          className="w-20 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1 py-0.5 text-right tabular-nums outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
        />
      </div>
    );
  }

  return (
    <div className="mt-1 flex items-center gap-1 rounded-md border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-2 py-1 text-[10px]">
      <span className="font-medium text-[var(--color-text)]">🪙 Piso {fmtCurrency(dayPiso)}</span>
      {!readOnly && (
        <>
          <button
            onClick={() => { setLocal(String(dayPiso)); setEditing(true); }}
            className="ml-auto text-[var(--color-muted)] hover:text-[var(--color-accent)] hover:underline"
            title="Editar"
          >
            ✎
          </button>
          <button
            onClick={onApplyAll}
            disabled={!pendingCount}
            className="text-[var(--color-muted)] hover:text-[var(--color-accent)] hover:underline disabled:opacity-40 disabled:no-underline disabled:hover:text-[var(--color-muted)]"
            title={
              pendingCount
                ? `Asignar este piso a los ${pendingCount} con producción que aún no lo tienen`
                : "Todos los que tienen producción ese día ya tienen el piso"
            }
          >
            👥 a todos{pendingCount ? ` (${pendingCount})` : ""}
          </button>
          <button
            onClick={() => onPersist(0)}
            className="text-[var(--color-danger)] hover:underline"
            title="Quitar piso del día"
          >
            ✕
          </button>
        </>
      )}
    </div>
  );
}
