import { useMemo, useState, useEffect } from "react";
import { cyclesService, jobsService, subjobsService, workersService } from "../services";
import { useCarriers } from "../contexts/CarriersContext";
import { useCatalogs } from "../contexts/CatalogsContext";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { useIsMobile } from "../hooks/useIsMobile";
import { fetchWorkdaysInRange, fetchTripsInRange } from "../services/calendarService";
import { DayDetailDrawer } from "./calendar/DayDetailDrawer";
import { DayExpandedModal } from "./calendar/DayExpandedModal";
import { monthBounds, isWeekendDate } from "./calendar/helpers";
import { Legend } from "./calendar/Legend";
import { MonthGrid } from "./calendar/MonthGrid";

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

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

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
          jobsService.list({ cache: true, persist: true, ttl: 10 * 60 * 1000 }),
          subjobsService.list({ cache: true, persist: true, ttl: 10 * 60 * 1000 }),
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
