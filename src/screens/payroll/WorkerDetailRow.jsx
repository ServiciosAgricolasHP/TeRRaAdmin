import { formatRutForDisplay } from "../../utils/rutUtils";
import { bankName } from "../../utils/banks";
import { fmtCurrency } from "../../utils/format";
import { accountTypeShort } from "./helpers";
import { WorkerPaidDetailTables } from "./WorkerPaidDetailTables";
import { WorkerPaySummaryCards } from "./WorkerPaySummaryCards";

// El RUT tal como viene, cuando no se pasa `rutOf`.
const sameRut = (r) => r;

// Fila expandible de banco o efectivo. Al expandirla muestra el detalle de la
// persona en la nómina: tablas por ciclo y tarjetas de bruto, anticipos, bonos
// y neto. "📅 Ver historial completo" abre el WorkerSummaryModal.
export function WorkerDetailRow({
  rutOf = sameRut, item, expanded, onToggle, onShowSummary, cycleDetails, displayCycleLabel,
  editMode, editBusy, onRemoveWorker, cols, snapshot, snapshotLoading, catalogs, isMobile,
  cashPaidMode = false, cashPaid = false, onToggleCashPaid,
}) {
  const isBank = cols === "bank";
  // Columnas base: 7 en banco, 4 en efectivo. Cada modo opcional suma una.
  const colSpan = (isBank ? 7 : 4) + (editMode ? 1 : 0) + (cashPaidMode ? 1 : 0);
  const cashPaidBtnTitle = cashPaid
    ? "Ya cobró su efectivo. Click para desmarcar."
    : "Marcar que esta persona ya cobró su efectivo (se descuenta de la deuda).";

  const expandedDetail = (
    <div className="space-y-3">
      {/* Encabezado con líder y email, y atajo al historial completo */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {item.groupLeader && (
            <span className="rounded bg-[var(--color-surface)] px-1.5 py-0.5 text-[10px]">
              👥 <b>{item.groupLeader}</b>
            </span>
          )}
          {item.email && (
            <span className="text-[10px] text-[var(--color-muted)]">✉ {item.email}</span>
          )}
        </div>
        <button
          type="button"
          onClick={onShowSummary}
          className="rounded-md border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-fg)]"
          title="Abrir el detalle completo del trabajador con todos sus ciclos"
        >
          📅 Ver historial completo
        </button>
      </div>

      {/* Detalle por ciclo, como en Trabajadores: una tabla por ciclo con
          encabezado faena · subfaena · ciclo y filas labor × día. */}
      <WorkerPaidDetailTables
        displayRut={rutOf(item.rut, item.workerId)}
        item={item}
        snapshot={snapshot}
        snapshotLoading={snapshotLoading}
        cycleDetails={cycleDetails}
        displayCycleLabel={displayCycleLabel}
        catalogs={catalogs}
      />

      <WorkerPaySummaryCards item={item} />
    </div>
  );

  if (isMobile) {
    return (
      <div>
        <div
          className="flex min-h-[44px] cursor-pointer items-center gap-2 px-3 py-2 active:bg-[var(--color-accent-soft)]"
          onClick={onToggle}
        >
          <span className="shrink-0 text-[var(--color-muted)]">{expanded ? "▾" : "▸"}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{item.name}</div>
            <div className="flex flex-wrap items-center gap-x-2 font-mono text-[11px] text-[var(--color-muted)]">
              <span>{formatRutForDisplay(rutOf(item.rut, item.workerId))}</span>
              {isBank && (
                <span className="truncate">{bankName(item.bankCode)} · {item.accountNumber} · {accountTypeShort(item.accountType)}</span>
              )}
            </div>
          </div>
          <span className={`shrink-0 font-semibold tabular-nums ${cashPaid ? "text-[var(--color-muted)] line-through" : ""}`}>
            {fmtCurrency(item.amount)}
          </span>
          {cashPaidMode && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleCashPaid?.(item.rut); }}
              title={cashPaidBtnTitle}
              className={`min-h-[32px] shrink-0 rounded border px-2 text-[11px] ${
                cashPaid
                  ? "border-[var(--color-success)] bg-[var(--color-success-soft)] text-[var(--color-success)]"
                  : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)]"
              }`}
            >
              {cashPaid ? "✓ cobró" : "○ debe"}
            </button>
          )}
          {editMode && (
            <button
              type="button"
              disabled={editBusy}
              onClick={(e) => { e.stopPropagation(); onRemoveWorker(item); }}
              className="shrink-0 rounded border border-[var(--color-danger)] bg-[var(--color-danger-soft)] px-2 py-1.5 text-[10px] text-[var(--color-danger)] hover:opacity-80 disabled:opacity-50"
              title="Sacar trabajador de la nómina"
            >
              ✕
            </button>
          )}
        </div>
        {expanded && (
          <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-3 py-3">
            {expandedDetail}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <tr
        className="cursor-pointer border-t border-[var(--color-border)] hover:bg-[var(--color-accent-soft)]"
        onClick={onToggle}
      >
        {isBank ? (
          <>
            <td className="px-2 py-1 text-center text-[var(--color-muted)]">{expanded ? "▾" : "▸"}</td>
            <td className="px-2 py-1 font-mono text-xs">{formatRutForDisplay(rutOf(item.rut, item.workerId))}</td>
            <td className="px-2 py-1">{item.name}</td>
            <td className="px-2 py-1 text-xs">{bankName(item.bankCode)}</td>
            <td className="px-2 py-1 font-mono text-xs">{item.accountNumber}</td>
            <td className="px-2 py-1 text-xs">{accountTypeShort(item.accountType)}</td>
            <td className="px-2 py-1 text-right tabular-nums">{fmtCurrency(item.amount)}</td>
          </>
        ) : (
          <>
            <td className="px-2 py-1 text-center text-[var(--color-muted)]">{expanded ? "▾" : "▸"}</td>
            <td className="px-2 py-1 font-mono text-xs">{formatRutForDisplay(rutOf(item.rut, item.workerId))}</td>
            <td className="px-2 py-1">{item.name}</td>
            <td className="px-2 py-1 text-right tabular-nums">{fmtCurrency(item.amount)}</td>
          </>
        )}
        {cashPaidMode && (
          <td className="px-2 py-1 text-right" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => onToggleCashPaid?.(item.rut)}
              title={cashPaidBtnTitle}
              className={`rounded border px-1.5 py-0.5 text-[10px] ${
                cashPaid
                  ? "border-[var(--color-success)] bg-[var(--color-success-soft)] text-[var(--color-success)]"
                  : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)]"
              }`}
            >
              {cashPaid ? "✓ cobró" : "○ debe"}
            </button>
          </td>
        )}
        {editMode && (
          <td className="px-2 py-1 text-right" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              disabled={editBusy}
              onClick={() => onRemoveWorker(item)}
              className="rounded border border-[var(--color-danger)] bg-[var(--color-danger-soft)] px-1.5 py-0.5 text-[10px] text-[var(--color-danger)] hover:opacity-80 disabled:opacity-50"
              title="Sacar trabajador de la nómina"
            >
              ✕
            </button>
          </td>
        )}
      </tr>
      {expanded && (
        <tr className="border-t border-[var(--color-border)] bg-[var(--color-surface-2)]/40">
          <td colSpan={colSpan} className="px-3 py-3">
            {expandedDetail}
          </td>
        </tr>
      )}
    </>
  );
}
