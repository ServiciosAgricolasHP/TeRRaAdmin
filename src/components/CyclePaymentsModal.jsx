import { useRef, useState } from "react";
import Modal from "./Modal";
import WorkerSummaryModal from "./WorkerSummaryModal";
import { useCatalogs } from "../contexts/CatalogsContext";
import { useCaptureActions } from "../hooks/useCaptureActions";
import { useIsMobile } from "../hooks/useIsMobile";
import { cyclePaymentGroups } from "../utils/cyclePayments";
import { fmtCurrency } from "../utils/format";
import { PRINT_GRID_CSS } from "../utils/printWindow";
import { workerSearchInput } from "../utils/workerSearch";
import { WorkerPayrollDetailModal } from "./WorkerPayrollDetailModal";
import { CyclePaymentsTable } from "./cyclePaymentsModal/CyclePaymentsTable";
import { useCyclePayments } from "./cyclePaymentsModal/useCyclePayments";
import { writeCyclePaymentsXlsx } from "./cyclePaymentsModal/writeCyclePaymentsXlsx";

const VIEWS = [
  { v: "payroll", l: "🧾 Por nómina" },
  { v: "person", l: "👤 Por persona" },
];
const STATES = [
  { v: "all", l: "Todo", text: "todo" },
  { v: "paid", l: "✓ Pagadas", text: "solo nóminas pagadas" },
  { v: "unpaid", l: "⏳ Sin pagar", text: "solo nóminas sin pagar" },
];
// En la grilla del ciclo, también lo que no está en ninguna nómina.
const UNPAID_OPTION = { v: "none", l: "⚠ Sin nómina", text: "solo lo que no está en ninguna nómina" };
const SEGMENT = "inline-flex rounded-lg bg-[var(--color-surface-2)] p-0.5 text-xs";
const TOOL = "min-h-8 rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-50";

function Segment({ label, options, value, onChange }) {
  return (
    <div className={SEGMENT} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={`min-h-8 rounded-md px-2.5 py-1 ${value === o.v ? "bg-[var(--color-surface)] font-medium shadow-sm" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

// Los pagos de un ciclo en todas sus nóminas: a quién se le pagó qué labor,
// en qué nómina y cuánto recibió en esa nómina entera. Se abre desde "Ciclos
// de esta nómina", en el detalle. El líquido de cada fila abre lo que la
// persona cobró en esa nómina, día por día, y de ahí su resumen completo.
//
// Desde la grilla del ciclo no hay nómina abierta (`payroll`): ahí suma lo
// que falta pagar (`includeUnpaid`), con las jornadas que la grilla ya tiene
// (`workdays`).
export function CyclePaymentsModal({ allPayrolls = null, cycle, includeUnpaid = false, labors, onClose, payroll = null, workdays = null, workers = null }) {
  const isMobile = useIsMobile();
  const { data, error, loading, payrolls } = useCyclePayments({ allPayrolls, cycleId: cycle.id, includeUnpaid, labors, payroll, workdays, workers });
  const states = includeUnpaid ? [...STATES, UNPAID_OPTION] : STATES;
  const [view, setView] = useState("payroll");
  const [state, setState] = useState("all");
  const [search, setSearch] = useState("");
  const tableRef = useRef(null);
  const { catalogs } = useCatalogs();
  // La fila elegida: su detalle de pago en esa nómina (`pay`) o el resumen
  // completo de la persona (`summary`).
  const [shown, setShown] = useState(null);
  const shownWorker = shown ? { workerId: shown.row.personKey, id: shown.row.personKey, rut: shown.row.rut, name: shown.row.name } : null;
  const shownPayment = shown?.kind === "pay"
    ? { payroll: [payroll, ...(payrolls || [])].find((p) => p?.id === shown.row.payrollId) || null, itemKey: shown.row.itemKey }
    : null;
  const { busy, copy, print, run } = useCaptureActions();

  const report = data ? cyclePaymentGroups(data, { view, state, search }) : null;
  const empty = !report || report.groups.length === 0;
  const subtitle = report
    ? `${states.find((s) => s.v === state).text} · ${report.people} ${report.people === 1 ? "persona" : "personas"} en ${report.payrolls} ${report.payrolls === 1 ? "nómina" : "nóminas"} · ${fmtCurrency(report.totals.cycleAmount)}${report.unpaidAmount > 0 ? ` · falta pagar ${fmtCurrency(report.unpaidAmount)}` : ""}`
    : "";

  return (
    <Modal
      open
      onClose={onClose}
      title="💸 Pagos del ciclo"
      size="2xl"
      section="Pagos del ciclo"
      footer={
        <button onClick={onClose} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)]">
          Cerrar
        </button>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segment label="Vista" options={VIEWS} value={view} onChange={setView} />
        <Segment label="Estado de la nómina" options={states} value={state} onChange={setState} />
        <div className="relative w-full sm:w-auto sm:min-w-[200px] sm:flex-1">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--color-muted)]">🔍</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(workerSearchInput(e.target.value))}
            placeholder="Buscar por nombre o RUT"
            className="min-h-8 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] py-1.5 pl-8 pr-2.5 text-sm outline-none focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)]"
          />
        </div>
        <div className="flex gap-1.5">
          <button type="button" className={TOOL} disabled={!!busy || empty} onClick={() => copy(tableRef.current)} title="Copiar como imagen">
            {busy === "copy" ? "Copiando…" : "📋 Copiar"}
          </button>
          <button
            type="button"
            className={`${TOOL} hidden md:inline-block`}
            disabled={!!busy || empty}
            onClick={() => print(tableRef.current, { title: `Pagos del ciclo — ${cycle.label}`, css: PRINT_GRID_CSS, margin: "10mm" })}
            title="Imprimir"
          >
            🖨 Imprimir
          </button>
          <button
            type="button"
            className={TOOL}
            disabled={!!busy || empty}
            onClick={() => run("xlsx", () => writeCyclePaymentsXlsx({ cycleLabel: cycle.label, report, subtitle }))}
            title="Descargar Excel"
          >
            {busy === "xlsx" ? "…" : "📊 Excel"}
          </button>
        </div>
      </div>

      {loading && <p className="py-8 text-center text-sm text-[var(--color-muted)]">Cargando las jornadas del ciclo…</p>}
      {error && <p className="py-8 text-center text-sm text-[var(--color-danger)]">No se pudieron cargar los pagos del ciclo. {error}</p>}
      {report && (
        <div ref={tableRef} className="bg-[var(--color-surface)]">
          <div className="mb-2">
            <div className="text-sm font-semibold [overflow-wrap:anywhere]">Pagos del ciclo {cycle.label}</div>
            <div className="text-xs text-[var(--color-muted)]">{subtitle}</div>
          </div>
          {empty ? (
            <p className="py-6 text-center text-sm text-[var(--color-muted)]">
              {data.rows.length === 0 ? (includeUnpaid ? "Este ciclo no tiene jornadas con monto." : "Ninguna nómina tiene jornadas de este ciclo.") : "Nada calza con el filtro."}
            </p>
          ) : (
            <CyclePaymentsTable report={report} isMobile={isMobile} onShowPay={(row) => setShown({ kind: "pay", row })} />
          )}
        </div>
      )}
      {shownWorker && (
        <>
          <WorkerPayrollDetailModal
            open={!!shownPayment}
            payment={shownPayment}
            worker={shownWorker}
            catalogs={catalogs}
            onClose={() => setShown(null)}
            onShowFullHistory={() => setShown({ kind: "summary", row: shown.row })}
          />
          <WorkerSummaryModal open={shown.kind === "summary"} worker={shownWorker} onClose={() => setShown(null)} />
        </>
      )}
    </Modal>
  );
}
