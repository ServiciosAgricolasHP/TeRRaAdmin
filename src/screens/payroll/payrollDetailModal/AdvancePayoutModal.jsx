import { useRef, useState } from "react";
import Modal, { ModalCloseButton } from "../../../components/Modal";
import { listPendingForWorkers } from "../../../services/advancesService";
import { listCycleWorkdays } from "../../../services/workdayCycles";
import { payoutCandidates } from "../../../utils/advancePayouts";
import { attempt } from "../../../utils/attempt";
import { errorText } from "../../../utils/errorText";
import { fmtCurrency } from "../../../utils/format";
import { formatRutForDisplay } from "../../../utils/rutUtils";

const dayText = (iso) => String(iso || "").split("-").reverse().join("-");

// Los ciclos abiertos, agrupados por faena, para el selector.
function cycleGroups(cycles, faenas) {
  const faenaName = new Map(faenas.map((f) => [f.id, f.name || ""]));
  const groups = new Map();
  for (const c of cycles) {
    if (c.status === "closed") continue;
    const name = faenaName.get(c.faenaId) || "Sin faena";
    if (!groups.has(name)) groups.set(name, []);
    const parts = String(c.label || "").split("/");
    groups.get(name).push({ id: c.id, label: (parts.length >= 3 ? parts.slice(1).join(" / ") : c.label) || c.id });
  }
  return [...groups.entries()]
    .map(([name, list]) => ({ name, cycles: list.sort((a, b) => a.label.localeCompare(b.label, "es", { numeric: true })) }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

// "💸 Entregar anticipos": se elige un ciclo abierto, esté o no en la nómina,
// y de los anticipos pendientes de quienes trabajaron ahí (sin descuentos ni
// entregas), cuáles paga esta nómina. Quien no está en la nómina entra solo
// con su anticipo. `onConfirm({ advanceIds, cycleId })`.
export function AdvancePayoutModal({ items, cycles, faenas, workers, busy, onClose, onConfirm }) {
  const [cycleId, setCycleId] = useState("");
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  // La última carga pedida: una respuesta vieja no pisa a la nueva.
  const requestRef = useRef(0);
  const groups = cycleGroups(cycles, faenas);

  const chooseCycle = async (id) => {
    requestRef.current += 1;
    const request = requestRef.current;
    setCycleId(id);
    setRows(null);
    setSelected(new Set());
    setError("");
    if (!id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { value, error: err } = await attempt(async () => {
      const workdays = await listCycleWorkdays([id]);
      // El rut que guarda la jornada y el que la persona tiene hoy.
      const rutById = new Map(workers.map((w) => [w.id, w.rut]));
      const ruts = new Set();
      for (const wd of workdays) {
        if (wd.workerRut) ruts.add(wd.workerRut);
        if (rutById.get(wd.workerId)) ruts.add(rutById.get(wd.workerId));
      }
      const advances = ruts.size ? await listPendingForWorkers([...ruts]) : [];
      const worked = [...ruts].map((rut) => ({ workerRut: rut }));
      return payoutCandidates({ advances, workdays: [...workdays, ...worked], items });
    });
    if (request !== requestRef.current) return;
    if (err) setError(errorText(err));
    else setRows(value);
    setLoading(false);
  };

  const toggle = (advanceId) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(advanceId)) next.delete(advanceId);
      else next.add(advanceId);
      return next;
    });
  const chosen = (rows || []).filter((r) => selected.has(r.advanceId));
  const total = chosen.reduce((s, r) => s + r.amount, 0);
  const allChosen = !!rows?.length && chosen.length === rows.length;
  const toggleAll = () => setSelected(allChosen ? new Set() : new Set(rows.map((r) => r.advanceId)));
  const entering = new Set(chosen.filter((r) => !r.inPayroll).map((r) => r.rut)).size;
  const submit = () => {
    if (chosen.length && !busy) onConfirm({ advanceIds: chosen.map((r) => r.advanceId), cycleId });
  };

  return (
    <Modal
      open
      onClose={onClose}
      dirty={!busy && chosen.length > 0}
      size="lg"
      section="Entregar anticipos"
      title="💸 Entregar anticipos"
      footer={
        <>
          <ModalCloseButton onClick={onClose} className="min-h-8 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm">
            Cancelar
          </ModalCloseButton>
          <button
            type="button"
            onClick={submit}
            disabled={chosen.length === 0 || busy}
            className="min-h-8 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
          >
            {busy ? "Guardando…" : chosen.length ? `Entregar ${chosen.length} · ${fmtCurrency(total)}` : "Entregar"}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="text-xs text-[var(--color-muted)]">
          Esta nómina le paga a cada persona los anticipos que elijas, además de lo suyo. Cada anticipo sigue pendiente: lo
          descuenta la próxima nómina en la que esté la persona.
        </p>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--color-muted)]">Ciclo al que se asocian</span>
          <select
            value={cycleId}
            onChange={(e) => chooseCycle(e.target.value)}
            disabled={busy}
            className="min-h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm"
          >
            <option value="">Elige un ciclo abierto…</option>
            {groups.map((g) => (
              <optgroup key={g.name} label={g.name}>
                {g.cycles.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        {loading && <p className="text-xs text-[var(--color-muted)]">Buscando los anticipos de quienes trabajaron en el ciclo…</p>}
        {error && <p className="text-xs text-[var(--color-danger)]">No se pudieron leer los anticipos. {error}</p>}
        {rows && rows.length === 0 && (
          <p className="rounded-md border border-dashed border-[var(--color-border)] px-3 py-4 text-center text-xs text-[var(--color-muted)]">
            Nadie de este ciclo tiene un anticipo pendiente sin entregar. Los anticipos se crean en Anticipos / Bonos.
          </p>
        )}
        {rows && rows.length > 0 && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <button
                type="button"
                onClick={toggleAll}
                className="min-h-8 rounded-md border border-[var(--color-border)] px-2 hover:bg-[var(--color-accent-soft)]"
              >
                {allChosen ? "Quitar todos" : `Marcar los ${rows.length}`}
              </button>
              <span className="text-[var(--color-muted)]">
                {chosen.length} de {rows.length} · <b className="tabular-nums text-[var(--color-text)]">{fmtCurrency(total)}</b>
              </span>
            </div>
            <ul className="max-h-[45vh] divide-y divide-[var(--color-border)] overflow-y-auto rounded-md border border-[var(--color-border)]">
              {rows.map((r) => (
                <li key={r.advanceId}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 hover:bg-[var(--color-accent-soft)]">
                    <input
                      type="checkbox"
                      checked={selected.has(r.advanceId)}
                      onChange={() => toggle(r.advanceId)}
                      disabled={busy}
                      className="h-4 w-4 shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2">
                        <span className="truncate font-medium" title={r.name}>{r.name}</span>
                        {!r.inPayroll && (
                          <span
                            className="whitespace-nowrap rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--color-muted)]"
                            title="No está en la nómina: entra solo con su anticipo"
                          >
                            entra a la nómina
                          </span>
                        )}
                      </span>
                      <span className="block truncate text-[11px] text-[var(--color-muted)]" title={r.note}>
                        {formatRutForDisplay(r.rut)} · {dayText(r.date) || "sin fecha"}{r.note ? ` · ${r.note}` : ""}
                      </span>
                    </span>
                    <span className="whitespace-nowrap font-semibold tabular-nums">{fmtCurrency(r.amount)}</span>
                  </label>
                </li>
              ))}
            </ul>
            {entering > 0 && (
              <p className="text-xs text-[var(--color-muted)]">
                {entering === 1 ? "1 persona entra" : `${entering} personas entran`} a la nómina solo con su anticipo, con
                la cuenta y el grupo de su ficha.
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
