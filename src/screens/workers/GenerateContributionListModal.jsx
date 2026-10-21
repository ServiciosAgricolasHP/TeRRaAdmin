import { useState } from "react";
import Modal, { ModalCloseButton } from "../../components/Modal";
import WorkerSearchPicker from "../../components/WorkerSearchPicker";
import { useWorkersList } from "../../hooks/useWorkersList";
import { loadWorkedDays } from "../../services/employmentsService";
import { contributionListsService } from "../../services/contributionListsService";
import { localIsoDate } from "../../utils/dates";
import { contributionRows, monthRange } from "../../utils/employment";
import { buildContributionItems, contributionItemKey, contributionTotals, monthTitle } from "../../utils/contributionLists";
import ContributionItemsTable from "./ContributionItemsTable";

const inputCls =
  "w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";

// El mes anterior a hoy, que es el que normalmente se declara.
function previousMonth(today) {
  const [y, m] = today.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

// Generar la lista de imposiciones de un mes: quienes tuvieron contrato con el
// empleador ese mes, una fila por faena con sus días trabajados (dentro del
// período del contrato), y la liquidación con finiquito si el contrato terminó
// ese mes. Los días se editan, las filas se quitan y se puede sumar a alguien.
export default function GenerateContributionListModal({ employers, onClose, onSaved }) {
  const { workers } = useWorkersList();
  const [employerId, setEmployerId] = useState("");
  const [month, setMonth] = useState(() => previousMonth(localIsoDate()));
  const [items, setItems] = useState(null);
  const [faenas, setFaenas] = useState([]);
  const [reads, setReads] = useState(0);
  const [adding, setAdding] = useState({ worker: null, faenaId: "", days: 1 });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const employer = employers.find((x) => x.id === employerId);

  const calculate = async () => {
    const { from, to } = monthRange(month);
    const workersById = new Map(workers.map((w) => [w.id, w]));
    setBusy("calc");
    setError("");
    try {
      const data = await loadWorkedDays(from, to, workers);
      const rows = contributionRows(data.employments, data.worked, { employerId, month });
      setItems(buildContributionItems(rows, { workersById, faenaNameOf: data.faenaNameOf }));
      setFaenas(data.faenas);
      setReads(data.reads);
    } catch (e) {
      setError(e.message || "No se pudieron leer las jornadas.");
    }
    setBusy("");
  };

  const change = (key, patch) => setItems((list) => list.map((it) => (contributionItemKey(it) === key ? { ...it, ...patch } : it)));
  const remove = (key) => setItems((list) => list.filter((it) => contributionItemKey(it) !== key));

  const addPerson = () => {
    const w = adding.worker;
    if (!w) return;
    const item = {
      workerId: w.id,
      rut: w.rut || w.id,
      name: w.name || "",
      faenaId: adding.faenaId,
      faenaName: faenas.find((f) => f.id === adding.faenaId)?.name || "",
      days: Number(adding.days) || 0,
      request: "payslip",
      endDate: "",
      endReason: null,
    };
    setItems((list) => [...list.filter((it) => contributionItemKey(it) !== contributionItemKey(item)), item]);
    setAdding({ worker: null, faenaId: "", days: 1 });
  };

  const save = async () => {
    const data = {
      employerId,
      employerName: employer?.name || "",
      month,
      items,
      totals: contributionTotals(items),
      sentAt: "",
    };
    setBusy("save");
    setError("");
    try {
      onSaved(await contributionListsService.create(data));
    } catch (e) {
      setError(e.message || "No se pudo guardar la lista.");
      setBusy("");
    }
  };

  const totals = items ? contributionTotals(items) : null;

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title="Generar lista de imposiciones"
      size="xl"
      dirty={!!items?.length && !busy}
      footer={
        <>
          <ModalCloseButton disabled={!!busy} className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm hover:bg-[var(--color-surface-2)]">
            Cancelar
          </ModalCloseButton>
          <button type="button" onClick={save} disabled={!!busy || !items?.length} className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] disabled:opacity-60">
            {busy === "save" ? "Guardando…" : "Guardar lista"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
          <label className="block">
            <span className="mb-1 block text-sm text-[var(--color-muted)]">Empleador</span>
            <select value={employerId} onChange={(e) => { setEmployerId(e.target.value); setItems(null); }} className={inputCls}>
              <option value="">Elige…</option>
              {employers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-[var(--color-muted)]">Mes</span>
            <input type="month" value={month} onChange={(e) => { setMonth(e.target.value); setItems(null); }} className={inputCls} />
          </label>
          <button type="button" onClick={calculate} disabled={!employerId || !month || !!busy} className="min-h-10 rounded-md border border-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)] disabled:opacity-50">
            {busy === "calc" ? "Calculando…" : items ? "Volver a calcular" : "Calcular días"}
          </button>
        </div>

        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}

        {items && (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-[var(--color-surface-2)] px-3 py-2 text-sm">
              <span>{monthTitle(month)}</span>
              <span><b>{totals.people}</b> persona{totals.people === 1 ? "" : "s"} · {totals.days} días</span>
              {totals.settlements > 0 && <span className="text-[var(--color-warning)]">{totals.settlements} con finiquito</span>}
              <span className="ml-auto text-xs text-[var(--color-muted)]">{reads} jornadas leídas</span>
            </div>
            {items.length === 0 ? (
              <p className="rounded-md border border-dashed border-[var(--color-border)] py-6 text-center text-sm text-[var(--color-muted)]">
                Nadie tuvo contrato con {employer?.name || "ese empleador"} en {monthTitle(month)}.
              </p>
            ) : (
              <ContributionItemsTable items={items} editable onChange={change} onRemove={remove} />
            )}
            <div className="rounded-md border border-[var(--color-border)] p-3">
              <div className="mb-2 text-sm font-medium">Sumar a alguien</div>
              {adding.worker ? (
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_6rem_auto] sm:items-center">
                  <span className="text-sm">{adding.worker.name}</span>
                  <select value={adding.faenaId} onChange={(e) => setAdding((a) => ({ ...a, faenaId: e.target.value }))} className={inputCls} aria-label="Faena">
                    <option value="">Sin faena</option>
                    {faenas.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                  <input type="number" min="0" value={adding.days} onChange={(e) => setAdding((a) => ({ ...a, days: e.target.value }))} className={inputCls} aria-label="Días" />
                  <button type="button" onClick={addPerson} className="rounded-md bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-[var(--color-accent-fg)]">
                    + Sumar
                  </button>
                </div>
              ) : (
                <WorkerSearchPicker onPick={(w) => setAdding((a) => ({ ...a, worker: w }))} actionLabel="Elegir" take={15} />
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
