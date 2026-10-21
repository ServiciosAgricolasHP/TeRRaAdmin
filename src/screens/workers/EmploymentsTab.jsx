import { useMemo, useState } from "react";
import EndEmploymentsModal from "../../components/EndEmploymentsModal";
import WorkerEditModal from "../../components/WorkerEditModal";
import ScreenLoader from "../../components/ScreenLoader";
import { useToast } from "../../contexts/ToastContext";
import { useEmployers } from "../../hooks/useEmployers";
import { useWorkersList } from "../../hooks/useWorkersList";
import { setSettlementStatus } from "../../services/employmentsService";
import { formatRutForDisplay } from "../../utils/rutUtils";
import { workerMatchesQuery } from "../../utils/workerSearch";
import { EMPLOYMENT_TYPES, END_REASONS, SETTLEMENT_STATUSES } from "../../utils/employment";
import EmployersModal from "./EmployersModal";
import StartEmploymentsModal from "./StartEmploymentsModal";
import { useEmployments } from "./useEmployments";

const fmt = (iso) => (iso ? iso.split("-").reverse().join("-") : "");

const selectCls =
  "rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]";
const btnCls =
  "min-h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-50";

const SETTLEMENT_TONE = {
  pending: "text-[var(--color-danger)]",
  requested: "text-[var(--color-warning)]",
  done: "text-[var(--color-success)]",
};

// Contratos y honorarios vigentes, y los finiquitos. Se filtra por tipo,
// empleador y nombre o RUT, se eligen varios y se terminan o se marca su
// finiquito de una vez. El nombre abre la ficha de la persona, con su
// historial.
export default function EmploymentsTab() {
  const toast = useToast();
  const { active, settlements, loading, error, today, reload } = useEmployments();
  const { employers, nameOf, reload: reloadEmployers } = useEmployers();
  const { workers } = useWorkersList();
  const [view, setView] = useState("active");
  const [type, setType] = useState("");
  const [employerId, setEmployerId] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [starting, setStarting] = useState(false);
  const [ending, setEnding] = useState(null);
  const [employersOpen, setEmployersOpen] = useState(false);
  const [card, setCard] = useState(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => {
    const source = view === "active" ? active : settlements;
    return source
      .filter((e) => !type || e.type === type)
      .filter((e) => !employerId || e.employerId === employerId)
      .filter((e) => !query.trim() || workerMatchesQuery({ id: e.workerId, rut: e.workerRut, name: e.workerName }, query))
      .sort((a, b) => String(a.workerName).localeCompare(String(b.workerName), "es"));
  }, [view, active, settlements, type, employerId, query]);

  const picked = rows.filter((e) => selected.has(e.id));
  const allPicked = rows.length > 0 && picked.length === rows.length;
  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setSelected(allPicked ? new Set() : new Set(rows.map((e) => e.id)));
  const switchView = (v) => {
    setView(v);
    setSelected(new Set());
  };
  const afterAction = (msg) => {
    toast.success(msg);
    setSelected(new Set());
    reload();
  };

  const markSettlement = async (status) => {
    setBusy(true);
    try {
      await setSettlementStatus(picked.map((e) => e.id), status, today);
      afterAction(`${picked.length} finiquito${picked.length === 1 ? "" : "s"}: ${SETTLEMENT_STATUSES[status].toLowerCase()}`);
    } catch (e) {
      toast.error(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const openCard = (e) => {
    const w = workers.find((x) => x.id === e.workerId);
    if (w) setCard(w);
    else toast.warning("No se encontró la ficha de esa persona.");
  };

  const counts = {
    contract: active.filter((e) => e.type === "contract").length,
    fees: active.filter((e) => e.type === "fees").length,
    pending: settlements.filter((e) => e.settlementStatus !== "done").length,
  };
  const segBtn = (v, label) => (
    <button
      type="button"
      onClick={() => switchView(v)}
      className={`px-3 py-1.5 ${view === v ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]" : "bg-[var(--color-surface)] hover:bg-[var(--color-accent-soft)]"}`}
    >
      {label}
    </button>
  );
  const typeTag = (e) => `${EMPLOYMENT_TYPES[e.type]?.icon || ""} ${EMPLOYMENT_TYPES[e.type]?.label || "—"}`;
  const settlementTag = (e) =>
    e.settlementStatus ? (
      <span className={SETTLEMENT_TONE[e.settlementStatus]}>
        {SETTLEMENT_STATUSES[e.settlementStatus]}
        {e.settlementStatus === "done" && e.settlementDoneAt ? ` el ${fmt(e.settlementDoneAt)}` : ""}
        {e.settlementStatus === "requested" && e.settlementRequestedAt ? ` el ${fmt(e.settlementRequestedAt)}` : ""}
      </span>
    ) : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--color-muted)]">
          {counts.contract} con contrato · {counts.fees} a honorarios · {counts.pending} finiquito{counts.pending === 1 ? "" : "s"} por cerrar
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setStarting(true)} className="min-h-9 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]">
            + Contratar
          </button>
          <button type="button" onClick={() => setEmployersOpen(true)} className={btnCls}>
            ⚙ Empleadores
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-md border border-[var(--color-border)] text-sm">
          {segBtn("active", `Vigentes (${active.length})`)}
          {segBtn("settlements", `Finiquitos (${settlements.length})`)}
        </div>
        <select value={type} onChange={(e) => setType(e.target.value)} className={selectCls} aria-label="Tipo">
          <option value="">Contrato y honorarios</option>
          {Object.entries(EMPLOYMENT_TYPES).map(([k, m]) => <option key={k} value={k}>{m.icon} {m.label}</option>)}
        </select>
        <select value={employerId} onChange={(e) => setEmployerId(e.target.value)} className={selectCls} aria-label="Empleador">
          <option value="">Todos los empleadores</option>
          {employers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nombre o RUT…" className={`${selectCls} w-full sm:w-56`} />
      </div>

      {picked.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-3 py-2 text-sm">
          <span className="font-medium">{picked.length} elegido{picked.length === 1 ? "" : "s"}</span>
          {view === "active" ? (
            <button type="button" onClick={() => setEnding(picked)} className="min-h-8 rounded-md bg-[var(--color-danger)] px-3 py-1 text-sm font-medium text-white">
              Terminar ({picked.length})
            </button>
          ) : (
            <>
              <button type="button" disabled={busy} onClick={() => markSettlement("requested")} className={btnCls}>
                Marcar solicitado
              </button>
              <button type="button" disabled={busy} onClick={() => markSettlement("done")} className={btnCls}>
                Marcar listo
              </button>
            </>
          )}
          <button type="button" onClick={() => setSelected(new Set())} className="ml-auto text-xs underline">
            Quitar selección
          </button>
        </div>
      )}

      {loading ? (
        <ScreenLoader label="Cargando contratos…" />
      ) : error ? (
        <p className="text-sm text-[var(--color-danger)]">{error}</p>
      ) : rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--color-border)] py-8 text-center text-sm text-[var(--color-muted)]">
          {view === "active" ? "Nadie con contrato ni honorarios vigentes con estos filtros." : "No hay finiquitos con estos filtros."}
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-lg border border-[var(--color-border)] md:block">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-surface-2)] text-left text-xs text-[var(--color-muted)]">
                <tr>
                  <th className="w-8 px-3 py-2">
                    <input type="checkbox" checked={allPicked} onChange={toggleAll} aria-label="Elegir todos" />
                  </th>
                  <th className="px-3 py-2">Persona</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Empleador</th>
                  <th className="px-3 py-2">Desde</th>
                  <th className="px-3 py-2">Hasta</th>
                  {view === "settlements" && <th className="px-3 py-2">Motivo</th>}
                  {view === "settlements" && <th className="px-3 py-2">Finiquito</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} className="border-t border-[var(--color-border)]">
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggle(e.id)} aria-label={`Elegir a ${e.workerName}`} />
                    </td>
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => openCard(e)} className="text-left font-medium hover:underline">
                        {e.workerName}
                      </button>
                      <div className="text-xs text-[var(--color-muted)]">{formatRutForDisplay(e.workerRut)}</div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{typeTag(e)}</td>
                    <td className="px-3 py-2">{nameOf(e.employerId)}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">{fmt(e.startDate)}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">{e.endDate ? fmt(e.endDate) : <span className="text-[var(--color-muted)]">sin término</span>}</td>
                    {view === "settlements" && <td className="px-3 py-2">{END_REASONS[e.endReason] || "—"}</td>}
                    {view === "settlements" && <td className="whitespace-nowrap px-3 py-2">{settlementTag(e)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-2 md:hidden">
            <label className="flex items-center gap-2 px-1 text-sm">
              <input type="checkbox" checked={allPicked} onChange={toggleAll} /> Elegir todos ({rows.length})
            </label>
            {rows.map((e) => (
              <div key={e.id} className="flex gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggle(e.id)} aria-label={`Elegir a ${e.workerName}`} className="mt-1 h-4 w-4" />
                <div className="min-w-0 flex-1">
                  <button type="button" onClick={() => openCard(e)} className="block truncate text-left font-medium">
                    {e.workerName}
                  </button>
                  <div className="text-xs text-[var(--color-muted)]">
                    {formatRutForDisplay(e.workerRut)} · {typeTag(e)} · {nameOf(e.employerId)}
                  </div>
                  <div className="text-xs">
                    {fmt(e.startDate)} → {e.endDate ? fmt(e.endDate) : "sin término"}
                    {view === "settlements" && e.endReason && ` · ${END_REASONS[e.endReason]}`}
                  </div>
                  {view === "settlements" && <div className="text-xs">Finiquito: {settlementTag(e)}</div>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {starting && (
        <StartEmploymentsModal
          employers={employers}
          activeEmployments={active}
          onClose={() => setStarting(false)}
          onDone={(n) => {
            setStarting(false);
            afterAction(`${n} período${n === 1 ? "" : "s"} creado${n === 1 ? "" : "s"}`);
          }}
        />
      )}
      {ending && (
        <EndEmploymentsModal
          items={ending}
          onClose={() => setEnding(null)}
          onDone={(n) => {
            setEnding(null);
            afterAction(`${n} período${n === 1 ? "" : "s"} terminado${n === 1 ? "" : "s"}`);
          }}
        />
      )}
      {employersOpen && <EmployersModal employers={employers} onClose={() => setEmployersOpen(false)} onChanged={reloadEmployers} />}
      {card && (
        <WorkerEditModal
          open
          mode="edit"
          worker={card}
          allWorkers={workers}
          onClose={() => {
            setCard(null);
            reload();
          }}
          onSaved={() => {
            setCard(null);
            reload();
          }}
        />
      )}
    </div>
  );
}
