import { useState } from "react";
import Modal, { ModalCloseButton } from "../../components/Modal";
import { cyclesService } from "../../services";
import { useToast } from "../../contexts/ToastContext";
import { closedCyclePatch } from "../../utils/cycleClosing";
import { fmtCurrency, fmtShortDate } from "../../utils/format";
import { attempt } from "../../utils/attempt";

// Cierra de una vez ciclos que ya se pagaron por completo (`settledOpenCycles`).
// Todos vienen marcados. Cerrar es el mismo cambio que el botón del ciclo
// (estado cerrado y fechas de lo trabajado), y se deshace reabriendo el ciclo.
export default function CloseCyclesModal({ candidates, waitingCount = 0, intro, faenaName, onClose, onDone }) {
  const toast = useToast();
  const [chosen, setChosen] = useState(() => new Set(candidates.map((r) => r.cycle.id)));
  const [busy, setBusy] = useState(false);

  const groups = [];
  for (const row of candidates) {
    const name = faenaName(row.cycle.faenaId) || "Sin faena";
    let g = groups.find((x) => x.name === name);
    if (!g) groups.push((g = { name, rows: [] }));
    g.rows.push(row);
  }
  const allOn = candidates.every((r) => chosen.has(r.cycle.id));
  const toggle = (id) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setChosen(allOn ? new Set() : new Set(candidates.map((r) => r.cycle.id)));

  const run = async () => {
    setBusy(true);
    let closed = 0;
    const { error: err } = await attempt(async () => {
      for (const { cycle } of candidates) {
        if (!chosen.has(cycle.id)) continue;
        await cyclesService.update(cycle.id, closedCyclePatch(cycle));
        closed += 1;
      }
      toast.success(`${closed} ciclo${closed === 1 ? "" : "s"} cerrado${closed === 1 ? "" : "s"}`);
    });
    if (err) toast.error(`Se cerraron ${closed}; el resto falló: ${err.message || err}`);
    setBusy(false);
    await onDone();
  };

  const n = chosen.size;
  return (
    <Modal
      open
      size="lg"
      onClose={busy ? () => {} : onClose}
      title="🔒 Cerrar ciclos pagados"
      footer={
        <>
          <ModalCloseButton disabled={busy} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-60">
            Ahora no
          </ModalCloseButton>
          <button
            type="button"
            onClick={run}
            disabled={busy || n === 0}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Cerrando…" : `🔒 Cerrar ${n} ciclo${n === 1 ? "" : "s"}`}
          </button>
        </>
      }
    >
      <p className="mb-3 text-sm text-[var(--color-muted)]">{intro}</p>
      {candidates.length > 1 && (
        <label className="mb-2 flex min-h-8 items-center gap-2 text-sm">
          <input type="checkbox" checked={allOn} onChange={toggleAll} disabled={busy} />
          Todos ({candidates.length})
        </label>
      )}
      <div className="max-h-[50vh] space-y-3 overflow-auto">
        {groups.map((g) => (
          <section key={g.name}>
            <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">{g.name}</h3>
            <ul className="divide-y divide-[var(--color-border)] rounded-md border border-[var(--color-border)]">
              {g.rows.map(({ cycle, paid, firstDay, lastDay }) => (
                <li key={cycle.id}>
                  <label className="flex min-h-[44px] cursor-pointer items-center gap-3 px-3 py-2 hover:bg-[var(--color-surface-2)]">
                    <input type="checkbox" checked={chosen.has(cycle.id)} onChange={() => toggle(cycle.id)} disabled={busy} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{cycle.label || cycle.id}</span>
                      {firstDay && (
                        <span className="block text-xs text-[var(--color-muted)]">
                          {fmtShortDate(firstDay)} → {fmtShortDate(lastDay)}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-right text-xs">
                      <span className="block text-[var(--color-muted)]">pagado</span>
                      <span className="font-semibold tabular-nums">{fmtCurrency(paid)}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {waitingCount > 0 && (
        <p className="mt-3 text-xs text-[var(--color-muted)]">
          {waitingCount} ciclo{waitingCount === 1 ? "" : "s"} más no tiene{waitingCount === 1 ? "" : "n"} pendiente, pero
          sigue{waitingCount === 1 ? "" : "n"} en una nómina sin pagar: se ofrece{waitingCount === 1 ? "" : "n"} al marcarla pagada.
        </p>
      )}
      <p className="mt-3 text-xs text-[var(--color-muted)]">
        Un ciclo cerrado queda de solo lectura. Para corregir algo se reabre desde el ciclo.
      </p>
    </Modal>
  );
}
