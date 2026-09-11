import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtCompactCLP, fmtCurrency, fmtNumber, fmtPercent } from "../utils/format";

// Todos los gráficos del Dashboard viven acá y el Dashboard importa este
// módulo con React.lazy — así Recharts queda en su propio chunk y las
// tarjetas de KPI pintan sin esperar a que baje la librería.
//
// Los colores salen de las variables del tema (`var(--color-*)`), que viven en
// <html>, así que los gráficos siguen el cambio de tema solos. Nada de verde
// hardcodeado: el accent es naranja en donDiego y violeta en sheridan.

const AXIS_TICK = { fill: "var(--color-muted)", fontSize: 11 };
const GRID_STROKE = "var(--color-border)";
const ACCENT = "var(--color-accent)";
const WARNING = "var(--color-warning)";
const MUTED = "var(--color-muted)";

// Los ids de <defs> son globales al documento, así que cada gradiente/filtro
// lleva prefijo propio para no pisarse entre gráficos de la misma página.
function ChartDefs({ id, color, altColor }) {
  return (
    <defs>
      <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity={0.95} />
        <stop offset="100%" stopColor={color} stopOpacity={0.55} />
      </linearGradient>
      <linearGradient id={`${id}-area`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity={0.55} />
        <stop offset="100%" stopColor={color} stopOpacity={0.04} />
      </linearGradient>
      <linearGradient id={`${id}-fill-h`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor={color} stopOpacity={0.6} />
        <stop offset="100%" stopColor={color} stopOpacity={0.95} />
      </linearGradient>
      {altColor && (
        <>
          <linearGradient id={`${id}-alt`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={altColor} stopOpacity={0.95} />
            <stop offset="100%" stopColor={altColor} stopOpacity={0.55} />
          </linearGradient>
          <linearGradient id={`${id}-alt-h`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={altColor} stopOpacity={0.6} />
            <stop offset="100%" stopColor={altColor} stopOpacity={0.95} />
          </linearGradient>
        </>
      )}
      <filter id={`${id}-shadow`} x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="1.5" stdDeviation="2.5" floodOpacity="0.22" />
      </filter>
    </defs>
  );
}

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

function ChartTooltip({ active, payload, label, valueFormatter, showTotal = false }) {
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

// El gráfico de deuda necesita decir explícitamente si en ese mes se pagó más
// o menos de lo que se generó — es la lectura útil, no los montos sueltos.
function DebtTooltip({ active, payload, label }) {
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

function DteTooltip({ active, payload, label }) {
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

function PieTooltip({ active, payload, total }) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <TooltipBox label={p.name}>
      <TooltipRow color={p.payload.fill} name="Monto" value={fmtCurrency(p.value)} />
      <TooltipRow name="Del total" value={total > 0 ? fmtPercent((p.value / total) * 100, 1) : "—"} />
    </TooltipBox>
  );
}

function ChartCard({ title, hint, empty, wide = false, children }) {
  return (
    <div
      className={`rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-md ${
        wide ? "lg:col-span-2" : ""
      }`}
    >
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">{title}</h3>
        {hint && <span className="text-[10px] text-[var(--color-muted)]">{hint}</span>}
      </div>
      {empty ? (
        <div className="flex h-[200px] items-center justify-center text-xs text-[var(--color-muted)]">
          Sin datos en el período.
        </div>
      ) : (
        children
      )}
    </div>
  );
}

function Legend({ items }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-[var(--color-muted)]">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <span
            className={`inline-block ${it.line ? "h-0.5 w-3.5 rounded-full" : "h-2.5 w-2.5 rounded-sm"}`}
            style={{ background: it.color }}
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}

export default function DashboardCharts({
  payrollMonths = [],
  payMix = [],
  cyclesByFaena = [],
  carrierSpend = [],
  transportMonths = [],
  debtMonths = [],
  workdayMonths = [],
  onDebtMonthClick,
  dte,
}) {
  const mixTotal = payMix.reduce((s, m) => s + m.value, 0);
  const MIX_COLORS = [ACCENT, WARNING, MUTED];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartCard title="Pagado a trabajadores por mes" hint="banco vs efectivo" empty={payrollMonths.length === 0} wide>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={payrollMonths} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="22%">
            <ChartDefs id="pay" color={ACCENT} altColor={WARNING} />
            <CartesianGrid stroke={GRID_STROKE} strokeDasharray="2 5" vertical={false} />
            <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} dy={4} />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={56} tickFormatter={fmtCompactCLP} />
            <Tooltip
              cursor={{ fill: "var(--color-accent-soft)", radius: 6 }}
              content={<ChartTooltip valueFormatter={fmtCurrency} showTotal />}
            />
            <Bar dataKey="banco" name="Banco" stackId="pago" fill="url(#pay-fill)" />
            <Bar
              dataKey="efectivo"
              name="Efectivo"
              stackId="pago"
              fill="url(#pay-alt)"
              radius={[5, 5, 0, 0]}
              filter="url(#pay-shadow)"
            />
          </BarChart>
        </ResponsiveContainer>
        <Legend items={[{ label: "Banco", color: ACCENT }, { label: "Efectivo", color: WARNING }]} />
      </ChartCard>

      <ChartCard
        title="Deuda con transportistas en el tiempo"
        hint="12 meses · por período trabajado · clic para el detalle"
        empty={debtMonths.length === 0}
        wide
      >
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart
            data={debtMonths}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            barCategoryGap="24%"
            style={onDebtMonthClick ? { cursor: "pointer" } : undefined}
            // Recharts 3 sacó `activePayload` del onClick del gráfico: ahora
            // solo llegan el índice y la etiqueta del punto activo, así que el
            // dato se resuelve contra el array. `activeIndex` puede venir como
            // string, de ahí el Number(); si no llega, se cae a la etiqueta.
            onClick={(state) => {
              const idx = Number(state?.activeTooltipIndex ?? state?.activeIndex);
              const row = Number.isInteger(idx)
                ? debtMonths[idx]
                : debtMonths.find((r) => r.label === state?.activeLabel);
              if (row) onDebtMonthClick?.(row);
            }}
          >
            <ChartDefs id="debt" color={ACCENT} altColor={WARNING} />
            <CartesianGrid stroke={GRID_STROKE} strokeDasharray="2 5" vertical={false} />
            <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} dy={4} />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={56} tickFormatter={fmtCompactCLP} />
            <Tooltip cursor={{ fill: "var(--color-accent-soft)", radius: 6 }} content={<DebtTooltip />} />
            <Bar dataKey="generado" name="Deuda generada" fill="url(#debt-alt)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="pagado" name="Pagado" fill="url(#debt-fill)" radius={[4, 4, 0, 0]} />
            {/* El saldo acumulado arranca del saldo real anterior a la ventana,
                así que la línea es la deuda vigente, no el flujo del período. */}
            <Line
              type="monotone"
              dataKey="saldo"
              name="Saldo acumulado"
              stroke={MUTED}
              strokeWidth={2}
              strokeDasharray="4 3"
              dot={{ r: 2.5, fill: MUTED, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
        <Legend
          items={[
            { label: "Deuda generada", color: WARNING },
            { label: "Pagado", color: ACCENT },
            { label: "Saldo acumulado", color: MUTED, line: true },
          ]}
        />
      </ChartCard>

      <ChartCard
        title="Actividad: registros de jornada por mes"
        hint="últimos 12 meses · no depende del período"
        empty={workdayMonths.length === 0}
        wide
      >
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={workdayMonths} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <ChartDefs id="wd" color={ACCENT} />
            <CartesianGrid stroke={GRID_STROKE} strokeDasharray="2 5" vertical={false} />
            <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} dy={4} />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={48} tickFormatter={fmtNumber} />
            <Tooltip cursor={{ stroke: ACCENT, strokeWidth: 1 }} content={<ChartTooltip valueFormatter={fmtNumber} />} />
            <Area
              type="monotone"
              dataKey="jornadas"
              name="Registros"
              stroke={ACCENT}
              strokeWidth={2}
              fill="url(#wd-area)"
              dot={{ r: 2.5, fill: ACCENT, strokeWidth: 0 }}
              activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--color-surface)" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Ciclos abiertos por faena" empty={cyclesByFaena.length === 0}>
        <ResponsiveContainer width="100%" height={Math.max(190, cyclesByFaena.length * 34)}>
          <BarChart data={cyclesByFaena} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 0 }} barCategoryGap="26%">
            <ChartDefs id="cyc" color={ACCENT} />
            <CartesianGrid stroke={GRID_STROKE} strokeDasharray="2 5" horizontal={false} />
            <XAxis type="number" tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} />
            <YAxis type="category" dataKey="name" tick={AXIS_TICK} tickLine={false} axisLine={false} width={112} />
            <Tooltip
              cursor={{ fill: "var(--color-accent-soft)", radius: 6 }}
              content={<ChartTooltip valueFormatter={fmtNumber} />}
            />
            <Bar dataKey="ciclos" name="Ciclos abiertos" fill="url(#cyc-fill-h)" radius={[0, 5, 5, 0]} filter="url(#cyc-shadow)" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Composición de lo devengado" hint="del período" empty={payMix.length === 0}>
        {/* Dona a la izquierda y leyenda a la derecha: hay ancho de sobra en la
            tarjeta, y así cada categoría muestra su monto y su porcentaje sin
            tener que pasar el mouse por encima. */}
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <ResponsiveContainer width="100%" height={228}>
              <PieChart>
                <defs>
                  <filter id="mix-shadow" x="-30%" y="-30%" width="160%" height="160%">
                    <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.22" />
                  </filter>
                </defs>
                <Tooltip content={<PieTooltip total={mixTotal} />} />
                <Pie
                  data={payMix}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={54}
                  outerRadius={88}
                  paddingAngle={2}
                  stroke="var(--color-surface)"
                  strokeWidth={2}
                  filter="url(#mix-shadow)"
                >
                  {payMix.map((slice, i) => (
                    <Cell key={slice.name} fill={MIX_COLORS[i % MIX_COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="w-[46%] shrink-0 space-y-2 text-xs">
            {payMix.map((s, i) => (
              <li key={s.name}>
                <div className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ background: MIX_COLORS[i % MIX_COLORS.length] }}
                  />
                  <span className="truncate text-[var(--color-muted)]">{s.name}</span>
                  <span className="ml-auto font-medium tabular-nums">
                    {mixTotal > 0 ? fmtPercent((s.value / mixTotal) * 100, 1) : "—"}
                  </span>
                </div>
                <div className="pl-4 tabular-nums text-[var(--color-muted)]">{fmtCurrency(s.value)}</div>
              </li>
            ))}
            <li className="flex items-center gap-1.5 border-t border-[var(--color-border)] pt-2">
              <span className="font-medium">Total</span>
              <span className="ml-auto font-semibold tabular-nums">{fmtCurrency(mixTotal)}</span>
            </li>
          </ul>
        </div>
      </ChartCard>

      <ChartCard title="Gasto por transportista" hint="resúmenes del período" empty={carrierSpend.length === 0}>
        <ResponsiveContainer width="100%" height={Math.max(190, carrierSpend.length * 34)}>
          <BarChart data={carrierSpend} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 0 }} barCategoryGap="26%">
            <ChartDefs id="car" color={ACCENT} altColor={WARNING} />
            <CartesianGrid stroke={GRID_STROKE} strokeDasharray="2 5" horizontal={false} />
            <XAxis type="number" tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={fmtCompactCLP} />
            <YAxis type="category" dataKey="name" tick={AXIS_TICK} tickLine={false} axisLine={false} width={112} />
            <Tooltip
              cursor={{ fill: "var(--color-accent-soft)", radius: 6 }}
              content={<ChartTooltip valueFormatter={fmtCurrency} />}
            />
            {/* Los que siguen pendientes de pago van en color de alerta para
                que se distingan del gasto ya saldado. */}
            <Bar dataKey="total" name="Gasto" radius={[0, 5, 5, 0]} filter="url(#car-shadow)">
              {carrierSpend.map((c) => (
                <Cell key={c.name} fill={c.pending > 0 ? "url(#car-alt-h)" : "url(#car-fill-h)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <Legend items={[{ label: "Saldado", color: ACCENT }, { label: "Con saldo pendiente", color: WARNING }]} />
      </ChartCard>

      <ChartCard title="Gasto de transporte por mes" hint="6 meses · por período trabajado" empty={transportMonths.length === 0}>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={transportMonths} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <ChartDefs id="tsp" color={WARNING} />
            <CartesianGrid stroke={GRID_STROKE} strokeDasharray="2 5" vertical={false} />
            <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} dy={4} />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={56} tickFormatter={fmtCompactCLP} />
            <Tooltip cursor={{ stroke: WARNING, strokeWidth: 1 }} content={<ChartTooltip valueFormatter={fmtCurrency} />} />
            <Area
              type="monotone"
              dataKey="gasto"
              name="Gasto"
              stroke={WARNING}
              strokeWidth={2}
              fill="url(#tsp-area)"
              dot={{ r: 2.5, fill: WARNING, strokeWidth: 0 }}
              activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--color-surface)" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Facturación: `dteDocuments` es la colección más grande del sistema, así
          que esta tarjeta primero dice cuánto costaría y la carga es a pedido.
          Una vez cargada queda en el estado de la pantalla y no se repite. */}
      {dte && (
        <ChartCard title="Compras vs ventas" hint={`${dte.months} meses · con IVA`} wide>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <select
              value={dte.companyId}
              onChange={(e) => dte.onSelectCompany(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)] sm:flex-none sm:max-w-xs"
            >
              {dte.companies.length === 0 && <option value="">Sin empresas</option>}
              {dte.companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.alias || c.razonSocial || c.id}
                </option>
              ))}
            </select>
            {dte.busy && <span className="text-[11px] text-[var(--color-muted)]">Cargando...</span>}
          </div>
          {!dte.rows ? (
            dte.error ? (
              <p className="rounded-md border border-[var(--color-danger)] bg-[var(--color-danger-soft)] px-3 py-2 text-[11px] break-words text-[var(--color-danger)]">
                {dte.error}
              </p>
            ) : (
              <div className="flex h-[180px] items-center justify-center text-xs text-[var(--color-muted)]">
                {dte.busy ? "Cargando..." : "Sin datos para esta empresa."}
              </div>
            )
          ) : (
            <>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={dte.rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={3} barCategoryGap="22%">
                  <ChartDefs id="dte" color={ACCENT} altColor={WARNING} />
                  <CartesianGrid stroke={GRID_STROKE} strokeDasharray="2 5" vertical={false} />
                  <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} dy={4} />
                  <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={56} tickFormatter={fmtCompactCLP} />
                  <Tooltip cursor={{ fill: "var(--color-accent-soft)", radius: 6 }} content={<DteTooltip />} />
                  <Bar dataKey="ventas" name="Ventas" fill="url(#dte-fill)" radius={[5, 5, 0, 0]} filter="url(#dte-shadow)" />
                  <Bar dataKey="compras" name="Compras" fill="url(#dte-alt)" radius={[5, 5, 0, 0]} filter="url(#dte-shadow)" />
                </BarChart>
              </ResponsiveContainer>
              <Legend items={[{ label: "Ventas", color: ACCENT }, { label: "Compras", color: WARNING }]} />
            </>
          )}
        </ChartCard>
      )}
    </div>
  );
}
