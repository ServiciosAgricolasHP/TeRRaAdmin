import RowMenu from "../../components/RowMenu";
import {
  kindMeta,
  partialPaidOf,
  isOpen,
  remainingOf,
  extraOf,
  canPostpone,
  canProtest,
  paidLabel,
  paidTotalOf,
} from "../../utils/commitments";
import { bankName } from "../../utils/banks";
import { fmtCurrency } from "../../utils/format";
import { fmtDate } from "./helpers";
import { StatusChip } from "./StatusChip";

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
export function CommitmentList({
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
