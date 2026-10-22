import { lazy, useState, useEffect, useMemo, Suspense } from "react";
import { Link } from "react-router-dom";
import {
  companiesService,
  dteDocumentsService,
  jobsService,
  cyclesService,
  transportPaymentsService,
} from "../services";
import { payrollsService } from "../services/payrollsService";
import { fortnightsService } from "../services/transportsService";
import { commitmentsService } from "../services/commitmentsService";
import { countedList } from "../services/cache";
import { useAuth } from "../contexts/AuthContext";
import { useCarriers } from "../contexts/CarriersContext";
import { useToast } from "../contexts/ToastContext";
import MetricCard from "./dashboard/MetricCard";
import Modal from "../components/Modal";
import { fmtMonthKey, fmtNumber, fmtCurrency, fmtPercent } from "../utils/format";
import { localIsoDate } from "../utils/dates";
import { countWorkdaysInRange } from "../services/countsService";
import { CommitmentsWeek } from "./dashboard/CommitmentsWeek";
import { DebtDetailList } from "./dashboard/DebtDetailList";
import ScreenLoader from "../components/ScreenLoader";
import {
  commitmentsWeekOf,
  cycleMargins,
  DTE_MONTHS,
  dteMonthlyTotals,
  lastMonthKeys,
  monthRangeOfKey,
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
  const { isAdmin } = useAuth();
  const { carriers } = useCarriers();
  const toast = useToast();
  const [periodKey, setPeriodKey] = useState("3m");
  const [loading, setLoading] = useState(true);
  const [reads, setReads] = useState(0);
  const [jobs, setJobs] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [payrolls, setPayrolls] = useState([]);
  const [fortnights, setFortnights] = useState([]);
  const [payments, setPayments] = useState([]);
  const [workdayMonths, setWorkdayMonths] = useState([]);
  const [countReads, setCountReads] = useState(0);
  // Mes del gráfico de deuda abierto en el modal de detalle.
  const [debtDetail, setDebtDetail] = useState(null);
  // Comparativa compras/ventas, de una empresa a la vez: `dteDocuments` es la
  // colección más grande del sistema y la consulta se acota a la empresa
  // elegida.
  const [dteCompanies, setDteCompanies] = useState([]);
  const [dteCompanyId, setDteCompanyId] = useState("");
  const [dteRows, setDteRows] = useState(null);
  const [dteBusy, setDteBusy] = useState(false);
  const [dteReads, setDteReads] = useState(0);
  const [dteError, setDteError] = useState("");
  const [commitments, setCommitments] = useState(null);
  const [commitmentReads, setCommitmentReads] = useState(0);

  const period = PERIODS.find((p) => p.key === periodKey) || PERIODS[1];
  const periodMonths = period.months;

  // Serie de actividad de los últimos 12 meses. Un `getCountFromServer` por mes
  // = 12 lecturas para el año entero, contra las decenas de miles que costaría
  // traerse las filas. No depende del selector de período: se pide una sola vez
  // por sesión y alimenta tanto la tarjeta como el gráfico de historia.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const keys = lastMonthKeys(12);
      try {
        const counts = await Promise.all(
          keys.map((k) => {
            const { start, end } = monthRangeOfKey(k);
            return countWorkdaysInRange(start, end);
          }),
        );
        if (cancelled) return;
        setWorkdayMonths(keys.map((k, i) => ({ key: k, label: fmtMonthKey(k), workdayCount: counts[i] })));
        setCountReads(keys.length);
      } catch (err) {
        if (!cancelled) console.error("[dashboard] conteo de jornadas:", err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Catálogo de empresas para el selector. Misma clave de caché que
  // Facturación: no cuesta lecturas si esa pantalla ya lo cargó.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, reads } = await countedList(companiesService, {
          order: ["razonSocial", "asc"],
          cache: true,
          ttl: 600_000,
        });
        if (cancelled) return;
        setDteCompanies(data);
        setDteCompanyId((prev) => prev || data[0]?.id || "");
        setDteReads((r) => r + reads);
      } catch (err) {
        if (!cancelled) console.error("[dashboard] empresas:", err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Comparativa de la empresa elegida. Carga sola con la primera empresa y se
  // rehace al cambiar de empresa. Va por el servicio para quedar cacheada y
  // persistida: salir del Dashboard y volver dentro de 10 minutos no relee.
  useEffect(() => {
    if (!dteCompanyId) return;
    let cancelled = false;
    setDteRows(null);
    setDteError("");
    setDteBusy(true);
    (async () => {
      try {
        const { data, reads } = await countedList(dteDocumentsService, {
          wheres: [
            ["companyId", "==", dteCompanyId],
            ["periodo", "in", lastMonthKeys(DTE_MONTHS)],
          ],
          cache: true,
          persist: true,
          ttl: 600_000,
        });
        if (cancelled) return;
        setDteRows(dteMonthlyTotals(data, lastMonthKeys(DTE_MONTHS)));
        setDteReads((r) => r + reads);
      } catch (err) {
        if (cancelled) return;
        // La consulta cruza `companyId` con `periodo` y puede pedir un índice
        // compuesto. El mensaje de Firestore trae el link para crearlo: va a la
        // consola del navegador.
        console.error("[dashboard] comparativa de facturación:", err);
        setDteError(
          err.code === "failed-precondition"
            ? "Falta un índice en Firestore para esta consulta (el detalle está en la consola del navegador)."
            : "No se pudo cargar la facturación de esta empresa.",
        );
      } finally {
        if (!cancelled) setDteBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [dteCompanyId]);

  // Cheques y pagos, aparte de la carga principal: si falla, el resto del
  // tablero se muestra igual. Las opciones son las de `listCommitments`, así
  // comparte la caché con la pantalla.
  useEffect(() => {
    let cancelled = false;
    countedList(commitmentsService, { order: ["dueDate", "asc"], cache: true, ttl: 300_000 })
      .then(({ data, reads }) => {
        if (cancelled) return;
        setCommitments(data);
        setCommitmentReads(reads);
      })
      .catch((err) => console.error("[dashboard] cheques y pagos:", err));
    return () => { cancelled = true; };
  }, []);

  const commitmentsWeek = useMemo(
    () => (commitments ? commitmentsWeekOf(commitments, localIsoDate()) : null),
    [commitments],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Los resúmenes de transporte se traen siempre por 12 meses (la ventana
        // más larga que se puede pedir) y todo lo que depende del período se
        // filtra en cliente. Así cambiar de período no cuesta ninguna lectura,
        // y la curva de deuda tiene el histórico completo que necesita.
        const historyStart = `${lastMonthKeys(12)[0]}-01`;
        const [f, c, p, q, pays] = await Promise.all([
          // Las tres primeras copian las opciones exactas de Faenas/Transporte/
          // Nóminas para compartir clave de caché y salir gratis.
          countedList(jobsService, { order: ["name", "asc"], cache: true, persist: true, ttl: 10 * 60 * 1000 }),
          countedList(cyclesService, { cache: true, persist: true, ttl: 5 * 60 * 1000 }),
          countedList(payrollsService, { order: ["createdAt", "desc"], take: 50, cache: true, persist: true, ttl: 5 * 60 * 1000 }),
          fortnightsService.listAll(),
          transportPaymentsService.listSince(new Date(historyStart)),
        ]);
        if (cancelled) return;
        setJobs(f.data);
        setCycles(c.data);
        setPayrolls(p.data);
        setFortnights(q);
        setPayments(pays);
        setReads(f.reads + c.reads + p.reads + q.length + pays.length);
      } catch (err) {
        if (!cancelled) {
          console.error("[dashboard] carga:", err);
          toast.error("No se pudo cargar el dashboard: " + (err.message || err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
                {reads + countReads + dteReads + commitmentReads === 0
                  ? "· desde caché"
                  : `· ${fmtNumber(reads + countReads + dteReads + commitmentReads)} lecturas`}
              </span>
            )}
          </p>
        </div>
        <div className="flex rounded-md overflow-hidden border border-[var(--color-border)] text-xs">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriodKey(p.key)}
              className={`px-3 py-1.5 ${
                p.key === periodKey
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
                companies: dteCompanies,
                companyId: dteCompanyId,
                onSelectCompany: setDteCompanyId,
                error: dteError,
                rows: dteRows,
                busy: dteBusy,
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
