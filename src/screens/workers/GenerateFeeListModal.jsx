import { useEffect, useState } from "react";
import Modal, { ModalCloseButton } from "../../components/Modal";
import WorkerSearchPicker from "../../components/WorkerSearchPicker";
import { useWorkersList } from "../../hooks/useWorkersList";
import { loadWorkedDays } from "../../services/employmentsService";
import { feeListsService, getEmploymentConfig } from "../../services/feeListsService";
import { localIsoDate } from "../../utils/dates";
import { feeRows } from "../../utils/employment";
import { buildFeeListItems, feeItem, feeItemKey, feeListTotals, missingAddress } from "../../utils/feeLists";
import { fmtCurrency } from "../../utils/format";
import FeeItemsTable from "./FeeItemsTable";

const inputCls =
  "w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";

const monthStart = (today) => `${today.slice(0, 7)}-01`;

// Generar una lista de honorarios: el empleador y el rango de fechas arman una
// fila por persona y faena con los días que trabajó a honorarios con ese
// empleador. Los días se editan, las filas se quitan y se puede sumar a
// alguien. La tarifa y la retención vienen de la configuración y se pueden
// cambiar para esta lista.
export default function GenerateFeeListModal({ employers, onClose, onSaved }) {
  const today = localIsoDate();
  const { workers } = useWorkersList();
  const [employerId, setEmployerId] = useState("");
  const [from, setFrom] = useState(monthStart(today));
  const [to, setTo] = useState(today);
  const [dailyNet, setDailyNet] = useState("");
  const [ratePct, setRatePct] = useState("");
  const [items, setItems] = useState(null);
  const [faenas, setFaenas] = useState([]);
  const [reads, setReads] = useState(0);
  const [adding, setAdding] = useState({ worker: null, faenaId: "", days: 1 });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    getEmploymentConfig()
      .then((c) => {
        setDailyNet(String(c.feeDailyNet));
        setRatePct(String(Math.round(c.feeWithholdingRate * 10000) / 100));
      })
      .catch(() => {});
  }, []);

  const net = Number(dailyNet) || 0;
  const rate = (Number(String(ratePct).replace(",", ".")) || 0) / 100;
  const employer = employers.find((x) => x.id === employerId);

  const calculate = async () => {
    setBusy("calc");
    setError("");
    try {
      const data = await loadWorkedDays(from, to, workers);
      const rows = feeRows(data.employments, data.worked, { employerId, from, to });
      const workersById = new Map(workers.map((w) => [w.id, w]));
      setItems(buildFeeListItems(rows, { workersById, faenaNameOf: data.faenaNameOf, dailyNet: net, rate }));
      setFaenas(data.faenas);
      setReads(data.reads);
    } catch (e) {
      setError(e.message || "No se pudieron leer las jornadas.");
    }
    setBusy("");
  };

  const reprice = (nextNet, nextRate) => setItems((list) => (list ? list.map((it) => feeItem(it, nextNet, nextRate)) : list));
  const changeNet = (v) => {
    setDailyNet(v);
    reprice(Number(v) || 0, rate);
  };
  const changeRate = (v) => {
    setRatePct(v);
    reprice(net, (Number(String(v).replace(",", ".")) || 0) / 100);
  };
  const change = (key, patch) => setItems((list) => list.map((it) => (feeItemKey(it) === key ? feeItem({ ...it, ...patch }, net, rate) : it)));
  const remove = (key) => setItems((list) => list.filter((it) => feeItemKey(it) !== key));

  const addPerson = () => {
    const w = adding.worker;
    if (!w) return;
    const faenaName = faenas.find((f) => f.id === adding.faenaId)?.name || "";
    const item = feeItem(
      { workerId: w.id, rut: w.rut || w.id, name: w.name || "", faenaId: adding.faenaId, faenaName, days: Number(adding.days) || 0, address: w.address || "", commune: w.commune || "", issued: false, folio: "", issuedAt: "" },
      net,
      rate,
    );
    setItems((list) => [...list.filter((it) => feeItemKey(it) !== feeItemKey(item)), item]);
    setAdding({ worker: null, faenaId: "", days: 1 });
  };

  const save = async () => {
    const kept = items.filter((it) => it.days > 0);
    const data = {
      employerId,
      employerName: employer?.name || "",
      from,
      to,
      dailyNet: net,
      withholdingRate: rate,
      items: kept,
      totals: feeListTotals(kept),
    };
    setBusy("save");
    setError("");
    try {
      const saved = await feeListsService.create(data);
      onSaved(saved);
    } catch (e) {
      setError(e.message || "No se pudo guardar la lista.");
      setBusy("");
    }
  };

  const totals = items ? feeListTotals(items) : null;
  const noAddress = items ? missingAddress(items) : [];
  const ready = employerId && from && to && from <= to && net > 0;

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title="Generar lista de honorarios"
      size="xl"
      dirty={!!items?.length && !busy}
      footer={
        <>
          <ModalCloseButton disabled={!!busy} className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm hover:bg-[var(--color-surface-2)]">
            Cancelar
          </ModalCloseButton>
          <button
            type="button"
            onClick={save}
            disabled={!!busy || !items?.some((it) => it.days > 0)}
            className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] disabled:opacity-60"
          >
            {busy === "save" ? "Guardando…" : "Guardar lista"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
          <label className="block">
            <span className="mb-1 block text-sm text-[var(--color-muted)]">Empleador</span>
            <select value={employerId} onChange={(e) => { setEmployerId(e.target.value); setItems(null); }} className={inputCls}>
              <option value="">Elige…</option>
              {employers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-[var(--color-muted)]">Desde</span>
            <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setItems(null); }} className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-[var(--color-muted)]">Hasta</span>
            <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setItems(null); }} className={inputCls} />
          </label>
          <button type="button" onClick={calculate} disabled={!ready || !!busy} className="min-h-10 rounded-md border border-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)] disabled:opacity-50">
            {busy === "calc" ? "Calculando…" : items ? "Volver a calcular" : "Calcular días"}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:w-96">
          <label className="block">
            <span className="mb-1 block text-sm text-[var(--color-muted)]">Líquido por día</span>
            <input type="number" min="0" value={dailyNet} onChange={(e) => changeNet(e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-[var(--color-muted)]">Retención (%)</span>
            <input inputMode="decimal" value={ratePct} onChange={(e) => changeRate(e.target.value)} className={inputCls} />
          </label>
        </div>

        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}

        {items && (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-[var(--color-surface-2)] px-3 py-2 text-sm">
              <span><b>{totals.people}</b> persona{totals.people === 1 ? "" : "s"} · {totals.days} días</span>
              <span>Bruto <b>{fmtCurrency(totals.gross)}</b></span>
              <span>Retención {fmtCurrency(totals.withholding)}</span>
              <span>Líquido <b>{fmtCurrency(totals.net)}</b></span>
              <span className="ml-auto text-xs text-[var(--color-muted)]">{reads} jornadas leídas</span>
            </div>
            {noAddress.length > 0 && (
              <p className="text-xs text-[var(--color-warning)]">
                Sin dirección ({noAddress.length}): {noAddress.join(", ")}. La boleta la pide; se completa en la ficha de cada persona.
              </p>
            )}
            {items.length === 0 ? (
              <p className="rounded-md border border-dashed border-[var(--color-border)] py-6 text-center text-sm text-[var(--color-muted)]">
                Nadie trabajó a honorarios con {employer?.name || "ese empleador"} en esas fechas.
              </p>
            ) : (
              <FeeItemsTable items={items} mode="draft" onChange={change} onRemove={remove} />
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
                  <input type="number" min="1" value={adding.days} onChange={(e) => setAdding((a) => ({ ...a, days: e.target.value }))} className={inputCls} aria-label="Días" />
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
