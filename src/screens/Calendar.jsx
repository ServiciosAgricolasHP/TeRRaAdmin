import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { faenasService, subfaenasService, cyclesService, workersService } from "../services";
import { tripsService } from "../services/transportsService";
import { useCarriers } from "../contexts/CarriersContext";
import { useCatalogs } from "../contexts/CatalogsContext";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { tratoTypeLabel, tratoUnitLabel, cosechaUnit, qualityLabel, containerLabel, getTratoTierTotals, getTratoTiers } from "../utils/cosechaCombos";
import { useIsMobile } from "../hooks/useIsMobile";
import { localIsoDate } from "../utils/dates";

// ============================================================================
// CALENDARIO DE PRODUCCIÓN
// ============================================================================
// Muestra un mes con celdas por día. Cada celda lista las subfaenas que
// trabajaron ese día como barras de color. Click en una barra abre el detalle
// de esa subfaena en el día (DayDetailDrawer); click en la celda, todas las
// subfaenas del día (DayExpandedModal).
//
// Lecturas: lee los workdays del rango del mes y agrega en el cliente
// (~3.000 lecturas en un mes pico, ~US$0,02). Un caché de sesión de 5 min
// evita releer al ir y volver entre meses. `fetchWorkdaysInRange` es el único
// punto que lee workdays.
// ============================================================================

const COLOR_PALETTE = [
  "#0ea5e9", "#f59e0b", "#10b981", "#8b5cf6",
  "#ef4444", "#06b6d4", "#ec4899", "#84cc16",
  "#f97316", "#6366f1", "#14b8a6", "#a855f7",
  "#dc2626", "#7c3aed", "#059669", "#d97706",
];

// Color estable derivado de un hash del id de la subfaena.
function colorForSubfaena(subfaenaId) {
  const s = String(subfaenaId || "");
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) | 0;
  }
  return COLOR_PALETTE[Math.abs(hash) % COLOR_PALETTE.length];
}

const fmtCurrency = (v) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", minimumFractionDigits: 0 }).format(
    Number(v) || 0,
  );

const fmtNumber = (v) =>
  new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 }).format(Number(v) || 0);

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// Sábado o domingo, que se marcan en rojo como en las grillas de tratoHE. Los
// feriados de cada labor viven en dayPrices, que acá no se carga: solo cubre
// fines de semana.
function isWeekendDate(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return false;
  const dow = d.getDay();
  return dow === 0 || dow === 6;
}

const WEEKDAY_SHORT = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MONTH_SHORT_LIST = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
// Formato "vie 16-may-2026" para los encabezados de los modales.
function humanDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  return `${WEEKDAY_SHORT[d.getDay()]} ${String(d.getDate()).padStart(2, "0")}-${MONTH_SHORT_LIST[d.getMonth()]}-${d.getFullYear()}`;
}

const LABOR_TYPE_LABEL = {
  cosecha: "cosecha",
  trato: "a trato",
  tratoHE: "jornadas (HE)",
  main: "al día",
  supervision: "supervisión",
  extra: "adicional",
};

// Texto de la columna "Métrica" según el tipo de labor: cantidad con la unidad
// del envase en cosecha, con la unidad del tier y el tipo del catálogo (ej.
// "poda") en trato, jornadas y HE en tratoHE, y jornadas en las labores al
// día. Vacío si no hay cantidad.
function laborMetricLabel(l, catalogs) {
  if (l.laborType === "cosecha") {
    if (!(l.kilos > 0)) return "";
    const unit = cosechaUnit(catalogs, l.containers).toLowerCase();
    return `${fmtNumber(l.kilos)} ${unit}`;
  }
  if (l.laborType === "trato") {
    if (!(l.tratoQty > 0)) return "";
    const typeLabel = tratoTypeLabel(catalogs, l.tratoType ?? 0);
    // Con unidades de tier (plantas, metros…) el rótulo es la unidad, con el
    // tipo entre paréntesis; sin unidad configurada, el tipo.
    const units = l.tratoUnits ? [...l.tratoUnits]
      .map((u) => tratoUnitLabel(catalogs, u))
      .filter(Boolean)
      .map((s) => s.toLowerCase()) : [];
    if (units.length === 1) {
      return `${fmtNumber(l.tratoQty)} ${units[0]} (${typeLabel.toLowerCase()})`;
    }
    if (units.length > 1) {
      return `${fmtNumber(l.tratoQty)} ${units.join("/")} (${typeLabel.toLowerCase()})`;
    }
    return `${fmtNumber(l.tratoQty)} ${typeLabel}`;
  }
  if (l.laborType === "tratoHE") {
    const parts = [];
    if (l.jornadas > 0) parts.push(`${fmtNumber(l.jornadas)} jornadas`);
    if (l.overtimeHours > 0) parts.push(`${fmtNumber(l.overtimeHours)} HE`);
    return parts.join(" + ");
  }
  // main / supervision / extra → solo jornadas
  return l.jornadas > 0 ? `${fmtNumber(l.jornadas)} jornadas` : "";
}

// ============================================================================
// Caché de sesión por mes (TTL 5 min)
// ============================================================================

const CACHE_TTL = 5 * 60 * 1000;
const cacheKey = (y, m) => `af.calendar.${y}.${String(m).padStart(2, "0")}`;

function readMonthCache(y, m) {
  try {
    const raw = sessionStorage.getItem(cacheKey(y, m));
    if (!raw) return null;
    const { ts, workdays } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return workdays;
  } catch {
    return null;
  }
}

function writeMonthCache(y, m, workdays) {
  try {
    sessionStorage.setItem(
      cacheKey(y, m),
      JSON.stringify({ ts: Date.now(), workdays }),
    );
  } catch {
    // Sin espacio en sessionStorage: se sigue sin caché.
  }
}

function invalidateMonthCache(y, m) {
  try { sessionStorage.removeItem(cacheKey(y, m)); } catch { /* noop */ }
}

// ============================================================================
// Carga de datos
// ============================================================================

function monthBounds(year, month) {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end, lastDay };
}

// Trae los workdays del rango: una lectura por workday. Es el único punto de
// la pantalla que lee workdays.
async function fetchWorkdaysInRange(start, end) {
  const snap = await getDocs(
    query(
      collection(db, "workdays"),
      where("date", ">=", start),
      where("date", "<=", end),
    ),
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function fetchTripsInRange(start, end) {
  const snap = await getDocs(
    query(
      collection(db, "transports"),
      where("date", ">=", start),
      where("date", "<=", end),
    ),
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ============================================================================
// Componente
// ============================================================================

export default function Calendar() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const { carriers } = useCarriers();
  const { catalogs } = useCatalogs();
  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1); // 1..12

  const [workdays, setWorkdays] = useState([]);
  const [trips, setTrips] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [faenas, setFaenas] = useState([]);
  const [subfaenas, setSubfaenas] = useState([]);
  // Lista completa de trabajadores, para los nombres del detalle del día.
  // Comparte con Trabajadores la caché de 2 h en localStorage: la primera
  // carga cuesta ~500-2.000 lecturas y las siguientes, ninguna.
  const [workers, setWorkers] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [readCount, setReadCount] = useState(0); // lecturas de workdays del mes, para el contador
  const [fromCache, setFromCache] = useState(false);

  const [selectedDay, setSelectedDay] = useState(null); // { date, mode: "all" | "subfaena", subfaenaId?, from? }

  // Subfaenas ocultas (vacío = todas visibles), guardadas en localStorage. No
  // cambia la consulta a Firestore: oculta sus barras en la grilla, el modal
  // del día y la impresión; la leyenda las muestra tachadas.
  const [excludedSubfaenas, setExcludedSubfaenas] = useState(() => {
    try {
      const raw = localStorage.getItem("calendar.excludedSubfaenas");
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
  });
  useEffect(() => {
    try {
      localStorage.setItem("calendar.excludedSubfaenas", JSON.stringify([...excludedSubfaenas]));
    } catch { /* noop */ }
  }, [excludedSubfaenas]);
  const toggleSubfaenaFilter = (id) => {
    setExcludedSubfaenas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const clearSubfaenaFilter = () => setExcludedSubfaenas(new Set());
  // Deja visible solo `idToKeep`. `allIds` son las subfaenas del mes, que
  // entrega la leyenda.
  const isolateSubfaena = (idToKeep, allIds) => {
    const next = new Set();
    for (const id of allIds) if (id !== idToKeep) next.add(id);
    setExcludedSubfaenas(next);
  };

  const isMobile = useIsMobile();

  // Carga ciclos, faenas, subfaenas y trabajadores con la caché de los
  // servicios. No suma al contador de lecturas del mes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [c, f, s, w] = await Promise.all([
          cyclesService.list({ cache: true, ttl: 5 * 60 * 1000 }),
          faenasService.list({ cache: true, persist: true, ttl: 10 * 60 * 1000 }),
          subfaenasService.list({ cache: true, persist: true, ttl: 10 * 60 * 1000 }),
          workersService.list({
            order: ["name", "asc"],
            cache: true,
            persist: true,
            ttl: 2 * 60 * 60 * 1000,
          }),
        ]);
        if (cancelled) return;
        setCycles(c);
        setFaenas(f);
        setSubfaenas(s);
        setWorkers(w);
      } catch (err) {
        if (!cancelled) setError(err.message || String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Carga los workdays del mes (con el caché de sesión de 5 min) y después
  // sus vueltas de transporte.
  const loadMonth = async (y, m, { forceFresh = false } = {}) => {
    setLoading(true);
    setError("");
    setFromCache(false);
    try {
      const { start, end } = monthBounds(y, m);
      let wds = forceFresh ? null : readMonthCache(y, m);
      if (wds) {
        setWorkdays(wds);
        setReadCount(0);
        setFromCache(true);
      } else {
        wds = await fetchWorkdaysInRange(start, end);
        writeMonthCache(y, m, wds);
        setWorkdays(wds);
        setReadCount(wds.length);
      }
      // Las vueltas se leen siempre frescas, sin caché: son pocas.
      const ts = await fetchTripsInRange(start, end);
      setTrips(ts);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMonth(year, month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  // ─── Índices y agregaciones ──────────────────────────────────────────────

  const cycleById = useMemo(() => {
    const m = new Map();
    for (const c of cycles) m.set(c.id, c);
    return m;
  }, [cycles]);

  const faenaById = useMemo(() => {
    const m = new Map();
    for (const f of faenas) m.set(f.id, f);
    return m;
  }, [faenas]);

  const subfaenaById = useMemo(() => {
    const m = new Map();
    for (const s of subfaenas) m.set(s.id, s);
    return m;
  }, [subfaenas]);

  const carrierById = useMemo(() => {
    const m = new Map();
    for (const c of carriers) m.set(c.id, c);
    return m;
  }, [carriers]);

  const workerById = useMemo(() => {
    const m = new Map();
    for (const w of workers) m.set(w.id, w);
    return m;
  }, [workers]);

  // Para cada día, qué subfaenas trabajaron y con cuánta actividad.
  // Forma: { [date]: [{ subfaenaId, name, faenaName, color, workerCount, kilos, jornadas, amount }] },
  // cada día ordenado por workerCount descendente.
  const dayIndex = useMemo(() => {
    const idx = {};
    for (const wd of workdays) {
      const date = wd.date;
      if (!date) continue;
      const cycle = cycleById.get(wd.cycleId);
      if (!cycle) continue;
      const subfaenaId = cycle.subfaenaId || "(sin-subfaena)";
      if (!idx[date]) idx[date] = {};
      if (!idx[date][subfaenaId]) {
        const sub = subfaenaById.get(subfaenaId);
        const faena = sub ? faenaById.get(sub.faenaId) : null;
        idx[date][subfaenaId] = {
          subfaenaId,
          name: sub?.name || "Sin subfaena",
          faenaName: faena?.name || "",
          color: colorForSubfaena(subfaenaId),
          workers: new Set(),
          kilos: 0,
          jornadas: 0,
          amount: 0,
        };
      }
      const e = idx[date][subfaenaId];
      e.workers.add(wd.workerId || wd.workerRut);
      e.kilos += Number(wd.qty) || 0;
      e.amount += Number(wd.amount) || 0;
      // jornadas: qty en tratoHE y 1 por workday en las labores al día; cosecha y trato no suman
      const labor = (cycle.labors || []).find((l) => l.id === wd.laborId);
      const t = labor?.type;
      if (t === "tratoHE") e.jornadas += Number(wd.qty) || 0;
      else if (t === "main" || t === "supervision" || t === "extra") e.jornadas += 1;
    }
    // Convierte los Sets en conteos y cada día en un array.
    const out = {};
    for (const date in idx) {
      out[date] = Object.values(idx[date])
        .map((e) => ({ ...e, workerCount: e.workers.size, workers: undefined }))
        .sort((a, b) => b.workerCount - a.workerCount);
    }
    return out;
  }, [workdays, cycleById, subfaenaById, faenaById]);

  // dayIndex sin las subfaenas ocultas. Lo usan la grilla, el modal del día y
  // la impresión; la leyenda usa el dayIndex completo.
  const visibleDayIndex = useMemo(() => {
    if (!excludedSubfaenas || excludedSubfaenas.size === 0) return dayIndex;
    const out = {};
    for (const date in dayIndex) {
      const arr = dayIndex[date].filter((it) => !excludedSubfaenas.has(it.subfaenaId));
      if (arr.length > 0) out[date] = arr;
    }
    return out;
  }, [dayIndex, excludedSubfaenas]);

  // ─── Navegación de mes ───────────────────────────────────────────────────

  const goPrev = () => {
    if (month === 1) {
      setMonth(12);
      setYear(year - 1);
    } else {
      setMonth(month - 1);
    }
    setSelectedDay(null);
  };
  const goNext = () => {
    if (month === 12) {
      setMonth(1);
      setYear(year + 1);
    } else {
      setMonth(month + 1);
    }
    setSelectedDay(null);
  };
  const goToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth() + 1);
    setSelectedDay(null);
  };
  // Imprime el mes completo desde una ventana nueva. A diferencia de la
  // grilla (4 barras + "+N más"), lista todas las subfaenas de cada día con su
  // faena. Respeta el filtro de subfaenas (`visibleDayIndex`).
  const handlePrintMonth = () => {
    const { lastDay } = monthBounds(year, month);
    const firstWeekday = new Date(year, month - 1, 1).getDay(); // 0=Domingo
    const offset = (firstWeekday + 6) % 7; // semana arranca lunes

    const cells = [];
    for (let i = 0; i < offset; i++) cells.push({ empty: true });
    for (let d = 1; d <= lastDay; d++) {
      const date = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({ date, day: d });
    }
    while (cells.length % 7 !== 0) cells.push({ empty: true });

    const escapeHtml = (s) =>
      String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

    const renderCell = (c) => {
      if (c.empty) return `<td class="empty"></td>`;
      const items = visibleDayIndex[c.date] || [];
      const weekend = isWeekendDate(c.date);
      const pills = items
        .map((it) => {
          const faena = it.faenaName ? `<span class="f">${escapeHtml(it.faenaName)}</span>` : "";
          const sub = `<span class="s">${escapeHtml(it.name)}</span>`;
          const count = it.workerCount ? `<span class="n">${it.workerCount}</span>` : "";
          return `<div class="pill" style="background:${it.color}">${faena}${sub}${count}</div>`;
        })
        .join("");
      return `<td class="day"><div class="dnum ${weekend ? "wknd" : ""}">${c.day}</div>${pills}</td>`;
    };

    const tableRows = weeks.map((w) => `<tr>${w.map(renderCell).join("")}</tr>`).join("");
    const title = `${MONTH_NAMES[month - 1]} ${year}`;
    const win = window.open("", "_blank", "width=1200,height=850");
    if (!win) {
      toast.warning("Permite las ventanas emergentes para imprimir.");
      return;
    }
    win.document.write(`<!DOCTYPE html><html><head><title>Calendario · ${title}</title>
      <style>
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box; }
        body { font-family: ui-sans-serif, system-ui, sans-serif; padding: 12px 16px; color: #000; margin: 0; }
        h1 { text-align: center; font-size: 18px; margin: 0 0 10px; letter-spacing: 1px; }
        table { border-collapse: collapse; width: 100%; table-layout: fixed; }
        thead th {
          background: #f3f4f6; border: 1px solid #888; padding: 4px 6px;
          font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #444;
        }
        td { border: 1px solid #888; padding: 4px; vertical-align: top; height: 110px; width: 14.285%; }
        td.empty { background: #fafafa; }
        td.day { background: #fff; }
        .dnum { font-size: 11px; color: #666; font-weight: 600; margin-bottom: 3px; }
        .dnum.wknd { color: #dc2626; }
        .pill {
          color: #fff; border-radius: 3px; padding: 2px 4px;
          margin-bottom: 2px; font-size: 9px; line-height: 1.15;
          display: flex; align-items: baseline; gap: 4px;
        }
        .pill .f { font-weight: 400; opacity: 0.85; font-size: 8px; }
        .pill .s { font-weight: 600; flex: 1; }
        .pill .n {
          background: rgba(255,255,255,0.25); border-radius: 8px;
          padding: 0 4px; font-size: 8px; font-weight: 600;
        }
        tr { page-break-inside: avoid; }
        @media print { @page { size: landscape; margin: 8mm; } body { padding: 0; } }
      </style>
    </head><body>
      <h1>${title}</h1>
      <table>
        <thead><tr>
          <th>Lun</th><th>Mar</th><th>Mié</th><th>Jue</th><th>Vie</th><th>Sáb</th><th>Dom</th>
        </tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
      <script>window.onload = () => { window.focus(); window.print(); };</script>
    </body></html>`);
    win.document.close();
  };

  const refresh = () => {
    invalidateMonthCache(year, month);
    loadMonth(year, month, { forceFresh: true });
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calendario</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Producción diaria por subfaena.
            {/* Contador de lecturas de Firestore, para diagnóstico; solo lo ve un admin. */}
            {isAdmin && (fromCache ? " · resultado de caché" : ` · ${readCount} lecturas`)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={goPrev}
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-sm hover:bg-[var(--color-accent-soft)]"
            title="Mes anterior"
          >
            ◀
          </button>
          <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-medium">
            {MONTH_NAMES[month - 1]} {year}
          </div>
          <button
            type="button"
            onClick={goNext}
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-sm hover:bg-[var(--color-accent-soft)]"
            title="Mes siguiente"
          >
            ▶
          </button>
          <button
            type="button"
            onClick={goToday}
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-sm hover:bg-[var(--color-accent-soft)]"
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
            title="Forzar recarga (ignora la caché)"
          >
            ↻
          </button>
          <button
            type="button"
            onClick={handlePrintMonth}
            disabled={loading}
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
            title="Imprimir el mes completo (todas las faenas de cada día)"
          >
            🖨️
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-md border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      )}

      <MonthGrid
        year={year}
        month={month}
        dayIndex={visibleDayIndex}
        loading={loading}
        // En mobile, tocar una barra abre el modal del día, igual que la
        // celda; ahí se elige la subfaena.
        onCellClick={(date) => setSelectedDay({ date, mode: "all" })}
        onBarClick={
          isMobile
            ? (date) => setSelectedDay({ date, mode: "all" })
            : (date, subfaenaId) => setSelectedDay({ date, mode: "subfaena", subfaenaId })
        }
      />

      <Legend
        dayIndex={dayIndex}
        excludedSubfaenas={excludedSubfaenas}
        onToggle={toggleSubfaenaFilter}
        onIsolate={isolateSubfaena}
        onClear={clearSubfaenaFilter}
      />

      {selectedDay && selectedDay.mode === "subfaena" && (
        <DayDetailDrawer
          date={selectedDay.date}
          subfaenaId={selectedDay.subfaenaId}
          workdays={workdays.filter((wd) => wd.date === selectedDay.date)}
          trips={trips.filter((t) => t.date === selectedDay.date)}
          cycleById={cycleById}
          subfaenaById={subfaenaById}
          faenaById={faenaById}
          carrierById={carrierById}
          workerById={workerById}
          catalogs={catalogs}
          onClose={() => {
            // Si se llegó desde el modal del día, vuelve a ese modal en vez
            // de cerrar todo.
            if (selectedDay.from === "all") {
              setSelectedDay({ date: selectedDay.date, mode: "all" });
            } else {
              setSelectedDay(null);
            }
          }}
        />
      )}

      {selectedDay && selectedDay.mode === "all" && (
        <DayExpandedModal
          date={selectedDay.date}
          subfaenasOfDay={visibleDayIndex[selectedDay.date] || []}
          subfaenaById={subfaenaById}
          faenaById={faenaById}
          onClose={() => setSelectedDay(null)}
          onPickSubfaena={(subfaenaId) =>
            setSelectedDay({ date: selectedDay.date, mode: "subfaena", subfaenaId, from: "all" })
          }
        />
      )}
    </div>
  );
}

// ============================================================================
// Grilla del mes
// ============================================================================

function MonthGrid({ year, month, dayIndex, loading, onCellClick, onBarClick }) {
  const { lastDay } = monthBounds(year, month);
  const firstWeekday = new Date(year, month - 1, 1).getDay(); // 0=Domingo
  // Desfase con la semana empezando en lunes (dom=0 → 6, lun=1 → 0…)
  const offset = (firstWeekday + 6) % 7;
  const todayStr = localIsoDate();

  const cells = [];
  for (let i = 0; i < offset; i++) cells.push({ empty: true, key: `e${i}` });
  for (let d = 1; d <= lastDay; d++) {
    const date = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ date, day: d });
  }
  while (cells.length % 7 !== 0) cells.push({ empty: true, key: `f${cells.length}` });

  return (
    <div>
      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
        {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
          <div key={`h${i}`} className="py-1">{d}</div>
        ))}
      </div>
      <div className={`grid grid-cols-7 gap-1 ${loading ? "opacity-50 pointer-events-none" : ""}`}>
        {cells.map((c) => {
          if (c.empty) return <div key={c.key} className="aspect-square" />;
          const items = dayIndex[c.date] || [];
          const isToday = c.date === todayStr;
          return (
            <div
              key={c.date}
              onClick={() => onCellClick(c.date)}
              className={`flex aspect-square cursor-pointer flex-col rounded border p-1 transition-colors hover:border-[var(--color-accent)] ${
                isToday
                  ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]/30"
                  : "border-[var(--color-border)] bg-[var(--color-surface)]"
              }`}
            >
              <div
                className={`text-xs ${
                  isToday
                    ? "font-semibold text-[var(--color-accent)]"
                    : isWeekendDate(c.date)
                      ? "font-medium text-[#dc2626]"
                      : "text-[var(--color-muted)]"
                }`}
              >
                {c.day}
              </div>
              <div className="mt-1 flex-1 space-y-0.5 overflow-hidden">
                {items.slice(0, 4).map((it) => (
                  <button
                    key={it.subfaenaId}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onBarClick(c.date, it.subfaenaId);
                    }}
                    className="block w-full truncate rounded px-1 py-0.5 text-left text-[10px] font-medium leading-tight text-white hover:opacity-90"
                    style={{ backgroundColor: it.color }}
                    title={`${it.faenaName ? it.faenaName + " · " : ""}${it.name} · ${it.workerCount} trabajador${it.workerCount === 1 ? "" : "es"}`}
                  >
                    {it.name}
                  </button>
                ))}
                {items.length > 4 && (
                  <div className="text-[9px] text-[var(--color-muted)]">
                    +{items.length - 4} más
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Leyenda de colores
// ============================================================================

// Leyenda interactiva: click en un chip oculta o muestra esa subfaena en la
// grilla y el modal del día; doble click la aísla. "Mostrar todas" aparece solo
// con un filtro activo. El click espera ~220 ms antes de aplicarse, para no
// alternar el chip cuando en realidad es un doble click.
function Legend({ dayIndex, excludedSubfaenas, onToggle, onIsolate, onClear }) {
  const subfaenas = useMemo(() => {
    const seen = new Map();
    for (const date in dayIndex) {
      for (const it of dayIndex[date]) {
        if (!seen.has(it.subfaenaId)) {
          seen.set(it.subfaenaId, {
            subfaenaId: it.subfaenaId,
            name: it.name,
            faenaName: it.faenaName,
            color: it.color,
          });
        }
      }
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [dayIndex]);

  const allIds = useMemo(() => subfaenas.map((s) => s.subfaenaId), [subfaenas]);
  const clickTimer = useRef(null);
  const cancelPendingClick = () => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
  };
  const handleClick = (id) => {
    cancelPendingClick();
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      onToggle(id);
    }, 220);
  };
  const handleDoubleClick = (id) => {
    cancelPendingClick();
    onIsolate(id, allIds);
  };
  useEffect(() => () => cancelPendingClick(), []);

  if (subfaenas.length === 0) return null;
  const hasFilter = excludedSubfaenas && excludedSubfaenas.size > 0;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-[11px]">
      <span className="text-[var(--color-muted)]">
        Subfaenas{hasFilter ? " (click para mostrar/ocultar · doble-click para aislar)" : " (doble-click para aislar)"}:
      </span>
      {subfaenas.map((s) => {
        const excluded = excludedSubfaenas?.has(s.subfaenaId);
        return (
          <button
            type="button"
            key={s.subfaenaId}
            onClick={() => handleClick(s.subfaenaId)}
            onDoubleClick={() => handleDoubleClick(s.subfaenaId)}
            title={excluded ? "Click: mostrar · doble-click: aislar" : "Click: ocultar · doble-click: aislar"}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 transition-opacity ${
              excluded
                ? "border-dashed border-[var(--color-border)] bg-transparent opacity-40"
                : "border-transparent bg-[var(--color-surface-2)] hover:bg-[var(--color-accent-soft)]"
            }`}
          >
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
            <span className={excluded ? "line-through" : ""}>{s.name}</span>
            {s.faenaName && <span className="text-[var(--color-muted)]">· {s.faenaName}</span>}
          </button>
        );
      })}
      {hasFilter && (
        <button
          type="button"
          onClick={onClear}
          className="ml-auto rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 text-[var(--color-muted)] hover:text-[var(--color-accent)]"
        >
          Mostrar todas
        </button>
      )}
    </div>
  );
}

// ============================================================================
// Detalle del día (drawer)
// ============================================================================

function DayDetailDrawer({ date, subfaenaId, workdays, trips, cycleById, subfaenaById, faenaById, carrierById, workerById, catalogs, onClose }) {
  // Labores expandidas, que muestran el desglose por trabajador y por
  // calidad. Arrancan cerradas.
  const [expandedLabors, setExpandedLabors] = useState(() => new Set());
  const toggleLabor = (key) =>
    setExpandedLabors((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  // Con `subfaenaId`, filtra workdays y vueltas a esa subfaena, según el
  // `subfaenaId` de su ciclo.
  const filteredWorkdays = useMemo(() => {
    if (!subfaenaId) return workdays;
    return workdays.filter((wd) => {
      const cycle = cycleById.get(wd.cycleId);
      return cycle?.subfaenaId === subfaenaId;
    });
  }, [workdays, subfaenaId, cycleById]);

  const filteredTrips = useMemo(() => {
    if (!subfaenaId) return trips;
    return trips.filter((t) => {
      const cycle = cycleById.get(t.cycleId);
      return cycle?.subfaenaId === subfaenaId;
    });
  }, [trips, subfaenaId, cycleById]);

  // Totales del día. Cada métrica suma solo su tipo de labor (kilos de
  // cosecha, tratoQty de trato, etc.); las tarjetas en 0 no se muestran.
  const totals = useMemo(() => {
    const workers = new Set();
    let kilos = 0;
    let tratoQty = 0;
    let amount = 0;
    let jornadas = 0;
    let overtimeHours = 0;
    let pisoAmount = 0;
    let pisoCount = 0;
    const tratoTypes = new Set();
    const cosechaContainers = new Set();
    for (const wd of filteredWorkdays) {
      workers.add(wd.workerId || wd.workerRut);
      amount += Number(wd.amount) || 0;
      if (wd.pisoOnly) {
        pisoAmount += Number(wd.amount) || 0;
        pisoCount += 1;
        continue; // el monto ya se sumó; el piso no aporta producción ni jornadas
      }
      const cycle = cycleById.get(wd.cycleId);
      const labor = cycle?.labors?.find((l) => l.id === wd.laborId);
      const t = labor?.type;
      if (t === "cosecha") {
        kilos += Number(wd.qty) || 0;
        cosechaContainers.add(Number(wd.containerY) || 0);
      } else if (t === "trato") {
        tratoTypes.add(labor?.tratoType ?? 0);
        tratoQty += getTratoTierTotals(wd).qty;
      } else if (t === "tratoHE") {
        jornadas += Number(wd.qty) || 0;
        overtimeHours += Number(wd.overtimeHours) || 0;
      } else {
        jornadas += 1;
      }
    }
    const tripsTotal = filteredTrips.reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const tratoLabel = tratoTypes.size === 1
      ? tratoTypeLabel(catalogs, [...tratoTypes][0])
      : "Trato";
    const cosechaUnitLabel = cosechaUnit(catalogs, cosechaContainers);
    return {
      workerCount: workers.size,
      kilos,
      cosechaUnitLabel,
      tratoQty,
      tratoLabel,
      amount,
      jornadas,
      overtimeHours,
      pisoAmount,
      pisoCount,
      tripsCount: filteredTrips.length,
      tripsTotal,
    };
  }, [filteredWorkdays, filteredTrips, cycleById, catalogs]);

  // Agrupa los workdays por (cycleId, laborId), con solo las métricas que
  // aplican a cada tipo de labor. Guarda además dos desgloses para la fila
  // expandida:
  //   - `workersMap`: producción por trabajador (kilos / tratoQty / jornadas /
  //     monto / piso); sale como el array `workersBreakdown`.
  //   - `qualityMap`: en cosecha, totales por combo (calidadX/envaseY); sale
  //     como `qualityDist`.
  const byLabor = useMemo(() => {
    const map = new Map();
    for (const wd of filteredWorkdays) {
      const key = `${wd.cycleId}__${wd.laborId}`;
      if (!map.has(key)) {
        const cycle = cycleById.get(wd.cycleId);
        const labor = cycle?.labors?.find((l) => l.id === wd.laborId);
        const sub = cycle ? subfaenaById.get(cycle.subfaenaId) : null;
        const faena = sub ? faenaById.get(sub.faenaId) : null;
        map.set(key, {
          key,
          cycleLabel: cycle?.label || wd.cycleId,
          laborName: labor?.name || wd.laborId,
          laborType: labor?.type || "main",
          tratoType: labor?.tratoType ?? 0,
          subfaenaName: sub?.name || "",
          faenaName: faena?.name || "",
          workers: new Set(),
          containers: new Set(),
          kilos: 0,
          tratoQty: 0,
          tratoUnits: new Set(),
          jornadas: 0,
          overtimeHours: 0,
          amount: 0,
          workersMap: new Map(),
          qualityMap: new Map(),
          _cycle: cycle,
        });
      }
      const e = map.get(key);
      // Agrupa por `workerId`, que no cambia: `workerRut` es el rut que tenía
      // el trabajador al crear cada workday y puede diferir entre ellos.
      const workerId = wd.workerId || wd.workerRut;
      e.workers.add(workerId);
      e.amount += Number(wd.amount) || 0;

      if (!e.workersMap.has(workerId)) {
        e.workersMap.set(workerId, {
          id: workerId,
          rut: wd.workerRut,
          kilos: 0,
          tratoQty: 0,
          jornadas: 0,
          overtimeHours: 0,
          amount: 0,
          pisoAmount: 0,
        });
      }
      const wEntry = e.workersMap.get(workerId);
      const wdAmount = Number(wd.amount) || 0;
      wEntry.amount += wdAmount;

      if (wd.pisoOnly) {
        e.pisoAmount = (e.pisoAmount || 0) + wdAmount;
        e.pisoCount = (e.pisoCount || 0) + 1;
        wEntry.pisoAmount += wdAmount;
        continue;
      }
      const t = e.laborType;
      if (t === "cosecha") {
        const kg = Number(wd.qty) || 0;
        const qx = Number(wd.qualityX) || 0;
        const cy = Number(wd.containerY) || 0;
        e.kilos += kg;
        e.containers.add(cy);
        wEntry.kilos += kg;
        // Distribución por (calidad, envase): kilos + monto.
        const qk = `${qx}_${cy}`;
        if (!e.qualityMap.has(qk)) {
          e.qualityMap.set(qk, { qx, cy, kilos: 0, amount: 0 });
        }
        const q = e.qualityMap.get(qk);
        q.kilos += kg;
        q.amount += wdAmount;
      } else if (t === "trato") {
        const q = getTratoTierTotals(wd).qty;
        e.tratoQty += q;
        wEntry.tratoQty += q;
        // Unidades (plantas, metros…) de los tiers del workday, según el
        // dayPrices del ciclo para esa labor y fecha. Junta las de todos los
        // tiers de `wd.tiers`; sin ese campo, usa el tier 0.
        if (e._cycle?.dayPrices) {
          const tiers = getTratoTiers(e._cycle.dayPrices, wd.laborId, wd.date);
          const tierKeys = wd.tiers ? Object.keys(wd.tiers) : ["0"];
          for (const tk of tierKeys) {
            const tier = tiers[Number(tk)];
            if (tier?.unit != null) e.tratoUnits.add(tier.unit);
          }
        }
      } else if (t === "tratoHE") {
        const j = Number(wd.qty) || 0;
        const oh = Number(wd.overtimeHours) || 0;
        e.jornadas += j;
        e.overtimeHours += oh;
        wEntry.jornadas += j;
        wEntry.overtimeHours += oh;
      } else {
        e.jornadas += 1;
        wEntry.jornadas += 1;
      }
    }
    return [...map.values()]
      .map((e) => {
        const workersBreakdown = [...e.workersMap.values()]
          .map((w) => {
            const found = workerById?.get?.(w.id);
            return { ...w, rut: found?.rut || w.rut, name: found?.name || w.rut };
          })
          .sort((a, b) => b.amount - a.amount);
        const qualityDist = [...e.qualityMap.values()].sort(
          (a, b) => b.kilos - a.kilos || b.amount - a.amount,
        );
        const { workersMap: _wm, qualityMap: _qm, ...rest } = e;
        return { ...rest, workerCount: e.workers.size, workersBreakdown, qualityDist };
      })
      .sort((a, b) => b.amount - a.amount);
  }, [filteredWorkdays, cycleById, subfaenaById, faenaById, workerById]);

  // Por transportista — el nombre viene del lookup de carriers, no del id.
  const byCarrier = useMemo(() => {
    const map = new Map();
    for (const t of filteredTrips) {
      const key = t.carrierId || "(sin id)";
      if (!map.has(key)) {
        const carrier = carrierById?.get?.(key);
        map.set(key, {
          carrierId: key,
          alias: carrier?.alias || carrier?.name || "(transportista eliminado)",
          name: carrier?.name || "",
          tripCount: 0,
          total: 0,
        });
      }
      const e = map.get(key);
      e.tripCount += 1;
      e.total += Number(t.amount) || 0;
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [filteredTrips, carrierById]);

  const subfaenaLabel = subfaenaId ? subfaenaById.get(subfaenaId)?.name : "Todas las subfaenas";

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-xl flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between border-b border-[var(--color-border)] px-4 py-3">
          <div>
            <h2 className={`text-lg font-semibold ${isWeekendDate(date) ? "text-[#dc2626]" : ""}`}>
              {humanDate(date)}
            </h2>
            <p className="text-xs text-[var(--color-muted)]">{subfaenaLabel}</p>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--color-muted)] hover:text-[var(--color-text)]"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {/* Totales: solo las métricas que aplican al día. */}
          <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Trabajadores" value={fmtNumber(totals.workerCount)} />
            {totals.jornadas > 0 && <Stat label="Jornadas" value={fmtNumber(totals.jornadas)} />}
            {totals.kilos > 0 && <Stat label={totals.cosechaUnitLabel} value={fmtNumber(totals.kilos)} />}
            {totals.tratoQty > 0 && <Stat label={totals.tratoLabel} value={fmtNumber(totals.tratoQty)} />}
            {totals.overtimeHours > 0 && <Stat label="HE (horas)" value={fmtNumber(totals.overtimeHours)} />}
            {totals.pisoAmount > 0 && (
              <Stat label={`Pisos (${totals.pisoCount})`} value={fmtCurrency(totals.pisoAmount)} />
            )}
            <Stat label="Producción $" value={fmtCurrency(totals.amount)} />
          </section>

          {/* Por labor */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
              Por labor ({byLabor.length})
            </h3>
            {byLabor.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">Sin actividad registrada.</p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-[var(--color-border)]" style={{ WebkitOverflowScrolling: "touch" }}>
                <table className="w-full min-w-[420px] text-sm">
                  <thead className="bg-[var(--color-surface-2)] text-left text-xs text-[var(--color-muted)]">
                    <tr>
                      <th className="px-2 py-1.5">Ciclo / Labor</th>
                      <th className="px-2 py-1.5 text-right">Personas</th>
                      <th className="px-2 py-1.5 text-right">Métrica</th>
                      <th className="px-2 py-1.5 text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byLabor.map((l) => {
                      const isOpen = expandedLabors.has(l.key);
                      const cosechaUnitForLabor = l.laborType === "cosecha"
                        ? cosechaUnit(catalogs, l.containers).toLowerCase()
                        : "";
                      // Unidad de trato para el detalle por trabajador: la
                      // del tier (plantas, metros) con el tipo (poda, amarre)
                      // entre paréntesis; sin unidad configurada, el tipo.
                      const tratoUnitForLabor = (() => {
                        if (l.laborType !== "trato") return "";
                        const units = l.tratoUnits ? [...l.tratoUnits]
                          .map((u) => tratoUnitLabel(catalogs, u))
                          .filter(Boolean)
                          .map((s) => s.toLowerCase()) : [];
                        const typeLabel = tratoTypeLabel(catalogs, l.tratoType ?? 0).toLowerCase();
                        if (units.length === 1) return `${units[0]} (${typeLabel})`;
                        if (units.length > 1) return `${units.join("/")} (${typeLabel})`;
                        return typeLabel;
                      })();
                      return (
                        <Fragment key={l.key}>
                          <tr
                            className="cursor-pointer border-t border-[var(--color-border)] hover:bg-[var(--color-accent-soft)]"
                            onClick={() => toggleLabor(l.key)}
                          >
                            <td className="px-2 py-1.5">
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-[var(--color-muted)]">{isOpen ? "▾" : "▸"}</span>
                                <div>
                                  <div className="text-sm font-medium">{l.laborName}</div>
                                  <div className="text-[10px] text-[var(--color-muted)]">
                                    {l.cycleLabel} · {LABOR_TYPE_LABEL[l.laborType] || l.laborType}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{l.workerCount}</td>
                            <td className="px-2 py-1.5 text-right text-xs tabular-nums">
                              {l.laborType === "tratoHE" ? (
                                <div className="flex flex-col items-end leading-tight">
                                  {l.jornadas > 0 && (
                                    <span>
                                      {fmtNumber(l.jornadas)}{" "}
                                      <span className="text-[var(--color-muted)]">jornadas</span>
                                    </span>
                                  )}
                                  {l.overtimeHours > 0 && (
                                    <span>
                                      {fmtNumber(l.overtimeHours)}{" "}
                                      <span className="text-[var(--color-muted)]">horas extras</span>
                                    </span>
                                  )}
                                </div>
                              ) : l.laborType === "trato" ? (() => {
                                // Promedio por persona con producción ese día
                                // (tratoQty > 0), no por todas las del listado.
                                // Sale de `workersBreakdown`: byLabor no conserva
                                // `workersMap`.
                                const peopleWithProd = (l.workersBreakdown || [])
                                  .filter((w) => (w.tratoQty || 0) > 0);
                                const n = peopleWithProd.length;
                                const avg = n > 0 ? l.tratoQty / n : 0;
                                return (
                                  <div className="flex flex-col items-end leading-tight">
                                    <span>{laborMetricLabel(l, catalogs)}</span>
                                    {n > 0 && (
                                      <span className="text-[10px] text-[var(--color-muted)]">
                                        {n} persona{n === 1 ? "" : "s"} · prom {fmtNumber(avg)}/persona
                                      </span>
                                    )}
                                  </div>
                                );
                              })() : (
                                laborMetricLabel(l, catalogs)
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                              {fmtCurrency(l.amount)}
                            </td>
                          </tr>
                          {isOpen && (
                            <tr className="border-t border-[var(--color-border)] bg-[var(--color-surface-2)]/40">
                              <td colSpan={4} className="px-3 py-2">
                                {l.laborType === "cosecha" && l.qualityDist.length > 0 && (
                                  <div className="mb-2">
                                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                                      Distribución por calidad / envase
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                      {l.qualityDist.map((q) => {
                                        const lblQ = qualityLabel(catalogs, q.qx);
                                        const lblC = containerLabel(catalogs, q.cy);
                                        const pct = l.kilos > 0 ? (q.kilos / l.kilos) * 100 : 0;
                                        return (
                                          <div
                                            key={`${q.qx}_${q.cy}`}
                                            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[11px]"
                                          >
                                            <div className="font-medium">{lblQ} / {lblC}</div>
                                            <div className="tabular-nums">
                                              {fmtNumber(q.kilos)} {lblC.toLowerCase()}
                                              <span className="ml-1 text-[var(--color-muted)]">
                                                ({pct.toFixed(0)}%)
                                              </span>
                                            </div>
                                            <div className="text-[10px] tabular-nums text-[var(--color-muted)]">
                                              {fmtCurrency(q.amount)}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                                  Trabajadores ({l.workersBreakdown.length})
                                </div>
                                <table className="w-full text-xs">
                                  <thead className="text-left text-[var(--color-muted)]">
                                    <tr>
                                      <th className="px-1 py-1">Nombre</th>
                                      <th className="px-1 py-1 text-right">Producción</th>
                                      <th className="px-1 py-1 text-right">Monto</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {l.workersBreakdown.map((w) => {
                                      const prodParts = [];
                                      if (l.laborType === "cosecha" && w.kilos > 0) {
                                        prodParts.push(`${fmtNumber(w.kilos)} ${cosechaUnitForLabor}`);
                                      }
                                      if (l.laborType === "trato" && w.tratoQty > 0) {
                                        prodParts.push(`${fmtNumber(w.tratoQty)} ${tratoUnitForLabor}`);
                                      }
                                      if (w.jornadas > 0) {
                                        prodParts.push(`${fmtNumber(w.jornadas)} jornadas`);
                                      }
                                      if (w.overtimeHours > 0) {
                                        prodParts.push(`${fmtNumber(w.overtimeHours)} horas extras`);
                                      }
                                      if (w.pisoAmount > 0) {
                                        prodParts.push(`🪙 ${fmtCurrency(w.pisoAmount)}`);
                                      }
                                      return (
                                        <tr key={w.rut} className="border-t border-[var(--color-border)]">
                                          <td className="px-1 py-1">
                                            <div>{w.name}</div>
                                            <div className="font-mono text-[10px] text-[var(--color-muted)]">{w.rut}</div>
                                          </td>
                                          <td className="px-1 py-1 text-right tabular-nums">
                                            {l.laborType === "tratoHE" ? (
                                              <div className="flex flex-col items-end leading-tight">
                                                {w.jornadas > 0 && (
                                                  <span>
                                                    {fmtNumber(w.jornadas)}{" "}
                                                    <span className="text-[var(--color-muted)]">jornadas</span>
                                                  </span>
                                                )}
                                                {w.overtimeHours > 0 && (
                                                  <span>
                                                    {fmtNumber(w.overtimeHours)}{" "}
                                                    <span className="text-[var(--color-muted)]">horas extras</span>
                                                  </span>
                                                )}
                                                {w.pisoAmount > 0 && (
                                                  <span>🪙 {fmtCurrency(w.pisoAmount)}</span>
                                                )}
                                                {w.jornadas === 0 && w.overtimeHours === 0 && w.pisoAmount === 0 && "—"}
                                              </div>
                                            ) : (
                                              prodParts.join(" · ") || "—"
                                            )}
                                          </td>
                                          <td className="px-1 py-1 text-right font-medium tabular-nums">
                                            {fmtCurrency(w.amount)}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Por transportista */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
              Transportes ({totals.tripsCount} · {fmtCurrency(totals.tripsTotal)})
            </h3>
            {byCarrier.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">Sin transportes.</p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-[var(--color-border)]" style={{ WebkitOverflowScrolling: "touch" }}>
                <table className="w-full min-w-[420px] text-sm">
                  <thead className="bg-[var(--color-surface-2)] text-left text-xs text-[var(--color-muted)]">
                    <tr>
                      <th className="px-2 py-1.5">Transportista</th>
                      <th className="px-2 py-1.5 text-right">Vueltas</th>
                      <th className="px-2 py-1.5 text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byCarrier.map((c) => (
                      <tr key={c.carrierId} className="border-t border-[var(--color-border)]">
                        <td className="px-2 py-1.5">{c.alias}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{c.tripCount}</td>
                        <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                          {fmtCurrency(c.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2">
      <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">{label}</div>
      <div className="mt-0.5 text-base font-semibold tabular-nums">{value}</div>
    </div>
  );
}

// ============================================================================
// Modal: todas las subfaenas del día
// ============================================================================
//
// Se abre con un click en la celda (en mobile, también en una barra). Muestra
// todas las subfaenas del día, incluidas las que no caben en la celda, como
// botones agrupados por faena; cada una abre su detalle del día.
function DayExpandedModal({ date, subfaenasOfDay, subfaenaById, faenaById, onClose, onPickSubfaena }) {
  const groupedByFaena = useMemo(() => {
    const map = new Map();
    for (const s of subfaenasOfDay) {
      const sub = subfaenaById.get(s.subfaenaId);
      const faena = sub ? faenaById.get(sub.faenaId) : null;
      const faenaId = faena?.id || "(sin-faena)";
      if (!map.has(faenaId)) {
        map.set(faenaId, { faena, items: [] });
      }
      map.get(faenaId).items.push(s);
    }
    return [...map.values()].sort((a, b) =>
      (a.faena?.name || "").localeCompare(b.faena?.name || ""),
    );
  }, [subfaenasOfDay, subfaenaById, faenaById]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-baseline justify-between border-b border-[var(--color-border)] px-5 py-3">
          <div>
            <h2 className={`text-lg font-semibold ${isWeekendDate(date) ? "text-[#dc2626]" : ""}`}>
              {humanDate(date)}
            </h2>
            <p className="text-xs text-[var(--color-muted)]">
              {subfaenasOfDay.length} subfaena{subfaenasOfDay.length === 1 ? "" : "s"} activa{subfaenasOfDay.length === 1 ? "" : "s"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--color-muted)] hover:text-[var(--color-text)]"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {groupedByFaena.length === 0 ? (
            <p className="rounded-md border border-dashed border-[var(--color-border)] py-6 text-center text-sm text-[var(--color-muted)]">
              Sin actividad registrada este día.
            </p>
          ) : (
            groupedByFaena.map((g) => (
              <section key={g.faena?.id || "(sin-faena)"}>
                <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                  {g.faena?.name || "Sin faena"}
                </h3>
                <div className="space-y-1.5">
                  {g.items.map((s) => (
                    <button
                      key={s.subfaenaId}
                      type="button"
                      onClick={() => onPickSubfaena(s.subfaenaId)}
                      className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-white shadow-sm hover:opacity-90"
                      style={{ backgroundColor: s.color }}
                    >
                      <span className="truncate">{s.name}</span>
                      <span className="shrink-0 text-xs opacity-90">
                        {s.workerCount} {s.workerCount === 1 ? "trabajador" : "trabajadores"}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
