import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection, getCountFromServer, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { faenasService, cyclesService, transportPaymentsService, companiesService, dteDocumentsService } from "../services";
import { payrollsService } from "../services/payrollsService";
import { transportPayrollsService } from "../services/transportsService";
import { cacheKey, getCache } from "../services/cache";
import { useAuth } from "../contexts/AuthContext";
import { useCarriers } from "../contexts/CarriersContext";
import { useToast } from "../contexts/ToastContext";
import MetricCard from "../components/MetricCard";
import Modal from "../components/Modal";
import { fmtCurrency, fmtMonthKey, fmtNumber, fmtPercent, fmtShortDate } from "../utils/format";

// Recharts pesa, y el bundle ya viene con warning de tamaño. Cargándolo con
// lazy queda en su propio chunk y las tarjetas de KPI pintan sin esperarlo.
const DashboardCharts = lazy(() => import("../components/DashboardCharts"));

const PERIODS = [
  { key: "1m", label: "Mes actual", months: 1 },
  { key: "3m", label: "3 meses", months: 3 },
  { key: "12m", label: "12 meses", months: 12 },
];

// Un ciclo abierto cuyo último día cargado quedó más atrás que esto se
// considera olvidado. No hay nada que lo cierre solo — es justamente el tipo
// de cosa que se escapa y por eso vale la pena tenerla en la portada.
const STALE_DAYS = 14;

const monthKeyOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const isoOf = (d) => `${monthKeyOf(d)}-${String(d.getDate()).padStart(2, "0")}`;

// Últimas N claves de mes, de la más vieja a la más nueva.
function lastMonthKeys(n) {
  const out = [];
  const base = new Date();
  for (let i = n - 1; i >= 0; i--) {
    out.push(monthKeyOf(new Date(base.getFullYear(), base.getMonth() - i, 1)));
  }
  return out;
}

// "2026-09" -> { start: "2026-09-01", end: "2026-09-30" }
function monthRangeOfKey(key) {
  const [y, m] = String(key).split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return { start: `${key}-01`, end: `${key}-${String(lastDay).padStart(2, "0")}` };
}

// Timestamp de Firestore -> "YYYY-MM-DD". Devuelve "" si no hay fecha.
function tsToIso(ts) {
  const d = ts?.toDate?.() || (ts?.seconds ? new Date(ts.seconds * 1000) : null);
  return d ? isoOf(d) : "";
}

// A qué fecha se atribuye un resumen de transporte. Va por el período que
// cubre y no por `createdAt`: el resumen de la segunda semana de agosto se
// suele armar recién en septiembre, y contarlo en septiembre corre el gasto de
// mes. Se toma el punto medio de [periodFrom, periodTo] porque cuando el
// período cruza el cambio de mes, el medio cae en el mes que tiene la mayoría
// de los días (28-ago a 3-sep → 31-ago → agosto).
//
// `periodFrom`/`periodTo` son el rango con que se creó el resumen y no se
// recalculan si después se le agregan vueltas, así que pueden quedar algo más
// angostos que las fechas reales — igual es mucho mejor referencia que la
// fecha de creación. Si el resumen no trae período, cae a `createdAt`.
function paymentPeriodDate(p) {
  const from = p.periodFrom || p.periodTo;
  const to = p.periodTo || p.periodFrom;
  if (!from) return tsToIso(p.createdAt);
  const a = new Date(`${from}T00:00:00`).getTime();
  const b = new Date(`${to}T00:00:00`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return tsToIso(p.createdAt);
  return isoOf(new Date((a + b) / 2));
}

// La nómina se fecha por `paidAt` (string ISO) si ya se pagó; si no, por el
// `createdAt` (Timestamp de Firestore).
function payrollMonthKey(p) {
  if (p.paidAt) return String(p.paidAt).slice(0, 7);
  const d = p.createdAt?.toDate?.() || (p.createdAt?.seconds ? new Date(p.createdAt.seconds * 1000) : null);
  return d ? monthKeyOf(d) : null;
}

// Listado completo de los movimientos de un mes en el modal de detalle. En el
// tooltip del gráfico solo entran los más grandes; acá va todo.
function DebtDetailList({ title, items, total, color }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">{title}</h3>
        <span className="ml-auto font-semibold tabular-nums">{fmtCurrency(total)}</span>
      </div>
      {items.length === 0 ? (
        <p className="px-2 py-1.5 text-xs text-[var(--color-muted)]">Sin movimientos este mes.</p>
      ) : (
        <ul className="rounded-md border border-[var(--color-border)]">
          {items.map((it, i) => (
            <li
              key={`${it.name}-${it.kind}-${i}`}
              className="border-b border-[var(--color-border)] px-3 py-2 last:border-b-0"
            >
              <div className="flex items-center gap-2 text-sm">
                <span className="min-w-0 truncate">{it.name}</span>
                <span
                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                    it.kind === "abono"
                      ? "bg-[var(--color-warning-soft)] text-[var(--color-warning)]"
                      : "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                  }`}
                >
                  {it.kind}
                </span>
                <span className="ml-auto shrink-0 tabular-nums">{fmtCurrency(it.amount)}</span>
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-[var(--color-muted)]">
                <span>{it.period ? `Período ${it.period}` : "Sin período cargado"}</span>
                <span>{it.quincena ? `Quincena: ${it.quincena}` : "Resumen suelto"}</span>
                {it.date && (
                  <span>
                    {it.marked ? "Marcado pagado el" : "Abonado el"} {fmtShortDate(it.date)}
                  </span>
                )}
              </div>
              {it.notes && <div className="mt-0.5 text-[11px] italic text-[var(--color-muted)]">{it.notes}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const pendingOfPayment = (p) => {
  const total = Number(p?.total) || 0;
  const abonado = (p?.abonos || []).reduce((s, a) => s + (Number(a.amount) || 0), 0);
  return Math.max(0, total - abonado);
};

// Envuelve un `list()` cacheado para saber si efectivamente pagó lecturas o
// salió del caché. Reconstruye la misma clave que arma `firestoreBase.list`
// (`collection::{wheres,order,take}`) — por eso las opciones de acá tienen que
// coincidir exactamente con las de las otras pantallas.
async function countedList(service, opts) {
  const key = cacheKey(service.collectionName, {
    wheres: opts.wheres || [],
    order: opts.order,
    take: opts.take,
  });
  const warm = getCache(key, { persist: !!opts.persist }) !== undefined;
  const data = await service.list(opts);
  return { data, reads: warm ? 0 : data.length };
}

// Notas de crédito: restan del total del período. Mismo criterio que
// `Facturacion.jsx` para que los números de las dos pantallas coincidan.
const CREDIT_NOTE_TYPES = new Set([61, 112]);
// Ventana de la comparativa de facturación. 6 meses entra cómodo en el límite
// de 30 valores del operador `in`.
const DTE_MONTHS = 6;

async function countWorkdaysInRange(from, to) {
  const q = query(collection(db, "workdays"), where("date", ">=", from), where("date", "<=", to));
  const snap = await getCountFromServer(q);
  return snap.data().count;
}

export default function Dashboard() {
  const { isAdmin } = useAuth();
  const { carriers } = useCarriers();
  const toast = useToast();
  const [periodKey, setPeriodKey] = useState("3m");
  const [loading, setLoading] = useState(true);
  const [reads, setReads] = useState(0);
  const [faenas, setFaenas] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [payrolls, setPayrolls] = useState([]);
  const [quincenas, setQuincenas] = useState([]);
  const [payments, setPayments] = useState([]);
  const [workdayMonths, setWorkdayMonths] = useState([]);
  const [countReads, setCountReads] = useState(0);
  // Mes del gráfico de deuda abierto en el modal de detalle.
  const [debtDetail, setDebtDetail] = useState(null);
  // Comparativa compras/ventas. `dteDocuments` es la colección más grande del
  // sistema, así que primero se consulta cuánto costaría (1 lectura) y la carga
  // queda a criterio del usuario.
  const [dteCompanies, setDteCompanies] = useState([]);
  const [dteCompanyId, setDteCompanyId] = useState("");
  const [dteRows, setDteRows] = useState(null);
  const [dteBusy, setDteBusy] = useState(false);
  const [dteReads, setDteReads] = useState(0);
  const [dteError, setDteError] = useState("");

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
        setWorkdayMonths(keys.map((k, i) => ({ key: k, label: fmtMonthKey(k), jornadas: counts[i] })));
        setCountReads(keys.length);
      } catch (err) {
        if (!cancelled) console.error("[dashboard] conteo de jornadas:", err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Catálogo de empresas para el selector. Misma clave de caché que
  // Facturación, así que es gratis si ya pasaste por esa pantalla.
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
        const byMonth = new Map(
          lastMonthKeys(DTE_MONTHS).map((k) => [k, { key: k, label: fmtMonthKey(k), ventas: 0, compras: 0 }]),
        );
        for (const d of data) {
          const row = byMonth.get(d.periodo);
          if (!row) continue;
          // `total` ya viene con IVA incluido. Las notas de crédito restan.
          const amount = (CREDIT_NOTE_TYPES.has(Number(d.tipo)) ? -1 : 1) * (Number(d.total) || 0);
          if (d.kind === "venta") row.ventas += amount;
          else row.compras += amount;
        }
        setDteRows([...byMonth.values()].map((r) => ({ ...r, diferencia: r.ventas - r.compras })));
        setDteReads((r) => r + reads);
      } catch (err) {
        if (cancelled) return;
        // La consulta cruza `companyId` con `periodo`, así que puede pedir un
        // índice compuesto. Firestore manda el link para crearlo dentro del
        // mensaje — eso va a consola, que es donde sirve.
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
          countedList(faenasService, { order: ["name", "asc"], cache: true, persist: true, ttl: 10 * 60 * 1000 }),
          countedList(cyclesService, { cache: true, persist: true, ttl: 5 * 60 * 1000 }),
          countedList(payrollsService, { order: ["createdAt", "desc"], take: 50, cache: true, persist: true, ttl: 5 * 60 * 1000 }),
          transportPayrollsService.listAll(),
          transportPaymentsService.listSince(new Date(historyStart)),
        ]);
        if (cancelled) return;
        setFaenas(f.data);
        setCycles(c.data);
        setPayrolls(p.data);
        setQuincenas(q);
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

  const money = useMemo(() => {
    const keys = lastMonthKeys(periodMonths);
    const keySet = new Set(keys);
    const byMonth = new Map(keys.map((k) => [k, { key: k, label: fmtMonthKey(k), banco: 0, efectivo: 0, total: 0 }]));
    let periodTotal = 0, periodCash = 0, periodAdvances = 0, periodCount = 0;
    let pendingCount = 0, pendingTotal = 0;
    for (const p of payrolls) {
      if (p.status !== "paid") {
        pendingCount += 1;
        pendingTotal += Number(p.total) || 0;
      }
      const mk = payrollMonthKey(p);
      if (!mk || !keySet.has(mk)) continue;
      const row = byMonth.get(mk);
      row.banco += Number(p.bankTotal) || 0;
      row.efectivo += Number(p.cashTotal) || 0;
      row.total += Number(p.total) || 0;
      periodTotal += Number(p.total) || 0;
      periodCash += Number(p.cashTotal) || 0;
      periodAdvances += Number(p.advanceTotal) || 0;
      periodCount += 1;
    }
    return {
      months: [...byMonth.values()],
      periodTotal,
      periodCash,
      periodAdvances,
      periodCount,
      cashShare: periodTotal > 0 ? (periodCash / periodTotal) * 100 : 0,
      pendingCount,
      pendingTotal,
      lastPayroll: payrolls[0] || null,
      // Composición de lo devengado en el período: lo que se transfirió, lo
      // que se pagó en efectivo y lo que quedó retenido como anticipo (ya se
      // había entregado antes, por eso no está en `total`).
      mix: [
        { name: "Banco", value: periodTotal - periodCash },
        { name: "Efectivo", value: periodCash },
        { name: "Anticipos", value: periodAdvances },
      ].filter((s) => s.value > 0),
    };
  }, [payrolls, periodMonths]);

  const ops = useMemo(() => {
    const faenaName = new Map(faenas.map((f) => [f.id, f.name]));
    const open = cycles.filter((c) => c.status !== "closed");
    const byFaena = new Map();
    for (const c of open) {
      byFaena.set(c.faenaId, (byFaena.get(c.faenaId) || 0) + 1);
    }
    const cyclesByFaena = [...byFaena.entries()]
      .map(([id, ciclos]) => ({ name: faenaName.get(id) || "(sin faena)", ciclos }))
      .sort((a, b) => b.ciclos - a.ciclos)
      .slice(0, 8);

    // Última actividad = el día más reciente cargado en el ciclo. Si nunca se
    // le cargó un día, cae a la fecha de inicio.
    const cutoff = isoOf(new Date(Date.now() - STALE_DAYS * 86400000));
    const stale = open
      .map((c) => {
        const days = Array.isArray(c.days) ? c.days : [];
        const last = days.length ? days.reduce((a, b) => (a > b ? a : b)) : (c.startDate || "");
        return { cycle: c, last, faena: faenaName.get(c.faenaId) || "" };
      })
      .filter((x) => x.last && x.last < cutoff)
      .sort((a, b) => (a.last < b.last ? -1 : 1));

    const current = workdayMonths.at(-1)?.jornadas ?? null;
    const previous = workdayMonths.at(-2)?.jornadas ?? null;
    const delta = previous > 0 ? ((current - previous) / previous) * 100 : null;
    return {
      openCount: open.length,
      closedCount: cycles.length - open.length,
      activeFaenas: byFaena.size,
      cyclesByFaena,
      stale,
      workdaysCurrent: current,
      workdaysDelta: delta,
    };
  }, [cycles, faenas, workdayMonths]);

  const transport = useMemo(() => {
    const alias = new Map(carriers.map((c) => [c.id, c.alias || c.name || c.id]));
    const byCarrier = new Map();
    let periodSpend = 0;
    let periodPending = 0;
    // Los resúmenes vienen por 12 meses; el período se recorta acá.
    const periodStart = `${lastMonthKeys(periodMonths)[0]}-01`;
    for (const p of payments) {
      if (paymentPeriodDate(p) < periodStart) continue;
      const id = p.carrierId || "?";
      const row = byCarrier.get(id) || { name: alias.get(id) || id, total: 0, pending: 0 };
      const total = Number(p.total) || 0;
      row.total += total;
      periodSpend += total;
      if (p.status !== "paid") {
        const pend = pendingOfPayment(p);
        row.pending += pend;
        periodPending += pend;
      }
      byCarrier.set(id, row);
    }
    // Gasto mes a mes, fechado por el período que cubre el resumen. Ventana
    // fija de 6 meses: deja ver tendencia sin que las barras se aplasten.
    const keys = lastMonthKeys(6);
    const byMonth = new Map(keys.map((k) => [k, { key: k, label: fmtMonthKey(k), gasto: 0 }]));
    for (const p of payments) {
      const mk = paymentPeriodDate(p).slice(0, 7);
      if (byMonth.has(mk)) byMonth.get(mk).gasto += Number(p.total) || 0;
    }

    const spend = [...byCarrier.values()].sort((a, b) => b.total - a.total).slice(0, 8);
    const top3 = spend.slice(0, 3).reduce((s, r) => s + r.total, 0);
    const pendingQuincenas = quincenas.filter((q) => q.status !== "paid");
    return {
      spend,
      months: [...byMonth.values()],
      periodSpend,
      periodPending,
      concentration: periodSpend > 0 ? (top3 / periodSpend) * 100 : 0,
      carrierCount: byCarrier.size,
      pendingQuincenaCount: pendingQuincenas.length,
      pendingQuincenaTotal: pendingQuincenas.reduce((s, q) => s + (Number(q.total) || 0), 0),
    };
  }, [payments, quincenas, carriers, periodMonths]);

  // Cómo fue variando la deuda con los transportistas.
  //
  // La unidad de deuda es el RESUMEN (`transportPayments`), no la quincena: la
  // quincena es apenas una agrupación de resúmenes, así que contar las dos
  // duplicaría los montos. La deuda nace cuando se crea el resumen y baja de
  // dos formas — por abonos parciales (cada uno con su propia fecha) o cuando
  // se marca el resumen como pagado, que salda el remanente. Así el gráfico
  // refleja tanto lo que se debe como lo que efectivamente se fue pagando.
  //
  // La deuda se fecha por el período que cubre el resumen (`paymentPeriodDate`),
  // no por cuándo se armó; los pagos sí van por su fecha real, que es cuando la
  // plata se movió.
  //
  // Lo que cae antes de la ventana de 12 meses se acumula en un saldo inicial
  // para que la línea sea el saldo vigente y no solo el flujo de la ventana.
  // Ojo: los resúmenes se traen por `createdAt` de los últimos 12 meses, así
  // que una deuda más vieja que eso y todavía impaga no entra en ese saldo.
  const debt = useMemo(() => {
    const alias = new Map(carriers.map((c) => [c.id, c.alias || c.name || c.id]));
    const quincenaName = new Map(quincenas.map((q) => [q.id, q.name || q.id]));
    const keys = lastMonthKeys(12);
    const from = `${keys[0]}-01`;
    const rows = new Map(
      keys.map((k) => [
        k,
        { key: k, label: fmtMonthKey(k), generado: 0, pagado: 0, pagos: [], nuevos: [] },
      ]),
    );
    let saldo = 0;
    // `detail` alimenta el desglose del tooltip: qué resúmenes y qué abonos
    // componen la barra de ese mes.
    const apply = (date, field, amount, detail) => {
      if (!date || amount <= 0) return;
      if (date < from) {
        saldo += field === "generado" ? amount : -amount;
        return;
      }
      const row = rows.get(date.slice(0, 7));
      if (!row) return;
      row[field] += amount;
      if (field === "generado") row.nuevos.push(detail);
      else row.pagos.push(detail);
    };
    for (const p of payments) {
      const total = Number(p.total) || 0;
      if (total <= 0) continue;
      // Contexto común a todas las entradas que genera este resumen, para que
      // el modal pueda mostrar de qué período es y a qué quincena pertenece.
      const ctx = {
        name: alias.get(p.carrierId) || p.carrierId || "—",
        period:
          p.periodFrom || p.periodTo
            ? [fmtShortDate(p.periodFrom), fmtShortDate(p.periodTo)].filter(Boolean).join(" → ")
            : "",
        quincena: p.payrollId ? quincenaName.get(p.payrollId) || "" : "",
      };
      apply(paymentPeriodDate(p), "generado", total, { ...ctx, amount: total, kind: "resumen" });
      let abonado = 0;
      for (const a of p.abonos || []) {
        const amt = Number(a.amount) || 0;
        abonado += amt;
        const date = String(a.date || "").slice(0, 10);
        apply(date, "pagado", amt, { ...ctx, amount: amt, kind: "abono", date, notes: a.notes || "" });
      }
      if (p.status === "paid") {
        const resto = Math.max(0, total - abonado);
        const date = tsToIso(p.paidAt);
        apply(date, "pagado", resto, { ...ctx, amount: resto, kind: "resumen", date, marked: true });
      }
    }
    const byAmount = (a, b) => b.amount - a.amount;
    return keys.map((k) => {
      const r = rows.get(k);
      saldo += r.generado - r.pagado;
      return { ...r, pagos: r.pagos.sort(byAmount), nuevos: r.nuevos.sort(byAmount), saldo, neto: r.pagado - r.generado };
    });
  }, [payments, carriers, quincenas]);

  const margin = useMemo(() => {
    const rows = cycles
      .filter((c) => Number(c.summaryTotals?.cobrar) > 0)
      .map((c) => {
        const cobrar = Number(c.summaryTotals.cobrar) || 0;
        const pagar = Number(c.summaryTotals.pagar) || 0;
        return { cycle: c, cobrar, pagar, margen: cobrar - pagar, pct: ((cobrar - pagar) / cobrar) * 100 };
      })
      .sort((a, b) => b.margen - a.margen);
    const cobrarSum = rows.reduce((s, r) => s + r.cobrar, 0);
    const margenSum = rows.reduce((s, r) => s + r.margen, 0);
    return {
      rows,
      covered: rows.length,
      total: cycles.length,
      missing: cycles.length - rows.length,
      margenSum,
      pct: cobrarSum > 0 ? (margenSum / cobrarSum) * 100 : 0,
    };
  }, [cycles]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Plata, operación y transporte de un vistazo.
            {isAdmin && !loading && (
              <span className="ml-1 text-xs">
                {reads + countReads + dteReads === 0
                  ? "· desde caché"
                  : `· ${fmtNumber(reads + countReads + dteReads)} lecturas`}
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
        <div className="text-[var(--color-muted)]">Cargando...</div>
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
              <MetricCard label="Faenas con actividad" value={fmtNumber(ops.activeFaenas)} hint={`de ${faenas.length}`} />
              <MetricCard
                label="Registros de jornada"
                value={ops.workdaysCurrent == null ? "—" : fmtNumber(ops.workdaysCurrent)}
                hint={
                  ops.workdaysDelta == null
                    ? "mes actual"
                    : `${ops.workdaysDelta >= 0 ? "+" : ""}${fmtPercent(ops.workdaysDelta, 0)} vs mes anterior`
                }
                title="Filas de workday del mes en curso. Incluye piso y asistencia de trabajadores mensuales, así que no es exactamente la cuenta de jornadas pagadas."
              />
              <MetricCard
                label="Ciclos estancados"
                value={fmtNumber(ops.stale.length)}
                hint={`sin movimiento hace ${STALE_DAYS}+ días`}
                warning={ops.stale.length > 0}
              />
              <MetricCard
                label="Margen de ciclos"
                value={margin.covered > 0 ? fmtCurrency(margin.margenSum) : "—"}
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
                value={fmtNumber(transport.pendingQuincenaCount)}
                hint={transport.pendingQuincenaCount > 0 ? fmtCurrency(transport.pendingQuincenaTotal) : "ninguna"}
                warning={transport.pendingQuincenaCount > 0}
              />
              <MetricCard
                label="Concentración top 3"
                value={fmtPercent(transport.concentration, 0)}
                hint="del gasto del período"
                title="Qué porcentaje del gasto en transporte se lo llevan los tres transportistas más grandes."
              />
            </div>
          </section>

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
              cyclesByFaena={ops.cyclesByFaena}
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
                {ops.stale.slice(0, 10).map(({ cycle, last, faena }) => (
                  <Link
                    key={cycle.id}
                    to={`/cycles/${cycle.id}`}
                    className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-3 py-2 text-sm last:border-b-0 hover:bg-[var(--color-accent-soft)]"
                  >
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{cycle.label}</span>
                      {faena && <span className="ml-2 text-xs text-[var(--color-muted)]">{faena}</span>}
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
                            r.margen < 0 ? "text-[var(--color-danger)]" : ""
                          }`}
                        >
                          {fmtCurrency(r.margen)}
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
              items={debtDetail.nuevos}
              total={debtDetail.generado}
              color="var(--color-warning)"
            />
            <div>
              <DebtDetailList
                title="Pagado"
                items={debtDetail.pagos}
                total={debtDetail.pagado}
                color="var(--color-accent)"
              />
              {debtDetail.pagos.length > 0 && (
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
                <span className="ml-auto font-semibold tabular-nums">{fmtCurrency(debtDetail.saldo)}</span>
              </div>
              <div
                className={`mt-1 text-xs font-medium ${
                  debtDetail.neto > 0
                    ? "text-[var(--color-accent)]"
                    : debtDetail.neto < 0
                      ? "text-[var(--color-warning)]"
                      : "text-[var(--color-muted)]"
                }`}
              >
                {debtDetail.neto > 0
                  ? `Se pagó ${fmtCurrency(debtDetail.neto)} más de lo generado`
                  : debtDetail.neto < 0
                    ? `Se pagó ${fmtCurrency(-debtDetail.neto)} menos de lo generado`
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
