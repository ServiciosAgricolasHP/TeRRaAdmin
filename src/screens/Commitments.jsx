import { useState, useEffect, useMemo } from "react";
import ConfirmDialog from "../components/ConfirmDialog";
import PaymentReportModal from "./commitments/PaymentReportModal";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import { companiesService } from "../services";
import {
  listCommitments,
  cancelCommitment,
  markPending,
  markPostponed,
  markProtested,
  commitmentsService,
  stopSeries,
  createInstallmentPlan,
  createRecurringPlan,
  saveCommitment,
  markPaid,
  reschedule,
} from "../services/commitmentsService";
import {
  nextYearEnd,
  summarize,
  counterpartyOptions,
  groupUpcoming,
  displayStatus,
  kindMeta,
  directionOf,
  statusLabel,
  partialPaidOf,
  extraOf,
  paidTotalOf,
  remainingOf,
  upcomingMonthEnd,
  COMMITMENT_KINDS,
  paidLabel,
} from "../utils/commitments";
import { bankName } from "../utils/banks";
import { localIsoDate } from "../utils/dates";
import { fmtCurrency } from "../utils/format";
import { CommitmentList } from "./commitments/CommitmentList";
import { CommitmentModal } from "./commitments/CommitmentModal";
import { ConfigModal } from "./commitments/ConfigModal";
import { DateActionModal } from "./commitments/DateActionModal";
import { fmtDate } from "./commitments/helpers";
import { ImportModal } from "./commitments/ImportModal";
import { PartialPaymentModal } from "./commitments/PartialPaymentModal";
import { SeriesEditModal } from "./commitments/SeriesEditModal";
import { primaryCls, btnCls, inputCls } from "./commitments/styles";
import ScreenLoader from "../components/ScreenLoader";

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
  const [laterUntil, setLaterUntil] = useState(() => nextYearEnd(today));
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
  const counterparties = useMemo(() => counterpartyOptions(items), [items]);

  // "Más adelante" llega hasta `laterUntil`; lo de después se resume en una
  // línea. Vacío: sin límite.
  const upcoming = useMemo(() => groupUpcoming(items, today, { until: laterUntil }), [items, today, laterUntil]);
  const upcomingGroups = useMemo(
    () =>
      Object.entries(UPCOMING_TITLES)
        .map(([key, title]) => ({ key, title, items: upcoming[key] }))
        .filter((g) => g.items.length || (g.key === "later" && upcoming.beyond.length)),
    [upcoming],
  );

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
            📄 Informe de deudas
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
        <ScreenLoader />
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
                {g.key === "month" && <span className="font-normal"> (hasta el {fmtDate(upcomingMonthEnd(today))})</span>}
                {g.key === "later" && (
                  <span className="font-normal">
                    {" "}(hasta el{" "}
                    <input
                      type="date"
                      value={laterUntil}
                      onChange={(e) => setLaterUntil(e.target.value)}
                      className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1 py-0.5 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                      title="Vacío: sin límite"
                    />
                    )
                  </span>
                )}{" "}
                · {fmtCurrency(g.items.reduce((s, c) => s + remainingOf(c), 0))}
              </h2>
              {g.items.length > 0 && <CommitmentList items={g.items} {...rowProps} />}
              {g.key === "later" && upcoming.beyond.length > 0 && (
                <p className="mt-2 text-xs text-[var(--color-muted)]">
                  Después del {fmtDate(laterUntil)}: {upcoming.beyond.length} vencimiento{upcoming.beyond.length === 1 ? "" : "s"} por{" "}
                  {fmtCurrency(upcoming.beyond.reduce((s, c) => s + remainingOf(c), 0))}. Cambia la fecha para verlos.
                </p>
              )}
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
          counterparties={counterparties}
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
