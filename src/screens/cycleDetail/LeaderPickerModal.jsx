import { useState, useMemo } from "react";
import { useValuesChanged } from "../../hooks/useValuesChanged";
import Modal from "../../components/Modal";
import TextField from "../../components/TextField";
import { matchesSearchQuery } from "../../utils/textSearch";

export function LeaderPickerModal({ open, onClose, leaders, workerName, busy, onPick }) {
  const [filter, setFilter] = useState("");

  if (useValuesChanged([open], { onMount: true }) && open) setFilter("");

  const filtered = useMemo(() => {
    if (!filter.trim()) return leaders;
    return leaders.filter((l) => matchesSearchQuery(l, filter));
  }, [leaders, filter]);

  return (
    <Modal open={open} onClose={() => !busy && onClose()} title={`Asignar líder a ${workerName}`} size="md">
      <div className="space-y-3">
        <TextField
          label="Buscar líder"
          value={filter}
          onChange={setFilter}
          autoFocus
          placeholder="Filtrar..."
        />
        <div className="max-h-72 overflow-y-auto rounded-md border border-[var(--color-border)]">
          {leaders.length === 0 ? (
            <div className="p-3 text-sm text-[var(--color-muted)]">
              No hay líderes habilitados. Habilita líderes en la colección <code>groupLeader</code>.
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-3 text-sm text-[var(--color-muted)]">Sin resultados.</div>
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {filtered.map((l) => (
                <li key={l}>
                  <button
                    onClick={() => onPick(l)}
                    disabled={busy}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
                  >
                    <span className="font-medium">{l}</span>
                    <span className="text-xs text-[var(--color-muted)]">→</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
