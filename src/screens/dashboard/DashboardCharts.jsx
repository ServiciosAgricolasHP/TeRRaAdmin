import {
  ResponsiveContainer,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Bar,
  ComposedChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { fmtCompactCLP, fmtCurrency, fmtNumber, fmtPercent } from "../../utils/format";
import { ChartCard } from "./dashboardCharts/ChartCard";
import { ChartDefs } from "./dashboardCharts/ChartDefs";
import { ACCENT, WARNING, MUTED, GRID_STROKE, AXIS_TICK } from "./dashboardCharts/chartTheme";
import { ChartTooltip, DebtTooltip, PieTooltip, DteTooltip } from "./dashboardCharts/ChartTooltip";
import { Legend } from "./dashboardCharts/Legend";

export default function DashboardCharts({
  payrollMonths = [],
  payMix = [],
  cyclesByJob = [],
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
            <Bar dataKey="bank" name="Banco" stackId="payment" fill="url(#pay-fill)" />
            <Bar
              dataKey="cash"
              name="Efectivo"
              stackId="payment"
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
            // El onClick de Recharts 3 entrega el índice y la etiqueta del
            // punto activo, no el dato, así que la fila se busca en el array.
            // `activeIndex` puede venir como string; sin índice, se busca por
            // etiqueta.
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
            <Bar dataKey="generated" name="Deuda generada" fill="url(#debt-alt)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="paid" name="Pagado" fill="url(#debt-fill)" radius={[4, 4, 0, 0]} />
            {/* El saldo acumulado arranca del saldo real anterior a la ventana,
                así que la línea es la deuda vigente, no el flujo del período. */}
            <Line
              type="monotone"
              dataKey="balance"
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
              dataKey="workdayCount"
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

      <ChartCard title="Ciclos abiertos por faena" empty={cyclesByJob.length === 0}>
        <ResponsiveContainer width="100%" height={Math.max(190, cyclesByJob.length * 34)}>
          <BarChart data={cyclesByJob} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 0 }} barCategoryGap="26%">
            <ChartDefs id="cyc" color={ACCENT} />
            <CartesianGrid stroke={GRID_STROKE} strokeDasharray="2 5" horizontal={false} />
            <XAxis type="number" tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} />
            <YAxis type="category" dataKey="name" tick={AXIS_TICK} tickLine={false} axisLine={false} width={112} />
            <Tooltip
              cursor={{ fill: "var(--color-accent-soft)", radius: 6 }}
              content={<ChartTooltip valueFormatter={fmtNumber} />}
            />
            <Bar dataKey="cycleCount" name="Ciclos abiertos" fill="url(#cyc-fill-h)" radius={[0, 5, 5, 0]} filter="url(#cyc-shadow)" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Composición de lo devengado" hint="del período" empty={payMix.length === 0}>
        {/* Dona a la izquierda y leyenda a la derecha, con el monto y el
            porcentaje de cada categoría a la vista. */}
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
              dataKey="spent"
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

      {/* Compras vs ventas de la empresa elegida en el selector: la consulta
          a `dteDocuments`, la colección más grande, se acota a una empresa. */}
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
                  <Bar dataKey="sales" name="Ventas" fill="url(#dte-fill)" radius={[5, 5, 0, 0]} filter="url(#dte-shadow)" />
                  <Bar dataKey="purchases" name="Compras" fill="url(#dte-alt)" radius={[5, 5, 0, 0]} filter="url(#dte-shadow)" />
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
