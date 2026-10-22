import { lazy, useState, useMemo, Suspense } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useCarriers } from "../contexts/CarriersContext";
import MetricCard from "./dashboard/MetricCard";
import Modal from "../components/Modal";
import { fmtNumber, fmtCurrency, fmtPercent } from "../utils/format";
import { CommitmentsWeek } from "./dashboard/CommitmentsWeek";
import { DebtDetailList } from "./dashboard/DebtDetailList";
import ScreenLoader from "../components/ScreenLoader";
import { useDashboardData } from "./dashboard/useDashboardData";
import { useDteComparison } from "./dashboard/useDteComparison";
import {
  cycleMargins,
  DTE_MONTHS,
  operationStats,
  payrollMoneyStats,
  STALE_DAYS,
  transportDebtByMonth,
  transportStats,
} from "../utils/dashboard";

// Recharts se carga lazy, en su propio chunk: las tarjetas de KPI pintan sin
// esperarlo.
const DashboardCharts = lazy(() => import("./dashboard/DashboardCharts"));

const PERIODS = [
  { key: "1m", label: "Mes actual", months: 1 },
  { key: "3m", label: "3 meses", months: 3 },
  { key: "12m", label: "12 meses", months: 12 },
];

export default function Dashboard() {
  "use no memo";
  const { isAdmin } = useAuth();
  const { carriers } = useCarriers();
  const [period, setPeriod] = useState(PERIODS[1]);
  // Mes del gráfico de deuda abierto en el modal de detalle.
  const [debtDetail, setDebtDetail] = useState(null);
  const { commitmentsWeek, cycles, fortnights, jobs, loading, payments, payrolls, reads, workdayMonths } =
    useDashboardData();
  const dte = useDteComparison();

  const periodMonths = period.months;

  const money = useMemo(() => payrollMoneyStats(payrolls, periodMonths), [payrolls, periodMonths]);

  const ops = useMemo(() => operationStats(cycles, jobs, workdayMonths), [cycles, jobs, workdayMonths]);

  const transport = useMemo(
    () => transportStats(payments, fortnights, carriers, periodMonths),
    [payments, fortnights, carriers, periodMonths],
  );

  const debt = useMemo(() => transportDebtByMonth(payments, carriers, fortnights), [payments, carriers, fortnights]);

  const margin = useMemo(() => cycleMargins(cycles), [cycles]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Plata, operación y transporte de un vistazo.
            {isAdmin && !loading && (
              <span className="ml-1 text-xs">
                {reads + dte.reads === 0 ? "· desde caché" : `· ${fmtNumber(reads + dte.reads)} lecturas`}
              </span>
            )}
          </p>
        </div>
        <div className="flex rounded-md overflow-hidden border border-[var(--color-border)] text-xs">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 ${
                p.key === period.key
                  ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)] font-medium"
                  : "bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <ScreenLoader />
      ) : (
        <div className="space-y-6">
          <section>
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
              Plata pagada a trabajadores
            </h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <MetricCard
                label={`Pagado · ${period.label.toLowerCase()}`}
                value={fmtCurrency(money.periodTotal)}
                hint={`${money.periodCount} nómina${money.periodCount === 1 ? "" : "s"}`}
                highlight
              />
              <MetricCard
                label="Nóminas pendientes"
                value={fmtNumber(money.pendingCount)}
                hint={money.pendingCount > 0 ? fmtCurrency(money.pendingTotal) : "todo pagado"}
                warning={money.pendingCount > 0}
              />
              <MetricCard
                label="Efectivo"
                value={fmtPercent(money.cashShare, 1)}
                hint={fmtCurrency(money.periodCash)}
                title="Proporción del pago que salió en efectivo en vez de transferencia."
              />
              <MetricCard
                label="Anticipos descontados"
                value={fmtCurrency(money.periodAdvances)}
                hint="en el período"
              />
              <MetricCard
                label="Última nómina"
                value={money.lastPayroll ? fmtNumber(money.lastPayroll.workerCount || 0) : "—"}
                hint={money.lastPayroll ? `trabajadores · ${money.lastPayroll.name || ""}` : "sin nóminas"}
              />
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
              Operación
            </h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <MetricCard
                label="Ciclos abiertos"
                value={fmtNumber(ops.openCount)}
                hint={`${ops.closedCount} cerrados`}
                highlight
              />
              <MetricCard label="Faenas con actividad" value={fmtNumber(ops.activeJobs)} hint={`de ${jobs.length}`} />
              <MetricCard
                label="Registros de jornada"
                value={ops.workdaysCurrent == null ? "—" : fmtNumber(ops.workdaysCurrent)}
                hint={
                  ops.workdaysDelta == null
                    ? "mes actual"
                    : `${ops.workdaysDelta >= 0 ? "+" : ""}${fmtPercent(ops.workdaysDelta, 0)} vs mes anterior`
                }
                title="Registros de jornada del mes en curso. Incluye piso y asistencia de trabajadores mensuales, así que no es exactamente la cuenta de jornadas pagadas."
              />
              <MetricCard
                label="Ciclos estancados"
                value={fmtNumber(ops.stale.length)}
                hint={`sin movimiento hace ${STALE_DAYS}+ días`}
                warning={ops.stale.length > 0}
              />
              <MetricCard
                label="Margen de ciclos"
                value={margin.covered > 0 ? fmtCurrency(margin.marginSum) : "—"}
                hint={
                  margin.covered > 0
                    ? `${fmtPercent(margin.pct, 1)} · ${margin.missing} sin tarifas`
                    : "sin resúmenes de cobro"
                }
                title="Diferencia entre lo que se cobra al cliente y lo que se paga, para los ciclos cuyo resumen de cobro ya fue configurado."
              />
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
              Transporte
            </h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <MetricCard
                label="Gasto del período"
                value={fmtCurrency(transport.periodSpend)}
                hint={`${transport.carrierCount} transportistas`}
              />
              <MetricCard
                label="Pendiente de pago"
                value={fmtCurrency(transport.periodPending)}
                hint="resúmenes del período"
                warning={transport.periodPending > 0}
              />
              <MetricCard
                label="Quincenas pendientes"
                value={fmtNumber(transport.pendingFortnightCount)}
                hint={transport.pendingFortnightCount > 0 ? fmtCurrency(transport.pendingFortnightTotal) : "ninguna"}
                warning={transport.pendingFortnightCount > 0}
              />
              <MetricCard
                label="Concentración top 3"
                value={fmtPercent(transport.concentration, 0)}
                hint="del gasto del período"
                title="Qué porcentaje del gasto en transporte se lo llevan los tres transportistas más grandes."
              />
            </div>
          </section>

          {commitmentsWeek && <CommitmentsWeek data={commitmentsWeek} />}

          <Suspense
            fallback={
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center text-xs text-[var(--color-muted)]">
                Cargando gráficos...
              </div>
            }
          >
            <DashboardCharts
              payrollMonths={money.months}
              payMix={money.mix}
              cyclesByJob={ops.cyclesByJob}
              carrierSpend={transport.spend}
              transportMonths={transport.months}
              debtMonths={debt}
              workdayMonths={workdayMonths}
              onDebtMonthClick={setDebtDetail}
              dte={{
                companies: dte.companies,
                companyId: dte.companyId,
                onSelectCompany: dte.setCompanyId,
                error: dte.error,
                rows: dte.rows,
                busy: dte.busy,
                months: DTE_MONTHS,
              }}
            />
          </Suspense>

          {ops.stale.length > 0 && (
            <section>
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                Ciclos abiertos sin movimiento
              </h2>
              <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
                {ops.stale.slice(0, 10).map(({ cycle, last, job }) => (
                  <Link
                    key={cycle.id}
                    to={`/cycles/${cycle.id}`}
                    className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-3 py-2 text-sm last:border-b-0 hover:bg-[var(--color-accent-soft)]"
                  >
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{cycle.label}</span>
                      {job && <span className="ml-2 text-xs text-[var(--color-muted)]">{job}</span>}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-[var(--color-muted)]">último día {last}</span>
                  </Link>
                ))}
                {ops.stale.length > 10 && (
                  <div className="px-3 py-2 text-xs text-[var(--color-muted)]">+{ops.stale.length - 10} más</div>
                )}
              </div>
            </section>
          )}

          {margin.rows.length > 0 && (
            <section>
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                Margen por ciclo
              </h2>
              <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
                <table className="w-full text-sm">
                  <thead className="text-left text-[11px] uppercase tracking-wide text-[var(--color-muted)]">
                    <tr className="border-b border-[var(--color-border)]">
                      <th className="px-3 py-2 font-medium">Ciclo</th>
                      <th className="px-3 py-2 text-right font-medium">Cobrar</th>
                      <th className="px-3 py-2 text-right font-medium">Pagar</th>
                      <th className="px-3 py-2 text-right font-medium">Margen</th>
                      <th className="px-3 py-2 text-right font-medium">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {margin.rows.slice(0, 8).map((r) => (
                      <tr key={r.cycle.id} className="border-b border-[var(--color-border)] last:border-b-0">
                        <td className="px-3 py-1.5">
                          <Link to={`/cycles/${r.cycle.id}`} className="hover:text-[var(--color-accent)]">
                            {r.cycle.label}
                          </Link>
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{fmtCurrency(r.cobrar)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{fmtCurrency(r.pagar)}</td>
                        <td
                          className={`px-3 py-1.5 text-right font-medium tabular-nums ${
                            r.marginAmount < 0 ? "text-[var(--color-danger)]" : ""
                          }`}
                        >
                          {fmtCurrency(r.marginAmount)}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-[var(--color-muted)]">
                          {fmtPercent(r.pct, 1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-1 text-[11px] text-[var(--color-muted)]">
                Solo aparecen los ciclos cuyo resumen "Para cobrar" ya fue configurado ({margin.covered} de{" "}
                {margin.total}).
              </p>
            </section>
          )}
        </div>
      )}

      <Modal
        open={!!debtDetail}
        onClose={() => setDebtDetail(null)}
        title={`🚐 Movimientos de ${debtDetail?.label || ""}`}
        size="lg"
        footer={
          <button
            onClick={() => setDebtDetail(null)}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)]"
          >
            Cerrar
          </button>
        }
      >
        {debtDetail && (
          <div className="space-y-4">
            <DebtDetailList
              title="Deuda generada"
              items={debtDetail.createdItems}
              total={debtDetail.generated}
              color="var(--color-warning)"
            />
            <div>
              <DebtDetailList
                title="Pagado"
                items={debtDetail.paidItems}
                total={debtDetail.paid}
                color="var(--color-accent)"
              />
              {debtDetail.paidItems.length > 0 && (
                <p className="mt-1.5 rounded-md border border-[var(--color-warning)] bg-[var(--color-warning-soft)] px-3 py-2 text-[11px] text-[var(--color-warning)]">
                  ⚠ La fecha de pago es la del día en que se marcó como pagado en el sistema, no necesariamente la del
                  día en que se entregó la plata. Si un resumen se marcó días después, ese pago aparece en la fecha en
                  que se registró.
                </p>
              )}
            </div>
            <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-sm">
              <div className="flex items-baseline gap-2">
                <span className="text-[var(--color-muted)]">Saldo al cierre del mes</span>
                <span className="ml-auto font-semibold tabular-nums">{fmtCurrency(debtDetail.balance)}</span>
              </div>
              <div
                className={`mt-1 text-xs font-medium ${
                  debtDetail.net > 0
                    ? "text-[var(--color-accent)]"
                    : debtDetail.net < 0
                      ? "text-[var(--color-warning)]"
                      : "text-[var(--color-muted)]"
                }`}
              >
                {debtDetail.net > 0
                  ? `Se pagó ${fmtCurrency(debtDetail.net)} más de lo generado`
                  : debtDetail.net < 0
                    ? `Se pagó ${fmtCurrency(-debtDetail.net)} menos de lo generado`
                    : "Se pagó exactamente lo generado"}
              </div>
              <p className="mt-2 text-[11px] text-[var(--color-muted)]">
                La deuda se cuenta en el mes del período que cubre el resumen, no en el día en que se armó. Los pagos y
                abonos van por su fecha real. Un resumen saldado muestra el remanente que se pagó al marcarlo, no su
                total original: lo que ya se había abonado antes aparece en el mes de cada abono.
              </p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
