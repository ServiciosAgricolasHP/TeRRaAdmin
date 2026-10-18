import { fmtCurrency, fmtPercent } from "../../../utils/format";
import { WARNING, ACCENT } from "./chartTheme";

function TooltipBox({ label, wide = false, children }) {
  return (
    <div
      className={`rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs shadow-xl ${
        wide ? "min-w-[250px]" : "min-w-[170px]"
      }`}
    >
      <div className="mb-1.5 font-semibold">{label}</div>
      {children}
    </div>
  );
}

// Desglose de las entradas que componen una barra del gráfico de deuda.
// Se listan las más grandes primero; el resto se resume en una línea.
function TooltipDetail({ items, max = 4 }) {
  if (!items?.length) return null;
  const shown = items.slice(0, max);
  const rest = items.slice(max);
  const restSum = rest.reduce((s, i) => s + i.amount, 0);
  return (
    <div className="mt-0.5 space-y-0.5 pl-4">
      {shown.map((it, i) => (
        <div key={`${it.name}-${it.kind}-${i}`} className="flex items-center gap-2 text-[10px]">
          <span className="truncate text-[var(--color-muted)]">
            {it.name}
            <span className="ml-1 opacity-70">· {it.kind}</span>
          </span>
          <span className="ml-auto shrink-0 tabular-nums text-[var(--color-muted)]">{fmtCurrency(it.amount)}</span>
        </div>
      ))}
      {rest.length > 0 && (
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-muted)]">
          <span className="opacity-70">+{rest.length} más</span>
          <span className="ml-auto shrink-0 tabular-nums opacity-70">{fmtCurrency(restSum)}</span>
        </div>
      )}
    </div>
  );
}

function TooltipRow({ color, name, value }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      {color && <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />}
      <span className="text-[var(--color-muted)]">{name}</span>
      <span className="ml-auto font-medium tabular-nums">{value}</span>
    </div>
  );
}

export function ChartTooltip({ active, payload, label, valueFormatter, showTotal = false }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (Number(p.value) || 0), 0);
  return (
    <TooltipBox label={label}>
      {payload.map((p) => (
        <TooltipRow key={p.dataKey} color={p.color} name={p.name} value={valueFormatter(p.value)} />
      ))}
      {showTotal && payload.length > 1 && (
        <div className="mt-1.5 flex items-center gap-2 border-t border-[var(--color-border)] pt-1.5">
          <span className="font-medium">Total</span>
          <span className="ml-auto font-semibold tabular-nums">{valueFormatter(total)}</span>
        </div>
      )}
    </TooltipBox>
  );
}

// Tooltip de la deuda: lo generado y lo pagado en el mes, el saldo al cierre
// y si se pagó más o menos de lo generado.
export function DebtTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const neto = Number(row.neto) || 0;
  return (
    <TooltipBox label={label} wide>
      <TooltipRow color={WARNING} name="Deuda generada" value={fmtCurrency(row.generado)} />
      <TooltipDetail items={row.nuevos} />
      <div className="mt-1" />
      <TooltipRow color={ACCENT} name="Pagado" value={fmtCurrency(row.pagado)} />
      <TooltipDetail items={row.pagos} />
      <div className="mt-1.5 border-t border-[var(--color-border)] pt-1.5">
        <TooltipRow name="Saldo al cierre" value={fmtCurrency(row.saldo)} />
        <div
          className={`mt-1 text-[11px] font-medium ${
            neto > 0 ? "text-[var(--color-accent)]" : neto < 0 ? "text-[var(--color-warning)]" : "text-[var(--color-muted)]"
          }`}
        >
          {neto > 0
            ? `Se pagó ${fmtCurrency(neto)} más de lo generado`
            : neto < 0
              ? `Se pagó ${fmtCurrency(-neto)} menos de lo generado`
              : "Se pagó exactamente lo generado"}
        </div>
        <div className="mt-1 text-[10px] text-[var(--color-muted)] opacity-80">
          Clic para ver todos los movimientos del mes
        </div>
      </div>
    </TooltipBox>
  );
}

export function DteTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const dif = Number(row.diferencia) || 0;
  return (
    <TooltipBox label={label}>
      <TooltipRow color={ACCENT} name="Ventas" value={fmtCurrency(row.ventas)} />
      <TooltipRow color={WARNING} name="Compras" value={fmtCurrency(row.compras)} />
      <div className="mt-1.5 border-t border-[var(--color-border)] pt-1.5">
        <TooltipRow name="Diferencia" value={fmtCurrency(dif)} />
        <div className="mt-0.5 text-[10px] text-[var(--color-muted)]">Montos con IVA incluido, netos de notas de crédito.</div>
      </div>
    </TooltipBox>
  );
}

export function PieTooltip({ active, payload, total }) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <TooltipBox label={p.name}>
      <TooltipRow color={p.payload.fill} name="Monto" value={fmtCurrency(p.value)} />
      <TooltipRow name="Del total" value={total > 0 ? fmtPercent((p.value / total) * 100, 1) : "—"} />
    </TooltipBox>
  );
}
