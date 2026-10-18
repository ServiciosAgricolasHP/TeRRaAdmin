import { useState, useMemo } from "react";
import Modal, { ModalCloseButton } from "../../components/Modal";
import { useToast } from "../../contexts/ToastContext";
import {
  isCheque,
  buildInstallments,
  recurringDates,
  addDays,
  RECURRING_HORIZON_DAYS,
  COMMITMENT_KINDS,
  paidLabel,
} from "../../utils/commitments";
import { BANKS } from "../../utils/banks";
import { fmtCurrency } from "../../utils/format";
import { hasChanges } from "../../utils/formChanges";
import { CommonFields } from "./CommonFields";
import { fmtDate } from "./helpers";
import { btnCls, primaryCls, labelCls, inputCls } from "./styles";

const CHEQUE_BANKS = BANKS.filter((b) => b.code !== "EFE");

// Quién está del otro lado, según el tipo.
const COUNTERPARTY_LABEL = {
  chequeIssued: "Beneficiario",
  chequeReceived: "Quién lo entrega",
  payment: "A quién se paga",
  installment: "Acreedor",
  personalDebt: "A quién se le debe",
};

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
export function CommitmentModal({ initial, today, companies, counterparties, onCancel, onSave, onStopSeries }) {
  const toast = useToast();
  const isNew = !initial.id;
  const [form, setForm] = useState(() => ({
    count: 12,
    debtCount: 1,
    ...initial,
    extra: initial.status === "paid" ? Number(initial.extra) || 0 : 0,
  }));
  const [baseline] = useState(form);
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
  // Al agregar, elegir el tipo o el número de cuotas sin escribir nada más no
  // es un cambio que se pierda.
  const dirty = !busy && hasChanges(baseline, form, { ignore: isNew ? ["kind", "count", "debtCount"] : [] });

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
      dirty={dirty}
      title={isNew ? "Agregar documento" : "Editar"}
      footer={
        <>
          {onStopSeries && (
            <button type="button" className={`${btnCls} mr-auto text-[var(--color-danger)]`} onClick={onStopSeries}>
              ⏹ Detener pago recurrente
            </button>
          )}
          <ModalCloseButton className={btnCls}>Cancelar</ModalCloseButton>
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
          <CommonFields
            form={form}
            set={set}
            companies={companies}
            counterparties={counterparties}
            counterpartyLabel={counterpartyLabel}
            amountLabel={amountLabel}
          />
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
