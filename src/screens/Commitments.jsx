import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import PaymentReportModal from "../components/PaymentReportModal";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import { companiesService } from "../services";
import {
  listCommitments,
  commitmentsService,
  saveCommitment,
  markPaid,
  markPending,
  markPostponed,
  markProtested,
  reschedule,
  cancelCommitment,
  createInstallmentPlan,
  createRecurringPlan,
  stopSeries,
  addPartialPayment,
  addDebtPartialPayment,
  removePartialPayment,
  saveSeriesEdit,
  commitmentSeriesService,
  importRows,
  getCommitmentConfig,
  saveCommitmentConfig,
  DEFAULT_COMMITMENT_CONFIG,
} from "../services/commitmentsService";
import { enqueueJob, waitForJob } from "../services/functionJobsService";
import {
  COMMITMENT_KINDS,
  kindMeta,
  isCheque,
  paidLabel,
  displayStatus,
  statusLabel,
  STATUS_LABELS,
  daysUntil,
  urgencyLabel,
  summarize,
  buildInstallments,
  recurringDates,
  addDays,
  mapExcelRow,
  RECURRING_HORIZON_DAYS,
  extraOf,
  paidTotalOf,
  isOpen,
  canPostpone,
  canProtest,
  directionOf,
  groupUpcoming,
  upcomingMonthEnd,
  partialPaidOf,
  remainingOf,
  allocatePartialPayment,
  seriesRows,
  applySeriesTool,
  seriesChanges,
  seriesRowError,
} from "../utils/commitments";
import { BANKS, bankName } from "../utils/banks";
import { localIsoDate } from "../utils/dates";
import { fmtCurrency } from "../utils/format";

const inputCls =
  "w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";
const labelCls = "mb-1 block text-xs font-medium text-[var(--color-muted)]";
const btnCls =
  "rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-surface-2)] disabled:opacity-50";
const primaryCls =
  "rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-60";

const CHEQUE_BANKS = BANKS.filter((b) => b.code !== "EFE");

// Quién está del otro lado, según el tipo.
const COUNTERPARTY_LABEL = {
  chequeIssued: "Beneficiario",
  chequeReceived: "Quién lo entrega",
  payment: "A quién se paga",
  installment: "Acreedor",
  personalDebt: "A quién se le debe",
};

const STATUS_FILTERS = [
  { v: "", label: "Todos" },
  { v: "pending", label: "Pendientes" },
  { v: "overdue", label: "Vencidos" },
  { v: "postponed", label: "Aplazados" },
  { v: "protested", label: "Protestados" },
  { v: "paid", label: "Pagados / cobrados" },
  { v: "cancelled", label: "Anulados" },
];

// Grupos de la vista "Próximos", en orden (`groupUpcoming`).
const UPCOMING_TITLES = {
  overdue: "Vencidos sin marcar",
  protested: "Cheques protestados",
  week: "Próximos 7 días",
  month: "Próximo mes",
  later: "Más adelante",
};

// "2026-10-21" → "21-10-2026".
const fmtDate = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
};

function urgencyTone(c, today) {
  const status = displayStatus(c, today);
  if (status === "overdue" || status === "protested") return "danger";
  if (status === "postponed") return "warning";
  if (status !== "pending") return "muted";
  const days = daysUntil(c.dueDate, today);
  if (days <= 1) return "warning";
  if (days <= 7) return "accent";
  return "muted";
}

const TONE_CLS = {
  danger: "bg-[var(--color-danger-soft)] text-[var(--color-danger)]",
  warning: "bg-[var(--color-warning-soft)] text-[var(--color-warning)]",
  accent: "bg-[var(--color-accent-soft)] text-[var(--color-accent)]",
  success: "bg-[var(--color-surface-2)] text-[var(--color-success)]",
  muted: "bg-[var(--color-surface-2)] text-[var(--color-muted)]",
};

function StatusChip({ c, today }) {
  const status = displayStatus(c, today);
  const tone = status === "paid" ? "success" : urgencyTone(c, today);
  const text =
    status === "pending" || status === "overdue"
      ? urgencyLabel(daysUntil(c.dueDate, today))
      : status === "postponed"
        ? "Aplazado · ya vencido"
        : statusLabel(c, today);
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${TONE_CLS[tone]}`}>{text}</span>;
}

const CARD_TONE = {
  danger: { border: "border-[var(--color-danger)]", text: "text-[var(--color-danger)]" },
  warning: { border: "border-[var(--color-warning)]", text: "text-[var(--color-warning)]" },
};

function SummaryCard({ label, amount, count, tone }) {
  const border = CARD_TONE[tone]?.border || "border-[var(--color-border)]";
  const text = CARD_TONE[tone]?.text || "";
  return (
    <div className={`rounded-md border bg-[var(--color-surface)] px-3 py-2 ${border}`}>
      <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">{label}</div>
      <div className={`text-base font-semibold tabular-nums ${text}`}>{fmtCurrency(amount)}</div>
      <div className="text-[11px] text-[var(--color-muted)]">{count} {count === 1 ? "documento" : "documentos"}</div>
    </div>
  );
}

export default function Commitments() {
  const toast = useToast();
  const { isAdmin } = useAuth();
  const today = localIsoDate();

  const [items, setItems] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("upcoming");
  const [kindFilter, setKindFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");

  const [editing, setEditing] = useState(null);
  const [dateAction, setDateAction] = useState(null); // { item, mode: "pay" | "reschedule", date, paid }
  const [confirm, setConfirm] = useState(null); // { title, message, confirmLabel, danger, run }
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [partialFor, setPartialFor] = useState(null);
  const [seriesFor, setSeriesFor] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [list, comps] = await Promise.all([
        listCommitments(),
        companiesService.list({ order: ["razonSocial", "asc"], cache: true, ttl: 600_000 }),
      ]);
      setItems(list);
      setCompanies(comps);
    } catch (err) {
      toast.error("No se pudieron cargar los vencimientos: " + (err.message || err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const companyName = (c) => {
    const comp = companies.find((x) => x.id === c.companyId);
    return comp ? comp.alias || comp.razonSocial : c.companyLabel || "";
  };

  const summary = useMemo(() => summarize(items, today), [items, today]);

  const upcomingGroups = useMemo(() => {
    const groups = groupUpcoming(items, today);
    return Object.entries(UPCOMING_TITLES)
      .map(([key, title]) => ({ key, title, items: groups[key] }))
      .filter((g) => g.items.length);
  }, [items, today]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((c) => !kindFilter || c.kind === kindFilter)
      .filter((c) => !statusFilter || displayStatus(c, today) === statusFilter)
      .filter((c) => !companyFilter || (companyFilter === "_none" ? !c.companyId : c.companyId === companyFilter))
      .filter((c) => !from || c.dueDate >= from)
      .filter((c) => !to || c.dueDate <= to)
      .filter(
        (c) =>
          !q ||
          [c.counterparty, c.concept, c.notes, c.chequeNumber, bankName(c.bank), c.companyLabel]
            .some((v) => String(v || "").toLowerCase().includes(q)),
      )
      .sort((a, b) => (a.dueDate < b.dueDate ? 1 : a.dueDate > b.dueDate ? -1 : 0));
  }, [items, kindFilter, statusFilter, companyFilter, from, to, search, today]);

  const filteredTotal = useMemo(
    () => filtered.filter((c) => c.status !== "cancelled").reduce((s, c) => s + (Number(c.amount) || 0), 0),
    [filtered],
  );

  const runConfirm = async () => {
    if (!confirm) return;
    setConfirmBusy(true);
    try {
      await confirm.run();
      setConfirm(null);
      await load();
    } catch (err) {
      toast.error(err.message || String(err));
    } finally {
      setConfirmBusy(false);
    }
  };

  const askCancel = (c) =>
    setConfirm({
      title: "Anular",
      message: `¿Anular ${kindMeta(c.kind).label.toLowerCase()} de ${c.counterparty} por ${fmtCurrency(c.amount)}? Queda en el registro como anulado y deja de avisarse.`,
      confirmLabel: "Anular",
      danger: true,
      run: async () => {
        await cancelCommitment(c.id);
        toast.success("Anulado");
      },
    });

  const askReopen = (c) =>
    setConfirm({
      title: "Volver a pendiente",
      message: `¿Volver a dejar pendiente ${kindMeta(c.kind).label.toLowerCase()} de ${c.counterparty}? Vuelve a avisarse si está por vencer.`,
      confirmLabel: "Volver a pendiente",
      run: async () => {
        await markPending(c.id);
        toast.success("Quedó pendiente");
      },
    });

  const askPostpone = (c) =>
    setConfirm({
      title: "Aplazar",
      message: `¿Aplazar ${kindMeta(c.kind).label.toLowerCase()} de ${c.counterparty} por ${fmtCurrency(c.amount)}? Sigue como deuda, pero sin fecha de pago: deja de contar como vencido y, en Próximos y en el correo de avisos, va junto a lo que viene como "ya vencido". Cuando haya fecha, usa "Reprogramar".`,
      confirmLabel: "Aplazar",
      run: async () => {
        await markPostponed(c.id);
        toast.success("Aplazado");
      },
    });

  const askProtest = (c) =>
    setConfirm({
      title: "Cheque protestado",
      message: `¿Marcar protestado el cheque${c.chequeNumber ? ` N° ${c.chequeNumber}` : ""} de ${c.counterparty} por ${fmtCurrency(c.amount)}? ${
        c.status === "paid" ? "Deja de contar como cobrado y queda" : "Queda"
      } como ${directionOf(c.kind) === "in" ? "plata por cobrar" : "deuda por pagar"}, sin aviso por correo. Si se vuelve a depositar, usa "Reprogramar".`,
      confirmLabel: "Marcar protestado",
      danger: true,
      run: async () => {
        await markProtested(c.id);
        toast.success("Protestado");
      },
    });

  const askDelete = (c) =>
    setConfirm({
      title: "Eliminar",
      message: `¿Eliminar ${kindMeta(c.kind).label.toLowerCase()} de ${c.counterparty} por ${fmtCurrency(c.amount)}? Para dejar registro de un cheque que no se usó, conviene anularlo.`,
      confirmLabel: "Eliminar",
      danger: true,
      run: async () => {
        await commitmentsService.remove(c.id);
        toast.success("Eliminado");
      },
    });

  const askStopSeries = (c) => {
    const upcoming = items.filter((x) => x.seriesId === c.seriesId && x.status === "pending" && x.dueDate > today).length;
    setConfirm({
      title: "Detener pago recurrente",
      message: `¿Detener el pago recurrente a ${c.counterparty}? Se eliminan ${upcoming} vencimiento(s) pendiente(s) posteriores a hoy y no se generan más. Lo pagado queda como registro.`,
      confirmLabel: "Detener",
      danger: true,
      run: async () => {
        const n = await stopSeries(c.seriesId, today, items);
        setEditing(null);
        toast.success(`Pago recurrente detenido (${n} eliminado(s))`);
      },
    });
  };

  const exportXlsx = async () => {
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Cheques y pagos");
      ws.getColumn(1).width = 6;
      const headers = ["Vencimiento", "Tipo", "Estado", "Banco", "N° cheque", "Contraparte", "Concepto", "Monto", "Abonado", "Interés / extra", "Total pagado", "Fecha de pago", "Empresa", "Observaciones"];
      const head = ws.getRow(2);
      headers.forEach((h, i) => {
        const cell = head.getCell(i + 2);
        cell.value = h;
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF374151" } };
      });
      filtered.forEach((c, idx) => {
        const row = ws.getRow(idx + 3);
        [
          fmtDate(c.dueDate),
          kindMeta(c.kind).label,
          statusLabel(c, today),
          c.bank ? bankName(c.bank) : "",
          c.chequeNumber || "",
          c.counterparty || "",
          c.concept || "",
          Number(c.amount) || 0,
          partialPaidOf(c) || "",
          extraOf(c) || "",
          c.status === "paid" ? paidTotalOf(c) : "",
          fmtDate(c.paidAt),
          companyName(c),
          c.notes || "",
        ].forEach((v, i) => {
          row.getCell(i + 2).value = v;
        });
        [9, 10, 11, 12].forEach((col) => {
          row.getCell(col).numFmt = '"$"#,##0';
        });
      });
      const totalRow = ws.getRow(filtered.length + 3);
      totalRow.getCell(8).value = "Total (sin anulados)";
      totalRow.getCell(9).value = filteredTotal;
      totalRow.getCell(9).numFmt = '"$"#,##0';
      totalRow.font = { bold: true };
      [12, 18, 12, 22, 12, 28, 26, 14, 14, 14, 14, 12, 18, 40].forEach((w, i) => {
        ws.getColumn(i + 2).width = w;
      });
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Cheques_y_pagos_${today}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error("No se pudo generar el Excel: " + (err.message || err));
    }
  };

  const rowProps = {
    today,
    companyName,
    onPay: (c) => setDateAction({ item: c, mode: "pay", date: today, paid: String(remainingOf(c) || "") }),
    onReschedule: (c) => setDateAction({ item: c, mode: "reschedule", date: "" }),
    onPostpone: askPostpone,
    onProtest: askProtest,
    onCancel: askCancel,
    onReopen: askReopen,
    onEdit: (c) => setEditing({ ...c }),
    onDelete: askDelete,
    onPartialPayment: (c) => setPartialFor(c),
    onEditSeries: (c) => setSeriesFor(c),
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cheques y pagos</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Cheques, cuotas y pagos comprometidos, con aviso por correo antes de que venzan.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={primaryCls} onClick={() => setEditing({ kind: "chequeIssued", dueDate: today })}>
            + Agregar documento
          </button>
          <button type="button" className={btnCls} onClick={() => setReportOpen(true)} disabled={loading}>
            📄 Informe de pagos
          </button>
          {isAdmin && (
            <>
              <button type="button" className={btnCls} onClick={() => setConfigOpen(true)}>
                ⚙ Avisos
              </button>
              <button type="button" className={btnCls} onClick={() => setImportOpen(true)}>
                📥 Importar Excel
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2">
        <SummaryCard label="Por pagar" amount={summary.out.pending.amount} count={summary.out.pending.count} />
        <SummaryCard label="Vencido sin marcar" amount={summary.out.overdue.amount + summary.in.overdue.amount} count={summary.out.overdue.count + summary.in.overdue.count} tone={summary.out.overdue.count + summary.in.overdue.count ? "danger" : ""} />
        {summary.out.protested.count + summary.in.protested.count > 0 && (
          <SummaryCard label="Protestado" amount={summary.out.protested.amount + summary.in.protested.amount} count={summary.out.protested.count + summary.in.protested.count} tone="danger" />
        )}
        {summary.out.postponed.count + summary.in.postponed.count > 0 && (
          <SummaryCard label="Aplazado (sin fecha)" amount={summary.out.postponed.amount + summary.in.postponed.amount} count={summary.out.postponed.count + summary.in.postponed.count} tone="warning" />
        )}
        <SummaryCard label="Vence en 7 días" amount={summary.out.next7.amount} count={summary.out.next7.count} tone={summary.out.next7.count ? "warning" : ""} />
        <SummaryCard label="Por cobrar" amount={summary.in.pending.amount} count={summary.in.pending.count} />
        <SummaryCard label="Pagado este mes" amount={summary.paidThisMonth.amount} count={summary.paidThisMonth.count} />
        <SummaryCard label="Anulado" amount={summary.cancelled.amount} count={summary.cancelled.count} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {[
          { v: "upcoming", label: "⏳ Próximos" },
          { v: "all", label: "📋 Todos" },
        ].map((t) => (
          <button
            key={t.v}
            type="button"
            onClick={() => setView(t.v)}
            className={`min-h-8 rounded-md border px-3 py-1.5 text-sm ${
              view === t.v
                ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] font-medium text-[var(--color-accent)]"
                : "border-[var(--color-border)] hover:bg-[var(--color-surface-2)]"
            }`}
          >
            {t.label}
          </button>
        ))}
        {view === "all" && (
          <button type="button" className={`${btnCls} ml-auto`} onClick={exportXlsx} disabled={!filtered.length}>
            📊 Excel
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-[var(--color-muted)]">Cargando…</div>
      ) : view === "upcoming" ? (
        upcomingGroups.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--color-border)] py-12 text-center text-sm text-[var(--color-muted)]">
            No hay nada pendiente. Agrega un cheque, un pago o un crédito con "+ Agregar documento".
          </div>
        ) : (
          upcomingGroups.map((g) => (
            <section key={g.key}>
              <h2 className="mb-2 text-sm font-semibold text-[var(--color-muted)]">
                {g.title}
                {g.key === "month" && <span className="font-normal"> (hasta el {fmtDate(upcomingMonthEnd(today))})</span>} ·{" "}
                {fmtCurrency(g.items.reduce((s, c) => s + remainingOf(c), 0))}
              </h2>
              <CommitmentList items={g.items} {...rowProps} />
            </section>
          ))
        )
      ) : (
        <section className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar contraparte, concepto, N° de cheque…"
              className={`${inputCls} lg:col-span-2`}
            />
            <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} className={inputCls}>
              <option value="">Todos los tipos</option>
              {Object.entries(COMMITMENT_KINDS).map(([k, m]) => (
                <option key={k} value={k}>{m.icon} {m.label}</option>
              ))}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={inputCls}>
              {STATUS_FILTERS.map((s) => (
                <option key={s.v} value={s.v}>{s.label}</option>
              ))}
            </select>
            <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} className={inputCls}>
              <option value="">Todas las empresas</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.alias || c.razonSocial}</option>
              ))}
              <option value="_none">Sin empresa asignada</option>
            </select>
            <div className="flex gap-2">
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} title="Desde" />
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} title="Hasta" />
            </div>
          </div>
          <div className="text-sm text-[var(--color-muted)]">
            {filtered.length} documento(s) · {fmtCurrency(filteredTotal)} sin contar anulados
          </div>
          {filtered.length === 0 ? (
            <div className="rounded-md border border-dashed border-[var(--color-border)] py-8 text-center text-sm text-[var(--color-muted)]">
              Sin resultados con estos filtros.
            </div>
          ) : (
            <CommitmentList items={filtered} {...rowProps} />
          )}
        </section>
      )}

      {editing && (
        <CommitmentModal
          initial={editing}
          today={today}
          companies={companies}
          onCancel={() => setEditing(null)}
          onStopSeries={editing.seriesId && !editing.installment ? () => askStopSeries(editing) : null}
          onSave={async (draft, plan) => {
            if (plan === "installment" || plan === "personalDebt") {
              const r = await createInstallmentPlan(draft, {
                firstDate: draft.dueDate,
                count: Number(plan === "personalDebt" ? draft.debtCount : draft.count) || 0,
                kind: plan,
              });
              toast.success(`${r.count} cuota(s) creadas`);
            } else if (plan === "recurring") {
              const r = await createRecurringPlan(draft, { firstDate: draft.dueDate, today });
              toast.success(`${r.count} vencimiento(s) creados`);
            } else {
              await saveCommitment(draft);
              toast.success("Guardado");
            }
            setEditing(null);
            await load();
          }}
        />
      )}

      {dateAction && (
        <DateActionModal
          action={dateAction}
          onChange={(patch) => setDateAction((a) => ({ ...a, ...patch }))}
          onCancel={() => setDateAction(null)}
          onConfirm={async ({ item, mode, date, extra }) => {
            try {
              if (mode === "pay") await markPaid(item.id, date, extra);
              else await reschedule(item.id, date);
              setDateAction(null);
              toast.success(mode === "pay" ? paidLabel(item.kind) : `Reprogramado para el ${fmtDate(date)}`);
              await load();
            } catch (err) {
              toast.error(err.message || String(err));
            }
          }}
        />
      )}

      {partialFor && (
        <PartialPaymentModal
          item={partialFor}
          items={items}
          today={today}
          onClose={() => setPartialFor(null)}
          onSaved={async (msg) => {
            toast.success(msg);
            await load();
          }}
        />
      )}

      {seriesFor && (
        <SeriesEditModal
          item={seriesFor}
          items={items}
          today={today}
          onCancel={() => setSeriesFor(null)}
          onSaved={async (n) => {
            setSeriesFor(null);
            toast.success(n ? `${n} vencimiento(s) actualizados` : "Sin cambios");
            await load();
          }}
        />
      )}

      {configOpen && <ConfigModal onClose={() => setConfigOpen(false)} />}

      {reportOpen && (
        <PaymentReportModal items={items} companies={companies} today={today} onClose={() => setReportOpen(false)} />
      )}

      {importOpen && (
        <ImportModal
          companies={companies}
          existingIds={new Set(items.map((c) => c.id))}
          onCancel={() => setImportOpen(false)}
          onImported={async (n) => {
            setImportOpen(false);
            toast.success(`${n} cheque(s) importados`);
            await load();
          }}
        />
      )}

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        danger={!!confirm?.danger}
        busy={confirmBusy}
        onConfirm={runConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

// Marcar pagado (con la fecha y lo que se pagó de verdad) o reprogramar algo
// aplazado o protestado (con la fecha nueva).
function DateActionModal({ action, onChange, onCancel, onConfirm }) {
  const { item, mode, date } = action;
  const [busy, setBusy] = useState(false);
  const pay = mode === "pay";
  const cheque = isCheque(item.kind);
  const amount = Number(item.amount) || 0;
  const partial = partialPaidOf(item);
  const paid = Math.round(Number(action.paid) || 0);
  const extra = pay ? partial + paid - amount : 0;
  const invalid = !date || (pay && extra < 0);

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm({ item, mode, date, extra });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      size="sm"
      onClose={onCancel}
      title={pay ? `Marcar ${paidLabel(item.kind).toLowerCase()}` : "Reprogramar"}
      footer={
        <>
          <button type="button" className={btnCls} onClick={onCancel}>Cancelar</button>
          <button type="button" className={primaryCls} disabled={invalid || busy} onClick={confirm}>
            {busy ? "Guardando…" : "Confirmar"}
          </button>
        </>
      }
    >
      <p className="mb-3 text-sm">
        {item.counterparty} · <b>{fmtCurrency(amount)}</b>
        {item.chequeNumber ? ` · cheque N° ${item.chequeNumber}` : ""}
        {pay && partial > 0 && (
          <span className="text-[var(--color-muted)]"> · abonado {fmtCurrency(partial)}, falta {fmtCurrency(remainingOf(item))}</span>
        )}
        {!pay && <span className="text-[var(--color-muted)]"> · vencía el {fmtDate(item.dueDate)}</span>}
      </p>
      <div className="space-y-3">
        <div>
          <label className={labelCls}>
            {pay ? `Fecha en que se ${cheque ? "cobró" : "pagó"}` : `Nueva fecha de ${cheque ? "cobro" : "pago"}`}
          </label>
          <input type="date" value={date} onChange={(e) => onChange({ date: e.target.value })} className={inputCls} />
        </div>
        {pay && (
          <div>
            <label className={labelCls}>Monto {cheque ? "cobrado" : "pagado"}{partial > 0 ? " ahora" : ""}</label>
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={action.paid}
              onChange={(e) => onChange({ paid: e.target.value })}
              className={inputCls}
            />
            {extra > 0 && (
              <div className="mt-1 text-sm">
                Monto original {fmtCurrency(amount)}{partial > 0 ? ` (abonado ${fmtCurrency(partial)})` : ""} + <b>{fmtCurrency(extra)} de interés / extra</b>
              </div>
            )}
            {extra < 0 && (
              <div className="mt-1 text-xs text-[var(--color-danger)]">
                {partial > 0
                  ? `No puede ser menos que lo que falta (${fmtCurrency(remainingOf(item))}). Si cambió el monto, edítalo primero.`
                  : "No puede ser menos que el monto original. Si cambió el monto, edítalo primero."}
              </div>
            )}
            {extra === 0 && (
              <div className="mt-1 text-xs text-[var(--color-muted)]">
                Si se pagó con interés o recargo, pon el total: la diferencia queda como interés.
              </div>
            )}
          </div>
        )}
        {!pay && (
          <p className="text-xs text-[var(--color-muted)]">Vuelve a quedar pendiente con esta fecha y se avisa por correo como cualquier vencimiento.</p>
        )}
      </div>
    </Modal>
  );
}

// Orden de una serie: por fecha y, a igual fecha, por número de cuota.
const bySeriesOrder = (a, b) =>
  a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : (a.installment?.n || 0) - (b.installment?.n || 0);

const installmentLabel = (c) => (c.installment?.of ? `Cuota ${c.installment.n}/${c.installment.of}` : fmtDate(c.dueDate));

// Abonos de una deuda personal: a una cuota o a toda la deuda (se reparte de
// la cuota más antigua a la más nueva). Muestra lo abonado hasta ahora y deja
// quitar un abono; uno a toda la deuda se quita entero.
function PartialPaymentModal({ item, items, today, onClose, onSaved }) {
  const toast = useToast();
  const debt = (item.seriesId ? items.filter((c) => c.seriesId === item.seriesId) : items.filter((c) => c.id === item.id)).sort(
    bySeriesOrder,
  );
  const open = debt.filter(isOpen);
  const inSeries = debt.length > 1;
  const [target, setTarget] = useState(inSeries ? "debt" : item.id);
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(null);

  const value = Math.round(Number(amount) || 0);
  const totalOriginal = debt.filter((c) => c.status !== "cancelled").reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const totalRemaining = open.reduce((s, c) => s + remainingOf(c), 0);
  const targetItem = target === "debt" ? null : debt.find((c) => c.id === target);
  const available = targetItem ? remainingOf(targetItem) : totalRemaining;
  const allocation = target === "debt" && value > 0 ? allocatePartialPayment(debt, value).parts : [];
  const error = value > available ? `Es más que lo que falta (${fmtCurrency(available)})` : "";
  const canSave = open.length > 0 && value > 0 && !!date && !error && (target === "debt" || isOpen(targetItem || {}));

  // Historial: un abono a toda la deuda se muestra una vez, con sus partes.
  const historyRows = new Map();
  for (const c of debt) {
    for (const p of c.partialPayments || []) {
      const key = p.groupId || p.id;
      if (!historyRows.has(key)) historyRows.set(key, { key, payment: p, date: p.date, notes: p.notes, amount: 0, parts: [] });
      const row = historyRows.get(key);
      row.amount += Number(p.amount) || 0;
      row.parts.push(installmentLabel(c));
    }
  }
  const history = [...historyRows.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const save = async () => {
    setBusy(true);
    try {
      const input = { date, amount: value, notes };
      if (target === "debt") await addDebtPartialPayment(debt, input);
      else await addPartialPayment(targetItem, input);
      setAmount("");
      setNotes("");
      await onSaved(`Abono de ${fmtCurrency(value)} registrado`);
    } catch (err) {
      toast.error(err.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await removePartialPayment(debt, removing.payment);
      setRemoving(null);
      await onSaved("Abono quitado");
    } catch (err) {
      toast.error(err.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={`Abonos · ${item.counterparty}`}
      footer={
        <>
          <button type="button" className={btnCls} onClick={onClose}>Cerrar</button>
          {open.length > 0 && (
            <button type="button" className={primaryCls} disabled={!canSave || busy} onClick={save}>
              {busy ? "Guardando…" : "Registrar abono"}
            </button>
          )}
        </>
      }
    >
      <div className="mb-4 grid grid-cols-3 gap-2 text-sm">
        {[
          { label: "Deuda", value: totalOriginal },
          { label: "Pagado", value: totalOriginal - totalRemaining },
          { label: "Falta", value: totalRemaining, strong: true },
        ].map((x) => (
          <div key={x.label} className="rounded-md border border-[var(--color-border)] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">{x.label}</div>
            <div className={`tabular-nums ${x.strong ? "font-semibold" : ""}`}>{fmtCurrency(x.value)}</div>
          </div>
        ))}
      </div>

      {open.length === 0 ? (
        <p className="mb-4 text-sm text-[var(--color-muted)]">La deuda está pagada completa.</p>
      ) : (
        <div className="space-y-3">
          {inSeries && (
            <div>
              <label className={labelCls}>Abonar a</label>
              <select value={target} onChange={(e) => setTarget(e.target.value)} className={inputCls}>
                <option value="debt">Toda la deuda (desde la cuota más antigua)</option>
                {open.map((c) => (
                  <option key={c.id} value={c.id}>
                    {installmentLabel(c)} · vence {fmtDate(c.dueDate)} · falta {fmtCurrency(remainingOf(c))}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Fecha del abono</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Monto (falta {fmtCurrency(available)})</label>
              <input
                type="number"
                min="0"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={inputCls}
              />
              {error && <div className="mt-1 text-xs text-[var(--color-danger)]">{error}</div>}
            </div>
          </div>
          <div>
            <label className={labelCls}>Nota (opcional)</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} />
          </div>
          {allocation.length > 0 && !error && (
            <div className="rounded-md bg-[var(--color-surface-2)] px-3 py-2 text-sm">
              <div className="mb-1 text-xs text-[var(--color-muted)]">Se reparte así:</div>
              {allocation.map((p) => {
                const c = debt.find((x) => x.id === p.id);
                return (
                  <div key={p.id} className="flex justify-between gap-2 tabular-nums">
                    <span>{installmentLabel(c)}</span>
                    <span>
                      {fmtCurrency(p.amount)}
                      <span className="text-xs text-[var(--color-muted)]">
                        {p.closes ? " · queda pagada" : ` · falta ${fmtCurrency(remainingOf(c) - p.amount)}`}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <h3 className="mb-2 mt-5 text-sm font-semibold">Abonos registrados</h3>
      {history.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)]">Todavía no hay abonos.</p>
      ) : (
        <div className="divide-y divide-[var(--color-border)] rounded-md border border-[var(--color-border)]">
          {history.map((h) => (
            <div key={h.key} className="flex items-start gap-2 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <div>
                  <span className="tabular-nums">{fmtDate(h.date)}</span> · <b className="tabular-nums">{fmtCurrency(h.amount)}</b>
                  <span className="text-[var(--color-muted)]">
                    {" "}· {h.payment.groupId ? `a toda la deuda (${h.parts.join(", ")})` : h.parts[0]}
                  </span>
                </div>
                {h.notes && <div className="text-xs text-[var(--color-muted)]">{h.notes}</div>}
              </div>
              <button
                type="button"
                title="Quitar abono"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--color-danger)] hover:bg-[var(--color-surface-2)]"
                onClick={() => setRemoving(h)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!removing}
        title="Quitar abono"
        message={
          removing
            ? `¿Quitar el abono del ${fmtDate(removing.date)} por ${fmtCurrency(removing.amount)}?${
                removing.payment.groupId ? " Era a toda la deuda: se quita de todas las cuotas a las que se repartió." : ""
              } Lo que había dejado pagado vuelve a pendiente.`
            : ""
        }
        confirmLabel="Quitar"
        danger
        busy={busy}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </Modal>
  );
}

// Ajuste de una serie (crédito, deuda personal en cuotas o pago recurrente):
// fecha y monto de cada vencimiento abierto, a mano o con herramientas que se
// aplican desde un vencimiento en adelante. En un pago recurrente, el día y el
// monto aplicados con las herramientas también valen para lo que se genere
// después. Nada se guarda hasta "Guardar".
function SeriesEditModal({ item, items, today, onCancel, onSaved }) {
  const toast = useToast();
  const seriesItems = useMemo(() => items.filter((c) => c.seriesId === item.seriesId), [items, item.seriesId]);
  const byId = useMemo(() => new Map(seriesItems.map((c) => [c.id, c])), [seriesItems]);
  const recurring = !item.installment?.of;
  const [rows, setRows] = useState(() => seriesRows(seriesItems));
  const [seriesPatch, setSeriesPatch] = useState({});
  const [fromIndex, setFromIndex] = useState(() => Math.max(0, seriesRows(seriesItems).findIndex((r) => r.editable)));
  const [tool, setTool] = useState({ months: "1", day: "", amount: "" });
  const [busy, setBusy] = useState(false);

  const editableIdx = rows.map((r, i) => (r.editable ? i : -1)).filter((i) => i >= 0);
  const changes = seriesChanges(seriesItems, rows);
  const errors = rows.map((r) => seriesRowError(r, byId.get(r.id)));
  const hasErrors = errors.some(Boolean);
  const pendingBefore = seriesItems.reduce((s, c) => s + remainingOf(c), 0);
  const pendingAfter = rows.reduce((s, r) => {
    const c = byId.get(r.id);
    return r.editable ? s + Math.max(0, Math.round(Number(r.amount) || 0) - partialPaidOf(c)) : s;
  }, 0);

  const setRow = (i, patch) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const apply = (kind) => {
    if (kind === "months") {
      const months = Math.trunc(Number(tool.months) || 0);
      if (!months) return;
      setRows((rs) => applySeriesTool(rs, { fromIndex, months }));
    } else if (kind === "day") {
      const day = Math.trunc(Number(tool.day) || 0);
      if (day < 1 || day > 31) return toast.error("El día va de 1 a 31");
      setRows((rs) => applySeriesTool(rs, { fromIndex, day }));
      if (recurring) setSeriesPatch((p) => ({ ...p, dayOfMonth: day }));
    } else {
      const amount = Math.round(Number(tool.amount) || 0);
      if (!(amount > 0)) return toast.error("El monto debe ser mayor a 0");
      setRows((rs) => applySeriesTool(rs, { fromIndex, amount }));
      if (recurring) setSeriesPatch((p) => ({ ...p, amount }));
    }
  };

  const reset = () => {
    setRows(seriesRows(seriesItems));
    setSeriesPatch({});
  };

  const save = async () => {
    setBusy(true);
    try {
      const series = recurring ? await commitmentSeriesService.getById(item.seriesId) : null;
      const n = await saveSeriesEdit(series, seriesItems, changes, seriesPatch);
      await onSaved(n);
    } catch (err) {
      toast.error(err.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const toolInputCls = "w-24 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]";
  const dirty = changes.length > 0 || Object.keys(seriesPatch).length > 0;

  return (
    <Modal
      open
      size="xl"
      onClose={onCancel}
      title={`${recurring ? "Ajustar vencimientos" : "Ajustar cuotas"} · ${item.counterparty}`}
      footer={
        <>
          <div className="mr-auto self-center text-xs text-[var(--color-muted)]">
            {changes.length} cambio(s) · pendiente {fmtCurrency(pendingBefore)}
            {pendingAfter !== pendingBefore && <> → <b className="text-[var(--color-text)]">{fmtCurrency(pendingAfter)}</b></>}
          </div>
          {dirty && (
            <button type="button" className={btnCls} onClick={reset} disabled={busy}>
              Deshacer cambios
            </button>
          )}
          <button type="button" className={btnCls} onClick={onCancel}>Cancelar</button>
          <button type="button" className={primaryCls} disabled={!dirty || hasErrors || busy} onClick={save}>
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </>
      }
    >
      {editableIdx.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)]">No queda nada abierto para ajustar: todo está pagado o anulado.</p>
      ) : (
        <div className="mb-4 space-y-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-[var(--color-muted)]">Aplicar desde</span>
            <select
              value={fromIndex}
              onChange={(e) => setFromIndex(Number(e.target.value))}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm"
            >
              {editableIdx.map((i) => (
                <option key={rows[i].id} value={i}>
                  {rows[i].n ? `Cuota ${rows[i].n}` : fmtDate(byId.get(rows[i].id)?.dueDate)} en adelante
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="numeric"
                value={tool.months}
                onChange={(e) => setTool((t) => ({ ...t, months: e.target.value }))}
                className={toolInputCls}
                title="Meses (negativo para adelantar)"
              />
              <button type="button" className={btnCls} onClick={() => apply("months")}>Correr meses</button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                max="31"
                inputMode="numeric"
                placeholder="Día"
                value={tool.day}
                onChange={(e) => setTool((t) => ({ ...t, day: e.target.value }))}
                className={toolInputCls}
              />
              <button type="button" className={btnCls} onClick={() => apply("day")}>Cambiar día</button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                inputMode="numeric"
                placeholder="Monto"
                value={tool.amount}
                onChange={(e) => setTool((t) => ({ ...t, amount: e.target.value }))}
                className={`${toolInputCls} w-32`}
              />
              <button type="button" className={btnCls} onClick={() => apply("amount")}>Poner monto</button>
            </div>
          </div>
          <p className="text-xs text-[var(--color-muted)]">
            Las herramientas solo cambian lo abierto. Un aplazado o protestado al que se le cambia la fecha vuelve a pendiente.
            {recurring && " En un pago recurrente, el día y el monto también valen para los vencimientos que se generen después."}
          </p>
        </div>
      )}

      <div className="divide-y divide-[var(--color-border)] rounded-md border border-[var(--color-border)]">
        {rows.map((r, i) => {
          const c = byId.get(r.id);
          const changed = changes.some((x) => x.id === r.id);
          const partial = partialPaidOf(c);
          return (
            <div
              key={r.id}
              className={`grid grid-cols-[3rem_1fr_1fr] items-center gap-x-2 gap-y-1 px-3 py-2 text-sm sm:grid-cols-[3.5rem_11rem_10rem_1fr] ${
                r.editable ? "" : "opacity-60"
              } ${changed ? "bg-[var(--color-accent-soft)]" : ""}`}
            >
              <div className="tabular-nums text-[var(--color-muted)]">{r.n ? `${r.n}/${c.installment.of}` : i + 1}</div>
              {r.editable ? (
                <>
                  <input
                    type="date"
                    value={r.dueDate}
                    onChange={(e) => setRow(i, { dueDate: e.target.value })}
                    className="min-w-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm"
                  />
                  <input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={r.amount}
                    onChange={(e) => setRow(i, { amount: e.target.value })}
                    className="min-w-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-right text-sm tabular-nums"
                  />
                </>
              ) : (
                <>
                  <div className="tabular-nums">{fmtDate(r.dueDate)}</div>
                  <div className="text-right tabular-nums">{fmtCurrency(r.amount)}</div>
                </>
              )}
              <div className="col-span-3 flex flex-wrap items-center gap-2 sm:col-span-1">
                <StatusChip c={c} today={today} />
                {partial > 0 && <span className="text-xs text-[var(--color-muted)]">abonado {fmtCurrency(partial)}</span>}
                {errors[i] && <span className="text-xs text-[var(--color-danger)]">{errors[i]}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

// Menú "⋯" con las acciones secundarias de una fila. Va en un portal con
// posición fija: la tabla tiene overflow-x-auto y recortaría un desplegable
// absoluto. Se cierra al hacer click afuera, con Escape, al desplazar o al
// cambiar el tamaño de la ventana.
function RowMenu({ items }) {
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const open = !!pos;

  const close = (refocus) => {
    setPos(null);
    if (refocus) btnRef.current?.focus();
  };

  // El menú mide a lo más ~320 px: si abajo no cabe y arriba hay más espacio,
  // se ancla por abajo y crece hacia arriba.
  const toggle = () => {
    if (open) return close();
    const r = btnRef.current.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    const up = below < 320 && r.top > below;
    setPos({ right: window.innerWidth - r.right, ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }) });
  };

  useEffect(() => {
    if (!open) return;
    menuRef.current?.focus({ preventScroll: true });
    const onDown = (e) => {
      if (!menuRef.current?.contains(e.target) && !btnRef.current?.contains(e.target)) setPos(null);
    };
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      setPos(null);
      btnRef.current?.focus();
    };
    const onMove = () => setPos(null);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open]);

  // Flechas arriba/abajo recorren las opciones.
  const onMenuKey = (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const els = [...menuRef.current.querySelectorAll("[role=menuitem]")];
    const i = els.indexOf(document.activeElement);
    const next = e.key === "ArrowDown" ? (i + 1) % els.length : i <= 0 ? els.length - 1 : i - 1;
    els[next]?.focus();
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label="Más acciones"
        title="Más acciones"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        className={`flex h-9 w-9 items-center justify-center rounded-md border text-lg leading-none md:h-8 md:w-8 ${
          open
            ? "border-[var(--color-border-strong)] bg-[var(--color-surface-2)] text-[var(--color-text)]"
            : "border-[var(--color-border)] text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
        }`}
      >
        ⋯
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            tabIndex={-1}
            onKeyDown={onMenuKey}
            style={pos}
            className="fixed z-50 w-60 max-w-[calc(100vw-16px)] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1 text-[var(--color-text)] shadow-xl outline-none"
          >
            {items.map((it, i) =>
              it.divider ? (
                <div key={`d${i}`} role="separator" className="my-1 border-t border-[var(--color-border)]" />
              ) : (
                <button
                  key={it.label}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    close();
                    it.onClick();
                  }}
                  className={`flex min-h-10 w-full items-start gap-2.5 px-3 py-2 text-left text-sm outline-none hover:bg-[var(--color-surface-2)] focus:bg-[var(--color-surface-2)] md:min-h-9 ${
                    it.danger ? "text-[var(--color-danger)]" : ""
                  }`}
                >
                  <span className="w-5 shrink-0 text-center" aria-hidden="true">{it.icon}</span>
                  <span className="min-w-0">
                    <span className="block font-medium">{it.label}</span>
                    {it.hint && <span className="block text-xs font-normal text-[var(--color-muted)]">{it.hint}</span>}
                  </span>
                </button>
              )
            )}
          </div>,
          document.body
        )}
    </>
  );
}

// Monto de una fila. Si algo abierto tiene abonos, muestra lo que falta y,
// debajo, lo abonado del total; si se pagó con interés, el interés.
function AmountCell({ c }) {
  const sign = kindMeta(c.kind).direction === "in" ? "+" : "";
  const partial = partialPaidOf(c);
  if (isOpen(c) && partial > 0) {
    return (
      <>
        {sign}{fmtCurrency(remainingOf(c))}
        <div className="text-xs font-normal text-[var(--color-muted)]">
          abonado {fmtCurrency(partial)} de {fmtCurrency(c.amount)}
        </div>
      </>
    );
  }
  return (
    <>
      {sign}{fmtCurrency(c.amount)}
      {extraOf(c) > 0 && <div className="text-xs font-normal text-[var(--color-muted)]">+ {fmtCurrency(extraOf(c))} interés</div>}
    </>
  );
}

// Tabla en escritorio, tarjetas en el teléfono.
function CommitmentList({
  items,
  today,
  companyName,
  onPay,
  onReschedule,
  onPostpone,
  onProtest,
  onCancel,
  onReopen,
  onEdit,
  onDelete,
  onPartialPayment,
  onEditSeries,
}) {
  // Una sola acción a la vista (pagar o cobrar, si está abierto) y el resto en el menú.
  const actions = (c) => {
    const open = isOpen(c);
    const undated = c.status === "postponed" || c.status === "protested";
    const status = [
      undated && { icon: "📅", label: "Reprogramar", hint: "Ponerle una fecha de pago", onClick: () => onReschedule(c) },
      canPostpone(c, today) && { icon: "⏸", label: "Aplazar", hint: "Vencido y sin fecha de pago", onClick: () => onPostpone(c) },
      canProtest(c) && { icon: "⚠️", label: "Protestado", hint: "El banco rechazó el cheque", danger: true, onClick: () => onProtest(c) },
      open
        ? { icon: "🚫", label: "Anular", hint: "Ya no se va a pagar", onClick: () => onCancel(c) }
        : { icon: "↶", label: "Volver a pendiente", onClick: () => onReopen(c) },
    ].filter(Boolean);
    const recurring = c.seriesId && !c.installment?.of;
    const extras = [
      c.kind === "personalDebt" &&
        (open || partialPaidOf(c) > 0) && {
          icon: "💵",
          label: "Abonos",
          hint: open ? "Pagar una parte, de esta cuota o de toda la deuda" : "Ver los abonos",
          onClick: () => onPartialPayment(c),
        },
      c.seriesId && {
        icon: "🗂",
        label: recurring ? "Ajustar todos los vencimientos" : "Ajustar todas las cuotas",
        hint: "Fechas y montos de la serie completa",
        onClick: () => onEditSeries(c),
      },
    ].filter(Boolean);
    const menu = [
      ...status,
      ...(extras.length ? [{ divider: true }, ...extras] : []),
      { divider: true },
      { icon: "✏️", label: "Editar", onClick: () => onEdit(c) },
      { icon: "🗑️", label: "Eliminar", danger: true, onClick: () => onDelete(c) },
    ];
    return (
      <div className="flex items-center justify-end gap-1.5">
        {open && (
          <button
            type="button"
            onClick={() => onPay(c)}
            className="h-9 whitespace-nowrap rounded-md border border-[var(--color-accent)] px-3 text-sm font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)] md:h-8 md:px-2.5 md:text-xs"
          >
            ✓ {paidLabel(c.kind)}
          </button>
        )}
        <RowMenu items={menu} />
      </div>
    );
  };

  const detail = (c) =>
    [
      c.installment?.of ? `Cuota ${c.installment.n}/${c.installment.of}` : c.seriesId ? "Recurrente" : "",
      c.bank ? bankName(c.bank) : "",
      c.chequeNumber ? `N° ${c.chequeNumber}` : "",
      companyName(c),
    ]
      .filter(Boolean)
      .join(" · ");

  // "Pagado el 20-10-2026", con el total si se pagó con interés.
  const paidNote = (c) => {
    if (c.status !== "paid" || !c.paidAt) return "";
    return `${paidLabel(c.kind)} el ${fmtDate(c.paidAt)}${extraOf(c) > 0 ? `: ${fmtCurrency(paidTotalOf(c))} en total` : ""}`;
  };

  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border border-[var(--color-border)] md:block">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-surface-2)] text-left text-xs text-[var(--color-muted)]">
            <tr>
              <th className="px-3 py-2">Vence</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Contraparte</th>
              <th className="px-3 py-2">Detalle</th>
              <th className="px-3 py-2 text-right">Monto</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id} className={`border-t border-[var(--color-border)] ${c.status === "cancelled" ? "opacity-60" : ""}`}>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{fmtDate(c.dueDate)}</td>
                <td className="px-3 py-2"><StatusChip c={c} today={today} /></td>
                <td className="whitespace-nowrap px-3 py-2">{kindMeta(c.kind).icon} {kindMeta(c.kind).label}</td>
                <td className="px-3 py-2">
                  <div className="font-medium">{c.counterparty}</div>
                  {(c.concept || c.notes) && (
                    <div className="text-xs text-[var(--color-muted)]">{[c.concept, c.notes].filter(Boolean).join(" — ")}</div>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-[var(--color-muted)]">
                  {detail(c)}
                  {paidNote(c) && <div>{paidNote(c)}</div>}
                </td>
                <td className={`whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums ${c.status === "cancelled" ? "line-through" : ""}`}>
                  <AmountCell c={c} />
                </td>
                <td className="w-px whitespace-nowrap px-3 py-2">{actions(c)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-2 md:hidden">
        {items.map((c) => (
          <div key={c.id} className={`rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 ${c.status === "cancelled" ? "opacity-60" : ""}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs text-[var(--color-muted)]">{kindMeta(c.kind).icon} {kindMeta(c.kind).label} · {fmtDate(c.dueDate)}</div>
                <div className="truncate font-medium">{c.counterparty}</div>
              </div>
              <div className={`whitespace-nowrap text-right font-semibold tabular-nums ${c.status === "cancelled" ? "line-through" : ""}`}>
                <AmountCell c={c} />
              </div>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--color-muted)]">
              <StatusChip c={c} today={today} />
              <span>{detail(c)}</span>
            </div>
            {paidNote(c) && <div className="mt-1 text-xs text-[var(--color-muted)]">{paidNote(c)}</div>}
            {(c.concept || c.notes) && (
              <div className="mt-1 text-xs text-[var(--color-muted)]">{[c.concept, c.notes].filter(Boolean).join(" — ")}</div>
            )}
            <div className="mt-2">{actions(c)}</div>
          </div>
        ))}
      </div>
    </>
  );
}

// Campos comunes de contraparte, concepto, monto, empresa y notas.
function CommonFields({ form, set, companies, counterpartyLabel, amountLabel = "Monto" }) {
  return (
    <>
      <div className="sm:col-span-2">
        <label className={labelCls}>{counterpartyLabel}</label>
        <input value={form.counterparty || ""} onChange={(e) => set({ counterparty: e.target.value })} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>{amountLabel}</label>
        <input
          type="number"
          min="0"
          inputMode="numeric"
          value={form.amount ?? ""}
          onChange={(e) => set({ amount: e.target.value })}
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>Empresa / cuenta</label>
        <select
          value={form.companyId || ""}
          onChange={(e) => set({ companyId: e.target.value || null })}
          className={inputCls}
        >
          <option value="">{form.companyLabel ? `${form.companyLabel} (sin asignar)` : "— Sin empresa —"}</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.alias || c.razonSocial}</option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls}>Concepto</label>
        <input value={form.concept || ""} onChange={(e) => set({ concept: e.target.value })} className={inputCls} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls}>Observaciones</label>
        <textarea rows={2} value={form.notes || ""} onChange={(e) => set({ notes: e.target.value })} className={inputCls} />
      </div>
    </>
  );
}

// Tipos que se eligen al agregar: un vencimiento suelto (los de
// `COMMITMENT_KINDS` menos la cuota, que sale de un crédito) o una serie que
// los genera. La deuda personal es un pago único o, con más de una cuota, una
// serie como la de un crédito.
const SINGLE_KINDS = ["chequeIssued", "chequeReceived", "payment", "personalDebt"];
const PLAN_TYPES = {
  installment: { icon: "🏦", label: "Crédito en cuotas" },
  recurring: { icon: "🔁", label: "Pago recurrente" },
};

// Alta y edición. Al agregar se elige el tipo de documento; un crédito en
// cuotas o un pago recurrente muestra los vencimientos que va a crear antes de
// confirmar. Lo escrito se conserva al cambiar de tipo. Al editar, una cuota o
// un vencimiento de una serie no cambia de tipo.
function CommitmentModal({ initial, today, companies, onCancel, onSave, onStopSeries }) {
  const toast = useToast();
  const isNew = !initial.id;
  const [form, setForm] = useState(() => ({
    count: 12,
    debtCount: 1,
    ...initial,
    extra: initial.status === "paid" ? Number(initial.extra) || 0 : 0,
  }));
  const [plan, setPlan] = useState(null); // null | "installment" | "recurring"
  const [busy, setBusy] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const cheque = !plan && isCheque(form.kind);
  const personalDebt = isNew && !plan && form.kind === "personalDebt";
  // Deuda personal en más de una cuota: se crea como serie.
  const debtSplit = personalDebt && Number(form.debtCount) > 1;
  const series = plan || (debtSplit ? "personalDebt" : null);
  const kindLocked = !!form.seriesId || form.kind === "installment";
  const knownBank = !form.bank || CHEQUE_BANKS.some((b) => b.code === form.bank);

  const dates = useMemo(() => {
    const count = plan === "installment" ? form.count : debtSplit ? form.debtCount : 0;
    if (count) return buildInstallments({ firstDate: form.dueDate, count: Math.min(Number(count) || 0, 240) }).map((c) => c.dueDate);
    if (plan === "recurring") return recurringDates({ firstDate: form.dueDate, until: addDays(today, RECURRING_HORIZON_DAYS) });
    return [];
  }, [plan, debtSplit, form.dueDate, form.count, form.debtCount, today]);

  const submit = async () => {
    setBusy(true);
    try {
      await onSave(form, series);
    } catch (err) {
      toast.error(err.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const choice = (key, meta, selected, onPick) => (
    <button
      key={key}
      type="button"
      onClick={onPick}
      className={`min-h-8 rounded-md border px-3 py-2 text-left text-sm ${
        selected
          ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] font-medium text-[var(--color-accent)]"
          : "border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-accent-soft)]"
      }`}
    >
      {meta.icon} {meta.label}
    </button>
  );

  const dateLabel =
    plan === "installment" || debtSplit
      ? "Primera cuota"
      : plan === "recurring"
        ? "Primer vencimiento"
        : cheque
          ? "Fecha del cheque (cuándo se cobra)"
          : "Vencimiento";
  const counterpartyLabel =
    plan === "installment"
      ? "Acreedor (banco, proveedor…)"
      : plan === "recurring"
        ? COUNTERPARTY_LABEL.payment
        : COUNTERPARTY_LABEL[form.kind] || "Contraparte";
  const amountLabel =
    plan === "installment" || debtSplit
      ? "Cada cuota"
      : plan === "recurring"
        ? "Monto mensual"
        : form.kind === "installment" || form.installment?.of
          ? "Cuota"
          : "Monto";

  return (
    <Modal
      open
      size="lg"
      onClose={onCancel}
      title={isNew ? "Agregar documento" : "Editar"}
      footer={
        <>
          {onStopSeries && (
            <button type="button" className={`${btnCls} mr-auto text-[var(--color-danger)]`} onClick={onStopSeries}>
              ⏹ Detener pago recurrente
            </button>
          )}
          <button type="button" className={btnCls} onClick={onCancel}>Cancelar</button>
          <button type="submit" form="commitment-form" className={primaryCls} disabled={busy || (series && !dates.length)}>
            {busy ? "Guardando…" : series ? `Crear ${dates.length} vencimiento(s)` : "Guardar"}
          </button>
        </>
      }
    >
      <form id="commitment-form" onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-4">
        {(isNew || !kindLocked) && (
          <div>
            {isNew && <div className={labelCls}>Tipo de documento</div>}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {SINGLE_KINDS.map((k) =>
                choice(k, COMMITMENT_KINDS[k], !plan && form.kind === k, () => {
                  setPlan(null);
                  set({ kind: k });
                }),
              )}
              {isNew &&
                Object.entries(PLAN_TYPES).map(([k, meta]) => choice(k, meta, plan === k, () => setPlan(k)))}
            </div>
          </div>
        )}
        {plan && (
          <p className="text-sm text-[var(--color-muted)]">
            {plan === "installment"
              ? "Se crea una cuota por mes, el mismo día de la primera. Cada cuota se marca pagada por separado."
              : `Se repite cada mes el mismo día, sin fecha de término. La app mantiene creados los vencimientos de los próximos ${RECURRING_HORIZON_DAYS} días; para terminarlo, edita uno y usa "Detener pago recurrente".`}
          </p>
        )}
        {form.installment?.of && (
          <div className="text-sm text-[var(--color-muted)]">Cuota {form.installment.n} de {form.installment.of}</div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>{dateLabel}</label>
            <input type="date" value={form.dueDate || ""} onChange={(e) => set({ dueDate: e.target.value })} className={inputCls} />
          </div>
          {plan === "installment" && (
            <div>
              <label className={labelCls}>Número de cuotas</label>
              <input type="number" min="1" max="240" value={form.count} onChange={(e) => set({ count: e.target.value })} className={inputCls} />
            </div>
          )}
          {personalDebt && (
            <div>
              <label className={labelCls}>Número de cuotas (1 = pago único)</label>
              <input type="number" min="1" max="240" value={form.debtCount} onChange={(e) => set({ debtCount: e.target.value })} className={inputCls} />
            </div>
          )}
          {cheque && (
            <>
              <div>
                <label className={labelCls}>Fecha de emisión (opcional)</label>
                <input type="date" value={form.issueDate || ""} onChange={(e) => set({ issueDate: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Banco</label>
                <select value={form.bank || ""} onChange={(e) => set({ bank: e.target.value })} className={inputCls}>
                  <option value="">— Elegir —</option>
                  {!knownBank && <option value={form.bank}>{form.bank}</option>}
                  {CHEQUE_BANKS.map((b) => (
                    <option key={b.code} value={b.code}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>N° de cheque</label>
                <input value={form.chequeNumber || ""} onChange={(e) => set({ chequeNumber: e.target.value })} className={inputCls} />
              </div>
            </>
          )}
          <CommonFields form={form} set={set} companies={companies} counterpartyLabel={counterpartyLabel} amountLabel={amountLabel} />
          {form.status === "paid" && (
            <div>
              <label className={labelCls}>Interés / extra pagado</label>
              <input
                type="number"
                min="0"
                inputMode="numeric"
                value={form.extra}
                onChange={(e) => set({ extra: e.target.value })}
                className={inputCls}
              />
              <div className="mt-1 text-xs text-[var(--color-muted)]">
                {paidLabel(form.kind)}: {fmtCurrency((Number(form.amount) || 0) + (Number(form.extra) || 0))} en total
              </div>
            </div>
          )}
        </div>
        {dates.length > 0 && (
          <div>
            <div className={labelCls}>
              {dates.length} vencimiento(s){Number(form.amount) > 0 ? ` · total ${fmtCurrency(dates.length * Number(form.amount))}` : ""}
            </div>
            <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
              {dates.map((d, i) => (
                <span key={d} className="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-xs tabular-nums">
                  {plan === "recurring" ? "" : `${i + 1}. `}{fmtDate(d)}
                </span>
              ))}
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}

const OFFSET_CHOICES = [7, 5, 3, 2, 1, 0];
const offsetLabel = (n) => (n === 0 ? "El mismo día" : n === 1 ? "1 día antes" : `${n} días antes`);

function ConfigModal({ onClose }) {
  const toast = useToast();
  const { user } = useAuth();
  const [config, setConfig] = useState(null);
  const [recipientsText, setRecipientsText] = useState("");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    let alive = true;
    getCommitmentConfig()
      .then((c) => {
        if (!alive) return;
        setConfig(c);
        setRecipientsText((c.recipients || []).join("\n"));
      })
      .catch(() => alive && setConfig({ ...DEFAULT_COMMITMENT_CONFIG }));
    return () => {
      alive = false;
    };
  }, []);

  const parsedRecipients = recipientsText.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  const invalid = parsedRecipients.filter((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

  const persist = async () => {
    if (invalid.length) throw new Error(`Correo no válido: ${invalid.join(", ")}`);
    await saveCommitmentConfig({ ...config, recipients: parsedRecipients });
  };

  const save = async () => {
    setBusy(true);
    try {
      await persist();
      toast.success("Avisos guardados");
      onClose();
    } catch (err) {
      toast.error(err.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    try {
      await persist();
      const ref = await enqueueJob("sendCommitmentDigest", null, user);
      const outcome = await waitForJob(ref, { timeoutMs: 60_000 });
      if (outcome.status === "done") {
        toast.success(`Correo de prueba enviado a ${(outcome.result?.recipients || []).join(", ")}`);
      } else if (outcome.status === "timeout") {
        toast.error("El backend no respondió. ¿Está desplegada la función?");
      } else {
        toast.error("No se pudo enviar: " + (outcome.error || outcome.status));
      }
    } catch (err) {
      toast.error(err.message || String(err));
    } finally {
      setTesting(false);
    }
  };

  const toggleOffset = (n) =>
    setConfig((c) => {
      const has = c.offsets.includes(n);
      return { ...c, offsets: has ? c.offsets.filter((x) => x !== n) : [...c.offsets, n].sort((a, b) => b - a) };
    });

  return (
    <Modal
      open
      size="md"
      onClose={onClose}
      title="Avisos por correo"
      footer={
        <>
          <button type="button" className={`${btnCls} mr-auto`} onClick={sendTest} disabled={!config || testing || busy || !parsedRecipients.length}>
            {testing ? "Enviando…" : "📧 Enviar prueba"}
          </button>
          <button type="button" className={btnCls} onClick={onClose}>Cancelar</button>
          <button type="button" className={primaryCls} onClick={save} disabled={!config || busy}>
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </>
      }
    >
      {!config ? (
        <div className="py-6 text-center text-sm text-[var(--color-muted)]">Cargando…</div>
      ) : (
        <div className="space-y-4 text-sm">
          <p className="text-[var(--color-muted)]">
            Todos los días a las 8:00 se envía un solo correo con lo que vence en los días marcados. Si no hay nada que avisar, no llega correo.
          </p>
          <div>
            <label className={labelCls}>Destinatarios (uno por línea)</label>
            <textarea rows={3} value={recipientsText} onChange={(e) => setRecipientsText(e.target.value)} className={inputCls} placeholder="nombre@empresa.cl" />
            {invalid.length > 0 && <div className="mt-1 text-xs text-[var(--color-danger)]">No válido: {invalid.join(", ")}</div>}
          </div>
          <div>
            <label className={labelCls}>Avisar</label>
            <div className="flex flex-wrap gap-2">
              {OFFSET_CHOICES.map((n) => (
                <label key={n} className="flex min-h-8 items-center gap-1.5 rounded-md border border-[var(--color-border)] px-2">
                  <input type="checkbox" checked={config.offsets.includes(n)} onChange={() => toggleOffset(n)} />
                  {offsetLabel(n)}
                </label>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={!!config.includeOverdue} onChange={(e) => setConfig((c) => ({ ...c, includeOverdue: e.target.checked }))} />
            Repetir cada día los vencidos que nadie marcó como pagados
          </label>
          <p className="text-xs text-[var(--color-muted)]">
            Cada correo trae además los próximos 7 días, con los aplazados al principio como "ya vencido". Eso por sí solo no genera un correo: llega cuando hay algo que avisar. El de prueba lo trae siempre.
          </p>
          <div>
            <label className={labelCls}>Cuenta que envía (Gmail con contraseña de aplicación)</label>
            <input value={config.sender || ""} onChange={(e) => setConfig((c) => ({ ...c, sender: e.target.value }))} className={inputCls} placeholder="avisos@gmail.com" />
            <div className="mt-1 text-xs text-[var(--color-muted)]">
              La contraseña no se guarda acá: vive como secreto del backend (ver functions/README.md).
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

// Import de la planilla "Control de Cheques". Muestra lo que se va a crear y
// salta las filas que ya existen (mismo banco y N° de cheque).
function ImportModal({ companies, existingIds, onCancel, onImported }) {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);

  const readFile = async (file) => {
    if (!file) return;
    setFileName(file.name);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const ws = wb.getWorksheet("Control de Cheques") || wb.worksheets[0];
      const out = [];
      ws.eachRow((row, i) => {
        if (i === 1) return;
        const mapped = mapExcelRow(row.values.slice(1), { companies });
        if (mapped) out.push({ line: i, ...mapped });
      });
      setRows(out);
    } catch (err) {
      toast.error("No se pudo leer el archivo: " + (err.message || err));
    }
  };

  const seen = new Set();
  const classified = (rows || []).map((r) => {
    if (r.error) return { ...r, state: "error" };
    if (!r.id) return { ...r, state: "error", error: "Sin N° de cheque" };
    if (existingIds.has(r.id) || seen.has(r.id)) return { ...r, state: "exists" };
    seen.add(r.id);
    return { ...r, state: "new" };
  });
  const newRows = classified.filter((r) => r.state === "new");

  const confirm = async () => {
    setBusy(true);
    try {
      const n = await importRows(newRows, existingIds);
      await onImported(n);
    } catch (err) {
      toast.error("Error al importar: " + (err.message || err));
    } finally {
      setBusy(false);
    }
  };

  const STATE = {
    new: { label: "Nuevo", cls: TONE_CLS.accent },
    exists: { label: "Ya existe", cls: TONE_CLS.muted },
    error: { label: "No se importa", cls: TONE_CLS.danger },
  };

  return (
    <Modal
      open
      size="xl"
      onClose={onCancel}
      title="Importar planilla de cheques"
      footer={
        <>
          <button type="button" className={btnCls} onClick={onCancel}>Cancelar</button>
          <button type="button" className={primaryCls} onClick={confirm} disabled={busy || !newRows.length}>
            {busy ? "Importando…" : `Importar ${newRows.length}`}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="text-[var(--color-muted)]">
          Lee la hoja "Control de Cheques" (N°, fecha, banco, N° cheque, beneficiario, concepto, monto, fecha de cobro, estado, cuenta/empresa, observaciones).
          La fecha se toma como la fecha del cheque. "Vencido" entra como pendiente: la app lo marca vencido sola.
        </p>
        <input type="file" accept=".xlsx" onChange={(e) => readFile(e.target.files?.[0])} className="text-sm" />
        {rows && (
          <>
            <div className="text-[var(--color-muted)]">
              {fileName}: {newRows.length} nuevo(s), {classified.filter((r) => r.state === "exists").length} ya existen,{" "}
              {classified.filter((r) => r.state === "error").length} con error.
            </div>
            <div className="max-h-[50vh] overflow-auto rounded-md border border-[var(--color-border)]">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-[var(--color-surface-2)] text-left text-[var(--color-muted)]">
                  <tr>
                    <th className="px-2 py-1">Fila</th>
                    <th className="px-2 py-1">Estado</th>
                    <th className="px-2 py-1">Fecha</th>
                    <th className="px-2 py-1">Banco / N°</th>
                    <th className="px-2 py-1">Beneficiario</th>
                    <th className="px-2 py-1 text-right">Monto</th>
                    <th className="px-2 py-1">Situación</th>
                    <th className="px-2 py-1">Empresa</th>
                  </tr>
                </thead>
                <tbody>
                  {classified.map((r) => (
                    <tr key={r.line} className="border-t border-[var(--color-border)]">
                      <td className="px-2 py-1">{r.line}</td>
                      <td className="px-2 py-1">
                        <span className={`rounded-full px-1.5 py-0.5 ${STATE[r.state].cls}`}>{STATE[r.state].label}</span>
                        {r.error && <div className="text-[var(--color-danger)]">{r.error}</div>}
                      </td>
                      <td className="px-2 py-1 tabular-nums">{r.data ? fmtDate(r.data.dueDate) : ""}</td>
                      <td className="px-2 py-1">{r.data ? `${bankName(r.data.bank)} · ${r.data.chequeNumber}` : ""}</td>
                      <td className="px-2 py-1">{r.data?.counterparty}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{r.data ? fmtCurrency(r.data.amount) : ""}</td>
                      <td className="px-2 py-1">{r.data ? (r.data.status === "paid" ? paidLabel(r.data.kind) : STATUS_LABELS[r.data.status]) : ""}</td>
                      <td className="px-2 py-1">
                        {r.data
                          ? r.data.companyId
                            ? companies.find((c) => c.id === r.data.companyId)?.alias || "✓"
                            : `${r.data.companyLabel || "—"} (sin asignar)`
                          : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
