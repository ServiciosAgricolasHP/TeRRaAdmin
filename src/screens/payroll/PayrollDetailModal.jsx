import { useMemo, useState, useRef } from "react";
import {
  pendingCashItemsOf,
} from "../../services/payrollsService";
import { useCatalogs } from "../../contexts/CatalogsContext";
import { useToast } from "../../contexts/ToastContext";
import { liveProfileOf } from "../../services/payrollRecalc";
import {
  splitBankAndCash,
  groupCashByLeader,
  workdayPayAmount,
} from "../../utils/payroll";
import {
  payrollCycleBreakdown,
} from "../../utils/payrollItem";
import ConfirmDialog from "../../components/ConfirmDialog";
import WorkerSummaryModal from "../../components/WorkerSummaryModal";
import RowMenu from "../../components/RowMenu";
import { useIsMobile } from "../../hooks/useIsMobile";
import { currentRutResolver } from "../../utils/workerRut";
import {
  detailSummariesOf,
  subfaenaSummaryOf,
  cyclesPeriodOf,
  summaryCycleName,
} from "../../utils/payrollDetail";
import { fmtCurrency } from "../../utils/format";
import { AddCyclesModal } from "./AddCyclesModal";
import { AddWorkerDaysModal } from "./AddWorkerDaysModal";
import { CashEstimationModal } from "./CashEstimationModal";
import { PAY_STATE_PILL, payStateOf, paymentDates } from "./payState";
import { PortalBadge } from "./PayStatePill";
import {
  computeBonusAdvanceSummary,
  fetchPayrollWorkdays,
} from "./printCommon";
import { RecalcModal } from "./RecalcModal";
import { WorkerDetailRow } from "./WorkerDetailRow";
import { useDetailFilters } from "./payrollDetailModal/useDetailFilters";
import { useCashPaid } from "./payrollDetailModal/useCashPaid";
import { useCycleTitles } from "./payrollDetailModal/useCycleTitles";
import { usePayrollSnapshot } from "./payrollDetailModal/usePayrollSnapshot";
import { useContentEdit } from "./payrollDetailModal/useContentEdit";
import { usePayrollRecalc } from "./payrollDetailModal/usePayrollRecalc";
import { usePayrollPrints } from "./payrollDetailModal/usePayrollPrints";
import { useSummaryTable } from "./payrollDetailModal/useSummaryTable";
import { DetailFilterBar } from "./payrollDetailModal/DetailFilterBar";
import { CycleTitlesEditor } from "./payrollDetailModal/CycleTitlesEditor";
import { PayrollTotalsCards } from "./payrollDetailModal/PayrollTotalsCards";
import { SummaryTable } from "./payrollDetailModal/SummaryTable";
import { PayrollCyclesSection } from "./payrollDetailModal/PayrollCyclesSection";

export function PayrollDetailModal({ payroll, cycles, cycleStats = {}, faenas, subfaenas, workers, allPayrolls = [], onClose, onRedownload, onDownloadBankFile, onDownloadSnapshot, bankFormatLabel = null, onPublishPortal = null, publishedPayrollId = null, onChanged }) {
  "use no memo";
  const { catalogs } = useCatalogs();
  const toast = useToast();
  const isMobile = useIsMobile();
  const items = payroll.items || [];
  const rutOf = useMemo(() => currentRutResolver(workers), [workers]);
  const { bank, cash } = splitBankAndCash(items);
  const cashGroups = groupCashByLeader(cash);
  const allGroups = groupCashByLeader(items); // todos (banco y efectivo) agrupados por líder

  const filters = useDetailFilters({ items, payroll, rutOf });
  const { filteredItems } = filters;
  const [expandedRut, setExpandedRut] = useState(null);
  // Secciones colapsadas al abrir: los ciclos siempre (se despliegan solos al
  // editar el contenido) y, en una nómina pagada, cada grupo por líder (banco
  // y efectivo). El resumen abre siempre desplegado.
  const [collapsedSections, setCollapsedSections] = useState(() => {
    const set = new Set(["cycles"]);
    if (payroll.status !== "paid") return set;
    for (const g of groupCashByLeader(bank)) set.add(`bank_${g.leader}`);
    for (const g of cashGroups) set.add(`cash_${g.leader}`);
    return set;
  });
  const [workerSummaryFor, setWorkerSummaryFor] = useState(null);

  const toggleSection = (key) => setCollapsedSections((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });
  const isCollapsed = (key) => collapsedSections.has(key);

  const filteredSplit = useMemo(() => splitBankAndCash(filteredItems), [filteredItems]);
  const filteredBank = filteredSplit.bank;
  const filteredCash = filteredSplit.cash;
  const filteredCashGroups = useMemo(() => groupCashByLeader(filteredCash), [filteredCash]);
  // Banco también agrupado por líder, para imprimir el detalle por grupo (ej.
  // solo CHILENOS) igual que en efectivo. groupCashByLeader sirve para
  // cualquier conjunto de items, no solo los de efectivo.
  const filteredBankGroups = useMemo(() => groupCashByLeader(filteredBank), [filteredBank]);

  const {
    cashPaidMode,
    cashPaidSet,
    owedCash,
    setGroupCashPaid,
    toggleCashPaid,
  } = useCashPaid({ cash, payroll, toast });

  // Deuda de efectivo de OTRAS nóminas. No se mezcla con esta —son entregas
  // aparte, con su propio sobre— pero sí tiene que entrar al estimador: los
  // billetes y el sencillo se sacan del banco una sola vez. Una nómina pagada
  // ya entregó su efectivo: ni el resumen ni el estimador le ofrecen sumarle
  // el de otras.
  const isPaid = payroll.status === "paid";
  const otherPendingCash = useMemo(() => {
    const out = [];
    if (isPaid) return out;
    for (const other of allPayrolls) {
      if (!other || other.id === payroll.id) continue;
      const pendItems = pendingCashItemsOf(other);
      if (pendItems.length === 0) continue;
      // Período de la otra nómina, sacado de su propio `cycleDetails`.
      const days = (other.cycleDetails || []).flatMap((c) => [c.firstDay, c.lastDay]).filter(Boolean).sort();
      out.push({
        payrollId: other.id,
        name: other.name || other.id,
        items: pendItems,
        amount: pendItems.reduce((s, it) => s + (Number(it.amount) || 0), 0),
        period: days.length ? { first: days[0], last: days[days.length - 1] } : null,
      });
    }
    return out;
  }, [allPayrolls, payroll.id, isPaid]);

  const detailSummaries = detailSummariesOf(allGroups, payroll.cycleDetails);

  const cycleDetails = payroll.cycleDetails || [];

  const edit = useContentEdit({
    cycleDetails,
    cycles,
    faenas,
    items,
    onChanged,
    payroll,
    subfaenas,
    toast,
    workers,
  });
  const {
    addCyclesOpen,
    addWorkerOpen,
    confirmRemove,
    confirmRemoveAction,
    editBusy,
    editMode,
    handleAddCycles,
    handleAddWorkerDays,
    handleRemoveWorker,
    isPending,
    setAddCyclesOpen,
    setAddWorkerOpen,
    setConfirmRemove,
    setEditMode,
  } = edit;

  const { cycleTitleOverrides, displayCycleLabel, setCycleTitle } = useCycleTitles({ payroll });

  // El resumen junta los ciclos de una misma subfaena; "Ciclos separados" lo
  // muestra (y lo imprime y descarga) con una fila por ciclo.
  const [cyclesApart, setCyclesApart] = useState(false);
  const cycleNameOf = (cd) => summaryCycleName(cd, cycleTitleOverrides);
  const subfaenaSummary = subfaenaSummaryOf(cycleDetails, bank, cash, { byCycle: cyclesApart, cycleNameOf });

  const bonusAdvanceSummary = computeBonusAdvanceSummary(items);
  const cyclesPeriod = (cycleIdsIn) => cyclesPeriodOf(cycleDetails, cycleIdsIn);

  // Ciclos y jornadas de la nómina, una vez por modal. Se guarda la promesa y
  // no el resultado, así dos clicks seguidos no disparan dos lecturas, y queda
  // atada a la identidad de `payroll`: toda edición pasa por `onChanged`, que
  // reemplaza el objeto e invalida el memo. Cerrar y volver a abrir el modal
  // también relee.
  const payrollDataRef = useRef({ payroll: null, promise: null });
  const getPayrollData = () => {
    if (payrollDataRef.current.payroll !== payroll) {
      payrollDataRef.current = { payroll, promise: fetchPayrollWorkdays(payroll) };
    }
    return payrollDataRef.current.promise;
  };

  const table = useSummaryTable({
    allGroups,
    bonusAdvanceSummary,
    catalogs,
    cycleNameOf,
    cyclesApart,
    cyclesPeriod,
    getPayrollData,
    otherPendingCash,
    payroll,
    setCyclesApart,
    subfaenaSummary,
    toast,
  });

  const [showTitleEditor, setShowTitleEditor] = useState(false);
  const [showCashEstimation, setShowCashEstimation] = useState(false);

  const { snapshot, snapshotLoading } = usePayrollSnapshot({ payroll });

  // Lo que paga la nómina por ciclo y por labor. El monto de cada labor sale
  // de las jornadas del snapshot; sin snapshot quedan las jornadas y personas.
  const cycleBreakdown = useMemo(() => {
    const laborTypeById = new Map(cycles.flatMap((c) => (c.labors || []).map((l) => [l.id, l.type])));
    const workdayAmounts = new Map(
      (snapshot?.workdays || []).map((wd) => [wd.id, workdayPayAmount(wd, laborTypeById.get(wd.laborId))]),
    );
    return payrollCycleBreakdown({
      cycleDetails: payroll.cycleDetails || [],
      items: payroll.items || [],
      laborsOf: (cid) => cycles.find((c) => c.id === cid)?.labors || [],
      workdayAmounts,
    });
  }, [payroll.cycleDetails, payroll.items, cycles, snapshot]);

  const recalc = usePayrollRecalc({
    cycleBreakdown,
    cycles,
    faenas,
    onChanged,
    payroll,
    subfaenas,
    toast,
    workers,
  });
  const {
    applyRecalc,
    recalcBusy,
    recalcPreview,
    setRecalcPreview,
    setRemoval,
    startRecalc,
  } = recalc;

  const {
    handlePrint,
    handlePrintDetail,
    handlePrintGroupDetail,
    printing,
    printingDetail,
    printingGroupLeader,
  } = usePayrollPrints({
    allGroups,
    cashGroups,
    catalogs,
    cyclesApart,
    cycleTitleOverrides,
    detailSummaries,
    getPayrollData,
    payroll,
    rutOf,
    subfaenaSummary,
    toast,
  });

  // Lo que se imprime y lo que se descarga de la nómina, en dos menús al pie.
  const printItems = [
    ...(allGroups.length > 0
      ? [{ icon: "📄", label: "Detalle de pago", hint: "Todos los trabajadores, sin firma.", disabled: printingDetail, onClick: () => handlePrintDetail() }]
      : []),
    ...(cashGroups.length > 0
      ? [{ icon: "💵", label: "Comprobantes efectivo", hint: "Una hoja por líder, para firmar.", disabled: printing, onClick: () => handlePrint() }]
      : []),
  ];
  const downloadItems = [
    { icon: "📥", label: "XLSX completo", hint: "Nómina, resumen, transferencias y efectivo.", onClick: () => onRedownload(payroll) },
    { icon: "🏦", label: "Sólo Nómina", hint: bankFormatLabel ? `La hoja del banco (${bankFormatLabel}), para subir las transferencias.` : "La hoja del banco, para subir las transferencias.", onClick: () => onDownloadBankFile(payroll) },
    { divider: true },
    { icon: "{ }", label: "JSON", hint: "Toda la información para reconstruir la nómina.", onClick: () => onDownloadSnapshot(payroll) },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-2 py-3 sm:px-4 sm:py-6" onClick={onClose}>
      <div
        className="flex max-h-[94vh] w-full max-w-4xl flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl sm:max-h-[90vh] lg:max-w-6xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-[var(--color-border)] px-3 py-3 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="min-w-0 text-base font-semibold [overflow-wrap:anywhere] sm:text-lg">{payroll.name}</h2>
                <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${PAY_STATE_PILL[payStateOf(payroll)].cls}`}>
                  {PAY_STATE_PILL[payStateOf(payroll)].label}
                </span>
                {payroll.id === publishedPayrollId && <PortalBadge />}
                {payroll.classification === "diferencia" && (
                  <span className="shrink-0 rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[10px] text-[var(--color-muted)]">
                    Diferencia
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate text-xs text-[var(--color-muted)]">
                {cycleDetails.length > 0
                  ? cycleDetails.map((c) => displayCycleLabel(c)).join(" · ")
                  : (payroll.cycleLabels || []).join(" · ") || "—"}
              </p>
              {paymentDates(payroll).length > 0 && (
                <p className="mt-0.5 text-xs tabular-nums text-[var(--color-muted)]">
                  {paymentDates(payroll).map((d) => `${d.label} ${d.date}`).join(" · ")}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {onPublishPortal && (
                <button
                  type="button"
                  onClick={() => onPublishPortal(payroll)}
                  title="Publicar esta nómina en el portal de trabajadores: cada uno ve su detalle buscando su RUT"
                  className="min-h-8 whitespace-nowrap rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)]"
                >
                  🌐<span className="hidden sm:inline"> {payroll.id === publishedPayrollId ? "Actualizar en portal" : "Publicar en portal"}</span>
                </button>
              )}
              <button
                onClick={onClose}
                className="rounded p-1 text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>
          </div>
          {(cycleDetails.length > 0 || isPending) && (
            <div className="mt-2 flex flex-wrap gap-1">
              {cycleDetails.length > 0 && (
                <button
                  onClick={() => setShowTitleEditor((v) => !v)}
                  className={`rounded-md border px-2 py-1 text-xs ${
                    showTitleEditor
                      ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                      : "border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-accent-soft)]"
                  }`}
                  title="Cambiar el nombre con el que cada ciclo aparece en XLSX, comprobantes y PDF"
                >
                  📝 Editar encabezados
                </button>
              )}
              {isPending && (
                <button
                  onClick={() => {
                    if (editMode) setRemoval(new Map());
                    else setCollapsedSections((prev) => new Set([...prev].filter((k) => k !== "cycles")));
                    setEditMode(!editMode);
                  }}
                  className={`rounded-md border px-2 py-1 text-xs ${
                    editMode
                      ? "border-[var(--color-danger)] bg-[var(--color-danger-soft)] text-[var(--color-danger)]"
                      : "border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-accent-soft)]"
                  }`}
                  title="Sacar trabajadores, ciclos o labores de esta nómina"
                >
                  {editMode ? "✕ Cerrar edición" : "✂ Editar contenido"}
                </button>
              )}
              {isPending && editMode && (
                <>
                  <button
                    type="button"
                    disabled={editBusy}
                    onClick={() => setAddCyclesOpen(true)}
                    className="min-h-8 rounded-md border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-2 py-1 text-xs text-[var(--color-accent)] hover:opacity-80 disabled:opacity-50"
                    title="Agregar otro ciclo, o las labores que le faltan a uno que ya está"
                  >
                    + Agregar ciclo
                  </button>
                  <button
                    type="button"
                    disabled={editBusy}
                    onClick={() => setAddWorkerOpen(true)}
                    className="min-h-8 rounded-md border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-2 py-1 text-xs text-[var(--color-accent)] hover:opacity-80 disabled:opacity-50"
                    title="Sumar días puntuales de una persona, de cualquier ciclo abierto"
                  >
                    + Agregar persona
                  </button>
                </>
              )}
              {isPending && (
                <button
                  type="button"
                  disabled={recalcBusy}
                  onClick={startRecalc}
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
                  title="Volver a comparar contra la producción y los datos actuales de los trabajadores"
                >
                  {recalcBusy ? "Comparando..." : "🔄 Recalcular"}
                </button>
              )}
            </div>
          )}
        </div>
        <DetailFilterBar
          cycleDetails={cycleDetails}
          displayCycleLabel={displayCycleLabel}
          filters={filters}
          items={items}
        />

        <div className="flex-1 space-y-4 overflow-y-auto px-3 py-3 sm:space-y-5 sm:px-5 sm:py-4">
          {showTitleEditor && cycleDetails.length > 0 && (
            <CycleTitlesEditor
              cycleDetails={cycleDetails}
              cycleTitleOverrides={cycleTitleOverrides}
              setCycleTitle={setCycleTitle}
              setShowTitleEditor={setShowTitleEditor}
            />
          )}

          {/* Resumen — desglose general */}
          <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
            <button
              type="button"
              onClick={() => toggleSection("summary")}
              className="flex w-full items-center justify-between gap-2 text-left"
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <span className="text-[var(--color-muted)]">{isCollapsed("summary") ? "▸" : "▾"}</span>
                <span>Resumen</span>
              </span>
              <span className="shrink-0 tabular-nums text-sm font-semibold text-[var(--color-accent)]">
                {fmtCurrency(payroll.total || 0)}
              </span>
            </button>
            {!isCollapsed("summary") && (
              <>
                <PayrollTotalsCards
                  bank={bank}
                  cash={cash}
                  cashGroups={cashGroups}
                  cashPaidMode={cashPaidMode}
                  items={items}
                  owedCash={owedCash}
                  payroll={payroll}
                  setShowCashEstimation={setShowCashEstimation}
                />

                {subfaenaSummary.rows.length > 0 && (
                  <SummaryTable
                    bonusAdvanceSummary={bonusAdvanceSummary}
                    payroll={payroll}
                    table={table}
                  />
                )}
              </>
            )}
          </section>

          {cycleDetails.length > 0 && (
            <PayrollCyclesSection
              cycleBreakdown={cycleBreakdown}
              cycleDetails={cycleDetails}
              edit={edit}
              isCollapsed={isCollapsed}
              recalc={recalc}
              toggleSection={toggleSection}
            />
          )}

          {filteredBankGroups.length > 0 && (
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">🏦 Banco agrupado por líder ({filteredBank.length}{filteredBank.length !== bank.length ? `/${bank.length}` : ""})</h3>
                <span className="text-xs font-normal tabular-nums text-[var(--color-muted)]">
                  {fmtCurrency(filteredBank.reduce((s, x) => s + (Number(x.amount) || 0), 0))}
                </span>
              </div>
              <div className="space-y-2">
                {filteredBankGroups.map((g) => {
                  const sectionKey = `bank_${g.leader}`;
                  const collapsed = isCollapsed(sectionKey);
                  const groupKey = `bank:${g.leader}`;
                  return (
                    <div key={g.leader} className="rounded border border-[var(--color-border)]">
                      <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm">
                        <button
                          type="button"
                          onClick={() => toggleSection(sectionKey)}
                          className="flex flex-1 items-center gap-2 text-left hover:text-[var(--color-accent)]"
                        >
                          <span>{collapsed ? "▸" : "▾"}</span>
                          <span className="font-medium">{g.leader}</span>
                          <span className="text-[10px] text-[var(--color-muted)]">· {g.items.length} pers.</span>
                        </button>
                        <span className="font-semibold tabular-nums">{fmtCurrency(g.total)}</span>
                        <button
                          type="button"
                          disabled={printingGroupLeader === groupKey}
                          onClick={() => handlePrintGroupDetail(g, groupKey)}
                          title="Imprimir el detalle de pago solo para este grupo de transferencias"
                          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-[10px] hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
                        >
                          {printingGroupLeader === groupKey ? "..." : "🖨 Imprimir"}
                        </button>
                      </div>
                      {!collapsed && (
                        isMobile ? (
                          <div className="divide-y divide-[var(--color-border)]">
                            {g.items.map((it) => (
                              <WorkerDetailRow
                                key={it.rut}
                                rutOf={rutOf}
                                item={it}
                                expanded={expandedRut === it.rut}
                                onToggle={() => setExpandedRut((cur) => cur === it.rut ? null : it.rut)}
                                onShowSummary={() => setWorkerSummaryFor(it)}
                                cycleDetails={cycleDetails}
                                displayCycleLabel={displayCycleLabel}
                                editMode={editMode}
                                editBusy={editBusy}
                                onRemoveWorker={handleRemoveWorker}
                                cols="bank"
                                snapshot={snapshot}
                                snapshotLoading={snapshotLoading}
                                catalogs={catalogs}
                                isMobile
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                          <table className="w-full min-w-[640px] text-sm sm:min-w-0">
                            <thead className="bg-[var(--color-surface-2)] text-left text-[var(--color-muted)]">
                              <tr>
                                <th className="px-2 py-1 w-4"></th>
                                <th className="px-2 py-1">RUT</th>
                                <th className="px-2 py-1">Nombre</th>
                                <th className="px-2 py-1">Banco</th>
                                <th className="px-2 py-1">Cuenta</th>
                                <th className="px-2 py-1">Tipo</th>
                                <th className="px-2 py-1 text-right">Monto</th>
                                {editMode && <th className="px-2 py-1"></th>}
                              </tr>
                            </thead>
                            <tbody>
                              {g.items.map((it) => (
                                <WorkerDetailRow
                                  key={it.rut}
                                  rutOf={rutOf}
                                  item={it}
                                  expanded={expandedRut === it.rut}
                                  onToggle={() => setExpandedRut((cur) => cur === it.rut ? null : it.rut)}
                                  onShowSummary={() => setWorkerSummaryFor(it)}
                                  cycleDetails={cycleDetails}
                                  displayCycleLabel={displayCycleLabel}
                                  editMode={editMode}
                                  editBusy={editBusy}
                                  onRemoveWorker={handleRemoveWorker}
                                  cols="bank"
                                  snapshot={snapshot}
                                  snapshotLoading={snapshotLoading}
                                  catalogs={catalogs}
                                />
                              ))}
                            </tbody>
                          </table>
                          </div>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {filteredCashGroups.length > 0 && (
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">💵 Efectivo agrupado por líder ({filteredCash.length}{filteredCash.length !== cash.length ? `/${cash.length}` : ""})</h3>
                <span className="text-xs font-normal tabular-nums text-[var(--color-muted)]">
                  {fmtCurrency(filteredCash.reduce((s, x) => s + (Number(x.amount) || 0), 0))}
                </span>
              </div>
              <div className="space-y-2">
                {filteredCashGroups.map((g) => {
                  const sectionKey = `cash_${g.leader}`;
                  const collapsed = isCollapsed(sectionKey);
                  const groupKey = `cash:${g.leader}`;
                  return (
                    <div key={g.leader} className="rounded border border-[var(--color-border)]">
                      <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm">
                        <button
                          type="button"
                          onClick={() => toggleSection(sectionKey)}
                          className="flex flex-1 items-center gap-2 text-left hover:text-[var(--color-accent)]"
                        >
                          <span>{collapsed ? "▸" : "▾"}</span>
                          <span className="font-medium">{g.leader}</span>
                          <span className="text-[10px] text-[var(--color-muted)]">· {g.items.length} pers.</span>
                        </button>
                        <span className="font-semibold tabular-nums">{fmtCurrency(g.total)}</span>
                        {cashPaidMode && (() => {
                          const allPaid = g.items.every((it) => cashPaidSet.has(it.rut));
                          return (
                            <button
                              type="button"
                              onClick={() => setGroupCashPaid(g.items, !allPaid)}
                              title={allPaid
                                ? "Desmarcar a todo el grupo"
                                : "Marcar que todo el grupo ya cobró su efectivo"}
                              className={`rounded-md border px-2 py-0.5 text-[10px] ${
                                allPaid
                                  ? "border-[var(--color-success)] bg-[var(--color-success-soft)] text-[var(--color-success)]"
                                  : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"
                              }`}
                            >
                              {allPaid ? "✓ cobró todo" : "○ marcar grupo"}
                            </button>
                          );
                        })()}
                        <button
                          type="button"
                          disabled={printingGroupLeader === groupKey}
                          onClick={() => handlePrintGroupDetail(g, groupKey)}
                          title="Imprimir el detalle de pago solo para este grupo (mismo formato que el comprobante en efectivo)"
                          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-[10px] hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
                        >
                          {printingGroupLeader === groupKey ? "..." : "🖨 Imprimir"}
                        </button>
                      </div>
                      {!collapsed && (
                        isMobile ? (
                          <div className="divide-y divide-[var(--color-border)]">
                            {g.items.map((it) => (
                              <WorkerDetailRow
                                key={it.rut}
                                rutOf={rutOf}
                                item={it}
                                expanded={expandedRut === it.rut}
                                onToggle={() => setExpandedRut((cur) => cur === it.rut ? null : it.rut)}
                                onShowSummary={() => setWorkerSummaryFor(it)}
                                cycleDetails={cycleDetails}
                                displayCycleLabel={displayCycleLabel}
                                editMode={editMode}
                                editBusy={editBusy}
                                onRemoveWorker={handleRemoveWorker}
                                cols="cash"
                                cashPaidMode={cashPaidMode}
                                cashPaid={cashPaidSet.has(it.rut)}
                                onToggleCashPaid={toggleCashPaid}
                                snapshot={snapshot}
                                snapshotLoading={snapshotLoading}
                                catalogs={catalogs}
                                isMobile
                              />
                            ))}
                          </div>
                        ) : (
                          <table className="w-full text-sm">
                            <tbody>
                              {g.items.map((it) => (
                                <WorkerDetailRow
                                  key={it.rut}
                                  rutOf={rutOf}
                                  item={it}
                                  expanded={expandedRut === it.rut}
                                  onToggle={() => setExpandedRut((cur) => cur === it.rut ? null : it.rut)}
                                  onShowSummary={() => setWorkerSummaryFor(it)}
                                  cycleDetails={cycleDetails}
                                  displayCycleLabel={displayCycleLabel}
                                  editMode={editMode}
                                  editBusy={editBusy}
                                  onRemoveWorker={handleRemoveWorker}
                                  cols="cash"
                                  cashPaidMode={cashPaidMode}
                                  cashPaid={cashPaidSet.has(it.rut)}
                                  onToggleCashPaid={toggleCashPaid}
                                  snapshot={snapshot}
                                  snapshotLoading={snapshotLoading}
                                  catalogs={catalogs}
                                />
                              ))}
                            </tbody>
                          </table>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--color-border)] px-3 py-2.5 sm:px-5">
          <div className="min-w-0 text-sm">
            <span className="text-[var(--color-muted)]">Total </span>
            <span className="font-semibold tabular-nums">{fmtCurrency(payroll.total || 0)}</span>
            <span className="ml-1 hidden text-xs text-[var(--color-muted)] sm:inline">
              · {items.length} trabajador{items.length === 1 ? "" : "es"}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {printItems.length > 0 && (
              <RowMenu
                items={printItems}
                trigger={printing || printingDetail ? "Preparando…" : "🖨 Imprimir ▾"}
                triggerLabel="Imprimir"
                triggerClassName="min-h-9 shrink-0 whitespace-nowrap rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm font-medium hover:bg-[var(--color-accent-soft)] sm:px-4"
              />
            )}
            <RowMenu
              items={downloadItems}
              trigger="📥 Descargar ▾"
              triggerLabel="Descargar"
              triggerClassName="min-h-9 shrink-0 whitespace-nowrap rounded-md bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-[var(--color-accent-fg)] hover:opacity-90 sm:px-4"
            />
          </div>
        </div>
      </div>
      <WorkerSummaryModal
        open={!!workerSummaryFor}
        worker={
          workerSummaryFor
            ? {
                // El item trae el id estable en `workerId` y el rut del roster
                // en `rut`; el resumen se abre con el id.
                id: workerSummaryFor.workerId || workerSummaryFor.rut,
                rut: workerSummaryFor.rut,
                name: workerSummaryFor.name,
              }
            : null
        }
        onClose={() => setWorkerSummaryFor(null)}
      />
      {showCashEstimation && (
        <CashEstimationModal
          cashItems={cashPaidMode ? cash.filter((it) => !cashPaidSet.has(it.rut)) : cash}
          payrollName={payroll.name}
          pendingExtra={otherPendingCash}
          onClose={() => setShowCashEstimation(false)}
        />
      )}
      {addCyclesOpen && (
        <AddCyclesModal
          onClose={() => setAddCyclesOpen(false)}
          payroll={payroll}
          cycles={cycles}
          faenas={faenas}
          subfaenas={subfaenas}
          cycleStats={cycleStats}
          allPayrolls={allPayrolls}
          onConfirm={handleAddCycles}
          busy={editBusy}
        />
      )}
      {addWorkerOpen && (
        <AddWorkerDaysModal
          onClose={() => setAddWorkerOpen(false)}
          payroll={payroll}
          items={items}
          workers={workers}
          cycles={cycles}
          allPayrolls={allPayrolls}
          profileFor={liveProfileOf}
          onConfirm={handleAddWorkerDays}
          busy={editBusy}
        />
      )}
      <RecalcModal
        preview={recalcPreview}
        busy={recalcBusy}
        onClose={() => setRecalcPreview(null)}
        onConfirm={applyRecalc}
      />
      <ConfirmDialog
        open={!!confirmRemove}
        title="Sacar trabajador de la nómina"
        message={confirmRemove?.message || ""}
        confirmLabel="Sacar"
        danger
        onCancel={() => setConfirmRemove(null)}
        onConfirm={confirmRemoveAction}
      />
    </div>
  );
}
