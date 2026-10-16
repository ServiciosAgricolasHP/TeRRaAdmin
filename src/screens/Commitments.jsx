import { useEffect, useMemo, useState } from "react";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import { companiesService } from "../services";
import {
  listCommitments,
  commitmentsService,
  saveCommitment,
  markPaid,
  markPending,
  cancelCommitment,
  createInstallmentPlan,
  createRecurringPlan,
  stopSeries,
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
};

const STATUS_FILTERS = [
  { v: "", label: "Todos" },
  { v: "pending", label: "Pendientes" },
  { v: "overdue", label: "Vencidos" },
  { v: "paid", label: "Pagados / cobrados" },
  { v: "cancelled", label: "Anulados" },
];

// "2026-10-21" → "21-10-2026".
const fmtDate = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
};

function urgencyTone(c, today) {
  const status = displayStatus(c, today);
  if (status === "overdue") return "danger";
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
  const text = status === "pending" || status === "overdue" ? urgencyLabel(daysUntil(c.dueDate, today)) : statusLabel(c, today);
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
  const [plan, setPlan] = useState(null); // "installment" | "recurring"
  const [paying, setPaying] = useState(null);
  const [confirm, setConfirm] = useState(null); // { title, message, confirmLabel, danger, run }
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

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

  const upcoming = useMemo(
    () =>
      items
        .filter((c) => c.status === "pending")
        .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0)),
    [items],
  );
  const upcomingGroups = useMemo(() => {
    const groups = [
      { key: "overdue", title: "Vencidos sin marcar", items: [] },
      { key: "week", title: "Próximos 7 días", items: [] },
      { key: "later", title: "Más adelante", items: [] },
    ];
    for (const c of upcoming) {
      const days = daysUntil(c.dueDate, today);
      groups[days < 0 ? 0 : days <= 7 ? 1 : 2].items.push(c);
    }
    return groups.filter((g) => g.items.length);
  }, [upcoming, today]);

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
    const futuros = items.filter((x) => x.seriesId === c.seriesId && x.status === "pending" && x.dueDate > today).length;
    setConfirm({
      title: "Detener pago recurrente",
      message: `¿Detener el pago recurrente a ${c.counterparty}? Se eliminan ${futuros} vencimiento(s) pendiente(s) posteriores a hoy y no se generan más. Lo pagado queda como registro.`,
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
      const headers = ["Vencimiento", "Tipo", "Estado", "Banco", "N° cheque", "Contraparte", "Concepto", "Monto", "Fecha de pago", "Empresa", "Observaciones"];
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
          fmtDate(c.paidAt),
          companyName(c),
          c.notes || "",
        ].forEach((v, i) => {
          row.getCell(i + 2).value = v;
        });
        row.getCell(9).numFmt = '"$"#,##0';
      });
      const totalRow = ws.getRow(filtered.length + 3);
      totalRow.getCell(8).value = "Total (sin anulados)";
      totalRow.getCell(9).value = filteredTotal;
      totalRow.getCell(9).numFmt = '"$"#,##0';
      totalRow.font = { bold: true };
      [12, 18, 12, 22, 12, 28, 26, 14, 12, 18, 40].forEach((w, i) => {
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
    onPay: (c) => setPaying({ item: c, date: today }),
    onCancel: askCancel,
    onReopen: askReopen,
    onEdit: (c) => setEditing({ ...c }),
    onDelete: askDelete,
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
            + Cheque
          </button>
          <button type="button" className={btnCls} onClick={() => setEditing({ kind: "payment", dueDate: today })}>
            + Pago
          </button>
          <button type="button" className={btnCls} onClick={() => setPlan("installment")}>
            + Crédito en cuotas
          </button>
          <button type="button" className={btnCls} onClick={() => setPlan("recurring")}>
            + Pago recurrente
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

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryCard label="Por pagar" amount={summary.out.pending.amount} count={summary.out.pending.count} />
        <SummaryCard label="Vencido sin marcar" amount={summary.out.overdue.amount + summary.in.overdue.amount} count={summary.out.overdue.count + summary.in.overdue.count} tone={summary.out.overdue.count + summary.in.overdue.count ? "danger" : ""} />
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
            No hay nada pendiente. Agrega un cheque, un pago o un crédito con los botones de arriba.
          </div>
        ) : (
          upcomingGroups.map((g) => (
            <section key={g.key}>
              <h2 className="mb-2 text-sm font-semibold text-[var(--color-muted)]">
                {g.title} · {fmtCurrency(g.items.reduce((s, c) => s + (Number(c.amount) || 0), 0))}
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
          companies={companies}
          onCancel={() => setEditing(null)}
          onStopSeries={editing.seriesId && !editing.installment ? () => askStopSeries(editing) : null}
          onSave={async (draft) => {
            await saveCommitment(draft);
            setEditing(null);
            toast.success("Guardado");
            await load();
          }}
        />
      )}

      {plan && (
        <PlanModal
          mode={plan}
          today={today}
          companies={companies}
          onCancel={() => setPlan(null)}
          onSave={async (draft, opts) => {
            const r =
              plan === "installment"
                ? await createInstallmentPlan(draft, opts)
                : await createRecurringPlan(draft, { ...opts, today });
            setPlan(null);
            toast.success(`${r.count} vencimiento(s) creados`);
            await load();
          }}
        />
      )}

      {paying && (
        <Modal
          open
          size="sm"
          onClose={() => setPaying(null)}
          title={`Marcar ${paidLabel(paying.item.kind).toLowerCase()}`}
          footer={
            <>
              <button type="button" className={btnCls} onClick={() => setPaying(null)}>Cancelar</button>
              <button
                type="button"
                className={primaryCls}
                disabled={!paying.date}
                onClick={async () => {
                  try {
                    await markPaid(paying.item.id, paying.date);
                    setPaying(null);
                    toast.success(paidLabel(paying.item.kind));
                    await load();
                  } catch (err) {
                    toast.error(err.message || String(err));
                  }
                }}
              >
                Confirmar
              </button>
            </>
          }
        >
          <p className="mb-3 text-sm">
            {paying.item.counterparty} · <b>{fmtCurrency(paying.item.amount)}</b>
            {paying.item.chequeNumber ? ` · cheque N° ${paying.item.chequeNumber}` : ""}
          </p>
          <label className={labelCls}>Fecha en que se {isCheque(paying.item.kind) ? "cobró" : "pagó"}</label>
          <input
            type="date"
            value={paying.date}
            onChange={(e) => setPaying((p) => ({ ...p, date: e.target.value }))}
            className={inputCls}
          />
        </Modal>
      )}

      {configOpen && <ConfigModal onClose={() => setConfigOpen(false)} />}

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

// Tabla en escritorio, tarjetas en el teléfono.
function CommitmentList({ items, today, companyName, onPay, onCancel, onReopen, onEdit, onDelete }) {
  const actions = (c) => {
    const status = displayStatus(c, today);
    const open = status === "pending" || status === "overdue";
    return (
      <div className="flex flex-wrap justify-end gap-1">
        {open ? (
          <>
            <button type="button" className="min-h-8 rounded-md border border-[var(--color-border)] px-2 text-xs hover:bg-[var(--color-surface-2)]" onClick={() => onPay(c)}>
              ✓ {paidLabel(c.kind)}
            </button>
            <button type="button" className="min-h-8 rounded-md border border-[var(--color-border)] px-2 text-xs hover:bg-[var(--color-surface-2)]" onClick={() => onCancel(c)}>
              Anular
            </button>
          </>
        ) : (
          <button type="button" className="min-h-8 rounded-md border border-[var(--color-border)] px-2 text-xs hover:bg-[var(--color-surface-2)]" onClick={() => onReopen(c)}>
            ↶ Pendiente
          </button>
        )}
        <button type="button" title="Editar" className="min-h-8 rounded-md px-2 text-sm hover:bg-[var(--color-surface-2)]" onClick={() => onEdit(c)}>
          ✏️
        </button>
        <button type="button" title="Eliminar" className="min-h-8 rounded-md px-2 text-sm text-[var(--color-danger)] hover:bg-[var(--color-surface-2)]" onClick={() => onDelete(c)}>
          ✕
        </button>
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
                  {c.status === "paid" && c.paidAt ? <div>{paidLabel(c.kind)} el {fmtDate(c.paidAt)}</div> : null}
                </td>
                <td className={`whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums ${c.status === "cancelled" ? "line-through" : ""}`}>
                  {kindMeta(c.kind).direction === "in" ? "+" : ""}{fmtCurrency(c.amount)}
                </td>
                <td className="px-3 py-2">{actions(c)}</td>
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
                {kindMeta(c.kind).direction === "in" ? "+" : ""}{fmtCurrency(c.amount)}
              </div>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--color-muted)]">
              <StatusChip c={c} today={today} />
              <span>{detail(c)}</span>
            </div>
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

function CommitmentModal({ initial, companies, onCancel, onSave, onStopSeries }) {
  const toast = useToast();
  const [form, setForm] = useState(() => ({ ...initial }));
  const [busy, setBusy] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const cheque = isCheque(form.kind);
  // Una cuota o un vencimiento de una serie no cambia de tipo.
  const kindLocked = !!form.seriesId || form.kind === "installment";
  const knownBank = !form.bank || CHEQUE_BANKS.some((b) => b.code === form.bank);

  const submit = async () => {
    setBusy(true);
    try {
      await onSave(form);
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
      onClose={onCancel}
      title={form.id ? "Editar" : `Nuevo: ${kindMeta(form.kind).label.toLowerCase()}`}
      footer={
        <>
          {onStopSeries && (
            <button type="button" className={`${btnCls} mr-auto text-[var(--color-danger)]`} onClick={onStopSeries}>
              ⏹ Detener pago recurrente
            </button>
          )}
          <button type="button" className={btnCls} onClick={onCancel}>Cancelar</button>
          <button type="submit" form="commitment-form" className={primaryCls} disabled={busy}>
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </>
      }
    >
      <form id="commitment-form" onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-4">
        {!kindLocked && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {["chequeIssued", "chequeReceived", "payment"].map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => set({ kind: k })}
                className={`min-h-8 rounded-md border px-3 py-2 text-sm ${
                  form.kind === k
                    ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] font-medium text-[var(--color-accent)]"
                    : "border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-accent-soft)]"
                }`}
              >
                {COMMITMENT_KINDS[k].icon} {COMMITMENT_KINDS[k].label}
              </button>
            ))}
          </div>
        )}
        {form.installment?.of && (
          <div className="text-sm text-[var(--color-muted)]">Cuota {form.installment.n} de {form.installment.of}</div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>{cheque ? "Fecha del cheque (cuándo se cobra)" : "Vencimiento"}</label>
            <input type="date" value={form.dueDate || ""} onChange={(e) => set({ dueDate: e.target.value })} className={inputCls} />
          </div>
          {cheque && (
            <div>
              <label className={labelCls}>Fecha de emisión (opcional)</label>
              <input type="date" value={form.issueDate || ""} onChange={(e) => set({ issueDate: e.target.value })} className={inputCls} />
            </div>
          )}
          {cheque && (
            <>
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
          <CommonFields form={form} set={set} companies={companies} counterpartyLabel={COUNTERPARTY_LABEL[form.kind] || "Contraparte"} />
        </div>
      </form>
    </Modal>
  );
}

// Crédito en cuotas o pago recurrente: muestra los vencimientos que se van a
// crear antes de confirmar.
function PlanModal({ mode, today, companies, onCancel, onSave }) {
  const toast = useToast();
  const [form, setForm] = useState({ firstDate: today, count: 12, amount: "", counterparty: "", concept: "", notes: "", companyId: null });
  const [busy, setBusy] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const installment = mode === "installment";

  const dates = useMemo(() => {
    if (installment) return buildInstallments({ firstDate: form.firstDate, count: Math.min(Number(form.count) || 0, 240) }).map((c) => c.dueDate);
    return recurringDates({ firstDate: form.firstDate, until: addDays(today, RECURRING_HORIZON_DAYS) });
  }, [installment, form.firstDate, form.count, today]);

  const submit = async () => {
    setBusy(true);
    try {
      await onSave(form, { firstDate: form.firstDate, count: Number(form.count) || 0 });
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
      onClose={onCancel}
      title={installment ? "Nuevo crédito en cuotas" : "Nuevo pago recurrente"}
      footer={
        <>
          <button type="button" className={btnCls} onClick={onCancel}>Cancelar</button>
          <button type="submit" form="plan-form" className={primaryCls} disabled={busy || !dates.length}>
            {busy ? "Creando…" : `Crear ${dates.length} vencimiento(s)`}
          </button>
        </>
      }
    >
      <form id="plan-form" onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-4">
        <p className="text-sm text-[var(--color-muted)]">
          {installment
            ? "Se crea una cuota por mes, el mismo día de la primera. Cada cuota se marca pagada por separado."
            : `Se repite cada mes el mismo día, sin fecha de término. La app mantiene creados los vencimientos de los próximos ${RECURRING_HORIZON_DAYS} días; para terminarlo, edita uno y usa "Detener pago recurrente".`}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>{installment ? "Primera cuota" : "Primer vencimiento"}</label>
            <input type="date" value={form.firstDate} onChange={(e) => set({ firstDate: e.target.value })} className={inputCls} />
          </div>
          {installment && (
            <div>
              <label className={labelCls}>Número de cuotas</label>
              <input type="number" min="1" max="240" value={form.count} onChange={(e) => set({ count: e.target.value })} className={inputCls} />
            </div>
          )}
          <CommonFields
            form={form}
            set={set}
            companies={companies}
            counterpartyLabel={installment ? "Acreedor (banco, proveedor…)" : "A quién se paga"}
            amountLabel={installment ? "Monto de cada cuota" : "Monto mensual"}
          />
        </div>
        {dates.length > 0 && (
          <div>
            <div className={labelCls}>
              {dates.length} vencimiento(s){Number(form.amount) > 0 ? ` · total ${fmtCurrency(dates.length * Number(form.amount))}` : ""}
            </div>
            <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
              {dates.map((d, i) => (
                <span key={d} className="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-xs tabular-nums">
                  {installment ? `${i + 1}. ` : ""}{fmtDate(d)}
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
  const nuevas = classified.filter((r) => r.state === "new");

  const confirm = async () => {
    setBusy(true);
    try {
      const n = await importRows(nuevas, existingIds);
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
          <button type="button" className={primaryCls} onClick={confirm} disabled={busy || !nuevas.length}>
            {busy ? "Importando…" : `Importar ${nuevas.length}`}
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
              {fileName}: {nuevas.length} nuevo(s), {classified.filter((r) => r.state === "exists").length} ya existen,{" "}
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
