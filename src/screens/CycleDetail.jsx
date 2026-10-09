import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { AgGridReact } from "ag-grid-react";
import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import { captureFullWidthBlob, captureFullWidthDataUrl } from "../utils/imageCapture";
import { cyclesService, faenasService, subfaenasService, workdaysService, workersService, groupLeadersService, laborGroupsService, qrPrefixesService } from "../services";
import { formatRutForDisplay } from "../utils/rutUtils";
import { parseAmount } from "../utils/formula";
import { AG_GRID_LOCALE_ES } from "../utils/agGridLocale";
import {
  COSECHA_MODES,
  comboKey as makeComboKey,
  parseComboKey,
  qualityLabel,
  containerLabel,
  tratoTypeLabel,
  comboLabel,
  getDayCombos,
  getDaySingle,
  normalizeDayPricesEntry,
  workdayDocId,
  workdayMapKey,
  normalizeTratoDayPrices,
  getTratoTiers,
  normalizeTratoWorkday,
  getTratoTierTotals,
  PISO_COMBO_KEY,
  effectivePiso,
  getDayPiso,
  pisoTargets,
  pisoAssigned,
} from "../utils/cosechaCombos";
import {
  TRATO_HE_MODES,
  DEFAULT_BONUS_MANEJO,
  DEFAULT_BONUS_SUPERVISION,
  DEFAULT_OVERTIME_RATE,
  DEFAULT_BASE_DAY,
  isWeekendDate,
  isRedDay,
  calcTratoHEAmount,
  workdayHasData,
} from "../utils/tratoHE";
import {
  defaultStages,
  normalizeStages,
  newStageId,
  getStageDayPrice,
  computeStageDayAmount,
  getDayStages,
  getEtapasTotals,
  countingStageIds,
} from "../utils/tratoEtapas";
import { useCatalogs } from "../contexts/CatalogsContext";
import { useToast } from "../contexts/ToastContext";
import Modal from "../components/Modal";
import TextField from "../components/TextField";
import Select from "../components/Select";
import ConfirmDialog from "../components/ConfirmDialog";
import { useIsMobile } from "../hooks/useIsMobile";
import WorkerPickerModal from "../components/WorkerPickerModal";
import WorkerEditModal from "../components/WorkerEditModal";
import TransportsModal from "../components/TransportsModal";
import CycleWorkerList from "../components/CycleWorkerList";
import CycleWorkerEditModal from "../components/CycleWorkerEditModal";
import { matchesSearchQuery } from "../utils/textSearch";
import CycleSummaryModal from "../components/CycleSummaryModal";
import { tripsService } from "../services/transportsService";
import { qrLockedLaborsOf } from "../utils/harvestSync";
import { LABOR_TYPES } from "../utils/laborTypes";

ModuleRegistry.registerModules([AllCommunityModule]);

// Editor de las celdas numéricas de la grilla. Si la celda ya tiene un valor,
// arranca con `=<valor>` para que baste agregar `+50` (o `-10`, `*2`, `/3`)
// y lo evalúe parseAmount(). Si la edición se abrió tipeando un carácter
// (dígito u operador), arranca con ese carácter, como hace AG-Grid.
//
// En AG-Grid v33+ el valor editado se informa con `onValueChange`: el
// `getValue()` del proxy devuelve lo último reportado por ahí, no lo que se
// exponga con useImperativeHandle o useGridCellEditor.
function FormulaCellEditor({ initialValue, onValueChange, eventKey }) {
  const startFromKey = eventKey && /^[\d+\-*/(.]$/.test(eventKey);
  const initial = startFromKey
    ? String(eventKey)
    : (initialValue != null && initialValue !== "" && Number(initialValue) !== 0)
      ? `=${initialValue}`
      : String(initialValue == null ? "" : initialValue);
  const [text, setText] = useState(initial);
  const inputRef = useRef(null);

  // Informa al proxy el valor inicial ya evaluado, así Enter sin editar
  // confirma ese mismo número.
  useEffect(() => {
    onValueChange?.(parseAmount(initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.focus();
    // Cursor al final para que sea instantáneo agregar +/-/*/÷ al valor.
    const len = inputRef.current.value.length;
    inputRef.current.setSelectionRange(len, len);
  }, []);

  const handleChange = (e) => {
    const v = e.target.value;
    setText(v);
    // Informa al proxy el número ya evaluado en cada tecla. Una expresión a
    // medio escribir (ej. "=100+") vale 0 hasta completarla.
    onValueChange?.(parseAmount(v));
  };

  return (
    <input
      ref={inputRef}
      type="text"
      value={text}
      onChange={handleChange}
      style={{
        width: "100%",
        height: "100%",
        border: "none",
        outline: "none",
        padding: "0 4px",
        fontFamily: "inherit",
        fontSize: "inherit",
        textAlign: "right",
        background: "transparent",
        color: "var(--color-text)",
      }}
    />
  );
}

const todayStr = () => new Date().toISOString().slice(0, 10);
const newId = () => (crypto?.randomUUID?.() || `id_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`);

// Primer y último día de cycle.days. Al cerrar el ciclo, startDate y endDate
// toman estos valores: el rango de lo trabajado, no la fecha de creación ni
// la del cierre. Sin días, devuelven startDate/endDate (o hoy si faltan).
const firstWorkedDay = (cycle) => {
  const days = cycle?.days;
  if (Array.isArray(days) && days.length > 0) {
    return days.reduce((min, d) => (d < min ? d : min), days[0]);
  }
  return cycle?.startDate || todayStr();
};
const lastWorkedDay = (cycle) => {
  const days = cycle?.days;
  if (Array.isArray(days) && days.length > 0) {
    return days.reduce((max, d) => (d > max ? d : max), days[0]);
  }
  return cycle?.endDate || todayStr();
};

const fmtCurrency = (value) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", minimumFractionDigits: 0 }).format(
    Number(value) || 0,
  );

const SINGLE_COMBO = "0_0";

function normalizeCycle(c) {
  let days = Array.isArray(c.days) ? [...c.days] : null;
  let labors = c.labors;
  if (!labors || !labors.length) {
    labors = [{ id: newId(), name: "Principal", type: "main", workers: c.workers || [] }];
  }
  if (!days) {
    const union = new Set();
    for (const l of labors) for (const d of l.days || []) union.add(d);
    days = [...union].sort();
  }
  labors = labors.map(({ days: _drop, ...rest }) => rest);
  return { ...c, days, labors };
}

function LeaderPickerModal({ open, onClose, leaders, workerName, busy, onPick }) {
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (open) setFilter("");
  }, [open]);

  const filtered = useMemo(() => {
    if (!filter.trim()) return leaders;
    return leaders.filter((l) => matchesSearchQuery(l, filter));
  }, [leaders, filter]);

  return (
    <Modal open={open} onClose={() => !busy && onClose()} title={`Asignar líder a ${workerName}`} size="md">
      <div className="space-y-3">
        <TextField
          label="Buscar líder"
          value={filter}
          onChange={setFilter}
          autoFocus
          placeholder="Filtrar..."
        />
        <div className="max-h-72 overflow-y-auto rounded-md border border-[var(--color-border)]">
          {leaders.length === 0 ? (
            <div className="p-3 text-sm text-[var(--color-muted)]">
              No hay líderes habilitados. Habilita líderes en la colección <code>groupLeader</code>.
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-3 text-sm text-[var(--color-muted)]">Sin resultados.</div>
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {filtered.map((l) => (
                <li key={l}>
                  <button
                    onClick={() => onPick(l)}
                    disabled={busy}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
                  >
                    <span className="font-medium">{l}</span>
                    <span className="text-xs text-[var(--color-muted)]">→</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}

// Encabezado de las columnas (o del grupo de columnas) de un día: la fecha y
// un 📝 que se resalta si el día tiene anotación. Un click abre el modal de
// la anotación y el tooltip muestra su texto. Con `clickable=false` (día sin
// producción ni anotación en esta labor) muestra solo la fecha.
function DayHeader(props) {
  const { date, note, onClickNote, displayName, clickable = true } = props;
  const hasNote = !!String(note || "").trim();
  if (!clickable) {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", width: "100%", height: "100%", padding: "0 4px",
      }}>
        <span>{displayName || date}</span>
      </span>
    );
  }
  return (
    <span
      onClick={(e) => { e.stopPropagation(); onClickNote?.(date); }}
      title={hasNote ? note : "Agregar anotación del día"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        cursor: "pointer",
        width: "100%",
        height: "100%",
        userSelect: "none",
        padding: "0 4px",
      }}
    >
      <span>{displayName || date}</span>
      <span style={{
        fontSize: 12,
        color: hasNote ? "var(--color-accent)" : "var(--color-muted)",
        opacity: hasNote ? 1 : 0.55,
      }}>📝</span>
    </span>
  );
}

function GroupHeaderRowRenderer(props) {
  const data = props.data || {};
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "0 12px",
        height: "100%",
        background: "var(--color-accent-soft)",
        borderTop: "1px solid var(--color-border)",
        borderBottom: "1px solid var(--color-border)",
        fontWeight: 600,
        fontSize: 12,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        color: "var(--color-accent)",
      }}
    >
      <span>👥 {data._leader}</span>
      <span style={{ opacity: 0.7, fontWeight: 400 }}>· {data._count} trab.</span>
    </div>
  );
}

// Columna "Piso" al final de cada día en cosecha/trato: un click crea o borra
// el workday `_piso` del trabajador en ese día. Se habilita si el día tiene
// piso configurado y el trabajador ya tiene producción ese día. Muestra el
// piso y el total del día (producción + piso); el tooltip desglosa la suma.
function buildPisoChildCol(date, labor, dayPrices, disabled, togglePiso) {
  const eff = effectivePiso(labor, dayPrices, date);
  return {
    headerName: "Piso",
    headerTooltip: eff > 0 ? `Piso del día: ${fmtCurrency(eff)}` : "Sin piso configurado",
    field: `${date}__piso`,
    editable: false,
    width: 80,
    cellStyle: { textAlign: "center", padding: 0 },
    cellRenderer: (p) => {
      const amt = Number(p.value) || 0;
      const checked = amt > 0;
      const dayTotal = Number(p.data?.[`${date}__total`]) || 0;
      const production = dayTotal - amt;
      const hasWd = !!p.data?.[`${date}__piso_has_wd`];
      const canToggle = !disabled && hasWd && eff > 0;
      const breakdown = dayTotal > 0 ? `\n${fmtCurrency(production)} producción + ${fmtCurrency(amt)} piso = ${fmtCurrency(dayTotal)}` : "";
      const title = !hasWd
        ? "Asigna primero producción este día"
        : eff === 0
          ? "Configura el piso del día o el default de la labor"
          : `${checked ? "Quitar piso" : "Asignar piso"} (${fmtCurrency(eff)})${breakdown}`;
      return (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (canToggle) togglePiso(labor.id, date, p.data.rut);
          }}
          disabled={!canToggle}
          title={title}
          className={`flex h-full w-full flex-col items-center justify-center gap-0 leading-tight transition-colors ${
            checked
              ? "bg-amber-500/20 text-amber-700 hover:bg-amber-500/30 dark:text-amber-300"
              : canToggle
                ? "text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)]"
                : "cursor-not-allowed text-[var(--color-muted)] opacity-30"
          }`}
        >
          <div className="flex items-center gap-1">
            <span className="text-sm">{checked ? "🪙" : "·"}</span>
            {checked && <span className="text-[10px] tabular-nums">{fmtCurrency(amt)}</span>}
          </div>
          {dayTotal > 0 && (
            <span className="text-[10px] font-semibold tabular-nums text-[var(--color-accent)]">{fmtCurrency(dayTotal)}</span>
          )}
        </button>
      );
    },
  };
}

function buildRowsCosecha(workers, days, wdMap, dayCombosByDate) {
  return workers.map((w) => {
    const row = { rut: w.rut, name: w.name, _isTemp: !!w.isTemp, _isOrphan: !!w.isOrphan };
    let total = 0;
    for (const d of days) {
      const combos = dayCombosByDate[d] || [];
      let dayTotal = 0;
      let hasProduction = false;
      for (const c of combos) {
        const wd = wdMap[workdayMapKey(w.rut, d, c.key)];
        const qty = Number(wd?.qty) || 0;
        const amt = Number(wd?.amount) || 0;
        if (wd) hasProduction = true;
        row[`${d}__${c.key}`] = qty;
        row[`${d}__${c.key}__amt`] = amt;
        dayTotal += amt;
      }
      const pisoWd = wdMap[workdayMapKey(w.rut, d, PISO_COMBO_KEY)];
      const pisoAmt = pisoWd ? Number(pisoWd.amount) || 0 : 0;
      row[`${d}__piso`] = pisoAmt;
      row[`${d}__piso_has_wd`] = hasProduction;
      dayTotal += pisoAmt;
      row[`${d}__total`] = dayTotal;
      total += dayTotal;
    }
    row.total = total;
    return row;
  });
}

function buildRowsTratoHE(workers, days, wdMap) {
  return workers.map((w) => {
    const row = { rut: w.rut, name: w.name, _isTemp: !!w.isTemp, _isOrphan: !!w.isOrphan };
    let total = 0;
    for (const d of days) {
      const wd = wdMap[workdayMapKey(w.rut, d, SINGLE_COMBO)];
      const qty = Number(wd?.qty) || 0;
      const he = Number(wd?.overtimeHours) || 0;
      const m = !!wd?.hasManejo;
      const s = !!wd?.hasSupervision;
      const x = Number(wd?.extras) || 0;
      const amt = Number(wd?.amount) || 0;
      row[`${d}__qty`] = qty;
      row[`${d}__he`] = he;
      row[`${d}__m`] = m;
      row[`${d}__s`] = s;
      row[`${d}__x`] = x;
      row[`${d}__amt`] = amt;
      total += amt;
    }
    row.total = total;
    return row;
  });
}

function buildRowsTrato(workers, days, wdMap, dayTiersByDate) {
  return workers.map((w) => {
    const row = { rut: w.rut, name: w.name, _isTemp: !!w.isTemp, _isOrphan: !!w.isOrphan };
    let total = 0;
    for (const d of days) {
      const tiers = dayTiersByDate[d] || [];
      let dayTotal = 0;
      let hasProduction = false;
      for (const t of tiers) {
        const wd = wdMap[workdayMapKey(w.rut, d, t.key)];
        const qty = Number(wd?.qty) || 0;
        const amt = Number(wd?.amount) || 0;
        if (wd) hasProduction = true;
        row[`${d}__${t.key}`] = qty;
        row[`${d}__${t.key}__amt`] = amt;
        dayTotal += amt;
      }
      const pisoWd = wdMap[workdayMapKey(w.rut, d, PISO_COMBO_KEY)];
      const pisoAmt = pisoWd ? Number(pisoWd.amount) || 0 : 0;
      row[`${d}__piso`] = pisoAmt;
      row[`${d}__piso_has_wd`] = hasProduction;
      dayTotal += pisoAmt;
      row[`${d}__total`] = dayTotal;
      total += dayTotal;
    }
    row.total = total;
    return row;
  });
}

// Filas de la grilla para tratoEtapas. Las columnas por día son las etapas
// visibles ese día (las que tienen precio configurado o ya tienen producción),
// y la key del workday es el stageId. `row[${d}__${stageId}]` = qty, `__amt` =
// monto ya calculado (qty × precio del día).
function buildRowsTratoEtapas(workers, days, wdMap, dayStagesByDate) {
  return workers.map((w) => {
    const row = { rut: w.rut, name: w.name, _isTemp: !!w.isTemp, _isOrphan: !!w.isOrphan };
    let total = 0;
    for (const d of days) {
      const stages = dayStagesByDate[d] || [];
      let dayTotal = 0;
      for (const st of stages) {
        const wd = wdMap[workdayMapKey(w.rut, d, st.id)];
        const qty = Number(wd?.qty) || 0;
        const amt = Number(wd?.amount) || 0;
        row[`${d}__${st.id}`] = qty;
        row[`${d}__${st.id}__amt`] = amt;
        dayTotal += amt;
      }
      row[`${d}__total`] = dayTotal;
      total += dayTotal;
    }
    row.total = total;
    return row;
  });
}

function buildRowsNormal(workers, days, wdMap) {
  return workers.map((w) => {
    const row = { rut: w.rut, name: w.name, _isTemp: !!w.isTemp, _isOrphan: !!w.isOrphan, _monthly: !!w.monthly };
    let total = 0;
    for (const d of days) {
      const wd = wdMap[workdayMapKey(w.rut, d, SINGLE_COMBO)];
      const amount = Number(wd?.amount) || 0;
      row[d] = amount;
      // Marca si existe la jornada, para el ✓ de las celdas de sueldo mensual.
      row[`${d}__present`] = !!wd;
      total += amount;
    }
    row.total = total;
    return row;
  });
}

// Editor de etapas de una labor "A trato por etapas": el nombre de cada etapa
// y si cuenta para el conteo de unidades. Pueden contar varias (ej.
// Instalación y Completo). El precio de cada etapa se configura por día.
function StagesEditor({ stages, onChange }) {
  const update = (idx, patch) =>
    onChange(stages.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  const add = () =>
    onChange([...stages, { id: newStageId(), name: "", counts: false }]);
  const remove = (idx) => onChange(stages.filter((_, i) => i !== idx));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Etapas</span>
        <button
          type="button"
          onClick={add}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)]"
        >
          + Agregar etapa
        </button>
      </div>
      <p className="text-xs text-[var(--color-muted)]">
        Cada etapa: nombre y si cuenta para el conteo de unidades (✓). El precio
        se configura por día abajo, igual que en trato. Marcá las que cuentan
        (ej. Instalación, Completo); las que no cuentan pagan pero no suman unidades.
      </p>
      {stages.length === 0 && (
        <p className="text-xs text-[var(--color-danger)]">Agregá al menos una etapa.</p>
      )}
      {stages.map((st, idx) => (
        <div key={st.id || idx} className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2">
          <input
            value={st.name}
            onChange={(e) => update(idx, { name: e.target.value })}
            placeholder="Nombre (ej. Preparación)"
            className="min-w-0 flex-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm outline-none focus:border-[var(--color-accent)]"
          />
          <label className="flex shrink-0 items-center gap-1 text-xs" title="¿Cuenta para el conteo de unidades?">
            <input
              type="checkbox"
              checked={!!st.counts}
              onChange={(e) => update(idx, { counts: e.target.checked })}
            />
            cuenta
          </label>
          <button
            type="button"
            onClick={() => remove(idx)}
            title="Quitar etapa"
            className="shrink-0 text-[var(--color-danger)]"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

export default function CycleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { catalogs, addEntry: addCatalogEntry, renameEntry: renameCatalogEntry } = useCatalogs();
  const toast = useToast();

  const [cycle, setCycle] = useState(null);
  const [faena, setFaena] = useState(null);
  const [subfaena, setSubfaena] = useState(null);
  // Agrupaciones de labor de esta subfaena (Poda, Riego, etc.), para hilar
  // labores del mismo tipo a través de ciclos. Ver laborGroupsService.
  const [laborGroups, setLaborGroups] = useState([]);
  const [workdaysByLabor, setWorkdaysByLabor] = useState({});

  // Prefijos QR apuntados a este ciclo. Ver `qrLockedLabors` más abajo.
  const [qrPrefixes, setQrPrefixes] = useState([]);
  // Confirmación del piso masivo: { laborId, date, ruts, amount }.
  const [pisoBulk, setPisoBulk] = useState(null);
  const [pisoBulkBusy, setPisoBulkBusy] = useState(false);
  // Confirmación de quitar el piso del día: { laborId, date, libres, liquidados }.
  const [pisoRemove, setPisoRemove] = useState(null);
  const [pisoRemoveBusy, setPisoRemoveBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeLaborId, setActiveLaborId] = useState(null);

  const [addDayOpen, setAddDayOpen] = useState(false);
  const [newDay, setNewDay] = useState(todayStr());
  const [selectedDays, setSelectedDays] = useState(() => new Set());
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  // Anotaciones por (labor, día) en cycle.dayNotesByLabor = { [laborId]:
  // { "YYYY-MM-DD": "texto" } }. cycle.dayNotes (compartido entre labores)
  // solo se lee, cuando la labor no tiene anotación propia para ese día. Se
  // editan en un modal que abre el encabezado de la fecha (DayHeader).
  const [editingDayNote, setEditingDayNote] = useState(null); // { laborId, date } o null
  const [editingDayNoteText, setEditingDayNoteText] = useState("");
  const [dayNoteBusy, setDayNoteBusy] = useState(false);

  // Modal para agregar un precio (tier) a un día de trato.
  const [addPriceModal, setAddPriceModal] = useState(null);
  // forma: { laborId, date, nextKey, defaultMode, value }
  const [addPriceBusy, setAddPriceBusy] = useState(false);

  // Secciones colapsables (métricas y precios), persistidas por dispositivo,
  // para dejarle más alto a la grilla.
  const [metricsCollapsed, setMetricsCollapsed] = useState(() => {
    try { return localStorage.getItem("cycleDetail.metricsCollapsed") === "true"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("cycleDetail.metricsCollapsed", String(metricsCollapsed)); } catch { /* noop */ }
  }, [metricsCollapsed]);
  const [pricesCollapsed, setPricesCollapsed] = useState(() => {
    try { return localStorage.getItem("cycleDetail.pricesCollapsed") === "true"; } catch { return false; }
  });
  // Toggle maestro: colapsa TODO el bloque de controles (título+botones,
  // métricas, tabs de labor, barra de la labor activa, chips de días,
  // precios) en una sola línea, para maximizar el alto de la grilla. Los
  // toggles individuales (metricsCollapsed/pricesCollapsed) siguen aplicando
  // cuando este está expandido.
  const [toolbarCollapsed, setToolbarCollapsed] = useState(() => {
    try { return localStorage.getItem("cycleDetail.toolbarCollapsed") === "true"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("cycleDetail.toolbarCollapsed", String(toolbarCollapsed)); } catch { /* noop */ }
  }, [toolbarCollapsed]);
  useEffect(() => {
    try { localStorage.setItem("cycleDetail.pricesCollapsed", String(pricesCollapsed)); } catch { /* noop */ }
  }, [pricesCollapsed]);

  const [pickerOpen, setPickerOpen] = useState(false);
  // RUT sintético (TEMP-*) del temporal al que se le está asignando un RUT
  // real. Con valor, abre un segundo selector que reemplaza esa entrada (y
  // reescribe todas sus jornadas) por el trabajador elegido.
  const [assignTempRut, setAssignTempRut] = useState(null);
  const [assignBusy, setAssignBusy] = useState(false);

  const [removeWorker, setRemoveWorker] = useState(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  // Edición rápida del trabajador desde la grilla — doble click en la
  // columna RUT abre el mismo modal del módulo de Trabajadores. No aplica
  // a temporales (no existen como doc en `worker`).
  const [editingWorkerRut, setEditingWorkerRut] = useState(null);

  const [laborForm, setLaborForm] = useState(null);
  const [removeLabor, setRemoveLabor] = useState(null);

  const [photoMode, setPhotoMode] = useState(false);
  // En mobile se muestra la lista de trabajadores (CycleWorkerList) en vez de
  // la grilla, que obliga a desplazarse por decenas de columnas de día. Este
  // toggle muestra la grilla completa.
  const [showDesktopGrid, setShowDesktopGrid] = useState(false);
  // Modal mobile: edita un trabajador a la vez (una fila por día). Se cierra
  // al cambiar de labor, donde ese rut puede no existir.
  const [editingCycleWorkerRut, setEditingCycleWorkerRut] = useState(null);
  const [copyToast, setCopyToast] = useState("");
  const [closeFlow, setCloseFlow] = useState(false);
  const [closeBusy, setCloseBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [dayPrices, setDayPrices] = useState({});
  const [localPriceInputs, setLocalPriceInputs] = useState({});

  const [addComboFor, setAddComboFor] = useState(null);
  const [removeCombo, setRemoveCombo] = useState(null);
  const [confirmRemoveDay, setConfirmRemoveDay] = useState(null); // fecha (string) o null
  const [confirmReopen, setConfirmReopen] = useState(false);
  const [catalogsOpen, setCatalogsOpen] = useState(false);
  // Modales de tratoHE
  const [bonusEdit, setBonusEdit] = useState(null);   // { laborId, date, workerRut }
  const [dayModeEdit, setDayModeEdit] = useState(null); // { laborId, date }
  const [defaultLeadersOpen, setDefaultLeadersOpen] = useState(false);
  const [tratoHEView, setTratoHEView] = useState("detalle"); // "detalle" | "resumen"
  const [cosechaView, setCosechaView] = useState("detalle"); // "detalle" | "resumen"
  const [tratoView, setTratoView] = useState("detalle"); // "detalle" | "resumen"
  const [transportsOpen, setTransportsOpen] = useState(false);
  const [cycleTrips, setCycleTrips] = useState([]);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [groupView, setGroupView] = useState(() => {
    try { return localStorage.getItem("cycleDetail.groupView") === "group" ? "group" : "all"; }
    catch { return "all"; }
  });
  const [allWorkers, setAllWorkers] = useState([]);
  const [enabledLeaders, setEnabledLeaders] = useState([]);
  const [groupBusy, setGroupBusy] = useState(false);
  // Oculta de la grilla a los trabajadores con $0 en esta labor. Se ignora
  // mientras haya un filtro de columna activo (ver isExternalFilterPresent /
  // doesExternalFilterPass), así una búsqueda también encuentra a quien está
  // en $0.
  const [onlyWithProduction, setOnlyWithProduction] = useState(false);
  const [columnFilterActive, setColumnFilterActive] = useState(false);

  const gridRef = useRef(null);
  const photoRef = useRef(null);
  // Modo mobile (<768px): oculta la columna RUT y angosta las columnas para
  // que entren más días en pantalla.
  const isMobile = useIsMobile();
  // El toggle Detalle/Resumen solo cambia columnas de la grilla, así que se
  // oculta mientras la grilla no se ve (mobile con CycleWorkerList).
  const gridVisible = !isMobile || showDesktopGrid;
  // Pila de deshacer: cada entrada es un lote (array) de { rut, field, oldValue }.
  // Ctrl+Z saca un lote y vuelve a escribir los valores anteriores. Una edición
  // suelta apila un lote de 1; fillDown y pegar apilan uno de N, que se deshace
  // en un solo paso.
  const undoStackRef = useRef([]);
  const isUndoingRef = useRef(false);
  const pendingBatchRef = useRef(null);
  const UNDO_LIMIT = 50;

  useEffect(() => {
    (async () => {
      setLoading(true);
      const c = await cyclesService.getById(id);
      if (!c) { setLoading(false); return; }
      const normalized = normalizeCycle(c);
      const needsPersist =
        !c.labors || !c.labors.length || !Array.isArray(c.days) || (c.labors || []).some((l) => Array.isArray(l.days));
      if (needsPersist) {
        await cyclesService.update(id, { days: normalized.days, labors: normalized.labors });
      }
      setCycle(normalized);
      setActiveLaborId(normalized.labors[0]?.id || null);

      const rawDP = c.dayPrices || {};
      const normalizedDP = {};
      let dpChanged = false;
      for (const lid of Object.keys(rawDP)) {
        normalizedDP[lid] = {};
        const labor = (c.labors || []).find((l) => l.id === lid);
        const laborDefaultMode = labor?.tratoMode || "unit";
        for (const date of Object.keys(rawDP[lid])) {
          const before = rawDP[lid][date];
          const isTratoType = labor?.type === "trato";
          const after = isTratoType
            ? normalizeTratoDayPrices(before, laborDefaultMode)
            : normalizeDayPricesEntry(before);
          normalizedDP[lid][date] = after;
          if (JSON.stringify(before) !== JSON.stringify(after)) dpChanged = true;
        }
      }
      setDayPrices(normalizedDP);
      if (dpChanged) await cyclesService.update(id, { dayPrices: normalizedDP });

      if (normalized.faenaId) setFaena(await faenasService.getById(normalized.faenaId));
      if (normalized.subfaenaId) {
        setSubfaena(await subfaenasService.getById(normalized.subfaenaId));
        // Sin `order`: where(subfaenaId) + orderBy(name) pediría un índice
        // compuesto en Firestore. La lista es chica y se ordena en el cliente.
        const groups = await laborGroupsService.list({ wheres: [["subfaenaId", "==", normalized.subfaenaId]] });
        setLaborGroups([...groups].sort((a, b) => a.name.localeCompare(b.name)));
      }

      const wds = await workdaysService.list({ wheres: [["cycleId", "==", id]] });
      const byLabor = {};
      const labors = normalized.labors || [];
      for (const w of wds) {
        const lid = w.laborId || labors[0]?.id;
        // Clave de combo/tier (ck) del mapa en memoria: el 5.º segmento del
        // docId ("...__rut__date__ck"). Sin ese segmento, en trato es el tier
        // "t0" y en el resto el combo de qualityX/containerY. Las filas de
        // trato buscan sus jornadas por tier ("t0", "t1"…).
        const parts = String(w.id || "").split("__");
        const laborForDoc = labors.find((l) => l.id === lid);
        const isTrato = laborForDoc?.type === "trato";
        let ck;
        if (parts.length >= 5) {
          ck = parts.slice(4).join("__");
        } else if (isTrato) {
          ck = "t0";
        } else {
          const x = Number(w.qualityX) || 0;
          const y = Number(w.containerY) || 0;
          ck = makeComboKey(x, y);
        }
        if (!byLabor[lid]) byLabor[lid] = {};
        // Los workdays de piso no se normalizan como trato: no tienen tiers.
        const normalizedWd = w.pisoOnly || ck === PISO_COMBO_KEY ? w : normalizeTratoWorkday(w);
        byLabor[lid][workdayMapKey(w.workerRut, w.date, ck)] = normalizedWd;
      }
      setWorkdaysByLabor(byLabor);
      setLoading(false);
    })();
  }, [id]);

  const closed = cycle?.status === "closed";
  // Un ciclo cerrado es de solo lectura para todos, admin incluido; para
  // editarlo hay que reabrirlo.
  //
  // El corte es el cierre del ciclo, no el `payrollId` del workday: se paga a
  // mitad de ciclo y se sigue trabajando ahí para revisar y generar
  // diferencias.
  const readOnly = closed;

  // Toda escritura del ciclo y de sus workdays pasa por `cycleWrite`/`wdWrite`, que
  // verifican en un solo punto que el ciclo esté abierto. assertOpen lanza en
  // vez de devolver: los llamadores actualizan el estado local justo después
  // de escribir.
  //
  // Quedan fuera la normalización del loader (corre al montar, no es una
  // edición del usuario) y cerrar/reabrir el ciclo, que es lo que levanta el
  // candado.
  const assertOpen = () => {
    if (!closed) return;
    toast.warning("El ciclo está cerrado. Reábrelo para poder editarlo.");
    throw new Error("Ciclo cerrado: no se puede editar");
  };
  const cycleWrite = async (patch) => {
    assertOpen();
    return cyclesService.update(id, patch);
  };
  const wdWrite = {
    upsert: async (docId, data, opts) => {
      assertOpen();
      return workdaysService.upsert(docId, data, opts);
    },
    remove: async (docId) => {
      assertOpen();
      return workdaysService.remove(docId);
    },
  };

  // Prefijos QR (`qrPrefixes`): pocos documentos que cambian poco, en caché
  // persistida con TTL de 1 h. Dicen qué labores alimenta la app de escaneo
  // antes de que llegue el primer pesaje.
  useEffect(() => {
    qrPrefixesService
      .list({ order: ["label", "asc"], cache: true, persist: true, ttl: 60 * 60 * 1000 })
      .then(setQrPrefixes)
      .catch(() => { /* si falla, la pantalla sigue sin el candado QR */ });
  }, []);

  // laborId → prefijo QR que la sincroniza. La sincronización pisa `qty` y
  // `amount`, así que esas celdas se bloquean (ver utils/harvestSync.js).
  const qrLockedLabors = useMemo(
    () => qrLockedLaborsOf(qrPrefixes, cycle?.id),
    [qrPrefixes, cycle?.id],
  );

  const qrPrefixForActive = activeLaborId ? qrLockedLabors.get(activeLaborId) : null;
  const qrLocked = !!qrPrefixForActive;

  // Navegación entre ciclos hermanos (misma faena y subfaena), ordenados por
  // su primer día trabajado (mínimo de cycle.days), no por el número del
  // label. Se recarga solo cuando cambia la faena o la subfaena.
  const [siblingCycles, setSiblingCycles] = useState(null);
  useEffect(() => {
    const faenaId = cycle?.faenaId;
    if (!faenaId) { setSiblingCycles(null); return; }
    const subfaenaId = cycle?.subfaenaId || null;
    let cancelled = false;
    (async () => {
      const list = await cyclesService.list({
        wheres: [["faenaId", "==", faenaId]],
        cache: true,
        ttl: 2 * 60 * 1000,
      });
      if (cancelled) return;
      const scope = list.filter((c) => (c.subfaenaId || null) === subfaenaId);
      // Un ciclo sin días se ordena por startDate o createdAt, nunca por hoy
      // (a diferencia de firstWorkedDay).
      const firstDayForSort = (c) => {
        const days = c.days;
        if (Array.isArray(days) && days.length > 0) {
          return days.reduce((min, d) => (d < min ? d : min), days[0]);
        }
        return c.startDate || c.createdAt?.toDate?.()?.toISOString?.() || "";
      };
      scope.sort((a, b) => firstDayForSort(a).localeCompare(firstDayForSort(b)));
      setSiblingCycles(scope.map((c) => ({ id: c.id, label: c.label })));
    })();
    return () => { cancelled = true; };
  }, [cycle?.faenaId, cycle?.subfaenaId]);

  const cycleNavIndex = siblingCycles ? siblingCycles.findIndex((c) => c.id === id) : -1;
  const prevCycle = cycleNavIndex > 0 ? siblingCycles[cycleNavIndex - 1] : null;
  const nextCycle = cycleNavIndex >= 0 && cycleNavIndex < (siblingCycles?.length || 0) - 1
    ? siblingCycles[cycleNavIndex + 1]
    : null;

  const loadAllWorkers = async () => {
    const list = await workersService.list({
      order: ["name", "asc"],
      cache: true,
      persist: true,
      ttl: 2 * 60 * 60 * 1000,
    });
    setAllWorkers(list);
  };

  const loadEnabledLeaders = async () => {
    const list = await groupLeadersService.list({
      cache: true,
      persist: true,
      ttl: 24 * 60 * 60 * 1000,
    });
    const names = list
      .filter((d) => d.habilitado === true)
      .map((d) => String(d.name || d.nombre || d.id || "").trim().toUpperCase())
      .filter(Boolean);
    const dedup = [...new Set(names)].sort();
    setEnabledLeaders(dedup);
  };

  useEffect(() => {
    loadAllWorkers();
    loadEnabledLeaders();
  }, []);

  useEffect(() => {
    try { localStorage.setItem("cycleDetail.groupView", groupView); } catch { /* ignore */ }
  }, [groupView]);

  const rutToLeader = useMemo(() => {
    const m = new Map();
    for (const w of allWorkers) {
      const l = String(w.groupLeader?.[0] || "").trim().toUpperCase();
      if (l) m.set(w.id, l);
    }
    // Los temporales solo existen en labor.workers y guardan el líder como
    // string, no como el array del doc del trabajador. Se recorren todas las
    // labores para que el mapa sirva al cambiar de labor activa.
    for (const labor of cycle?.labors || []) {
      for (const w of labor.workers || []) {
        if (!w?.isTemp) continue;
        const l = String(w.groupLeader || "").trim().toUpperCase();
        if (l) m.set(w.rut, l);
      }
    }
    return m;
  }, [allWorkers, cycle]);

  // Nombre vigente de cada trabajador según la caché de trabajadores. Las
  // filas lo usan para reflejar los cambios de nombre hechos en Trabajadores
  // sin reescribir la copia en `labor.workers[i].name`.
  const rutToName = useMemo(() => {
    const m = new Map();
    for (const w of allWorkers) {
      if (w?.name) m.set(w.id, w.name);
    }
    return m;
  }, [allWorkers]);

  const LEADER_LOCAL = "CHILENOS";
  const LEADER_FOREIGN = "EXTRANJEROS";
  const LEADER_NONE = "__NONE__";

  const orderLeaders = (leaders) => {
    const arr = [...leaders];
    return arr.sort((a, b) => {
      if (a === b) return 0;
      if (a === LEADER_LOCAL) return -1;
      if (b === LEADER_LOCAL) return 1;
      if (a === LEADER_FOREIGN) return -1;
      if (b === LEADER_FOREIGN) return 1;
      if (a === LEADER_NONE) return 1;
      if (b === LEADER_NONE) return -1;
      return a.localeCompare(b);
    });
  };

  const activeLabor = useMemo(
    () => cycle?.labors?.find((l) => l.id === activeLaborId) || cycle?.labors?.[0] || null,
    [cycle, activeLaborId],
  );

  useEffect(() => {
    setEditingCycleWorkerRut(null);
  }, [activeLabor?.id]);

  const isCosechaLabor = activeLabor?.type === "cosecha";
  const isTratoLabor = activeLabor?.type === "trato";
  const isTratoEtapasLabor = activeLabor?.type === "tratoEtapas";
  const isTratoHELabor = activeLabor?.type === "tratoHE";
  const isQtyLabor = isCosechaLabor || isTratoLabor || isTratoEtapasLabor || isTratoHELabor;
  // Etapas de la labor por etapas (fijas, no por día), normalizadas.
  const etapas = useMemo(
    () => (isTratoEtapasLabor ? normalizeStages(activeLabor?.stages) : []),
    [isTratoEtapasLabor, activeLabor],
  );
  // Labores que pagan un monto por día por trabajador (main/supervision/extra).
  // No usan combos ni tiers — un único precio sugerido por día se persiste en
  // dayPrices y aparece como hint clickeable en la celda del trabajador.
  const isNormalLabor = !!activeLabor && !isQtyLabor;
  const days = cycle?.days || [];
  const workers = activeLabor?.workers || [];
  const wdMap = (activeLabor && workdaysByLabor[activeLabor.id]) || {};
  // Fechas con al menos un workday de esta labor. El ciclo comparte `days`
  // entre todas sus labores; esto acota en qué fechas se ofrece anotar.
  const activeLaborDatesWithProduction = new Set(
    Object.keys(wdMap).map((k) => k.split("__")[1]),
  );
  const defaultMode = activeLabor?.cosechaMode || activeLabor?.tratoMode || "unit";

  // `workerId` que se graba en cada workday junto a `workerRut`: el `id` de la
  // entrada del roster de la labor con ese rut, o el mismo rut si la entrada
  // no tiene `id` (ver docs/data-model.md).
  const workerIdFor = (laborId, rut) => {
    const labor = cycle?.labors?.find((l) => l.id === laborId);
    return labor?.workers?.find((w) => w.rut === rut)?.id || rut;
  };

  // Días de la labor activa que muestran la columna "Piso": los que tienen
  // piso configurado en `dayPrices` o algún workday pisoOnly.
  const daysWithPiso = useMemo(() => {
    if (!activeLabor || (!isCosechaLabor && !isTratoLabor)) return new Set();
    const s = new Set();
    const dp = dayPrices[activeLabor.id] || {};
    for (const d in dp) {
      if ((Number(dp[d]?.piso) || 0) > 0) s.add(d);
    }
    for (const k in wdMap) {
      const wd = wdMap[k];
      if (wd?.pisoOnly && wd.date) s.add(wd.date);
    }
    return s;
  }, [activeLabor, isCosechaLabor, isTratoLabor, dayPrices, wdMap]);

  const dayCombosByDate = useMemo(() => {
    if (!isCosechaLabor || !activeLabor) return {};
    const wdMapForLabor = workdaysByLabor[activeLabor.id] || {};
    const out = {};
    for (const d of days) {
      const fromPrices = getDayCombos(dayPrices, activeLabor.id, d, defaultMode);
      const seen = new Set(fromPrices.map((c) => c.key));
      const result = [...fromPrices];
      for (const k in wdMapForLabor) {
        if (!k.includes(`__${d}__`)) continue;
        const wd = wdMapForLabor[k];
        const x = Number(wd.qualityX) || 0;
        const y = Number(wd.containerY) || 0;
        const ck = makeComboKey(x, y);
        if (!seen.has(ck) && (Number(wd.qty) || 0) > 0) {
          result.push({ key: ck, x, y, price: 0, mode: defaultMode });
          seen.add(ck);
        }
      }
      result.sort((a, b) => a.x - b.x || a.y - b.y);
      out[d] = result;
    }
    return out;
  }, [isCosechaLabor, activeLabor, days, dayPrices, defaultMode, workdaysByLabor]);

  const dayTiersByDate = useMemo(() => {
    if (!isTratoLabor || !activeLabor) return {};
    const wdMapForLabor = workdaysByLabor[activeLabor.id] || {};
    const out = {};
    for (const d of days) {
      const fromPrices = getTratoTiers(dayPrices, activeLabor.id, d, defaultMode);
      const seen = new Set(fromPrices.map((t) => t.key));
      const result = [...fromPrices];
      for (const k in wdMapForLabor) {
        if (!k.includes(`__${d}__`)) continue;
        const wd = wdMapForLabor[k];
        if (!wd?.tiers) continue;
        for (const tk of Object.keys(wd.tiers)) {
          const tierKey = `t${tk}`;
          if (!seen.has(tierKey) && Number(wd.tiers[tk]?.qty) > 0) {
            const existing = dayPrices?.[activeLabor.id]?.[d]?.[tierKey] || {};
            result.push({ key: tierKey, index: Number(tk), price: Number(existing.price) || 0, mode: existing.mode || defaultMode });
            seen.add(tierKey);
          }
        }
      }
      result.sort((a, b) => a.index - b.index);
      out[d] = result;
    }
    return out;
  }, [isTratoLabor, activeLabor, days, dayPrices, defaultMode, workdaysByLabor]);

  // Etapas visibles por día en tratoEtapas: las etapas fijas de la labor que
  // tienen precio ese día o producción, con el precio y el modo del día
  // resueltos. Cada entrada: { id, name, counts, price, mode }.
  const dayStagesByDate = useMemo(() => {
    if (!isTratoEtapasLabor || !activeLabor) return {};
    const wdMapForLabor = workdaysByLabor[activeLabor.id] || {};
    const out = {};
    for (const d of days) {
      // Etapas con producción ese día: se muestran aunque no tengan precio.
      const withData = new Set();
      for (const k in wdMapForLabor) {
        if (!k.includes(`__${d}__`)) continue;
        const wd = wdMapForLabor[k];
        if (wd?.stageId && (Number(wd.qty) || 0) > 0) withData.add(String(wd.stageId));
      }
      out[d] = getDayStages(activeLabor, dayPrices, d)
        .filter((s) => s.price > 0 || withData.has(String(s.id)));
    }
    return out;
  }, [isTratoEtapasLabor, activeLabor, days, dayPrices, workdaysByLabor]);

  const legacyDayNotes = cycle?.dayNotes || {};
  const dayNotesByLabor = cycle?.dayNotesByLabor || {};
  const activeLaborDayNotes = (activeLabor && dayNotesByLabor[activeLabor.id]) || {};
  // Manda la anotación de la labor; si no tiene una para ese día, se usa la
  // compartida del ciclo.
  const noteForDay = (d) => activeLaborDayNotes[d] ?? legacyDayNotes[d] ?? "";
  // Se puede anotar un día con producción de esta labor o que ya tenga
  // anotación.
  const dayHasContent = (d) => activeLaborDatesWithProduction.has(d) || !!noteForDay(d);

  const openDayNote = (date) => {
    if (!activeLabor || !dayHasContent(date)) return;
    setEditingDayNote({ laborId: activeLabor.id, date });
    setEditingDayNoteText(String(noteForDay(date) || ""));
  };

  const closeDayNote = () => {
    if (dayNoteBusy) return;
    setEditingDayNote(null);
    setEditingDayNoteText("");
  };

  const editingDayNoteIdx = editingDayNote ? days.indexOf(editingDayNote.date) : -1;
  const hasPrevDayNote = editingDayNoteIdx > 0 && days.slice(0, editingDayNoteIdx).some(dayHasContent);
  const hasNextDayNote = editingDayNoteIdx >= 0 && days.slice(editingDayNoteIdx + 1).some(dayHasContent);
  const goToDayNote = (delta) => {
    if (!editingDayNote) return;
    let idx = editingDayNoteIdx;
    while (true) {
      idx += delta;
      if (idx < 0 || idx >= days.length) return;
      if (dayHasContent(days[idx])) break;
    }
    const nextDate = days[idx];
    setEditingDayNote({ ...editingDayNote, date: nextDate });
    setEditingDayNoteText(String(noteForDay(nextDate) || ""));
  };

  const saveDayNote = async () => {
    if (!editingDayNote) return;
    const { laborId, date } = editingDayNote;
    setDayNoteBusy(true);
    try {
      const text = String(editingDayNoteText || "").trim();
      const nextByLabor = { ...(cycle?.dayNotesByLabor || {}) };
      const nextForLabor = { ...(nextByLabor[laborId] || {}) };
      if (text) nextForLabor[date] = text;
      else delete nextForLabor[date];
      nextByLabor[laborId] = nextForLabor;
      await cycleWrite({ dayNotesByLabor: nextByLabor });
      setCycle((c) => (c ? { ...c, dayNotesByLabor: nextByLabor } : c));
      setEditingDayNote(null);
      setEditingDayNoteText("");
    } finally {
      setDayNoteBusy(false);
    }
  };

  // Nombre vigente de cada trabajador según la caché; si no está, el guardado
  // en labor.workers (temporales, o mientras carga la caché).
  const resolvedWorkers = useMemo(
    () => workers.map((w) => (w?.isTemp ? w : { ...w, name: rutToName.get(w.rut) || w.name })),
    [workers, rutToName],
  );

  // Trabajadores con workdays en esta labor que no están en labor.workers. Se
  // suman a la grilla con `isOrphan` para que se vean y se puedan corregir:
  // las métricas y la nómina los cuentan igual.
  const orphanWorkers = useMemo(() => {
    if (!activeLabor) return [];
    const inLabor = new Set((workers || []).map((w) => w.rut));
    const seen = new Set();
    const out = [];
    for (const k in wdMap) {
      const wd = wdMap[k];
      const rut = wd?.workerRut;
      if (!rut || inLabor.has(rut) || seen.has(rut)) continue;
      seen.add(rut);
      out.push({
        rut,
        name: rutToName.get(rut) || rut,
        isOrphan: true,
      });
    }
    return out;
  }, [activeLabor, workers, wdMap, rutToName]);

  const gridWorkers = useMemo(
    () => [...resolvedWorkers, ...orphanWorkers],
    [resolvedWorkers, orphanWorkers],
  );

  const rowDataRaw = useMemo(() => {
    if (isCosechaLabor) return buildRowsCosecha(gridWorkers, days, wdMap, dayCombosByDate);
    if (isTratoLabor) return buildRowsTrato(gridWorkers, days, wdMap, dayTiersByDate);
    if (isTratoEtapasLabor) return buildRowsTratoEtapas(gridWorkers, days, wdMap, dayStagesByDate);
    if (isTratoHELabor) return buildRowsTratoHE(gridWorkers, days, wdMap);
    return buildRowsNormal(gridWorkers, days, wdMap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridWorkers, days, wdMap, isCosechaLabor, isTratoLabor, isTratoEtapasLabor, isTratoHELabor, dayCombosByDate, dayTiersByDate, dayStagesByDate]);

  // Orden alfabético — mismo criterio que CycleWorkerList.jsx — para que el
  // modal mobile pueda navegar "‹ Anterior/Siguiente ›" entre trabajadores
  // sin cerrar y reabrir.
  const sortedWorkerRuts = useMemo(
    () => [...rowDataRaw].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))).map((r) => r.rut),
    [rowDataRaw],
  );
  const editingWorkerIndex = editingCycleWorkerRut ? sortedWorkerRuts.indexOf(editingCycleWorkerRut) : -1;
  const navigateCycleWorker = (dir) => {
    if (editingWorkerIndex === -1) return;
    const nextIndex = editingWorkerIndex + dir;
    if (nextIndex < 0 || nextIndex >= sortedWorkerRuts.length) return;
    setEditingCycleWorkerRut(sortedWorkerRuts[nextIndex]);
  };

  const groupBuckets = useMemo(() => {
    const buckets = new Map();
    for (const row of rowDataRaw) {
      const leader = rutToLeader.get(row.rut) || LEADER_NONE;
      if (!buckets.has(leader)) buckets.set(leader, []);
      buckets.get(leader).push(row);
    }
    for (const [, rows] of buckets) rows.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    return buckets;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowDataRaw, rutToLeader]);

  const orderedGroups = useMemo(() => {
    const keys = orderLeaders([...groupBuckets.keys()]);
    return keys.map((k) => ({
      key: k,
      label: k === LEADER_NONE ? "SIN GRUPO" : k,
      count: groupBuckets.get(k)?.length || 0,
      rows: groupBuckets.get(k) || [],
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupBuckets]);

  const useGrouped = groupView === "group" && !photoMode;

  const rowData = useMemo(() => {
    if (!useGrouped) return rowDataRaw;
    const out = [];
    for (const g of orderedGroups) {
      out.push({
        rut: `__group__${g.key}`,
        _isHeader: true,
        _leader: g.label,
        _leaderKey: g.key,
        _count: g.count,
      });
      for (const r of g.rows) out.push(r);
    }
    return out;
  }, [useGrouped, rowDataRaw, orderedGroups]);

  // "Solo con producción" es un filtro externo de AG-Grid (no recorta
  // `rowData`), así convive con el orden y la selección de la grilla. Con un
  // filtro de columna activo deja pasar todo: la búsqueda muestra a todos los
  // que calzan, tengan o no producción.
  const isExternalFilterPresent = () => onlyWithProduction;
  const doesExternalFilterPass = (node) => {
    if (node.data?._isHeader) return true;
    if (gridRef.current?.api?.isColumnFilterPresent()) return true;
    return Number(node.data?.total) > 0;
  };
  useEffect(() => {
    gridRef.current?.api?.onFilterChanged();
  }, [onlyWithProduction]);
  const handleGridFilterChanged = () => {
    setColumnFilterActive(!!gridRef.current?.api?.isColumnFilterPresent());
  };

  const scrollToGroup = (key) => {
    const api = gridRef.current?.api;
    if (!api) return;
    const node = api.getRowNode(`__group__${key}`);
    if (node) api.ensureNodeVisible(node, "top");
  };

  const assignLeaderToWorker = async (rut, leader) => {
    const w = allWorkers.find((x) => x.id === rut);
    const prev = Array.isArray(w?.groupLeader) ? w.groupLeader : [];
    const next = [leader, ...prev.filter((p) => String(p).toUpperCase() !== leader)];
    setGroupBusy(true);
    try {
      await workersService.update(rut, { groupLeader: next });
      await loadAllWorkers();
    } finally {
      setGroupBusy(false);
    }
  };

  const [leaderPickerFor, setLeaderPickerFor] = useState(null); // rut | null

  const totalsByLabor = useMemo(() => {
    const out = {};
    if (!cycle?.labors) return out;
    for (const l of cycle.labors) {
      const m = workdaysByLabor[l.id] || {};
      let sum = 0;
      for (const k in m) {
        const wd = m[k];
        sum += l.type === "trato" ? getTratoTierTotals(wd).amount : (Number(wd.amount) || 0);
      }
      out[l.id] = sum;
    }
    return out;
  }, [cycle?.labors, workdaysByLabor]);

  const totalQtyByContainerByLabor = useMemo(() => {
    const out = {};
    if (!cycle?.labors) return out;
    for (const l of cycle.labors) {
      if (l.type !== "cosecha") continue;
      const m = workdaysByLabor[l.id] || {};
      const byContainer = {};
      for (const k in m) {
        const wd = m[k];
        const y = Number(wd.containerY) || 0;
        const qty = Number(wd.qty) || 0;
        byContainer[y] = (byContainer[y] || 0) + qty;
      }
      out[l.id] = byContainer;
    }
    return out;
  }, [cycle?.labors, workdaysByLabor]);

  const totalQtyByLabor = useMemo(() => {
    const out = {};
    if (!cycle?.labors) return out;
    for (const l of cycle.labors) {
      const m = workdaysByLabor[l.id] || {};
      if (l.type === "trato") {
        let sum = 0;
        for (const k in m) sum += getTratoTierTotals(m[k]).qty;
        out[l.id] = sum;
      } else if (l.type === "tratoEtapas") {
        // Conteo deduplicado: solo las etapas marcadas como que cuentan.
        out[l.id] = getEtapasTotals(l, Object.values(m)).unidades;
      }
    }
    return out;
  }, [cycle?.labors, workdaysByLabor]);

  // Resumen por día de la labor tratoEtapas activa, para la barra de precios:
  // unidades de las etapas que cuentan, personas (ruts únicos con qty > 0 en
  // cualquier etapa) y monto del día. { [date]: { counted, people, amount } }.
  const etapasDaySummary = useMemo(() => {
    if (!isTratoEtapasLabor || !activeLabor) return {};
    const counting = countingStageIds(activeLabor);
    const m = workdaysByLabor[activeLabor.id] || {};
    const acc = {};
    for (const k in m) {
      const wd = m[k];
      const d = wd.date || k.split("__")[1];
      if (!d) continue;
      const qty = Number(wd.qty) || 0;
      if (!acc[d]) acc[d] = { counted: 0, amount: 0, people: new Set() };
      acc[d].amount += Number(wd.amount) || 0;
      if (counting.has(wd.stageId)) acc[d].counted += qty;
      const rut = wd.workerRut || k.split("__")[0];
      if (qty > 0 && rut) acc[d].people.add(rut);
    }
    const out = {};
    for (const d in acc) {
      out[d] = { counted: acc[d].counted, amount: acc[d].amount, people: acc[d].people.size };
    }
    return out;
  }, [isTratoEtapasLabor, activeLabor, workdaysByLabor]);

  // RUTs únicos con producción (qty > 0) por labor de trato, para el
  // "N personas · prom X/persona" de la tarjeta de métricas. Si el doc no trae
  // workerRut, el rut sale de la clave del mapa ("rut__date__ck").
  const tratoPeopleCountByLabor = useMemo(() => {
    const out = {};
    if (!cycle?.labors) return out;
    for (const l of cycle.labors) {
      if (l.type !== "trato") continue;
      const m = workdaysByLabor[l.id] || {};
      const ruts = new Set();
      for (const k in m) {
        const wd = m[k];
        if (getTratoTierTotals(wd).qty <= 0) continue;
        const rut = wd?.workerRut || k.split("__")[0];
        if (rut) ruts.add(rut);
      }
      out[l.id] = ruts.size;
    }
    return out;
  }, [cycle?.labors, workdaysByLabor]);

  // Pisos por labor: cuenta y suma total de los workdays pisoOnly. Solo
  // aplica a trato/cosecha; el resto siempre será 0.
  const pisoMetricsByLabor = useMemo(() => {
    const out = {};
    if (!cycle?.labors) return out;
    for (const l of cycle.labors) {
      const m = workdaysByLabor[l.id] || {};
      let count = 0;
      let amount = 0;
      for (const k in m) {
        const wd = m[k];
        if (!wd?.pisoOnly) continue;
        count += 1;
        amount += Number(wd.amount) || 0;
      }
      out[l.id] = { count, amount };
    }
    return out;
  }, [cycle?.labors, workdaysByLabor]);

  // tratoHE: jornadas (qty) y horas extras separadas por feriado/normal
  const tratoHEMetricsByLabor = useMemo(() => {
    const out = {};
    if (!cycle?.labors) return out;
    for (const l of cycle.labors) {
      if (l.type !== "tratoHE") continue;
      const m = workdaysByLabor[l.id] || {};
      let normalQty = 0, holidayQty = 0;
      let normalHE = 0, holidayHE = 0;
      let workersWithBonus = 0;
      const seenWorkers = new Set();
      for (const k in m) {
        const wd = m[k];
        const cfg = getDaySingle(dayPrices, l.id, wd.date, "normal");
        const red = isRedDay(wd.date, cfg);
        const qty = Number(wd.qty) || 0;
        const he = Number(wd.overtimeHours) || 0;
        if (red) { holidayQty += qty; holidayHE += he; }
        else { normalQty += qty; normalHE += he; }
        if ((wd.hasManejo || wd.hasSupervision) && !seenWorkers.has(wd.workerRut)) {
          seenWorkers.add(wd.workerRut);
          workersWithBonus++;
        }
      }
      out[l.id] = { normalQty, holidayQty, normalHE, holidayHE, workersWithBonus };
    }
    return out;
  }, [cycle?.labors, workdaysByLabor, dayPrices]);

  const totalQtyByDayCombo = useMemo(() => {
    if (!isCosechaLabor || !activeLabor) return {};
    const m = workdaysByLabor[activeLabor.id] || {};
    const out = {};
    for (const d of days) {
      out[d] = {};
      const combos = dayCombosByDate[d] || [];
      for (const c of combos) {
        let sum = 0;
        for (const w of workers) {
          sum += Number(m[workdayMapKey(w.rut, d, c.key)]?.qty) || 0;
        }
        out[d][c.key] = sum;
      }
    }
    return out;
  }, [isCosechaLabor, activeLabor, workdaysByLabor, days, workers, dayCombosByDate]);

  // Métricas por tier de las labores de trato. Los workdays de trato guardan
  // `tiers: { "0": ... }` aunque sean de t1/t2, así que el tier sale de la
  // 3.ª parte de la clave del mapa (`rut__date__ck`).
  const tratoTierMetricsByLabor = useMemo(() => {
    const out = {};
    if (!cycle?.labors) return out;
    for (const l of cycle.labors) {
      if (l.type !== "trato") continue;
      const m = workdaysByLabor[l.id] || {};
      const tiers = {};
      for (const k in m) {
        const wd = m[k];
        if (!wd || wd.pisoOnly) continue;
        const parts = String(k).split("__");
        const tierKey = parts[2] || "t0";
        const idx = tierKey.startsWith("t") ? Number(tierKey.slice(1)) || 0 : 0;
        if (!tiers[idx]) tiers[idx] = { qty: 0, amount: 0, workerCount: new Set() };
        // getTratoTierTotals da el total del workday: prioriza qty/amount del
        // primer nivel sobre la copia en `tiers`.
        const t = getTratoTierTotals(wd);
        tiers[idx].qty += t.qty;
        tiers[idx].amount += t.amount;
        if (wd.workerRut) tiers[idx].workerCount.add(wd.workerRut);
      }
      for (const idx of Object.keys(tiers)) tiers[idx].workerCount = tiers[idx].workerCount.size;
      out[l.id] = tiers;
    }
    return out;
  }, [cycle?.labors, workdaysByLabor]);

  const transportTotal = useMemo(
    () => cycleTrips.reduce((s, t) => s + (Number(t.amount) || 0), 0),
    [cycleTrips],
  );

  // "Total ciclo" = suma cruda de labores (sin transporte). El transporte
  // se muestra aparte y se suma en "Balance con transporte".
  const laborsTotal = useMemo(
    () => Object.values(totalsByLabor).reduce((a, b) => a + b, 0),
    [totalsByLabor],
  );
  const grandTotal = laborsTotal; // alias de laborsTotal: el "Total ciclo"
  const balanceWithTransport = useMemo(
    () => laborsTotal + transportTotal,
    [laborsTotal, transportTotal],
  );

  const reloadTransports = async () => {
    if (!id) return;
    try {
      const list = await tripsService.listByCycle(id);
      setCycleTrips(list);
    } catch (err) {
      console.error("[Transports] load failed:", err);
    }
  };

  useEffect(() => {
    reloadTransports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Guardan los días y una labor del ciclo (agregar o quitar día o trabajador,
  // toggle de mensual). Si la escritura falla muestran un toast de error y
  // devuelven false; si guarda, true, y el llamador decide si avisa.
  const persistDays = async (nextDays) => {
    try {
      await cycleWrite({ days: nextDays });
      setCycle((c) => ({ ...c, days: nextDays }));
      return true;
    } catch (err) {
      toast.error("No se pudo guardar el cambio de días: " + (err.message || err));
      return false;
    }
  };

  const persistLabor = async (next) => {
    try {
      const nextLabors = cycle.labors.map((l) => (l.id === next.id ? next : l));
      await cycleWrite({ labors: nextLabors });
      setCycle((c) => ({ ...c, labors: nextLabors }));
      return true;
    } catch (err) {
      toast.error("No se pudo guardar el cambio: " + (err.message || err));
      return false;
    }
  };

  // ============================================================
  // Combos y precio único por día
  // ============================================================

  const getCombo = (laborId, date, ck) => {
    const combos = laborId === activeLabor?.id && isCosechaLabor
      ? (dayCombosByDate[date] || [])
      : getDayCombos(dayPrices, laborId, date, defaultMode);
    return combos.find((c) => c.key === ck) || { key: ck, x: 0, y: 0, price: 0, mode: defaultMode };
  };

  const recalcDayCombo = async (laborId, date, ck, price, mode, isTrato) => {
    const labor = cycle.labors.find((l) => l.id === laborId);
    if (!labor || (labor.type !== "cosecha" && labor.type !== "trato")) return;
    const wdMapForLabor = workdaysByLabor[laborId] || {};
    const { x, y } = parseComboKey(ck);
    const updates = {};
    for (const w of labor.workers) {
      const mapKey = workdayMapKey(w.rut, date, ck);
      const wd = wdMapForLabor[mapKey];
      if (!wd) continue;
      const qty = Number(wd.qty) || 0;
      if (qty === 0) continue;
      const amount = mode === "flat" ? price : qty * price;
      const docId = workdayDocId(id, laborId, w.rut, date, ck);
      // En trato también se reescriben `tiers["0"]` y `totalAmount`, la copia
      // del monto que guarda el workday (igual que commitTratoTier).
      const patch = isTrato
        ? { ...wd, amount, tiers: { "0": { qty, amount } }, totalAmount: amount, workerId: w.id || w.rut }
        : { ...wd, qualityX: x, containerY: y, amount, workerId: w.id || w.rut };
      await wdWrite.upsert(docId, patch);
      updates[mapKey] = patch;
    }
    if (Object.keys(updates).length > 0) {
      setWorkdaysByLabor((prev) => ({
        ...prev,
        [laborId]: { ...(prev[laborId] || {}), ...updates },
      }));
    }
  };

  const persistComboConfig = async (laborId, date, ck, patch, isTrato = false) => {
    const dayEntry = normalizeDayPricesEntry(dayPrices[laborId]?.[date]);
    const current = dayEntry[ck] || { price: 0, mode: defaultMode };
    const merged = { ...current, ...patch };
    const nextDay = { ...dayEntry, [ck]: merged };
    const next = { ...dayPrices, [laborId]: { ...(dayPrices[laborId] || {}), [date]: nextDay } };
    setDayPrices(next);
    await cycleWrite({ dayPrices: next });
    await recalcDayCombo(laborId, date, ck, merged.price, merged.mode, isTrato);
  };

  // tratoEtapas: recalcula el amount de los workdays de una etapa en un día
  // cuando cambia su precio o modo. Cada workday guarda su propio amount, que
  // es el que leen el resumen y la nómina.
  const recalcDayStage = async (laborId, date, stageId, price, mode) => {
    const labor = cycle.labors.find((l) => l.id === laborId);
    if (!labor || labor.type !== "tratoEtapas") return;
    const wdMapForLabor = workdaysByLabor[laborId] || {};
    const updates = {};
    for (const w of labor.workers) {
      const mapKey = workdayMapKey(w.rut, date, stageId);
      const wd = wdMapForLabor[mapKey];
      if (!wd) continue;
      const qty = Number(wd.qty) || 0;
      if (qty === 0) continue;
      const amount = computeStageDayAmount(mode, price, qty);
      if (amount === wd.amount) continue;
      const docId = workdayDocId(id, laborId, w.rut, date, stageId);
      const patch = { ...wd, amount, workerId: w.id || w.rut };
      await wdWrite.upsert(docId, patch);
      updates[mapKey] = patch;
    }
    if (Object.keys(updates).length > 0) {
      setWorkdaysByLabor((prev) => ({
        ...prev,
        [laborId]: { ...(prev[laborId] || {}), ...updates },
      }));
    }
  };

  // Persiste el precio/modo de una etapa en un día (dayPrices[lab][date][stageId])
  // y recalcula los workdays afectados.
  const persistStagePrice = async (laborId, date, stageId, patch) => {
    const dayEntry = dayPrices[laborId]?.[date] || {};
    const current = dayEntry[stageId] || { price: 0, mode: "unit" };
    const merged = { ...current, ...patch };
    const nextDay = { ...dayEntry, [stageId]: merged };
    const next = { ...dayPrices, [laborId]: { ...(dayPrices[laborId] || {}), [date]: nextDay } };
    setDayPrices(next);
    await cycleWrite({ dayPrices: next });
    await recalcDayStage(laborId, date, stageId, merged.price, merged.mode);
  };

  // Piso: monto fijo por día, guardado como campo `piso` de
  // `dayPrices[laborId][date]`, junto a los combos o tiers. En 0 se quita el
  // campo.
  const writeDayPiso = async (laborId, date, value) => {
    const dayEntry = normalizeDayPricesEntry(dayPrices[laborId]?.[date]);
    const nextDay = { ...dayEntry, piso: Number(value) || 0 };
    if (!nextDay.piso) delete nextDay.piso;
    const next = { ...dayPrices, [laborId]: { ...(dayPrices[laborId] || {}), [date]: nextDay } };
    setDayPrices(next);
    await cycleWrite({ dayPrices: next });
  };

  // Quitar el piso del día (el ✕, o dejar el monto en cero) también borra los
  // bonos de ese día que no están en una nómina. Si hay bonos asignados, antes
  // pide confirmación.
  const persistDayPiso = async (laborId, date, value) => {
    const monto = Number(value) || 0;
    if (!monto) {
      const { libres, liquidados } = pisoAssigned(workdaysByLabor[laborId] || {}, date);
      if (libres.length || liquidados.length) {
        setPisoRemove({ laborId, date, libres, liquidados });
        return;
      }
    }
    await writeDayPiso(laborId, date, monto);
  };

  const removeDayPiso = async () => {
    if (!pisoRemove) return;
    const { laborId, date, libres } = pisoRemove;
    setPisoRemoveBusy(true);
    try {
      const borradas = [];
      for (const wd of libres) {
        const docId = wd.id || workdayDocId(id, laborId, wd.workerRut, date, PISO_COMBO_KEY);
        await wdWrite.remove(docId);
        borradas.push(workdayMapKey(wd.workerRut, date, PISO_COMBO_KEY));
      }
      setWorkdaysByLabor((prev) => {
        const lab = { ...(prev[laborId] || {}) };
        for (const k of borradas) delete lab[k];
        return { ...prev, [laborId]: lab };
      });
      await writeDayPiso(laborId, date, 0);
      setPisoRemove(null);
      toast.success(
        borradas.length
          ? `Piso del día quitado · ${borradas.length} bono${borradas.length === 1 ? "" : "s"} eliminado${borradas.length === 1 ? "" : "s"}.`
          : "Piso del día quitado.",
      );
    } catch (err) {
      toast.error("No se pudo quitar el piso: " + (err.message || err));
    } finally {
      setPisoRemoveBusy(false);
    }
  };

  // Cuántos trabajadores con producción quedan sin piso, por día. Alimenta el
  // contador del botón "a todos" del panel de precios.
  const pisoPendingByDate = useMemo(() => {
    const out = {};
    if (!activeLabor) return out;
    const wds = workdaysByLabor[activeLabor.id] || {};
    const fechas = new Set(Object.values(wds).map((wd) => wd?.date).filter(Boolean));
    for (const d of fechas) out[d] = pisoTargets(wds, d).length;
    return out;
  }, [activeLabor, workdaysByLabor]);

  // Abre la confirmación del piso masivo, con la cantidad de personas y el
  // total. No escribe nada.
  const askApplyPisoToAll = (laborId, date) => {
    const labor = cycle.labors.find((l) => l.id === laborId);
    if (!labor) return;
    const amount = effectivePiso(labor, dayPrices, date);
    if (!amount) {
      toast.warning("Configura primero el piso de este día.");
      return;
    }
    const ruts = pisoTargets(workdaysByLabor[laborId] || {}, date);
    if (ruts.length === 0) {
      toast.info("Todos los que tienen producción ese día ya tienen el piso.");
      return;
    }
    setPisoBulk({ laborId, date, ruts, amount });
  };

  // Escribe un workday `_piso` por cada trabajador pendiente. Es exactamente lo
  // mismo que apretar el toggle de cada uno en la columna 🪙, en lote.
  const applyPisoToAll = async () => {
    if (!pisoBulk) return;
    const { laborId, date, ruts, amount } = pisoBulk;
    setPisoBulkBusy(true);
    try {
      const escritos = {};
      for (const rut of ruts) {
        const mapKey = workdayMapKey(rut, date, PISO_COMBO_KEY);
        const docId = workdayDocId(id, laborId, rut, date, PISO_COMBO_KEY);
        const next = {
          cycleId: id, laborId, workerRut: rut, date,
          qty: 0, amount,
          pisoOnly: true,
          workerId: workerIdFor(laborId, rut),
        };
        await wdWrite.upsert(docId, next);
        escritos[mapKey] = { id: docId, ...next };
      }
      setWorkdaysByLabor((prev) => ({
        ...prev,
        [laborId]: { ...(prev[laborId] || {}), ...escritos },
      }));
      setPisoBulk(null);
      toast.success(`Piso asignado a ${ruts.length} trabajador${ruts.length === 1 ? "" : "es"}.`);
    } catch (err) {
      toast.error("No se pudo asignar el piso: " + (err.message || err));
    } finally {
      setPisoBulkBusy(false);
    }
  };

  // Toggle del piso de un trabajador en un día: crea o borra su workday `_piso`
  // (`pisoOnly: true`) con el piso configurado para ese día.
  const togglePiso = async (laborId, date, workerRut) => {
    const labor = cycle.labors.find((l) => l.id === laborId);
    if (!labor) return;
    const mapKey = workdayMapKey(workerRut, date, PISO_COMBO_KEY);
    const docId = workdayDocId(id, laborId, workerRut, date, PISO_COMBO_KEY);
    const existing = (workdaysByLabor[laborId] || {})[mapKey];
    if (existing) {
      // Un piso que ya está en una nómina no se borra: le descuadraría el total.
      if (existing.payrollId) {
        toast.warning("Ese piso ya está en una nómina. Hay que eliminar o editar la nómina para poder quitarlo.");
        return;
      }
      await wdWrite.remove(docId);
      setWorkdaysByLabor((prev) => {
        const lab = { ...(prev[laborId] || {}) };
        delete lab[mapKey];
        return { ...prev, [laborId]: lab };
      });
      return;
    }
    const amount = effectivePiso(labor, dayPrices, date);
    if (!amount) {
      toast.warning("Configurá primero el piso por día o el piso default en la labor.");
      return;
    }
    const next = {
      cycleId: id, laborId, workerRut, date,
      qty: 0, amount,
      pisoOnly: true,
      workerId: workerIdFor(laborId, workerRut),
    };
    await wdWrite.upsert(docId, next);
    setWorkdaysByLabor((prev) => {
      const lab = { ...(prev[laborId] || {}) };
      lab[mapKey] = { id: docId, ...next };
      return { ...prev, [laborId]: lab };
    });
  };

  const addComboToDay = async (laborId, date, x, y) => {
    const ck = makeComboKey(x, y);
    const dayEntry = normalizeDayPricesEntry(dayPrices[laborId]?.[date]);
    if (dayEntry[ck]) return;
    const nextDay = { ...dayEntry, [ck]: { price: 0, mode: defaultMode } };
    const next = { ...dayPrices, [laborId]: { ...(dayPrices[laborId] || {}), [date]: nextDay } };
    setDayPrices(next);
    await cycleWrite({ dayPrices: next });
  };

  // ============================================================
  // Helpers de tratoHE
  // ============================================================

  const tratoHERates = (labor) => ({
    bonusManejo: labor?.bonusManejo ?? DEFAULT_BONUS_MANEJO,
    bonusSupervision: labor?.bonusSupervision ?? DEFAULT_BONUS_SUPERVISION,
    overtimeRate: labor?.overtimeRate ?? DEFAULT_OVERTIME_RATE,
    baseDayDefault: labor?.baseDayDefault ?? DEFAULT_BASE_DAY,
  });

  const effectiveDayPrice = (labor, dayCfg) =>
    Number(dayCfg?.price) || Number(labor?.baseDayDefault) || DEFAULT_BASE_DAY;

  // Labores main/supervision/extra: guarda el precio sugerido del día (uno por
  // día, no por trabajador). No recalcula los workdays existentes: solo cambia
  // el sugerido que muestran las celdas vacías.
  const persistNormalDayPrice = async (laborId, date, price) => {
    const dayEntry = normalizeDayPricesEntry(dayPrices[laborId]?.[date]);
    const current = dayEntry["0_0"] || { price: 0, mode: "normal" };
    const merged = { ...current, price: Number(price) || 0 };
    const nextDay = { ...dayEntry, "0_0": merged };
    const next = { ...dayPrices, [laborId]: { ...(dayPrices[laborId] || {}), [date]: nextDay } };
    setDayPrices(next);
    await cycleWrite({ dayPrices: next });
  };

  // Guarda el monto del día de un trabajador en labores main/supervision/extra.
  // Lo usan la grilla (onCellValueChanged), el botón del precio sugerido y el
  // modal de edición por trabajador. Con monto 0 borra el workday.
  const commitNormalAmount = async (date, workerRut, rawAmount) => {
    const laborId = activeLabor.id;
    const amount = parseAmount(rawAmount) || 0;
    const docId = workdayDocId(id, laborId, workerRut, date, SINGLE_COMBO);
    const mapKey = workdayMapKey(workerRut, date, SINGLE_COMBO);
    // Si la escritura falla, devuelve el último monto guardado; el llamador
    // pinta la celda con este valor.
    try {
      if (amount === 0) {
        if (wdMap[mapKey]) {
          await wdWrite.remove(docId);
          setWorkdaysByLabor((prev) => {
            const lab = { ...(prev[laborId] || {}) };
            delete lab[mapKey];
            return { ...prev, [laborId]: lab };
          });
        }
      } else {
        const workerId = workerIdFor(laborId, workerRut);
        await wdWrite.upsert(docId, { cycleId: id, laborId, workerRut, date, amount, workerId });
        setWorkdaysByLabor((prev) => {
          const lab = { ...(prev[laborId] || {}) };
          lab[mapKey] = { ...lab[mapKey], cycleId: id, laborId, workerRut, date, amount, workerId };
          return { ...prev, [laborId]: lab };
        });
      }
      return { amount };
    } catch (err) {
      toast.error("No se pudo guardar el cambio: " + (err.message || err));
      return { amount: wdMap[mapKey]?.amount || 0 };
    }
  };

  const computeTratoHEAmount = (labor, dayCfg, wd) =>
    calcTratoHEAmount({
      qty: wd.qty,
      overtimeHours: wd.overtimeHours,
      hasManejo: wd.hasManejo,
      hasSupervision: wd.hasSupervision,
      extras: wd.extras,
      dayPrice: effectiveDayPrice(labor, dayCfg),
      dayMode: dayCfg?.mode || "normal",
      ...tratoHERates(labor),
    });

  const upsertTratoHEWorkday = async (laborId, date, workerRut, patch) => {
    const labor = cycle.labors.find((l) => l.id === laborId);
    if (!labor) return { amount: 0 };
    const mapKey = workdayMapKey(workerRut, date, SINGLE_COMBO);
    const docId = workdayDocId(id, laborId, workerRut, date, SINGLE_COMBO);
    const existing = (workdaysByLabor[laborId] || {})[mapKey];
    const defaults = labor.bonusDefaults?.[workerRut] || {};
    const seed = existing
      ? { ...existing }
      : { qty: 0, overtimeHours: 0, extras: 0, hasManejo: !!defaults.manejo, hasSupervision: !!defaults.supervision };
    const merged = { ...seed, ...patch };
    const dayCfg = getDaySingle(dayPrices, laborId, date, "normal");
    const amount = computeTratoHEAmount(labor, dayCfg, merged);
    const wd = { cycleId: id, laborId, workerRut, date, ...merged, amount, workerId: workerIdFor(laborId, workerRut) };

    // Si falla devuelve `ok: false`: la rama tratoHE de onCellValueChanged pinta
    // qty/HE con su propio valor (`newVal`) y usa esta bandera para revertir
    // el campo.
    try {
      if (!workdayHasData(wd)) {
        if (existing) {
          await wdWrite.remove(docId);
          setWorkdaysByLabor((prev) => {
            const lab = { ...(prev[laborId] || {}) };
            delete lab[mapKey];
            return { ...prev, [laborId]: lab };
          });
        }
        return { amount: 0 };
      }
      await wdWrite.upsert(docId, wd);
      setWorkdaysByLabor((prev) => {
        const lab = { ...(prev[laborId] || {}) };
        lab[mapKey] = wd;
        return { ...prev, [laborId]: lab };
      });
      return { amount };
    } catch (err) {
      toast.error("No se pudo guardar el cambio: " + (err.message || err));
      return { amount: existing?.amount || 0, ok: false };
    }
  };

  // Guarda la cantidad de un combo (calidad×envase) de un trabajador en un día
  // de cosecha; qty 0 borra el workday. Lo usan la grilla
  // (onCellValueChanged) y el modal de edición por trabajador.
  const commitCosechaCombo = async (date, comboKey, workerRut, rawQty) => {
    const laborId = activeLabor.id;
    const { x, y } = parseComboKey(comboKey);
    const docId = workdayDocId(id, laborId, workerRut, date, comboKey);
    const mapKey = workdayMapKey(workerRut, date, comboKey);
    const qty = parseAmount(rawQty) || 0;
    const combo = getCombo(laborId, date, comboKey);
    const amount = combo.mode === "flat" ? combo.price : qty * combo.price;

    try {
      if (qty === 0) {
        if (wdMap[mapKey]) {
          await wdWrite.remove(docId);
          setWorkdaysByLabor((prev) => {
            const lab = { ...(prev[laborId] || {}) };
            delete lab[mapKey];
            return { ...prev, [laborId]: lab };
          });
        }
      } else {
        const workerId = workerIdFor(laborId, workerRut);
        await wdWrite.upsert(docId, {
          cycleId: id, laborId, workerRut, date,
          qualityX: x, containerY: y, qty, amount, workerId,
        });
        setWorkdaysByLabor((prev) => {
          const lab = { ...(prev[laborId] || {}) };
          lab[mapKey] = { ...lab[mapKey], cycleId: id, laborId, workerRut, date, qualityX: x, containerY: y, qty, amount, workerId };
          return { ...prev, [laborId]: lab };
        });
      }
      return { qty, amount };
    } catch (err) {
      toast.error("No se pudo guardar el cambio: " + (err.message || err));
      return { qty: wdMap[mapKey]?.qty || 0, amount: wdMap[mapKey]?.amount || 0 };
    }
  };

  // Guarda la cantidad de un tier de precio de un trabajador en un día de
  // trato; qty 0 borra el workday.
  const commitTratoTier = async (date, tierKey, workerRut, rawQty) => {
    const laborId = activeLabor.id;
    const docId = workdayDocId(id, laborId, workerRut, date, tierKey);
    const mapKey = workdayMapKey(workerRut, date, tierKey);
    const qty = parseAmount(rawQty) || 0;

    const tiers = dayTiersByDate[date] || [];
    const tier = tiers.find((t) => t.key === tierKey);
    const amount = tier && tier.mode === "flat" ? (qty > 0 ? tier.price : 0) : qty * (tier?.price || 0);

    try {
      if (qty === 0) {
        if (wdMap[mapKey]) {
          await wdWrite.remove(docId);
          setWorkdaysByLabor((prev) => {
            const lab = { ...(prev[laborId] || {}) };
            delete lab[mapKey];
            return { ...prev, [laborId]: lab };
          });
        }
      } else {
        // `tiers` (una sola clave, "0") es la copia que normalizeTratoWorkday
        // agrega al cargar; se reescribe junto con qty/amount para que
        // coincidan.
        const tiersField = { "0": { qty, amount } };
        const workerId = workerIdFor(laborId, workerRut);
        await wdWrite.upsert(docId, {
          cycleId: id, laborId, workerRut, date, qty, amount,
          tiers: tiersField, totalAmount: amount, workerId,
        });
        setWorkdaysByLabor((prev) => {
          const lab = { ...(prev[laborId] || {}) };
          lab[mapKey] = {
            ...lab[mapKey],
            cycleId: id, laborId, workerRut, date, qty, amount,
            tiers: tiersField, totalAmount: amount, workerId,
          };
          return { ...prev, [laborId]: lab };
        });
      }
      return { qty, amount };
    } catch (err) {
      toast.error("No se pudo guardar el cambio: " + (err.message || err));
      return { qty: wdMap[mapKey]?.qty || 0, amount: wdMap[mapKey]?.amount || 0 };
    }
  };

  // Guarda la cantidad de una etapa de un trabajador en un día de
  // tratoEtapas; qty 0 borra el workday.
  const commitEtapaQty = async (date, stageId, workerRut, rawQty) => {
    const laborId = activeLabor.id;
    const docId = workdayDocId(id, laborId, workerRut, date, stageId);
    const mapKey = workdayMapKey(workerRut, date, stageId);
    const qty = parseAmount(rawQty) || 0;
    const { price, mode } = getStageDayPrice(dayPrices, laborId, date, stageId);
    const amount = computeStageDayAmount(mode, price, qty);

    try {
      if (qty === 0) {
        if (wdMap[mapKey]) {
          await wdWrite.remove(docId);
          setWorkdaysByLabor((prev) => {
            const lab = { ...(prev[laborId] || {}) };
            delete lab[mapKey];
            return { ...prev, [laborId]: lab };
          });
        }
      } else {
        // `stageId` explícito en el doc: lo consumen el conteo (getEtapasTotals),
        // los resúmenes y la nómina sin tener que re-parsear el docId.
        const workerId = workerIdFor(laborId, workerRut);
        await wdWrite.upsert(docId, {
          cycleId: id, laborId, workerRut, date, qty, amount, stageId, workerId,
        });
        setWorkdaysByLabor((prev) => {
          const lab = { ...(prev[laborId] || {}) };
          lab[mapKey] = {
            ...lab[mapKey],
            cycleId: id, laborId, workerRut, date, qty, amount, stageId, workerId,
          };
          return { ...prev, [laborId]: lab };
        });
      }
      return { qty, amount };
    } catch (err) {
      toast.error("No se pudo guardar el cambio: " + (err.message || err));
      return { qty: wdMap[mapKey]?.qty || 0, amount: wdMap[mapKey]?.amount || 0 };
    }
  };

  const recalcDayTratoHE = async (laborId, date) => {
    const labor = cycle.labors.find((l) => l.id === laborId);
    if (!labor || labor.type !== "tratoHE") return;
    const dayCfg = getDaySingle(dayPrices, laborId, date, "normal");
    const wdMapForLabor = workdaysByLabor[laborId] || {};
    const updates = {};
    for (const w of labor.workers) {
      const mapKey = workdayMapKey(w.rut, date, SINGLE_COMBO);
      const wd = wdMapForLabor[mapKey];
      if (!wd) continue;
      const amount = computeTratoHEAmount(labor, dayCfg, wd);
      if (amount === wd.amount) continue;
      const docId = workdayDocId(id, laborId, w.rut, date, SINGLE_COMBO);
      const next = { ...wd, amount, workerId: w.id || w.rut };
      await wdWrite.upsert(docId, next);
      updates[mapKey] = next;
    }
    if (Object.keys(updates).length > 0) {
      setWorkdaysByLabor((prev) => ({
        ...prev,
        [laborId]: { ...(prev[laborId] || {}), ...updates },
      }));
    }
  };

  const recalcAllTratoHE = async (laborId) => {
    const labor = cycle.labors.find((l) => l.id === laborId);
    if (!labor || labor.type !== "tratoHE") return;
    const wdMapForLabor = workdaysByLabor[laborId] || {};
    const updates = {};
    for (const k in wdMapForLabor) {
      const wd = wdMapForLabor[k];
      const dayCfg = getDaySingle(dayPrices, laborId, wd.date, "normal");
      const amount = computeTratoHEAmount(labor, dayCfg, wd);
      if (amount === wd.amount) continue;
      const docId = workdayDocId(id, laborId, wd.workerRut, wd.date, SINGLE_COMBO);
      const next = { ...wd, amount, workerId: workerIdFor(laborId, wd.workerRut) };
      await wdWrite.upsert(docId, next);
      updates[k] = next;
    }
    if (Object.keys(updates).length > 0) {
      setWorkdaysByLabor((prev) => ({
        ...prev,
        [laborId]: { ...(prev[laborId] || {}), ...updates },
      }));
    }
  };

  const persistTratoHEDay = async (laborId, date, patch) => {
    const dayEntry = normalizeDayPricesEntry(dayPrices[laborId]?.[date]);
    const current = dayEntry["0_0"] || {
      price: cycle.labors.find((l) => l.id === laborId)?.baseDayDefault ?? DEFAULT_BASE_DAY,
      mode: "normal",
      isHoliday: false,
    };
    const merged = { ...current, ...patch };
    const nextDay = { ...dayEntry, "0_0": merged };
    const next = { ...dayPrices, [laborId]: { ...(dayPrices[laborId] || {}), [date]: nextDay } };
    setDayPrices(next);
    await cycleWrite({ dayPrices: next });
    await recalcDayTratoHE(laborId, date);
  };

  const persistTratoHEBonusDefaults = async (laborId, defaults) => {
    const nextLabors = cycle.labors.map((l) =>
      l.id === laborId ? { ...l, bonusDefaults: defaults } : l,
    );
    await cycleWrite({ labors: nextLabors });
    setCycle((c) => ({ ...c, labors: nextLabors }));
  };

  const removeComboFromDay = async (laborId, date, ck) => {
    const wdMapForLabor = workdaysByLabor[laborId] || {};
    for (const k in wdMapForLabor) {
      if (k.endsWith(`__${ck}`) && k.includes(`__${date}__`)) {
        if (Number(wdMapForLabor[k].qty) > 0) {
          toast.warning("No se puede quitar: hay producción registrada en este combo.");
          return false;
        }
      }
    }
    const dayEntry = normalizeDayPricesEntry(dayPrices[laborId]?.[date]);
    delete dayEntry[ck];
    const next = { ...dayPrices, [laborId]: { ...(dayPrices[laborId] || {}), [date]: dayEntry } };
    setDayPrices(next);
    await cycleWrite({ dayPrices: next });
    return true;
  };

  const inputKey = (laborId, date, ck) => `${laborId}__${date}__${ck}`;

  const handlePriceBlur = (laborId, date, ck, isTrato = false) => {
    const k = inputKey(laborId, date, ck);
    const raw = localPriceInputs[k];
    if (raw === undefined) return;
    const price = parseAmount(String(raw)) || 0;
    setLocalPriceInputs((prev) => { const n = { ...prev }; delete n[k]; return n; });
    // Los tiers (t0, t1…) pasan por persistComboConfig, que recalcula los workdays existentes.
    if (isTrato && typeof ck === "string" && ck.startsWith("t")) {
      const entry = dayPrices?.[laborId]?.[date];
      const cur = entry?.[ck];
      if (!cur || price !== Number(cur.price)) {
        persistComboConfig(laborId, date, ck, { price }, true);
      }
      return;
    }
    const cur = isTrato
      ? getDaySingle(dayPrices, laborId, date, defaultMode)
      : getCombo(laborId, date, ck);
    if (price !== cur.price) {
      persistComboConfig(laborId, date, ck, { price }, isTrato);
    }
  };

  const getPriceInputValue = (laborId, date, ck, isTrato = false) => {
    const k = inputKey(laborId, date, ck);
    if (k in localPriceInputs) return localPriceInputs[k];
    // Tiers (t0, t1…)
    if (isTrato && typeof ck === "string" && ck.startsWith("t")) {
      const entry = dayPrices?.[laborId]?.[date];
      const tier = entry?.[ck];
      return tier?.price || "";
    }
    const cur = isTrato
      ? getDaySingle(dayPrices, laborId, date, defaultMode)
      : getCombo(laborId, date, ck);
    return cur.price || "";
  };

  // ============================================================
  // Edición de celdas
  // ============================================================

  // Campos editables por día (combo de cosecha, tier de trato, qty/HE de
  // tratoHE, monto normal). rut/name/total/__amt/__total son derivados y no
  // se escriben en lote.
  const isEditableField = (field) => {
    if (!field) return false;
    if (["rut", "name", "total"].includes(field)) return false;
    if (field.endsWith("__amt") || field.endsWith("__total")) return false;
    return true;
  };

  const dispatchCellChange = async (node, colDef, newValue) => {
    if (!node || !colDef) return;
    if (!isEditableField(colDef.field)) return;
    const oldValue = node.data?.[colDef.field];
    await onCellValueChanged({
      colDef,
      data: node.data,
      newValue,
      oldValue,
      node,
    });
  };

  // Ctrl+D (rellenar hacia abajo): copia el valor de la celda con foco a la
  // misma columna de cada fila seleccionada (api.getSelectedNodes()).
  const fillDown = async (params) => {
    if (readOnly || photoMode || qrLocked) return;
    const api = gridRef.current?.api;
    if (!api) return;
    const colDef = params.colDef;
    if (!isEditableField(colDef?.field)) return;
    const sourceValue = params.data?.[colDef.field];
    if (sourceValue == null || sourceValue === "" || sourceValue === 0) {
      setCopyToast("Celda fuente vacía");
      setTimeout(() => setCopyToast(""), 1500);
      return;
    }
    const selected = api.getSelectedNodes();
    if (selected.length === 0) {
      setCopyToast("Selecciona filas con Shift+Click primero");
      setTimeout(() => setCopyToast(""), 2200);
      return;
    }
    pendingBatchRef.current = [];
    let count = 0;
    for (const node of selected) {
      if (node.id === params.node?.id) continue;
      await dispatchCellChange(node, colDef, sourceValue);
      count++;
    }
    if (pendingBatchRef.current.length) {
      undoStackRef.current.push(pendingBatchRef.current);
      if (undoStackRef.current.length > UNDO_LIMIT) undoStackRef.current.shift();
    }
    pendingBatchRef.current = null;
    setCopyToast(`✓ Copiado a ${count} fila(s)`);
    setTimeout(() => setCopyToast(""), 1500);
  };

  // Ctrl+V: reparte las líneas del portapapeles en la misma columna, desde la
  // fila con foco hacia abajo y saltando los encabezados de grupo. De un
  // copiado con varias columnas (tabs) solo se usa la primera.
  const pasteFromClipboard = async (params) => {
    if (readOnly || photoMode || qrLocked) return;
    const api = gridRef.current?.api;
    if (!api) return;
    const colDef = params.colDef;
    if (!isEditableField(colDef?.field)) return;
    let text;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      setCopyToast("No pude leer el portapapeles");
      setTimeout(() => setCopyToast(""), 2000);
      return;
    }
    if (!text) return;
    const lines = text.replace(/\r/g, "").split("\n").map((l) => l.split("\t")[0]);
    while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
    if (lines.length === 0) return;
    const startIdx = params.node?.rowIndex;
    if (startIdx == null) return;
    pendingBatchRef.current = [];
    let count = 0;
    let lineIdx = 0;
    let targetIdx = startIdx;
    while (lineIdx < lines.length) {
      const node = api.getDisplayedRowAtIndex(targetIdx);
      if (!node) break;
      if (node.data?._isHeader) {
        targetIdx++;
        continue;
      }
      await dispatchCellChange(node, colDef, lines[lineIdx]);
      lineIdx++;
      targetIdx++;
      count++;
    }
    if (pendingBatchRef.current.length) {
      undoStackRef.current.push(pendingBatchRef.current);
      if (undoStackRef.current.length > UNDO_LIMIT) undoStackRef.current.shift();
    }
    pendingBatchRef.current = null;
    setCopyToast(`✓ Pegadas ${count} celda(s)`);
    setTimeout(() => setCopyToast(""), 1500);
  };

  // Ctrl+Z: saca el último lote de la pila y vuelve a escribir los valores
  // anteriores. Mientras tanto, isUndoingRef evita que onCellValueChanged
  // apile la reversión.
  const undoLast = async () => {
    if (readOnly || photoMode) return;
    const batch = undoStackRef.current.pop();
    if (!batch || batch.length === 0) {
      setCopyToast("Nada que deshacer");
      setTimeout(() => setCopyToast(""), 1500);
      return;
    }
    const api = gridRef.current?.api;
    if (!api) return;
    isUndoingRef.current = true;
    try {
      for (let i = batch.length - 1; i >= 0; i--) {
        const { rut, field, oldValue } = batch[i];
        let target = null;
        api.forEachNode((n) => { if (n.data?.rut === rut) target = n; });
        if (!target) continue;
        await dispatchCellChange(target, { field }, oldValue);
      }
      setCopyToast(`↶ Deshecho (${batch.length} celda${batch.length === 1 ? "" : "s"})`);
      setTimeout(() => setCopyToast(""), 1500);
    } finally {
      isUndoingRef.current = false;
    }
  };

  const onCellKeyDown = async (params) => {
    const e = params.event;
    if (!e) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (!ctrl) return;
    const key = String(e.key || "").toLowerCase();
    if (key === "d") {
      e.preventDefault();
      e.stopPropagation();
      await fillDown(params);
    } else if (key === "v") {
      e.preventDefault();
      e.stopPropagation();
      await pasteFromClipboard(params);
    } else if (key === "z" && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      await undoLast();
    }
  };

  const onCellValueChanged = async (params) => {
    const field = params.colDef.field;
    if (!field || field === "total" || field === "rut" || field === "name" || field.endsWith("__amt") || field.endsWith("__total")) return;

    // Lo usan la pila de deshacer y la rama tratoHE, que revierte la celda si
    // falla el guardado.
    const oldValue = params.oldValue !== undefined ? params.oldValue : params.data?.[field];

    // Apila el valor anterior antes de escribir, salvo mientras se deshace.
    if (!isUndoingRef.current) {
      const entry = { rut: params.data?.rut, field, oldValue };
      if (pendingBatchRef.current) {
        pendingBatchRef.current.push(entry);
      } else {
        undoStackRef.current.push([entry]);
        if (undoStackRef.current.length > UNDO_LIMIT) undoStackRef.current.shift();
      }
    }

    if (isCosechaLabor) {
      const [date, ...rest] = field.split("__");
      const ck = rest.join("_");
      const workerRut = params.data.rut;
      const { qty, amount } = await commitCosechaCombo(date, ck, workerRut, params.newValue);
      params.node.setDataValue(field, qty);
      params.node.setDataValue(`${field}__amt`, amount);

      let newTotal = 0;
      for (const d of days) {
        const combos = dayCombosByDate[d] || [];
        for (const c of combos) {
          const f = `${d}__${c.key}`;
          if (f === field) newTotal += amount;
          else newTotal += Number(params.data[`${f}__amt`]) || 0;
        }
      }
      params.node.setDataValue("total", newTotal);
      return;
    }

    if (isTratoHELabor) {
      const m = field.match(/^(\d{4}-\d{2}-\d{2})__(qty|he)$/);
      if (!m) return;
      const [, date, kind] = m;
      const workerRut = params.data.rut;
      const newVal = parseAmount(params.newValue) || 0;
      const patch = kind === "qty" ? { qty: newVal } : { overtimeHours: newVal };
      const result = await upsertTratoHEWorkday(activeLabor.id, date, workerRut, patch);
      // Esta rama pinta el campo con `newVal`, no con lo que devuelve la
      // función; si el guardado falló (`ok: false`) vuelve a `oldValue`.
      params.node.setDataValue(field, result.ok === false ? oldValue : newVal);
      params.node.setDataValue(`${date}__amt`, result.amount);
      let newTotal = 0;
      for (const d of days) {
        if (d === date) newTotal += result.amount;
        else newTotal += Number(params.data[`${d}__amt`]) || 0;
      }
      params.node.setDataValue("total", newTotal);
      return;
    }

    if (isTratoLabor) {
      const [date, ...rest] = field.split("__");
      const tierKey = rest.join("_"); // p. ej. "t0", "t1"
      const workerRut = params.data.rut;
      const { qty, amount } = await commitTratoTier(date, tierKey, workerRut, params.newValue);
      params.node.setDataValue(field, qty);
      params.node.setDataValue(`${field}__amt`, amount);

      // Recalcula el total con los datos de la fila
      let rowTotal = 0;
      for (const d of days) {
        const combos = dayTiersByDate[d] || [];
        for (const t of combos) {
          const f = `${d}__${t.key}`;
          if (f === field) rowTotal += amount;
          else rowTotal += Number(params.data[`${f}__amt`]) || 0;
        }
      }
      params.node.setDataValue("total", rowTotal);
      return;
    }

    if (isTratoEtapasLabor) {
      const [date, ...rest] = field.split("__");
      const stageId = rest.join("_");
      const workerRut = params.data.rut;
      const { qty, amount } = await commitEtapaQty(date, stageId, workerRut, params.newValue);
      params.node.setDataValue(field, qty);
      params.node.setDataValue(`${field}__amt`, amount);

      let rowTotal = 0;
      for (const d of days) {
        for (const st of dayStagesByDate[d] || []) {
          const f = `${d}__${st.id}`;
          if (f === field) rowTotal += amount;
          else rowTotal += Number(params.data[`${f}__amt`]) || 0;
        }
      }
      params.node.setDataValue("total", rowTotal);
      return;
    }

    // Labor normal
    const date = field;
    const workerRut = params.data.rut;
    const { amount } = await commitNormalAmount(date, workerRut, params.newValue);
    params.node.setDataValue(date, amount);
    const total = days.reduce((acc, d) => acc + (d === date ? amount : Number(params.data[d]) || 0), 0);
    params.node.setDataValue("total", total);
  };

  // ============================================================
  // Días
  // ============================================================

  const addDay = async () => {
    if (!newDay) return;
    if (days.includes(newDay)) { setAddDayOpen(false); return; }
    const ok = await persistDays([...days, newDay].sort());
    setAddDayOpen(false);
    if (ok) showToast(`Día ${newDay} agregado`);
  };

  const addSelectedDays = async () => {
    const toAdd = [...selectedDays].filter((d) => !days.includes(d));
    if (toAdd.length === 0) { setAddDayOpen(false); return; }
    const ok = await persistDays([...days, ...toAdd].sort());
    setSelectedDays(new Set());
    setAddDayOpen(false);
    if (ok) showToast(`${toAdd.length} día${toAdd.length === 1 ? "" : "s"} agregado${toAdd.length === 1 ? "" : "s"}`);
  };

  const toggleSelectedDay = (date) => {
    setSelectedDays((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  const removeDay = async (date) => {
    const wds = await workdaysService.list({
      wheres: [["cycleId", "==", id], ["date", "==", date]], take: 1,
    });
    if (wds.length) {
      toast.warning(`No se puede quitar ${date}: hay producción registrada en alguna labor para ese día.`);
      return;
    }
    setConfirmRemoveDay(date);
  };
  const doRemoveDay = async (date) => {
    const ok = await persistDays(days.filter((d) => d !== date));
    if (ok) showToast(`Día ${date} quitado`);
  };

  // ============================================================
  // Trabajadores
  // ============================================================

  const pickWorker = async (worker) => {
    const pickedId = worker.id || worker.rut;
    if (workers.find((w) => (w.id || w.rut) === pickedId)) { setPickerOpen(false); return; }
    const entry = { id: pickedId, rut: worker.rut, name: worker.name };
    if (worker.isTemp) {
      entry.isTemp = true;
      // Los temporales no tienen doc en `worker`: su líder se guarda en la
      // entrada de labor.workers y lo lee la vista por grupo.
      if (worker.groupLeader) entry.groupLeader = String(worker.groupLeader).toUpperCase();
    }
    const ok = await persistLabor({ ...activeLabor, workers: [...workers, entry] });
    setPickerOpen(false);
    if (ok) showToast(`${worker.name || "Trabajador"} agregado`);
  };

  // Toggle de sueldo mensual de un trabajador en la labor activa (`monthly:
  // true` en su entrada de labor.workers). Solo en labores normales: las
  // celdas del día pasan a casilla de asistencia y el workday se guarda con
  // amount 0, así no suma a la transferencia de la nómina.
  const toggleMonthly = async (rut) => {
    if (readOnly || !activeLabor) return;
    const nextWorkers = workers.map((w) =>
      w.rut === rut ? { ...w, monthly: !w.monthly } : w,
    );
    await persistLabor({ ...activeLabor, workers: nextWorkers });
  };

  // Crea o borra el workday en $0 (`attendanceOnly`) de un trabajador mensual:
  // la casilla "presente sin pago" de la celda del día. Como es un workday más,
  // cuenta en las métricas y en las jornadas. El llamador pasa
  // `currentlyPresent` desde la fila, sin depender del wdMap del closure.
  const toggleAttendance = async (rut, date, currentlyPresent) => {
    if (readOnly || !activeLabor) return;
    const mapKey = workdayMapKey(rut, date, SINGLE_COMBO);
    const docId = workdayDocId(id, activeLabor.id, rut, date, SINGLE_COMBO);
    if (currentlyPresent) {
      await wdWrite.remove(docId);
      setWorkdaysByLabor((prev) => {
        const lab = { ...(prev[activeLabor.id] || {}) };
        delete lab[mapKey];
        return { ...prev, [activeLabor.id]: lab };
      });
    } else {
      const workerId = workerIdFor(activeLabor.id, rut);
      await wdWrite.upsert(docId, {
        cycleId: id, laborId: activeLabor.id, workerRut: rut, date,
        amount: 0, attendanceOnly: true, workerId,
      });
      setWorkdaysByLabor((prev) => {
        const lab = { ...(prev[activeLabor.id] || {}) };
        lab[mapKey] = { cycleId: id, laborId: activeLabor.id, workerRut: rut, date, amount: 0, attendanceOnly: true, workerId };
        return { ...prev, [activeLabor.id]: lab };
      });
    }
  };

  const askRemoveWorker = (rut) => {
    const w = workers.find((x) => x.rut === rut);
    if (w) setRemoveWorker(w);
  };

  // Quita a un trabajador de la labor activa, sin pasar por el ConfirmDialog:
  // la usan el diálogo de escritorio y el modal mobile, que confirma por su
  // cuenta. Devuelve true si lo quitó.
  const removeWorkerNow = async (worker) => {
    if (!worker || !activeLabor) return false;
    // Temporales: también se borran sus workdays en todo el ciclo.
    if (worker.isTemp) {
      const all = await workdaysService.list({
        wheres: [["cycleId", "==", id], ["workerRut", "==", worker.rut]],
      });
      for (const wd of all) await wdWrite.remove(wd.id);
      setWorkdaysByLabor((prev) => {
        const next = {};
        for (const [lid, m] of Object.entries(prev)) {
          const filtered = {};
          for (const [k, v] of Object.entries(m)) {
            if (v?.workerRut !== worker.rut) filtered[k] = v;
          }
          next[lid] = filtered;
        }
        return next;
      });
      const ok = await persistLabor({ ...activeLabor, workers: workers.filter((w) => w.rut !== worker.rut) });
      if (ok) showToast(`${worker.name || "Trabajador"} quitado`);
      return ok;
    }
    const existing = await workdaysService.list({
      wheres: [["cycleId", "==", id], ["laborId", "==", activeLabor.id], ["workerRut", "==", worker.rut]],
      take: 1,
    });
    if (existing.length) {
      toast.warning("No se puede quitar: el trabajador tiene producción registrada en esta labor.");
      return false;
    }
    const ok = await persistLabor({ ...activeLabor, workers: workers.filter((w) => w.rut !== worker.rut) });
    if (ok) showToast(`${worker.name || "Trabajador"} quitado`);
    return ok;
  };

  const confirmRemoveWorker = async () => {
    if (!removeWorker) return;
    setRemoveBusy(true);
    try {
      await removeWorkerNow(removeWorker);
    } finally {
      setRemoveBusy(false);
      setRemoveWorker(null);
    }
  };

  // Wrapper por rut para el modal mobile, que solo conoce el rut (viene de
  // rowDataRaw) y no la entrada cruda de activeLabor.workers.
  const removeWorkerByRut = async (rut) => {
    const w = workers.find((x) => x.rut === rut);
    if (!w) return false;
    return await removeWorkerNow(w);
  };

  // Convierte un temporal (TEMP-…) en un trabajador real: reemplaza su entrada
  // en labor.workers y reescribe cada workday del ciclo con el rut temporal.
  // El docId incluye el rut, así que cada doc se copia a un id nuevo y se
  // borra el viejo (Firestore no renombra documentos).
  const convertTempToReal = async (real) => {
    const tempRut = assignTempRut;
    if (!tempRut || !real?.rut) { setAssignTempRut(null); return; }
    if (real.isTemp) { setAssignTempRut(null); return; }
    if (real.rut === tempRut) { setAssignTempRut(null); return; }
    if (workers.some((w) => w.rut === real.rut)) {
      toast.warning("Ese trabajador ya existe en este ciclo. Quitá primero la fila duplicada antes de asignar.");
      return;
    }
    setAssignBusy(true);
    try {
      const wds = await workdaysService.list({
        wheres: [["cycleId", "==", id], ["workerRut", "==", tempRut]],
      });
      for (const wd of wds) {
        const parts = String(wd.id).split("__");
        if (parts.length < 4) continue;
        parts[2] = real.rut;
        const newDocId = parts.join("__");
        const { id: _omit, ...rest } = wd;
        await wdWrite.upsert(newDocId, { ...rest, workerRut: real.rut, workerId: real.id || real.rut });
        await wdWrite.remove(wd.id);
      }
      // Reemplaza la entrada en labor.workers, conservando el orden.
      const nextWorkers = workers.map((w) =>
        w.rut === tempRut ? { id: real.id || real.rut, rut: real.rut, name: real.name } : w,
      );
      await persistLabor({ ...activeLabor, workers: nextWorkers });
      // Cambia la clave de las entradas del mapa local (de todas las labores)
      // que apuntaban al temporal.
      setWorkdaysByLabor((prev) => {
        const next = { ...prev };
        for (const [lid, m] of Object.entries(prev)) {
          const newMap = {};
          for (const [k, v] of Object.entries(m)) {
            if (v?.workerRut === tempRut) {
              const newKey = workdayMapKey(real.rut, v.date, k.split("__")[2] || SINGLE_COMBO);
              newMap[newKey] = { ...v, workerRut: real.rut };
            } else {
              newMap[k] = v;
            }
          }
          next[lid] = newMap;
        }
        return next;
      });
      setAssignTempRut(null);
    } catch (err) {
      console.error(err);
      toast.error("No se pudo asignar el RUT: " + (err.message || err));
    } finally {
      setAssignBusy(false);
    }
  };

  // ============================================================
  // Labor
  // ============================================================

  const openCreateLabor = () =>
    setLaborForm({
      mode: "create",
      data: {
        name: "", type: "extra",
        laborGroupId: "",
        newGroupName: "",
        cosechaMode: "unit",
        tratoMode: "unit",
        tratoType: catalogs.tratoTypes?.[0]?.value ?? 0,
        stages: defaultStages(),
        baseDayDefault: DEFAULT_BASE_DAY,
        bonusManejo: DEFAULT_BONUS_MANEJO,
        bonusSupervision: DEFAULT_BONUS_SUPERVISION,
        overtimeRate: DEFAULT_OVERTIME_RATE,
      },
    });

  const openEditLabor = () =>
    setLaborForm({
      mode: "edit",
      data: {
        id: activeLabor.id,
        name: activeLabor.name,
        type: activeLabor.type,
        laborGroupId: activeLabor.laborGroupId || "",
        newGroupName: "",
        cosechaMode: activeLabor.cosechaMode || "unit",
        tratoMode: activeLabor.tratoMode || "unit",
        tratoType: activeLabor.tratoType ?? (catalogs.tratoTypes?.[0]?.value ?? 0),
        stages: (activeLabor.stages && activeLabor.stages.length)
          ? activeLabor.stages.map((s) => ({ ...s }))
          : defaultStages(),
        baseDayDefault: activeLabor.baseDayDefault ?? DEFAULT_BASE_DAY,
        bonusManejo: activeLabor.bonusManejo ?? DEFAULT_BONUS_MANEJO,
        bonusSupervision: activeLabor.bonusSupervision ?? DEFAULT_BONUS_SUPERVISION,
        overtimeRate: activeLabor.overtimeRate ?? DEFAULT_OVERTIME_RATE,
      },
    });

  const submitLabor = async (e) => {
    e.preventDefault();
    if (!laborForm.data.name.trim()) return;
    // "__new__": se crea la agrupación nueva en laborGroups antes de armar la
    // labor.
    let laborGroupId = laborForm.data.laborGroupId || null;
    if (laborGroupId === "__new__") {
      if (!laborForm.data.newGroupName.trim()) {
        toast.warning("Ponele un nombre a la agrupación nueva.");
        return;
      }
      const created = await laborGroupsService.create({
        subfaenaId: cycle.subfaenaId,
        name: laborForm.data.newGroupName.trim(),
        active: true,
      });
      laborGroupId = created.id;
      setLaborGroups((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    }
    const buildLabor = (existing = {}) => {
      const base = {
        ...existing,
        name: laborForm.data.name.trim(),
        type: laborForm.data.type,
        laborGroupId: laborGroupId || null,
      };
      if (laborForm.data.type === "cosecha") {
        base.cosechaMode = laborForm.data.cosechaMode;
      }
      if (laborForm.data.type === "trato") {
        base.tratoMode = laborForm.data.tratoMode;
        base.tratoType = Number(laborForm.data.tratoType);
      }
      if (laborForm.data.type === "tratoEtapas") {
        base.stages = normalizeStages(laborForm.data.stages);
      }
      if (laborForm.data.type === "tratoHE") {
        base.baseDayDefault = Number(laborForm.data.baseDayDefault) || DEFAULT_BASE_DAY;
        base.bonusManejo = Number(laborForm.data.bonusManejo) || DEFAULT_BONUS_MANEJO;
        base.bonusSupervision = Number(laborForm.data.bonusSupervision) || DEFAULT_BONUS_SUPERVISION;
        base.overtimeRate = Number(laborForm.data.overtimeRate) || DEFAULT_OVERTIME_RATE;
      }
      if (["main", "supervision", "extra"].includes(laborForm.data.type)) {
        base.baseDayDefault = Number(laborForm.data.baseDayDefault) || DEFAULT_BASE_DAY;
      }
      return base;
    };
    if (laborForm.mode === "create") {
      const labor = { id: newId(), ...buildLabor(), workers: [] };
      const nextLabors = [...cycle.labors, labor];
      await cycleWrite({ labors: nextLabors });
      setCycle((c) => ({ ...c, labors: nextLabors }));
      setActiveLaborId(labor.id);
    } else {
      const nextLabors = cycle.labors.map((l) =>
        l.id === laborForm.data.id ? buildLabor(l) : l,
      );
      await cycleWrite({ labors: nextLabors });
      setCycle((c) => ({ ...c, labors: nextLabors }));
      // En tratoHE recalcula los workdays con las tarifas nuevas.
      if (laborForm.data.type === "tratoHE") {
        // Calcula con `nextLabors`: el estado `cycle` todavía tiene las
        // tarifas anteriores.
        const updatedLabor = nextLabors.find((l) => l.id === laborForm.data.id);
        const wdMapForLabor = workdaysByLabor[updatedLabor.id] || {};
        const updates = {};
        for (const k in wdMapForLabor) {
          const wd = wdMapForLabor[k];
          const dayCfg = getDaySingle(dayPrices, updatedLabor.id, wd.date, "normal");
          const amount = computeTratoHEAmount(updatedLabor, dayCfg, wd);
          if (amount === wd.amount) continue;
          const docId = workdayDocId(id, updatedLabor.id, wd.workerRut, wd.date, SINGLE_COMBO);
          const next = { ...wd, amount, workerId: workerIdFor(updatedLabor.id, wd.workerRut) };
          await wdWrite.upsert(docId, next);
          updates[k] = next;
        }
        if (Object.keys(updates).length > 0) {
          setWorkdaysByLabor((prev) => ({
            ...prev,
            [updatedLabor.id]: { ...(prev[updatedLabor.id] || {}), ...updates },
          }));
        }
      }
      // tratoEtapas: el precio es por día (no de la labor), así que cambiar
      // las etapas (nombre/counts) no recalcula montos de workdays.
    }
    setLaborForm(null);
  };

  const askRemoveLabor = () => setRemoveLabor(activeLabor);
  const confirmRemoveLabor = async () => {
    if (!removeLabor) return;
    const wds = await workdaysService.list({
      wheres: [["cycleId", "==", id], ["laborId", "==", removeLabor.id]], take: 1,
    });
    if (wds.length) {
      toast.warning("No se puede quitar: la labor tiene producción registrada.");
      setRemoveLabor(null);
      return;
    }
    if (cycle.labors.length === 1) {
      toast.warning("Debe existir al menos una labor.");
      setRemoveLabor(null);
      return;
    }
    const nextLabors = cycle.labors.filter((l) => l.id !== removeLabor.id);
    await cycleWrite({ labors: nextLabors });
    setCycle((c) => ({ ...c, labors: nextLabors }));
    setActiveLaborId(nextLabors[0]?.id || null);
    setRemoveLabor(null);
  };

  // ============================================================
  // Varios
  // ============================================================

  const showToast = (msg) => {
    setCopyToast(msg);
    setTimeout(() => setCopyToast(""), 1800);
  };

  const handleCloseCycle = async () => {
    setCloseBusy(true);
    try {
      const startDate = firstWorkedDay(cycle);
      const endDate = lastWorkedDay(cycle);
      await cyclesService.update(id, { status: "closed", startDate, endDate });
      setCycle((c) => ({ ...c, status: "closed", startDate, endDate }));
      setCloseFlow(false);
      showToast("Ciclo cerrado");
    } finally {
      setCloseBusy(false);
    }
  };

  const handleReopenCycle = () => setConfirmReopen(true);
  const doReopenCycle = async () => {
    await cyclesService.update(id, { status: "open", endDate: null });
    setCycle((c) => ({ ...c, status: "open", endDate: null }));
    showToast("Ciclo reabierto");
  };

  const exportPng = async () => {
    if (!photoRef.current) return;
    setExporting(true);
    try {
      const bg = getComputedStyle(document.body).backgroundColor || "#ffffff";
      const dataUrl = await captureFullWidthDataUrl(photoRef.current, { backgroundColor: bg, pixelRatio: 2, cacheBust: true });
      const link = document.createElement("a");
      link.download = `${cycle.label}_${activeLabor?.name || "labor"}_${todayStr()}.png`.replace(/\s+/g, "_");
      link.href = dataUrl;
      link.click();
      showToast("PNG descargado");
    } catch (err) {
      console.error(err);
      showToast("No se pudo generar el PNG");
    } finally {
      setExporting(false);
    }
  };

  const copyImage = async () => {
    if (!photoRef.current) return;
    setExporting(true);
    try {
      const bg = getComputedStyle(document.body).backgroundColor || "#ffffff";
      const blob = await captureFullWidthBlob(photoRef.current, { backgroundColor: bg, pixelRatio: 2, cacheBust: true });
      if (!blob) throw new Error("No se pudo generar la imagen");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      showToast("Imagen copiada");
    } catch (err) {
      console.error(err);
      showToast("No se pudo copiar la imagen");
    } finally {
      setExporting(false);
    }
  };

  const printPhoto = async () => {
    if (!photoRef.current) return;
    setExporting(true);
    try {
      const bg = getComputedStyle(document.body).backgroundColor || "#ffffff";
      const dataUrl = await captureFullWidthDataUrl(photoRef.current, { backgroundColor: bg, pixelRatio: 2, cacheBust: true });
      const win = window.open("", "_blank", "width=1100,height=800");
      if (!win) {
        toast.warning("Permite las ventanas emergentes para imprimir.");
        return;
      }
      win.document.write(`<!DOCTYPE html><html><head><title>${cycle.label} · ${activeLabor?.name || ""}</title>
        <style>
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
          body { margin: 0; padding: 16px; background: #fff; }
          img { max-width: 100%; height: auto; display: block; }
          @media print { @page { size: landscape; margin: 8mm; } body { padding: 0; } }
        </style>
      </head><body><img src="${dataUrl}" /></body></html>`);
      win.document.close();
      win.focus();
      setTimeout(() => { win.print(); }, 300);
    } catch (err) {
      console.error(err);
      showToast("No se pudo imprimir");
    } finally {
      setExporting(false);
    }
  };

  // ============================================================
  // Columnas de la grilla
  // ============================================================

  const columnDefs = useMemo(() => {
    const baseLeft = [
      {
        headerName: "RUT", field: "rut", editable: false, width: 140, pinned: "left",
        // Mobile (<768px): la columna RUT se oculta para que quepan más días.
        hide: isMobile,
        onCellDoubleClicked: (p) => {
          if (p.data?._isHeader || p.data?._isTemp) return;
          const rut = p.data?.rut;
          if (rut) setEditingWorkerRut(rut);
        },
        cellRenderer: (p) => {
          if (p.data?._isHeader) return null;
          if (p.data?._isTemp) {
            if (readOnly) {
              return <span className="text-xs italic text-[var(--color-muted)]">sin RUT</span>;
            }
            return (
              <button
                type="button"
                onClick={() => setAssignTempRut(p.data.rut)}
                className="rounded border border-amber-500/60 bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
                title="Asignar un RUT real a este trabajador temporal"
              >
                Asignar RUT
              </button>
            );
          }
          return (
            <span
              className="cursor-pointer hover:underline"
              title="Doble click para editar el trabajador"
            >
              {formatRutForDisplay(p.value)}
            </span>
          );
        },
      },
      {
        headerName: "Nombre", field: "name", editable: false, width: isMobile ? 130 : 220, pinned: "left",
        cellRenderer: (p) => {
          if (p.data?._isHeader) return p.value;
          const badges = [];
          if (p.data?._isTemp) {
            badges.push(
              <span
                key="temp"
                className="rounded border border-amber-500/50 bg-amber-500/15 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300"
                title="Trabajador temporal: solo vive en este ciclo y se ignora al pagar"
              >
                Temporal
              </span>
            );
          }
          if (p.data?._monthly) {
            badges.push(
              <span
                key="monthly"
                className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/20 text-[10px] font-bold text-emerald-700 dark:text-emerald-300"
                title="Pago mensual: las jornadas se registran como asistencia pero no entran al payroll"
              >
                M
              </span>
            );
          }
          if (p.data?._isOrphan) {
            badges.push(
              <span
                key="orphan"
                className="rounded border border-rose-500/50 bg-rose-500/15 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-300"
                title="Tiene producción registrada pero ya no está en el listado del labor. Las métricas y el payroll lo siguen contando. Eliminar sus workdays o re-agregarlo al listado."
              >
                Huérfano
              </span>
            );
          }
          if (badges.length === 0) return p.value;
          return (
            <span className="inline-flex items-center gap-1.5">
              <span>{p.value}</span>
              {badges}
            </span>
          );
        },
      },
    ];
    const totalCol = {
      headerName: isQtyLabor ? "TOTAL ($)" : "TOTAL",
      field: "total", editable: false, width: isMobile ? 100 : 150, pinned: "right",
      valueFormatter: (p) => fmtCurrency(p.value),
      cellStyle: { fontWeight: 600, color: "var(--color-accent)" },
    };
    const isNormalLaborForCol = !isCosechaLabor && !isTratoLabor && !isTratoHELabor;
    const actionsCol = photoMode ? [] : [{
      headerName: "", field: "_actions", editable: false,
      // Ancho según los botones de la celda: ✕, más M en labores normales y los
      // de líder en la vista por grupo.
      width: useGrouped
        ? (isNormalLaborForCol ? 160 : 130)
        : (isNormalLaborForCol ? 70 : 50),
      pinned: "right",
      cellRenderer: (p) => {
        const rut = p.data?.rut;
        if (!rut || p.data?._isHeader) return null;
        const isTemp = !!p.data?._isTemp;
        const isMonthly = !!p.data?._monthly;
        const isNormalLabor = !isCosechaLabor && !isTratoLabor && !isTratoHELabor;
        const showAssign = useGrouped && !rutToLeader.has(rut) && !readOnly && !isTemp;
        return (
          <div className="flex items-center gap-1.5">
            {isNormalLabor && !readOnly && (
              <button
                type="button"
                onClick={() => toggleMonthly(rut)}
                className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold ${
                  isMonthly
                    ? "border-emerald-500/60 bg-emerald-500/20 text-emerald-700 hover:bg-emerald-500/30 dark:text-emerald-300"
                    : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)]"
                }`}
                title={isMonthly
                  ? "Pago mensual activo. Click para volver a pago por día."
                  : "Marcar como pago mensual (no entra al payroll)."}
              >
                M
              </button>
            )}
            {showAssign && (
              <>
                <button
                  type="button"
                  onClick={() => assignLeaderToWorker(rut, LEADER_LOCAL)}
                  disabled={groupBusy}
                  className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
                  title="Marcar como CHILENOS"
                >
                  Chilenos
                </button>
                <button
                  type="button"
                  onClick={() => setLeaderPickerFor(rut)}
                  disabled={groupBusy}
                  className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
                  title="Elegir otro líder"
                >
                  …
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => askRemoveWorker(rut)}
              disabled={readOnly}
              title="Quitar trabajador"
              className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--color-danger)]/40 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)] disabled:opacity-40"
            >
              ✕
            </button>
          </div>
        );
      },
    }];

    // Encabezado del día con su anotación. Una columna simple usa
    // `headerComponent`; un grupo con hijos, `headerGroupComponent`.
    const dayHdrParams = (d) => ({
      date: d, note: noteForDay(d), onClickNote: openDayNote, clickable: dayHasContent(d),
    });
    const dayCellHdr = (d) => ({
      headerComponent: DayHeader,
      headerComponentParams: dayHdrParams(d),
    });
    const dayGroupHdr = (d) => ({
      headerGroupComponent: DayHeader,
      headerGroupComponentParams: dayHdrParams(d),
    });

    if (isCosechaLabor) {
      if (cosechaView === "resumen") {
        const dayCols = days.map((d) => ({
          headerName: d,
          field: `${d}__total`,
          editable: false,
          width: isMobile ? 70 : 110,
          ...dayCellHdr(d),
          valueFormatter: (p) => (p.value ? fmtCurrency(p.value) : ""),
          cellRenderer: (p) => {
            const amt = Number(p.value) || 0;
            if (!amt) return "";
            return <span className="text-right text-sm font-semibold tabular-nums">{fmtCurrency(amt)}</span>;
          },
          cellStyle: { textAlign: "right" },
        }));
        return [...baseLeft, ...dayCols, totalCol, ...actionsCol];
      }
      const dayGroups = days.map((d) => {
        const combos = dayCombosByDate[d] || [];
        const children = combos.map((c) => ({
          headerName: comboLabel(catalogs, c.x, c.y),
          field: `${d}__${c.key}`,
          // `qrLocked`: la sincronización de Pesajes QR hace `upsert` sobre este
          // mismo docId y pisa `qty` y `amount`. El piso sigue editable: es un
          // bono manual que la sincronización no toca.
          editable: !readOnly && !photoMode && !qrLocked,
          width: isMobile ? 78 : 120,
          type: "numericColumn",
          valueParser: (p) => parseAmount(p.newValue),
          cellEditor: FormulaCellEditor,
          cellRenderer: (p) => {
            const qty = Number(p.value) || 0;
            const amt = Number(p.data?.[`${d}__${c.key}__amt`]) || 0;
            if (!qty && !amt) return "";
            return (
              <div className="leading-tight">
                <div className="font-medium tabular-nums">
                  {qty.toLocaleString("es-CL")} {containerLabel(catalogs, c.y)}
                </div>
                {amt > 0 && (
                  <div className="text-[10px] text-[var(--color-muted)] tabular-nums">{fmtCurrency(amt)}</div>
                )}
              </div>
            );
          },
        }));
        if (daysWithPiso.has(d)) {
          children.push(buildPisoChildCol(d, activeLabor, dayPrices, readOnly || photoMode, togglePiso));
        }
        return {
          headerName: d, groupId: `g_${d}`,
          ...dayGroupHdr(d),
          children: children.length ? children : [{
            headerName: "—", field: `${d}__placeholder`, editable: false, width: 80, valueGetter: () => "",
          }],
        };
      });
      return [...baseLeft, ...dayGroups, totalCol, ...actionsCol];
    }

    if (isTratoLabor) {
      if (tratoView === "resumen") {
        const dayCols = days.map((d) => ({
          headerName: d,
          field: `${d}__total`,
          editable: false,
          width: isMobile ? 70 : 110,
          ...dayCellHdr(d),
          valueFormatter: (p) => (p.value ? fmtCurrency(p.value) : ""),
          cellRenderer: (p) => {
            const amt = Number(p.value) || 0;
            if (!amt) return "";
            return <span className="text-right text-sm font-semibold tabular-nums">{fmtCurrency(amt)}</span>;
          },
          cellStyle: { textAlign: "right" },
        }));
        return [...baseLeft, ...dayCols, totalCol, ...actionsCol];
      }
      const dayGroups = days.map((d) => {
        const tiers = dayTiersByDate[d] || [];
        const children = tiers.map((t) => ({
          headerName: `${fmtCurrency(t.price)} ${t.mode === "flat" ? "/día" : "/unid"}`,
          field: `${d}__${t.key}`,
          editable: !readOnly && !photoMode,
          width: isMobile ? 78 : 120,
          type: "numericColumn",
          valueParser: (p) => parseAmount(p.newValue),
          cellEditor: FormulaCellEditor,
          cellRenderer: (p) => {
            const qty = Number(p.value) || 0;
            const amt = Number(p.data?.[`${d}__${t.key}__amt`]) || 0;
            if (!qty && !amt) return "";
            return (
              <div className="leading-tight">
                <div className="font-medium tabular-nums">{qty.toLocaleString("es-CL")}</div>
                {amt > 0 && (
                  <div className="text-[10px] text-[var(--color-muted)] tabular-nums">{fmtCurrency(amt)}</div>
                )}
              </div>
            );
          },
        }));
        if (daysWithPiso.has(d)) {
          children.push(buildPisoChildCol(d, activeLabor, dayPrices, readOnly || photoMode, togglePiso));
        }
        return {
          headerName: d, groupId: `g_${d}`,
          ...dayGroupHdr(d),
          children: children.length ? children : [{
            headerName: "—", field: `${d}__placeholder`, editable: false, width: 80, valueGetter: () => "",
          }],
        };
      });
      return [...baseLeft, ...dayGroups, totalCol, ...actionsCol];
    }

    if (isTratoEtapasLabor) {
      // Cada día es un grupo; sus columnas hijas son las etapas visibles ese
      // día (con precio configurado o con producción). El precio del día va en
      // el tooltip del encabezado. La celda edita la cantidad y muestra el
      // monto debajo.
      const dayGroups = days.map((d) => {
        const stages = dayStagesByDate[d] || [];
        const children = stages.map((st) => ({
          headerName: `${st.name}${st.counts ? " ✓" : ""}`,
          headerTooltip: `${st.name} · ${fmtCurrency(st.price)}${st.mode === "flat" ? "/día" : "/unid"}${st.counts ? " · cuenta para producción" : " · no cuenta unidades"}`,
          field: `${d}__${st.id}`,
          editable: !readOnly && !photoMode,
          width: isMobile ? 84 : 130,
          type: "numericColumn",
          valueParser: (p) => parseAmount(p.newValue),
          cellEditor: FormulaCellEditor,
          cellRenderer: (p) => {
            const qty = Number(p.value) || 0;
            const amt = Number(p.data?.[`${d}__${st.id}__amt`]) || 0;
            if (!qty && !amt) return "";
            return (
              <div className="leading-tight">
                <div className="font-medium tabular-nums">{qty.toLocaleString("es-CL")}</div>
                {amt > 0 && (
                  <div className="text-[10px] text-[var(--color-muted)] tabular-nums">{fmtCurrency(amt)}</div>
                )}
              </div>
            );
          },
        }));
        return {
          headerName: d, groupId: `g_${d}`,
          ...dayGroupHdr(d),
          children: children.length ? children : [{
            headerName: "sin precio", field: `${d}__placeholder`, editable: false, width: 90, valueGetter: () => "",
          }],
        };
      });
      return [...baseLeft, ...dayGroups, totalCol, ...actionsCol];
    }

    if (isTratoHELabor) {
      const labor = activeLabor;
      const rates = {
        bonusManejo: labor?.bonusManejo ?? DEFAULT_BONUS_MANEJO,
        bonusSupervision: labor?.bonusSupervision ?? DEFAULT_BONUS_SUPERVISION,
        overtimeRate: labor?.overtimeRate ?? DEFAULT_OVERTIME_RATE,
      };
      const buildBreakdown = (data, d, cfg) => {
        const qty = Number(data?.[`${d}__qty`]) || 0;
        const he = Number(data?.[`${d}__he`]) || 0;
        const m = !!data?.[`${d}__m`];
        const s = !!data?.[`${d}__s`];
        const x = Number(data?.[`${d}__x`]) || 0;
        const lines = [];
        const base = cfg.mode === "overtimeOnly" ? 0 : qty;
        if (cfg.mode === "overtimeOnly") {
          lines.push(`Solo HE (sin base)`);
        } else if (qty > 0) {
          lines.push(`Base: ${fmtCurrency(base)}`);
        }
        if (he > 0) lines.push(`HE: ${he}h × ${fmtCurrency(rates.overtimeRate)} = ${fmtCurrency(he * rates.overtimeRate)}`);
        if (m) lines.push(`Manejo: ${fmtCurrency(rates.bonusManejo)}`);
        if (s) lines.push(`Supervisión: ${fmtCurrency(rates.bonusSupervision)}`);
        if (x !== 0) lines.push(`Extras: ${fmtCurrency(x)}`);
        const total = Number(data?.[`${d}__amt`]) || 0;
        if (lines.length === 0) return "Sin movimiento";
        lines.push(`= ${fmtCurrency(total)}`);
        return lines.join("\n");
      };

      // Modo resumen: una columna de $ por día
      if (tratoHEView === "resumen") {
        const dayCols = days.map((d) => {
          const cfg = getDaySingle(dayPrices, activeLabor.id, d, "normal");
          const red = isRedDay(d, cfg);
          const headerSuffix = cfg.mode === "overtimeOnly" ? " · solo HE" : "";
          const headerLabel = `${d}${cfg.isHoliday ? " 🎉" : ""}${headerSuffix}`;
          return {
            headerName: headerLabel,
            field: `${d}__amt`,
            editable: false,
            width: isMobile ? 70 : 110,
            ...dayCellHdr(d),
            headerClass: red ? "ag-header-red-day" : undefined,
            valueFormatter: (p) => p.value ? fmtCurrency(p.value) : "",
            cellRenderer: (p) => {
              const amt = Number(p.value) || 0;
              if (!amt) return "";
              return (
                <button
                  onClick={() => setBonusEdit({ laborId: activeLabor.id, date: d, workerRut: p.data.rut })}
                  disabled={readOnly}
                  title={buildBreakdown(p.data, d, cfg)}
                  className="h-full w-full text-right text-sm font-semibold tabular-nums hover:underline"
                >
                  {fmtCurrency(amt)}
                </button>
              );
            },
            cellStyle: { textAlign: "right" },
          };
        });
        return [...baseLeft, ...dayCols, totalCol, ...actionsCol];
      }

      const dayGroups = days.map((d) => {
        const cfg = getDaySingle(dayPrices, activeLabor.id, d, "normal");
        const red = isRedDay(d, cfg);
        const headerSuffix = cfg.mode === "overtimeOnly" ? " · solo HE" : "";
        const headerLabel = `${d}${cfg.isHoliday ? " 🎉" : ""}${headerSuffix}`;
        return {
          headerName: headerLabel,
          groupId: `g_${d}`,
          ...dayGroupHdr(d),
          headerClass: red ? "ag-header-red-day" : undefined,
          children: [
            {
              headerName: "Base",
              field: `${d}__qty`,
              // Una celda vacía no es editable, así el click llega al botón de
              // la base sugerida; con valor, se edita normalmente.
              editable: (p) => !readOnly && !photoMode && Number(p.data?.[`${d}__qty`] || 0) > 0,
              width: isMobile ? 85 : 130,
              type: "numericColumn",
              valueParser: (p) => parseAmount(p.newValue),
              cellEditor: FormulaCellEditor,
              valueFormatter: (p) => (p.value ? fmtCurrency(p.value) : ""),
              headerTooltip: `Base del día (monto). Sugerido: ${fmtCurrency(effectiveDayPrice(labor, cfg))}. Abajo: bonos (M/S/+) y total del día — click para editar.`,
              cellStyle: { padding: 0 },
              cellRenderer: (p) => {
                const v = Number(p.value) || 0;
                const m = p.data?.[`${d}__m`];
                const s = p.data?.[`${d}__s`];
                const x = Number(p.data?.[`${d}__x`]) || 0;
                const amt = Number(p.data?.[`${d}__amt`]) || 0;
                const suggested = effectiveDayPrice(labor, cfg);
                return (
                  <div className="flex h-full w-full flex-col">
                    <div className="flex flex-1 items-center justify-end px-1">
                      {v > 0 ? (
                        <span className="font-bold tabular-nums text-[var(--color-text)]">
                          {fmtCurrency(v)}
                        </span>
                      ) : (
                        !readOnly && !photoMode && cfg.mode !== "overtimeOnly" && (
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              await upsertTratoHEWorkday(activeLabor.id, d, p.data.rut, { qty: suggested });
                            }}
                            className="flex h-full w-full items-center justify-end gap-1 text-[10px] italic text-[var(--color-muted)] hover:not-italic hover:text-[var(--color-accent)]"
                            title={`Click: usar base sugerida ${fmtCurrency(suggested)}. Doble click después para modificar.`}
                          >
                            <span className="text-[8px]">+</span>
                            <span className="tabular-nums">{fmtCurrency(suggested)}</span>
                          </button>
                        )
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setBonusEdit({ laborId: activeLabor.id, date: d, workerRut: p.data.rut });
                      }}
                      disabled={readOnly}
                      title={buildBreakdown(p.data, d, cfg)}
                      className="flex shrink-0 items-center justify-center gap-1 border-t border-[var(--color-border)] px-1 py-0.5 text-[9px] leading-none hover:bg-[var(--color-accent-soft)]"
                    >
                      {m && <span className="rounded bg-blue-100 px-1 font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">M</span>}
                      {s && <span className="rounded bg-purple-100 px-1 font-medium text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">S</span>}
                      {x !== 0 && <span className="rounded bg-amber-100 px-1 font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">+</span>}
                      {!m && !s && !x && <span className="text-[var(--color-muted)] opacity-40">···</span>}
                      {amt > 0 && (
                        <span className="ml-1 font-semibold tabular-nums text-[var(--color-accent)]">{fmtCurrency(amt)}</span>
                      )}
                    </button>
                  </div>
                );
              },
            },
            {
              headerName: "HE",
              field: `${d}__he`,
              editable: !readOnly && !photoMode,
              width: 60,
              type: "numericColumn",
              valueParser: (p) => parseAmount(p.newValue),
              cellEditor: FormulaCellEditor,
              valueFormatter: (p) => (p.value ? `${p.value}h` : ""),
              headerTooltip: "Horas extras",
            },
          ],
        };
      });
      return [...baseLeft, ...dayGroups, totalCol, ...actionsCol];
    }

    const dayCols = days.map((d) => {
      const dayCfg = getDaySingle(dayPrices, activeLabor.id, d, "normal");
      const suggested = effectiveDayPrice(activeLabor, dayCfg);
      return {
        headerName: d, field: d,
        ...dayCellHdr(d),
        // Las filas de sueldo mensual no se editan: solo marcan asistencia con
        // un click. Una celda vacía tampoco, así el click llega al botón del
        // precio sugerido; con valor, se edita con doble click.
        editable: (p) => !readOnly && !photoMode && !p.data?._monthly && Number(p.data?.[d] || 0) > 0,
        width: isMobile ? 70 : 110,
        type: "numericColumn",
        valueParser: (p) => parseAmount(p.newValue),
        cellEditor: FormulaCellEditor,
        valueFormatter: (p) => fmtCurrency(p.value),
        headerTooltip: `${d} · Sugerido: ${fmtCurrency(suggested)}. Click en celda vacía para usarlo, doble click para editar.`,
        cellRenderer: (p) => {
          if (p.data?._monthly) {
            const present = !!p.data?.[`${d}__present`];
            if (readOnly || photoMode) {
              return (
                <span className={present ? "font-semibold text-emerald-600 dark:text-emerald-400" : "text-[var(--color-muted)]"}>
                  {present ? "✓" : ""}
                </span>
              );
            }
            return (
              <div
                role="button"
                onClick={(e) => { e.stopPropagation(); toggleAttendance(p.data.rut, d, present); }}
                className={`flex h-full w-full cursor-pointer items-center justify-center text-base font-bold transition-colors ${
                  present
                    ? "bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 dark:text-emerald-300"
                    : "text-transparent hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)]"
                }`}
                title={present ? "Asistencia registrada (sin pago). Click para borrar." : "Marcar asistencia sin pago."}
              >
                {present ? "✓" : "+"}
              </div>
            );
          }
          const amt = Number(p.value) || 0;
          if (amt) {
            return (
              <span className="font-bold tabular-nums text-[var(--color-text)]">
                {fmtCurrency(amt)}
              </span>
            );
          }
          if (readOnly || photoMode || !suggested) return "";
          return (
            <button
              onClick={async (e) => {
                e.stopPropagation();
                await commitNormalAmount(d, p.data.rut, suggested);
              }}
              className="flex h-full w-full items-center justify-end gap-1 text-[10px] italic text-[var(--color-muted)] hover:not-italic hover:text-[var(--color-accent)]"
              title={`Click: usar precio sugerido ${fmtCurrency(suggested)}. Doble click después para modificar.`}
            >
              <span className="text-[8px]">+</span>
              <span className="tabular-nums">{fmtCurrency(suggested)}</span>
            </button>
          );
        },
        cellStyle: (p) => p.data?._monthly
          ? { textAlign: "center", padding: 0 }
          : { textAlign: "right" },
      };
    });
    return [...baseLeft, ...dayCols, totalCol, ...actionsCol];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, readOnly, photoMode, qrLocked, isCosechaLabor, isTratoLabor, isTratoEtapasLabor, isTratoHELabor, dayCombosByDate, dayTiersByDate, dayStagesByDate, catalogs, dayPrices, activeLabor, tratoHEView, cosechaView, tratoView, activeLaborDayNotes, legacyDayNotes, activeLaborDatesWithProduction, daysWithPiso, isMobile]);

  if (loading) return <div className="text-[var(--color-muted)]">Cargando...</div>;
  if (!cycle) return <div className="text-[var(--color-muted)]">Ciclo no encontrado.</div>;

  const grid = (
    <div className="ag-theme-quartz ag-theme-app h-full overflow-x-auto" style={{ minHeight: 400 }}>
      {workers.length === 0 ? (
        <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-[var(--color-border)] text-[var(--color-muted)]">
          Agrega trabajadores para empezar.
        </div>
      ) : (
        <AgGridReact
          ref={gridRef}
          theme="legacy"
          rowData={rowData}
          columnDefs={columnDefs}
          onCellValueChanged={onCellValueChanged}
          onCellKeyDown={onCellKeyDown}
          isExternalFilterPresent={isExternalFilterPresent}
          doesExternalFilterPass={doesExternalFilterPass}
          onFilterChanged={handleGridFilterChanged}
          singleClickEdit={false}
          enterNavigatesVertically
          enterNavigatesVerticallyAfterEdit
          stopEditingWhenCellsLoseFocus
          getRowId={(p) => p.data.rut}
          enableCellTextSelection
          ensureDomOrder
          localeText={AG_GRID_LOCALE_ES}
          defaultColDef={{ resizable: true, sortable: true, filter: true }}
          rowHeight={isTratoHELabor ? 58 : (isQtyLabor ? 44 : undefined)}
          isFullWidthRow={(p) => !!p.rowNode.data?._isHeader}
          fullWidthCellRenderer={GroupHeaderRowRenderer}
          getRowClass={(p) => (p.data?._isHeader ? "ag-group-header-row" : "")}
        />
      )}
    </div>
  );

  if (photoMode) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-[var(--color-bg)] p-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button onClick={copyImage} disabled={exporting} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-60">
            {exporting ? "..." : "🖼 Copiar imagen"}
          </button>
          <button onClick={exportPng} disabled={exporting} className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-60">
            {exporting ? "Generando..." : "📥 Descargar PNG"}
          </button>
          <button onClick={printPhoto} disabled={exporting} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-60">
            🖨 Imprimir
          </button>
          <button onClick={() => setPhotoMode(false)} className="ml-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)]">
            Salir modo foto
          </button>
        </div>
        <div ref={photoRef} className="flex flex-1 flex-col bg-[var(--color-bg)] p-4">
          <div className="mb-3">
            <h1 className="text-xl font-semibold tracking-tight">{cycle.label} · {activeLabor?.name}</h1>
            <p className="text-xs text-[var(--color-muted)]">
              {faena?.name || "—"}
              {subfaena && ` · ${subfaena.name}`}
              {` · ${workers.length} trabajadores · ${days.length} días`}
            </p>
          </div>
          <div className="flex-1">{grid}</div>
        </div>
        {copyToast && (
          <div className="pointer-events-none fixed bottom-6 left-1/2 -translate-x-1/2 rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] shadow-lg">
            {copyToast}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link to="/faenas" className="hover:text-[var(--color-accent)]">Faenas</Link>
        <span>/</span>
        {faena ? (
          <Link
            to={`/faenas?selected=${faena.id}`}
            className="hover:text-[var(--color-accent)]"
          >
            {faena.name}
          </Link>
        ) : (
          <span>—</span>
        )}
        {subfaena && (
          <>
            <span>/</span>
            <Link
              to={`/faenas?selected=${faena?.id || ""}&sub=${subfaena.id}`}
              className="hover:text-[var(--color-accent)]"
            >
              {subfaena.name}
            </Link>
          </>
        )}
        <span>/</span>
        <span className="text-[var(--color-text)]">{cycle.label}</span>
      </div>

      {toolbarCollapsed && (
        <div className="mb-2 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setToolbarCollapsed(false)}
            title="Mostrar controles del ciclo"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-[var(--color-border)] text-xs text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          >
            ▶
          </button>
          <button
            type="button"
            onClick={() => prevCycle && navigate(`/cycles/${prevCycle.id}`)}
            disabled={!prevCycle}
            title={prevCycle ? `Ciclo anterior: ${prevCycle.label}` : "No hay ciclo anterior"}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-[var(--color-border)] text-xs text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-30 disabled:pointer-events-none"
          >
            ‹
          </button>
          <span className="text-lg font-semibold tracking-tight">{cycle.label}</span>
          <button
            type="button"
            onClick={() => nextCycle && navigate(`/cycles/${nextCycle.id}`)}
            disabled={!nextCycle}
            title={nextCycle ? `Ciclo siguiente: ${nextCycle.label}` : "No hay ciclo siguiente"}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-[var(--color-border)] text-xs text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-30 disabled:pointer-events-none"
          >
            ›
          </button>
          {activeLabor && (
            <span className="ml-1 truncate text-xs text-[var(--color-muted)]">
              {activeLabor.name} · {workers.length} trab. · {days.length} días
            </span>
          )}
        </div>
      )}

      {!toolbarCollapsed && (
      <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setToolbarCollapsed(true)}
              title="Ocultar controles del ciclo (más espacio para la grilla)"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-[var(--color-border)] text-xs text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              ▼
            </button>
            <button
              type="button"
              onClick={() => prevCycle && navigate(`/cycles/${prevCycle.id}`)}
              disabled={!prevCycle}
              title={prevCycle ? `Ciclo anterior: ${prevCycle.label}` : "No hay ciclo anterior"}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-[var(--color-border)] text-xs text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-30 disabled:pointer-events-none"
            >
              ‹
            </button>
            <h1 className="text-2xl font-semibold tracking-tight">{cycle.label}</h1>
            <button
              type="button"
              onClick={() => nextCycle && navigate(`/cycles/${nextCycle.id}`)}
              disabled={!nextCycle}
              title={nextCycle ? `Ciclo siguiente: ${nextCycle.label}` : "No hay ciclo siguiente"}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-[var(--color-border)] text-xs text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-30 disabled:pointer-events-none"
            >
              ›
            </button>
          </div>
          <p className="text-sm text-[var(--color-muted)]">
            {cycle.labors.length} labor{cycle.labors.length === 1 ? "" : "es"} · {days.length} días
            {closed && " · 🔒 ciclo cerrado (solo lectura)"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setCatalogsOpen(true)} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)]">
            ⚙ Catálogos
          </button>
          <button onClick={() => setTransportsOpen(true)} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)]">
            🚐 Transportes
          </button>
          <button onClick={() => setSummaryOpen(true)} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)]">
            📊 Resumen ciclo
          </button>
          {!closed && (
            <button onClick={() => setCloseFlow(true)} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)]">
              Cerrar ciclo
            </button>
          )}
          {closed && (
            <button onClick={handleReopenCycle} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)]">
              Reabrir ciclo
            </button>
          )}
          <span
            className="hidden sm:inline-flex items-center gap-1 rounded-md border border-dashed border-[var(--color-border)] px-2 py-1 text-[10px] text-[var(--color-muted)]"
            title={
              "Atajos en el grid:\n" +
              "  Esc → salir de edición\n" +
              "  Shift+Click en filas → seleccionar rango\n" +
              "  Ctrl+D → copiar valor de la celda focuseada a las filas seleccionadas\n" +
              "  Ctrl+V → pegar columna desde portapapeles (una línea por fila)\n" +
              "  Ctrl+Z → deshacer último cambio (Ctrl+D y Ctrl+V se deshacen como uno)"
            }
          >
            ⌨ Atajos
          </span>
        </div>
      </div>

      {/* Métricas */}
      <button
        type="button"
        onClick={() => setMetricsCollapsed((v) => !v)}
        className="mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-[var(--color-muted)] hover:text-[var(--color-accent)]"
        title={metricsCollapsed ? "Mostrar métricas" : "Ocultar métricas"}
      >
        <span>{metricsCollapsed ? "▶" : "▼"}</span>
        <span>Métricas</span>
      </button>
      {!metricsCollapsed && (
      <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {cycle.labors.map((l) => {
          const isCo = l.type === "cosecha";
          const isTr = l.type === "trato";
          const isEt = l.type === "tratoEtapas";
          const isHE = l.type === "tratoHE";
          const totalAmt = totalsByLabor[l.id] || 0;
          const qtyByContainer = totalQtyByContainerByLabor[l.id] || {};
          const totalQty = totalQtyByLabor[l.id] || 0;
          const heMetrics = tratoHEMetricsByLabor[l.id];
          const pisoMetrics = pisoMetricsByLabor[l.id] || { count: 0, amount: 0 };
          const tag = isCo ? "cosecha" : isTr ? "trato" : isEt ? "por etapas" : isHE ? "jornadas+HE" : l.type === "main" ? "al día" : l.type;
          const tagClass = isCo
            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
            : isTr
              ? "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400"
              : isEt
                ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400"
                : isHE
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                  : "bg-[var(--color-surface-2)]";
          return (
            <button
              type="button"
              key={l.id}
              onClick={() => setActiveLaborId(l.id)}
              className={`rounded-lg border bg-[var(--color-surface)] p-3 shadow-sm text-left transition-all hover:border-[var(--color-accent)] hover:shadow-md ${
                l.id === activeLabor?.id ? "border-[var(--color-accent)] ring-2 ring-[var(--color-accent-soft)]" : "border-[var(--color-border)]"
              }`}
            >
              <div className="flex items-center justify-between text-xs text-[var(--color-muted)]">
                <span>{l.name}</span>
                <span className="flex items-center gap-1">
                  {qrLockedLabors.has(l.id) && (
                    <span
                      title={`Cosecha sincronizada desde los pesajes QR del prefijo ${qrLockedLabors.get(l.id).id}`}
                      className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] text-violet-700 dark:bg-violet-900/30 dark:text-violet-400"
                    >
                      📱 {qrLockedLabors.get(l.id).id}
                    </span>
                  )}
                  <span className={`rounded px-1.5 py-0.5 text-[10px] ${tagClass}`}>{tag}</span>
                </span>
              </div>
              <div className="mt-1 text-lg font-semibold tabular-nums">{fmtCurrency(totalAmt)}</div>
              {isCo && Object.keys(qtyByContainer).length > 0 && (
                <div className="mt-0.5 text-[11px] text-[var(--color-muted)] tabular-nums">
                  {Object.entries(qtyByContainer)
                    .filter(([, qty]) => qty > 0)
                    .map(([y, qty]) => `${qty.toLocaleString("es-CL")} ${containerLabel(catalogs, Number(y))}`)
                    .join(" · ")}
                </div>
              )}
              {isTr && (
                <div className="mt-1 space-y-0.5 text-[11px] tabular-nums">
                  <div className="text-[var(--color-muted)]">
                    {tratoTypeLabel(catalogs, l.tratoType ?? 0)} · {totalQty.toLocaleString("es-CL")} unid.
                  </div>
                  {(() => {
                    const n = tratoPeopleCountByLabor[l.id] || 0;
                    if (n === 0) return null;
                    const avg = totalQty / n;
                    return (
                      <div className="text-[var(--color-muted)]">
                        {n} persona{n === 1 ? "" : "s"} · prom{" "}
                        {avg.toLocaleString("es-CL", { maximumFractionDigits: 1 })}/persona
                      </div>
                    );
                  })()}
                  {tratoTierMetricsByLabor[l.id] && Object.keys(tratoTierMetricsByLabor[l.id]).length > 1 && (
                    <div className="mt-0.5 space-y-0">
                      {Object.entries(tratoTierMetricsByLabor[l.id])
                        .sort(([a], [b]) => Number(a) - Number(b))
                        .map(([idx, tm]) => (
                          <div key={idx} className="flex justify-between gap-2 text-[var(--color-muted)]">
                            <span>Precio {Number(idx) + 1}:</span>
                            <span>
                              {tm.qty.toLocaleString("es-CL")} unid. · {fmtCurrency(tm.amount)}
                            </span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}
              {isEt && (
                <div className="mt-1 text-[11px] tabular-nums text-[var(--color-muted)]">
                  {totalQty.toLocaleString("es-CL")} unid. producidas
                  <span className="ml-1 opacity-70">(etapas que cuentan)</span>
                </div>
              )}
              {(isCo || isTr) && pisoMetrics.count > 0 && (
                <div className="mt-1 flex justify-between gap-2 text-[11px] tabular-nums">
                  <span className="text-[var(--color-muted)]">🪙 Pisos:</span>
                  <span>
                    <span className="font-medium">{pisoMetrics.count}</span>
                    <span className="text-[var(--color-muted)]"> jorn. · </span>
                    <span className="font-medium">{fmtCurrency(pisoMetrics.amount)}</span>
                  </span>
                </div>
              )}
              {isHE && heMetrics && (
                <div className="mt-1 space-y-0.5 text-[11px] tabular-nums">
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--color-muted)]">Base:</span>
                    <span>
                      <span className="font-medium">{fmtCurrency(heMetrics.normalQty)}</span>
                      <span className="text-[var(--color-muted)]"> norm.</span>
                      {heMetrics.holidayQty > 0 && (
                        <span className="ml-1 text-[var(--color-danger)]">
                          + {fmtCurrency(heMetrics.holidayQty)} fer.
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--color-muted)]">Horas extras:</span>
                    <span>
                      <span className="font-medium">{heMetrics.normalHE.toLocaleString("es-CL")}h</span>
                      <span className="text-[var(--color-muted)]"> norm.</span>
                      {heMetrics.holidayHE > 0 && (
                        <span className="ml-1 text-[var(--color-danger)]">
                          + {heMetrics.holidayHE.toLocaleString("es-CL")}h fer.
                        </span>
                      )}
                    </span>
                  </div>
                  {heMetrics.workersWithBonus > 0 && (
                    <div className="flex justify-between gap-2 text-[var(--color-muted)]">
                      <span>Con bonos:</span>
                      <span>{heMetrics.workersWithBonus} trab.</span>
                    </div>
                  )}
                </div>
              )}
            </button>
          );
        })}
        <div className="rounded-lg border border-[var(--color-accent)] bg-[var(--color-accent-soft)] p-3 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wider text-[var(--color-accent)]">Total ciclo</div>
          <div className="mt-1 text-lg font-bold tabular-nums text-[var(--color-accent)]">{fmtCurrency(grandTotal)}</div>
          <div className="mt-0.5 text-[10px] text-[var(--color-muted)]">Suma de labores</div>
        </div>
        {(transportTotal > 0 || cycleTrips.length > 0) && (
          <button
            type="button"
            onClick={() => setTransportsOpen(true)}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-sm text-left transition-all hover:border-[var(--color-accent)] hover:shadow-md"
          >
            <div className="flex items-center justify-between text-xs text-[var(--color-muted)]">
              <span>Transporte</span>
              <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">🚐 transp.</span>
            </div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{fmtCurrency(transportTotal)}</div>
            <div className="mt-0.5 text-[11px] text-[var(--color-muted)] tabular-nums">
              {cycleTrips.length} vuelta{cycleTrips.length === 1 ? "" : "s"}
            </div>
          </button>
        )}
        {(transportTotal > 0 || cycleTrips.length > 0) && (
          <div className="rounded-lg border border-[var(--color-success)] bg-[var(--color-success-soft)] p-3 shadow-sm">
            <div className="text-xs font-medium uppercase tracking-wider text-[var(--color-success)]">Balance con transporte</div>
            <div className="mt-1 text-lg font-bold tabular-nums text-[var(--color-success)]">{fmtCurrency(balanceWithTransport)}</div>
            <div className="mt-0.5 text-[10px] text-[var(--color-muted)]">Total ciclo + transporte</div>
          </div>
        )}
      </div>
      )}

      {/* Pestañas de labor */}
      <div className="mb-2 flex flex-wrap items-center gap-1 border-b border-[var(--color-border)]">
        {cycle.labors.map((l) => {
          const isActive = l.id === activeLabor?.id;
          const isCo = l.type === "cosecha";
          const isTr = l.type === "trato";
          const isHE = l.type === "tratoHE";
          const tagClass = isCo
            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
            : isTr
              ? "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400"
              : isHE
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                : "bg-[var(--color-surface-2)] text-[var(--color-muted)]";
          const tagIcon = isCo ? "🌾" : isTr ? "🛠" : isHE ? "⏱" : l.type === "main" ? "al día" : l.type;
          return (
            <button
              key={l.id}
              onClick={() => setActiveLaborId(l.id)}
              className={`relative px-4 py-1.5 text-sm transition-colors ${
                isActive ? "font-medium text-[var(--color-accent)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              {l.name}
              <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] ${tagClass}`}>{tagIcon}</span>
              {qrLockedLabors.has(l.id) && (
                <span
                  title={`Cosecha sincronizada desde los pesajes QR del prefijo ${qrLockedLabors.get(l.id).id}`}
                  className="ml-1 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] text-violet-700 dark:bg-violet-900/30 dark:text-violet-400"
                >
                  📱 {qrLockedLabors.get(l.id).id}
                </span>
              )}
              {isActive && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-[var(--color-accent)]" />}
            </button>
          );
        })}
        <button
          onClick={openCreateLabor}
          disabled={readOnly}
          className="ml-2 rounded-md border border-dashed border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-40"
        >
          + Labor
        </button>
      </div>
      </>
      )}

      {activeLabor && (
        <>
          {closed && (
            <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-[var(--color-warning)] bg-[var(--color-warning-soft)] px-3 py-2 text-xs text-[var(--color-text)]">
              <span className="font-semibold text-[var(--color-warning)]">🔒 Ciclo cerrado</span>
              <span>
                Está congelado: no se puede editar nada de la grilla, los precios ni las labores.
                Para corregir algo hay que <strong>reabrirlo</strong> con el botón de arriba, y
                volver a cerrarlo después.
              </span>
            </div>
          )}
          {/* Colores del tema (accent), no un violeta fijo: el accent cambia
              con el tema (ver la nota de colores en AGENTS.md). */}
          {qrLocked && (
            <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-3 py-2 text-xs text-[var(--color-text)]">
              <span className="font-semibold text-[var(--color-accent)]">📱 Cosecha sincronizada desde QR</span>
              <span>
                La producción de esta labor la escribe la app de escaneo del prefijo{" "}
                <span className="font-mono font-semibold">{qrPrefixForActive.id}</span>
                {qrPrefixForActive.label ? ` (${qrPrefixForActive.label})` : ""}, así que las celdas
                no se editan a mano: la próxima sincronización las sobrescribe. El piso sí se puede cargar.
              </span>
              <Link
                to="/admin/harvest-qr"
                className="font-medium text-[var(--color-accent)] underline hover:no-underline"
              >
                Ir a Pesajes QR
              </Link>
            </div>
          )}
          {!toolbarCollapsed && (
          <>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-[var(--color-muted)]">
              {workers.length} trabajadores · {days.length} días
              {!isQtyLabor && (
                <span className="ml-3 text-[var(--color-muted)]/70">
                  Tip: usa <code className="rounded bg-[var(--color-surface-2)] px-1">=350*54</code> para fórmulas.
                </span>
              )}
              {isCosechaLabor && (
                <span className="ml-3 text-[var(--color-muted)]/70">
                  Cosecha · default {defaultMode === "flat" ? "día fijo" : "por unidad"} · agrega tipos por día abajo
                </span>
              )}
              {isTratoLabor && (
                <span className="ml-3 text-[var(--color-muted)]/70">
                  Trato · {tratoTypeLabel(catalogs, activeLabor.tratoType ?? 0)} · ingresa cantidad y precio del día
                </span>
              )}
              {isTratoEtapasLabor && (
                <span className="ml-3 text-[var(--color-muted)]/70">
                  Por etapas · {etapas.map((s) => `${s.name}${s.counts ? " ✓" : ""}`).join(" · ")} · ✓ = cuenta unidades
                </span>
              )}
              {isTratoHELabor && (
                <span className="ml-3 text-[var(--color-muted)]/70">
                  Trato + HE · base ${(activeLabor.baseDayDefault ?? DEFAULT_BASE_DAY).toLocaleString("es-CL")} · HE ${(activeLabor.overtimeRate ?? DEFAULT_OVERTIME_RATE).toLocaleString("es-CL")}/h · bonos M ${(activeLabor.bonusManejo ?? DEFAULT_BONUS_MANEJO).toLocaleString("es-CL")} / S ${(activeLabor.bonusSupervision ?? DEFAULT_BONUS_SUPERVISION).toLocaleString("es-CL")}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {isTratoHELabor && (
                <>
                  {gridVisible && (
                    <div className="flex rounded-md overflow-hidden border border-[var(--color-border)] text-xs">
                      <button
                        onClick={() => setTratoHEView("detalle")}
                        className={`px-3 py-1.5 transition-colors ${
                          tratoHEView === "detalle"
                            ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)] font-medium"
                            : "bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"
                        }`}
                      >
                        Detalle
                      </button>
                      <button
                        onClick={() => setTratoHEView("resumen")}
                        className={`px-3 py-1.5 transition-colors ${
                          tratoHEView === "resumen"
                            ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)] font-medium"
                            : "bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"
                        }`}
                      >
                        Resumen
                      </button>
                    </div>
                  )}
                  <button onClick={() => setDefaultLeadersOpen(true)} disabled={readOnly} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-40">
                    ⚑ Líderes / Manejo
                  </button>
                </>
              )}
              {isCosechaLabor && gridVisible && (
                <div className="flex rounded-md overflow-hidden border border-[var(--color-border)] text-xs">
                  <button
                    onClick={() => setCosechaView("detalle")}
                    className={`px-3 py-1.5 transition-colors ${
                      cosechaView === "detalle"
                        ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)] font-medium"
                        : "bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"
                    }`}
                  >
                    Detalle
                  </button>
                  <button
                    onClick={() => setCosechaView("resumen")}
                    className={`px-3 py-1.5 transition-colors ${
                      cosechaView === "resumen"
                        ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)] font-medium"
                        : "bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"
                    }`}
                  >
                    Resumen
                  </button>
                </div>
              )}
              {isTratoLabor && gridVisible && (
                <div className="flex rounded-md overflow-hidden border border-[var(--color-border)] text-xs">
                  <button
                    onClick={() => setTratoView("detalle")}
                    className={`px-3 py-1.5 transition-colors ${
                      tratoView === "detalle"
                        ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)] font-medium"
                        : "bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"
                    }`}
                  >
                    Detalle
                  </button>
                  <button
                    onClick={() => setTratoView("resumen")}
                    className={`px-3 py-1.5 transition-colors ${
                      tratoView === "resumen"
                        ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)] font-medium"
                        : "bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"
                    }`}
                  >
                    Resumen
                  </button>
                </div>
              )}
              <button onClick={openEditLabor} disabled={readOnly} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-40">
                Editar labor
              </button>
              <button onClick={askRemoveLabor} disabled={readOnly || cycle.labors.length === 1} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)] disabled:opacity-40">
                Quitar labor
              </button>
              <button onClick={() => setAddDayOpen(true)} disabled={readOnly} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-50">
                + Día
              </button>
              <button onClick={() => setPickerOpen(true)} disabled={readOnly} className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] shadow-sm hover:bg-[var(--color-accent-hover)] disabled:opacity-50">
                + Trabajador
              </button>
            </div>
          </div>

          {days.length > 0 && !readOnly && (
            <div className="mb-2 flex flex-wrap gap-1">
              {days.map((d) => (
                <button
                  key={d}
                  onClick={() => removeDay(d)}
                  className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-0.5 text-xs text-[var(--color-muted)] hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]"
                  title="Click para quitar columna (solo si ninguna labor tiene producción ese día)"
                >
                  {d} ✕
                </button>
              ))}
            </div>
          )}

          {/* Barra de precios de cosecha */}
          {isCosechaLabor && days.length > 0 && (
            <div className={`mb-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] ${pricesCollapsed ? "px-3 py-1.5" : "p-2"}`}>
              <button
                type="button"
                onClick={() => setPricesCollapsed((v) => !v)}
                className="flex w-full items-center gap-2 text-left text-xs font-medium text-[var(--color-muted)] uppercase tracking-wider hover:text-[var(--color-accent)]"
                title={pricesCollapsed ? "Mostrar precios" : "Ocultar precios"}
              >
                <span>{pricesCollapsed ? "▶" : "▼"}</span>
                <span>🌾</span>
                <span>Precios por día y tipo</span>
                {readOnly && <span className="text-[var(--color-warning)]">solo lectura</span>}
              </button>
              {!pricesCollapsed && (
              <div className="mt-2 flex flex-wrap gap-2">
                {days.map((d) => {
                  const combos = dayCombosByDate[d] || [];
                  return (
                    <div key={d} className="flex flex-col gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2 text-xs min-w-[200px]">
                      <div className="font-medium text-[var(--color-text)]">{d}</div>
                      {combos.map((c) => {
                        const totalQty = totalQtyByDayCombo[d]?.[c.key] || 0;
                        const workersWithQty = workers.filter(
                          (w) => (wdMap[workdayMapKey(w.rut, d, c.key)]?.qty || 0) > 0,
                        ).length;
                        const totalAmt = c.mode === "flat" ? c.price * workersWithQty : totalQty * c.price;
                        return (
                          <div
                            key={c.key}
                            className={`flex flex-col gap-1 rounded-md border px-2 py-1.5 ${
                              c.price > 0
                                ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                                : "border-[var(--color-border)] bg-[var(--color-surface)]"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-medium text-[var(--color-text)]">
                                {comboLabel(catalogs, c.x, c.y)}
                              </span>
                              {!readOnly && (
                                <button
                                  onClick={() =>
                                    setRemoveCombo({
                                      laborId: activeLabor.id, date: d, comboKey: c.key,
                                      label: comboLabel(catalogs, c.x, c.y),
                                    })
                                  }
                                  className="text-[10px] text-[var(--color-muted)] hover:text-[var(--color-danger)]"
                                  title="Quitar tipo"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                            <div className="text-[10px] text-[var(--color-muted)]">
                              {totalQty.toLocaleString("es-CL")} {containerLabel(catalogs, c.y)}
                            </div>
                            <div className="flex rounded-md overflow-hidden border border-[var(--color-border)] text-[10px]">
                              <button
                                disabled={readOnly}
                                onClick={() => persistComboConfig(activeLabor.id, d, c.key, { mode: "unit" }, false)}
                                className={`flex-1 px-1 py-0.5 transition-colors ${
                                  c.mode === "unit"
                                    ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)] font-medium"
                                    : "bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"
                                } disabled:opacity-50`}
                              >
                                $/unidad
                              </button>
                              <button
                                disabled={readOnly}
                                onClick={() => persistComboConfig(activeLabor.id, d, c.key, { mode: "flat" }, false)}
                                className={`flex-1 px-1 py-0.5 transition-colors ${
                                  c.mode === "flat"
                                    ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)] font-medium"
                                    : "bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"
                                } disabled:opacity-50`}
                              >
                                $/día
                              </button>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-[var(--color-muted)]">$</span>
                              <input
                                type="number" min="0" disabled={readOnly}
                                value={getPriceInputValue(activeLabor.id, d, c.key)}
                                onChange={(e) =>
                                  setLocalPriceInputs((prev) => ({
                                    ...prev,
                                    [inputKey(activeLabor.id, d, c.key)]: e.target.value,
                                  }))
                                }
                                onBlur={() => handlePriceBlur(activeLabor.id, d, c.key)}
                                placeholder={c.mode === "flat" ? "tarifa/trab." : `precio/${containerLabel(catalogs, c.y)}`}
                                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-right tabular-nums outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
                              />
                            </div>
                            {totalAmt > 0 && (
                              <div className="text-[var(--color-accent)] text-[10px] font-medium tabular-nums">
                                = {fmtCurrency(totalAmt)}
                                {c.mode === "flat" && workersWithQty > 0 && (
                                  <span className="ml-1 font-normal text-[var(--color-muted)]">({workersWithQty} trab.)</span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <button
                        onClick={() => setAddComboFor({ laborId: activeLabor.id, date: d })}
                        disabled={readOnly}
                        className="rounded-md border border-dashed border-[var(--color-border)] px-2 py-1 text-[10px] text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-40"
                      >
                        + tipo
                      </button>
                      <PisoDayRow
                        labor={activeLabor}
                        dayPrices={dayPrices}
                        date={d}
                        readOnly={readOnly}
                        pendingCount={pisoPendingByDate[d] || 0}
                        onApplyAll={() => askApplyPisoToAll(activeLabor.id, d)}
                        onPersist={(v) => persistDayPiso(activeLabor.id, d, v)}
                      />
                    </div>
                  );
                })}
              </div>
              )}
            </div>
          )}

          {/* Barra de precios de tratoEtapas: precio por día de cada etapa (fijas de la labor) */}
          {isTratoEtapasLabor && days.length > 0 && (
            <div className={`mb-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] ${pricesCollapsed ? "px-3 py-1.5" : "p-2"}`}>
              <button
                type="button"
                onClick={() => setPricesCollapsed((v) => !v)}
                className="flex w-full items-center gap-2 text-left text-xs font-medium text-[var(--color-muted)] uppercase tracking-wider hover:text-[var(--color-accent)]"
                title={pricesCollapsed ? "Mostrar precios" : "Ocultar precios"}
              >
                <span>{pricesCollapsed ? "▶" : "▼"}</span>
                <span>🏕</span>
                <span>Precios por día y etapa</span>
                {readOnly && <span className="text-[var(--color-warning)]">solo lectura</span>}
              </button>
              {!pricesCollapsed && (
              <div className="mt-2 flex flex-wrap gap-2">
                {days.map((d) => (
                  <div key={d} className="flex flex-col gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-1.5 text-xs min-w-[210px]">
                    <div className="font-medium text-[var(--color-muted)]">{d}</div>
                    {etapas.map((st) => {
                      const { price, mode } = getStageDayPrice(dayPrices, activeLabor.id, d, st.id);
                      return (
                        <div
                          key={st.id}
                          className={`flex flex-col gap-0.5 rounded-md border px-1.5 py-1 ${
                            price > 0
                              ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                              : "border-[var(--color-border)] bg-[var(--color-surface)]"
                          }`}
                        >
                          <span className="truncate font-medium text-[var(--color-text)]">
                            {st.name}
                            {st.counts && <span className="ml-1 text-[10px] text-[var(--color-accent)]" title="cuenta para el conteo de unidades">✓</span>}
                          </span>
                          <div className="flex items-center gap-1">
                            <div className="flex shrink-0 rounded overflow-hidden border border-[var(--color-border)] text-[9px]">
                              <button
                                disabled={readOnly}
                                onClick={() => persistStagePrice(activeLabor.id, d, st.id, { mode: "unit" })}
                                title="Precio por unidad"
                                className={`px-1 py-0.5 transition-colors ${mode === "unit" ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)] font-medium" : "bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"} disabled:opacity-50`}
                              >
                                u
                              </button>
                              <button
                                disabled={readOnly}
                                onClick={() => persistStagePrice(activeLabor.id, d, st.id, { mode: "flat" })}
                                title="Precio fijo por día"
                                className={`px-1 py-0.5 transition-colors ${mode === "flat" ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)] font-medium" : "bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"} disabled:opacity-50`}
                              >
                                d
                              </button>
                            </div>
                            <div className="flex min-w-0 flex-1 items-center gap-0.5">
                              <span className="text-[var(--color-muted)]">$</span>
                              <input
                                key={`${d}_${st.id}_${price}_${mode}`}
                                type="number" min="0" disabled={readOnly}
                                defaultValue={price > 0 ? price : ""}
                                onBlur={(e) => {
                                  const v = Number(e.target.value) || 0;
                                  if (v !== price) persistStagePrice(activeLabor.id, d, st.id, { price: v });
                                }}
                                placeholder={mode === "flat" ? "día" : "unid"}
                                className="w-full min-w-0 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1 py-0.5 text-right tabular-nums outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {(() => {
                      const s = etapasDaySummary[d];
                      if (!s || (s.counted === 0 && s.people === 0)) return null;
                      const avg = s.people > 0 ? s.counted / s.people : 0;
                      return (
                        <div
                          className="flex items-center justify-between gap-1 rounded-md border border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] px-1.5 py-1 text-[10px] tabular-nums"
                          title={`Producción del día: ${s.counted.toLocaleString("es-CL")} unid. que cuentan · ${s.people} persona${s.people === 1 ? "" : "s"} · promedio ${avg.toLocaleString("es-CL", { maximumFractionDigits: 1 })} por persona`}
                        >
                          <span className="font-semibold text-[var(--color-accent)]">{s.counted.toLocaleString("es-CL")} unid.</span>
                          <span className="text-[var(--color-muted)]">{s.people} pers.</span>
                          <span className="text-[var(--color-text)]">prom {avg.toLocaleString("es-CL", { maximumFractionDigits: 1 })}</span>
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </div>
              )}
            </div>
          )}

          {/* Barra de configuración por día de tratoHE */}
          {isTratoHELabor && days.length > 0 && (
            <div className={`mb-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] ${pricesCollapsed ? "px-3 py-1.5" : "p-2"}`}>
              <button
                type="button"
                onClick={() => setPricesCollapsed((v) => !v)}
                className="flex w-full items-center gap-2 text-left text-xs font-medium text-[var(--color-muted)] uppercase tracking-wider hover:text-[var(--color-accent)]"
                title={pricesCollapsed ? "Mostrar precios" : "Ocultar precios"}
              >
                <span>{pricesCollapsed ? "▶" : "▼"}</span>
                <span>🛠</span>
                <span>Configuración por día</span>
                {readOnly && <span className="text-[var(--color-warning)]">solo lectura</span>}
              </button>
              {!pricesCollapsed && (
              <div className="mt-2 flex flex-wrap gap-2">
                {days.map((d) => {
                  const cfg = getDaySingle(dayPrices, activeLabor.id, d, "normal");
                  const red = isRedDay(d, cfg);
                  const isWeekend = isWeekendDate(d);
                  return (
                    <div
                      key={d}
                      className={`flex flex-col gap-1.5 rounded-lg border px-3 py-2 text-xs min-w-[200px] ${
                        red ? "border-[var(--color-danger)] bg-[var(--color-danger-soft)]" : "border-[var(--color-border)] bg-[var(--color-surface-2)]"
                      }`}
                    >
                      <button
                        onClick={() => !readOnly && setDayModeEdit({ laborId: activeLabor.id, date: d })}
                        disabled={readOnly}
                        className="flex items-center justify-between gap-2 text-left disabled:opacity-60"
                        title="Editar configuración del día"
                      >
                        <span className="font-medium text-[var(--color-text)]">
                          {d}
                          {cfg.isHoliday && <span className="ml-1">🎉</span>}
                          {!cfg.isHoliday && isWeekend && <span className="ml-1 text-[var(--color-danger)]">·</span>}
                        </span>
                        <span className="text-[10px] text-[var(--color-muted)] hover:text-[var(--color-accent)]">editar</span>
                      </button>
                      <div className="text-[10px] text-[var(--color-muted)]">
                        Base: ${(cfg.price || activeLabor.baseDayDefault || DEFAULT_BASE_DAY).toLocaleString("es-CL")}
                      </div>
                      <div className="text-[10px]">
                        {cfg.mode === "overtimeOnly" ? (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">solo HE</span>
                        ) : (
                          <span className="text-[var(--color-muted)]">jornada normal</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              )}
            </div>
          )}

          {/* Barra de precios de trato */}
          {isTratoLabor && days.length > 0 && (
            <div className={`mb-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] ${pricesCollapsed ? "px-3 py-1.5" : "p-2"}`}>
              <button
                type="button"
                onClick={() => setPricesCollapsed((v) => !v)}
                className="flex w-full items-center gap-2 text-left text-xs font-medium text-[var(--color-muted)] uppercase tracking-wider hover:text-[var(--color-accent)]"
                title={pricesCollapsed ? "Mostrar precios" : "Ocultar precios"}
              >
                <span>{pricesCollapsed ? "▶" : "▼"}</span>
                <span>🛠</span>
                <span>Precios por día · {tratoTypeLabel(catalogs, activeLabor.tratoType ?? 0)}</span>
                {readOnly && <span className="text-[var(--color-warning)]">solo lectura</span>}
              </button>
              {!pricesCollapsed && (
              <div className="mt-2 flex flex-wrap gap-2">
                {days.map((d) => {
                  const tiers = dayTiersByDate[d] || [];
                  // Suma de qty y monto de cada tier en este día.
                  const tierTotals = tiers.map((t) => {
                    let q = 0, a = 0;
                    for (const w of workers) {
                      const wd = wdMap[workdayMapKey(w.rut, d, t.key)];
                      q += Number(wd?.qty) || 0;
                      a += Number(wd?.amount) || 0;
                    }
                    return { qty: q, amount: a };
                  });
                  const totalQty = tierTotals.reduce((s, x) => s + x.qty, 0);
                  const totalAmt = tierTotals.reduce((s, x) => s + x.amount, 0);
                  // El desglose por tier se muestra con 2 o más tiers con
                  // producción; con uno basta la línea "= $X".
                  const tiersWithQty = tierTotals.filter((x) => x.qty > 0).length;
                  // Personas con producción ese día (algún tier con qty > 0),
                  // para el "N pers · prom X".
                  const peopleCount = workers.reduce((acc, w) => {
                    const hasProd = tiers.some(
                      (t) => Number(wdMap[workdayMapKey(w.rut, d, t.key)]?.qty) > 0,
                    );
                    return acc + (hasProd ? 1 : 0);
                  }, 0);
                  const avgPerPerson = peopleCount > 0 ? totalQty / peopleCount : 0;
                  return (
                    <div
                      key={d}
                      className={`flex flex-col gap-1.5 rounded-lg border px-3 py-2 text-xs ${
                        tiers.length > 0 && tiers.some((t) => t.price > 0)
                          ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                          : "border-[var(--color-border)] bg-[var(--color-surface-2)]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium text-[var(--color-text)]">{d}</span>
                        {totalQty > 0 && (
                          <div className="flex flex-col items-end leading-tight">
                            <span className="text-[var(--color-muted)]">{totalQty.toLocaleString("es-CL")}</span>
                            {peopleCount > 0 && (
                              <span className="text-[10px] text-[var(--color-muted)]">
                                {peopleCount} pers · prom{" "}
                                {avgPerPerson.toLocaleString("es-CL", { maximumFractionDigits: 1 })}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      {tiers.map((t, i) => {
                        const tt = tierTotals[i] || { qty: 0, amount: 0 };
                        return (
                        <div key={t.key} className="flex items-center gap-1 rounded-md bg-[var(--color-surface)] px-2 py-1">
                          <span className="text-[var(--color-muted)] text-[10px] w-12">P{i + 1}</span>
                          <span className="text-[var(--color-muted)]">$</span>
                          <input
                            type="number" min="0" disabled={readOnly}
                            value={getPriceInputValue(activeLabor.id, d, t.key, true)}
                            onChange={(e) =>
                              setLocalPriceInputs((prev) => ({
                                ...prev,
                                [inputKey(activeLabor.id, d, t.key)]: e.target.value,
                              }))
                            }
                            onBlur={() => handlePriceBlur(activeLabor.id, d, t.key, true)}
                            placeholder="precio"
                            className="w-20 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1 py-0.5 text-right text-[10px] tabular-nums outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
                          />
                          {/* Unidad del tier, guardada junto a su precio.
                              "—" = sin unidad. */}
                          <select
                            disabled={readOnly}
                            value={t.unit == null ? "" : String(t.unit)}
                            onChange={(e) => {
                              const v = e.target.value;
                              persistComboConfig(
                                activeLabor.id,
                                d,
                                t.key,
                                { unit: v === "" ? null : Number(v) },
                                true,
                              );
                            }}
                            title="Unidad de medida — qué representa cada qty (Metro, Polín, Planta, etc.)"
                            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1 py-0.5 text-[10px] outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
                          >
                            <option value="">—</option>
                            {(catalogs.tratoUnits || []).map((u) => (
                              <option key={u.value} value={u.value}>{u.label}</option>
                            ))}
                          </select>
                          <div className="flex overflow-hidden rounded border border-[var(--color-border)] text-[10px]">
                            <button
                              disabled={readOnly}
                              onClick={() => persistComboConfig(activeLabor.id, d, t.key, { mode: "unit" }, true)}
                              title="Por unidad (qty × precio)"
                              className={`px-1.5 py-0.5 transition-colors disabled:opacity-50 ${
                                t.mode === "unit"
                                  ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)] font-medium"
                                  : "bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"
                              }`}
                            >
                              /unid
                            </button>
                            <button
                              disabled={readOnly}
                              onClick={() => persistComboConfig(activeLabor.id, d, t.key, { mode: "flat" }, true)}
                              title="Pago al día (qty informativo)"
                              className={`px-1.5 py-0.5 transition-colors disabled:opacity-50 border-l border-[var(--color-border)] ${
                                t.mode === "flat"
                                  ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)] font-medium"
                                  : "bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"
                              }`}
                            >
                              /día
                            </button>
                          </div>
                          {tt.qty > 0 && (
                            <span
                              className="ml-1 text-[10px] tabular-nums text-[var(--color-muted)]"
                              title="Total de este tier en el día (cantidad · monto)"
                            >
                              {tt.qty.toLocaleString("es-CL")} · {fmtCurrency(tt.amount)}
                            </span>
                          )}
                          {tiers.length > 1 && (
                            <button
                              disabled={readOnly}
                              onClick={async () => {
                                const newEntry = { ...dayPrices };
                                const dayEntry = { ...(newEntry[activeLabor.id]?.[d] || {}) };
                                delete dayEntry[t.key];
                                newEntry[activeLabor.id] = { ...(newEntry[activeLabor.id] || {}), [d]: dayEntry };
                                setDayPrices(newEntry);
                                await cycleWrite({ dayPrices: newEntry });
                              }}
                              className="ml-auto text-[var(--color-danger)] text-[10px] hover:underline disabled:opacity-40"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                        );
                      })}
                      {!readOnly && (
                        <button
                          onClick={() =>
                            setAddPriceModal({
                              laborId: activeLabor.id,
                              date: d,
                              nextKey: `t${tiers.length}`,
                              defaultMode,
                              value: "",
                            })
                          }
                          className="text-[var(--color-accent)] text-[10px] hover:underline"
                        >
                          + Agregar precio
                        </button>
                      )}
                      {totalAmt > 0 && (
                        <div className="text-[var(--color-accent)] font-medium tabular-nums text-[11px]">
                          {tiersWithQty > 1 && (
                            <div className="mb-0.5 text-[10px] font-normal text-[var(--color-muted)]">
                              {tierTotals
                                .map((tt, i) => (tt.qty > 0 ? `P${i + 1} ${fmtCurrency(tt.amount)}` : null))
                                .filter(Boolean)
                                .join(" · ")}
                            </div>
                          )}
                          = {fmtCurrency(totalAmt)}
                        </div>
                      )}
                      <PisoDayRow
                        labor={activeLabor}
                        dayPrices={dayPrices}
                        date={d}
                        readOnly={readOnly}
                        pendingCount={pisoPendingByDate[d] || 0}
                        onApplyAll={() => askApplyPisoToAll(activeLabor.id, d)}
                        onPersist={(v) => persistDayPiso(activeLabor.id, d, v)}
                      />
                    </div>
                  );
                })}
              </div>
              )}
            </div>
          )}

          {/* Barra de precios de labores normales (main/supervision/extra): un
              precio sugerido por día, que las celdas vacías de la grilla
              ofrecen con un click. Se guarda en dayPrices del ciclo. */}
          {isNormalLabor && days.length > 0 && (
            <div className={`mb-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] ${pricesCollapsed ? "px-3 py-1.5" : "p-2"}`}>
              <button
                type="button"
                onClick={() => setPricesCollapsed((v) => !v)}
                className="flex w-full items-center gap-2 text-left text-xs font-medium text-[var(--color-muted)] uppercase tracking-wider hover:text-[var(--color-accent)]"
                title={pricesCollapsed ? "Mostrar precios" : "Ocultar precios"}
              >
                <span>{pricesCollapsed ? "▶" : "▼"}</span>
                <span>💵</span>
                <span>Precios por día</span>
                <span className="ml-1 normal-case text-[10px] tracking-normal text-[var(--color-muted)]">
                  (un click en la celda del trabajador lo aplica al día)
                </span>
                {readOnly && <span className="text-[var(--color-warning)]">solo lectura</span>}
              </button>
              {!pricesCollapsed && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {days.map((d) => {
                    const dayCfg = getDaySingle(dayPrices, activeLabor.id, d, "normal");
                    const fallback = activeLabor.baseDayDefault ?? DEFAULT_BASE_DAY;
                    const k = inputKey(activeLabor.id, d, "0_0");
                    const localVal = localPriceInputs[k];
                    const displayVal = localVal !== undefined
                      ? localVal
                      : (dayCfg.price ? dayCfg.price : "");
                    const hasCustom = Number(dayCfg.price) > 0;
                    return (
                      <div
                        key={d}
                        className={`flex flex-col gap-1 rounded-lg border px-3 py-2 text-xs min-w-[180px] ${
                          hasCustom
                            ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                            : "border-[var(--color-border)] bg-[var(--color-surface-2)]"
                        }`}
                      >
                        <div className="font-medium text-[var(--color-text)]">{d}</div>
                        <div className="flex items-center gap-1">
                          <span className="text-[var(--color-muted)]">$</span>
                          <input
                            type="number" min="0" disabled={readOnly}
                            value={displayVal}
                            onChange={(e) =>
                              setLocalPriceInputs((prev) => ({ ...prev, [k]: e.target.value }))
                            }
                            onBlur={async () => {
                              if (localVal === undefined) return;
                              const price = parseAmount(String(localVal)) || 0;
                              setLocalPriceInputs((prev) => { const n = { ...prev }; delete n[k]; return n; });
                              if (price !== Number(dayCfg.price || 0)) {
                                await persistNormalDayPrice(activeLabor.id, d, price);
                              }
                            }}
                            placeholder={`sugerido ${fallback.toLocaleString("es-CL")}`}
                            className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-right tabular-nums outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
                          />
                        </div>
                        {!hasCustom && (
                          <div className="text-[10px] text-[var(--color-muted)]">
                            usa base del ciclo · {fmtCurrency(fallback)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          </>
          )}

          {!photoMode && isMobile && workers.length > 0 && (
            <div className="mb-2">
              <button
                type="button"
                onClick={() => setShowDesktopGrid((v) => !v)}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-xs hover:bg-[var(--color-accent-soft)]"
              >
                {showDesktopGrid ? "📋 Ver por trabajador" : "🗂 Ver grid completo"}
              </button>
            </div>
          )}

          {!photoMode && workers.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {gridVisible && (
                <div className="inline-flex overflow-hidden rounded-md border border-[var(--color-border)] text-xs">
                  <button
                    onClick={() => setGroupView("all")}
                    className={`px-3 py-1.5 ${groupView === "all" ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]" : "bg-[var(--color-surface)] hover:bg-[var(--color-accent-soft)]"}`}
                  >
                    Todos
                  </button>
                  <button
                    onClick={() => setGroupView("group")}
                    className={`px-3 py-1.5 ${groupView === "group" ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]" : "bg-[var(--color-surface)] hover:bg-[var(--color-accent-soft)]"}`}
                  >
                    Por grupo
                  </button>
                </div>
              )}
              <div
                className="inline-flex overflow-hidden rounded-md border border-[var(--color-border)] text-xs"
                title="Oculta a los trabajadores con $0 en esta labor este ciclo. Se pausa solo mientras haya una búsqueda/filtro de nombre activo, para que encontrar a alguien puntual siga mostrando resultados."
              >
                <button
                  type="button"
                  onClick={() => setOnlyWithProduction(false)}
                  className={`px-3 py-1.5 ${!onlyWithProduction ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]" : "bg-[var(--color-surface)] hover:bg-[var(--color-accent-soft)]"}`}
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setOnlyWithProduction(true)}
                  className={`border-l border-[var(--color-border)] px-3 py-1.5 ${onlyWithProduction ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]" : "bg-[var(--color-surface)] hover:bg-[var(--color-accent-soft)]"}`}
                >
                  Con producción
                  {onlyWithProduction && columnFilterActive && <span className="ml-1 opacity-70">(pausado)</span>}
                </button>
              </div>
              {gridVisible && useGrouped && orderedGroups.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {orderedGroups.map((g) => {
                    const isNone = g.key === LEADER_NONE;
                    return (
                      <button
                        key={g.key}
                        type="button"
                        onClick={() => scrollToGroup(g.key)}
                        className={`rounded-full border px-2.5 py-1 text-xs ${
                          isNone
                            ? "border-[var(--color-warning)] bg-[var(--color-warning-soft)] text-[var(--color-warning)]"
                            : "border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-accent-soft)]"
                        }`}
                      >
                        {g.label} · {g.count}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Este bloque ocupa el alto libre del <main> (flex-1, min-h-0) y la
              grilla se desplaza por dentro. En mobile se muestra
              CycleWorkerList en su lugar, salvo con "Ver grid completo". */}
          <div className="flex min-h-0 flex-1 flex-col">
            {isMobile && !showDesktopGrid && !photoMode ? (
              <CycleWorkerList
                rows={rowDataRaw}
                days={days}
                fmtCurrency={fmtCurrency}
                onSelectWorker={setEditingCycleWorkerRut}
                onlyWithProduction={onlyWithProduction}
              />
            ) : (
              grid
            )}
          </div>
        </>
      )}

      {/* Modales */}
      <Modal
        open={!!editingDayNote}
        onClose={closeDayNote}
        size="lg"
        title={editingDayNote ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => goToDayNote(-1)}
              disabled={!hasPrevDayNote}
              title="Día anterior"
              className="rounded px-1.5 py-0.5 text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] disabled:opacity-30 disabled:hover:bg-transparent"
            >
              ◀
            </button>
            <span>
              Anotación del {editingDayNote.date} · {cycle?.labors?.find((l) => l.id === editingDayNote.laborId)?.name || ""}
            </span>
            <button
              type="button"
              onClick={() => goToDayNote(1)}
              disabled={!hasNextDayNote}
              title="Día siguiente"
              className="rounded px-1.5 py-0.5 text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] disabled:opacity-30 disabled:hover:bg-transparent"
            >
              ▶
            </button>
          </div>
        ) : "Anotación"}
        footer={(
          <>
            <button
              type="button"
              onClick={closeDayNote}
              disabled={dayNoteBusy}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={saveDayNote}
              disabled={dayNoteBusy || readOnly}
              className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
            >
              {dayNoteBusy ? "..." : "Guardar"}
            </button>
          </>
        )}
      >
        <textarea
          value={editingDayNoteText}
          onChange={(e) => setEditingDayNoteText(e.target.value)}
          disabled={readOnly}
          autoFocus
          placeholder="Ej: día con lluvia leve, solo media jornada, etc."
          rows={5}
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] disabled:opacity-70"
        />
        <p className="mt-1 text-[11px] text-[var(--color-muted)]">
          La anotación es propia de esta labor — otras labores del mismo día no la ven. Dejar el campo vacío y guardar la elimina.
        </p>
      </Modal>

      <Modal
        open={!!addPriceModal}
        onClose={() => !addPriceBusy && setAddPriceModal(null)}
        title={addPriceModal ? `Nuevo precio · ${addPriceModal.date}` : "Nuevo precio"}
        size="sm"
        footer={(
          <>
            <button
              type="button"
              onClick={() => setAddPriceModal(null)}
              disabled={addPriceBusy}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!addPriceModal) return;
                const price = parseAmount(addPriceModal.value) || 0;
                if (price === 0) return;
                setAddPriceBusy(true);
                try {
                  await persistComboConfig(
                    addPriceModal.laborId,
                    addPriceModal.date,
                    addPriceModal.nextKey,
                    { price, mode: addPriceModal.defaultMode },
                    true,
                  );
                  setAddPriceModal(null);
                } finally {
                  setAddPriceBusy(false);
                }
              }}
              disabled={addPriceBusy || !(parseAmount(addPriceModal?.value) > 0)}
              className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
            >
              {addPriceBusy ? "..." : "Agregar"}
            </button>
          </>
        )}
      >
        {addPriceModal && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const price = parseAmount(addPriceModal.value) || 0;
              if (price === 0 || addPriceBusy) return;
              (async () => {
                setAddPriceBusy(true);
                try {
                  await persistComboConfig(
                    addPriceModal.laborId,
                    addPriceModal.date,
                    addPriceModal.nextKey,
                    { price, mode: addPriceModal.defaultMode },
                    true,
                  );
                  setAddPriceModal(null);
                } finally {
                  setAddPriceBusy(false);
                }
              })();
            }}
            className="space-y-2"
          >
            <TextField
              label="Precio"
              required
              autoFocus
              placeholder="Ej: 1500"
              value={addPriceModal.value}
              onChange={(v) => setAddPriceModal((s) => (s ? { ...s, value: v } : s))}
            />
            <p className="text-[11px] text-[var(--color-muted)]">
              Se agrega como un nuevo tramo de precio para este día. Modo por defecto: {addPriceModal.defaultMode === "flat" ? "pago al día" : "por unidad"}.
            </p>
          </form>
        )}
      </Modal>

      <LeaderPickerModal
        open={!!leaderPickerFor}
        onClose={() => setLeaderPickerFor(null)}
        leaders={enabledLeaders}
        workerName={leaderPickerFor ? (allWorkers.find((w) => w.id === leaderPickerFor)?.name || leaderPickerFor) : ""}
        busy={groupBusy}
        onPick={async (leader) => {
          const rut = leaderPickerFor;
          setLeaderPickerFor(null);
          if (rut && leader) await assignLeaderToWorker(rut, leader);
        }}
      />
      <Modal
        open={addDayOpen}
        onClose={() => { setAddDayOpen(false); setSelectedDays(new Set()); }}
        title="Agregar días"
        size="md"
        footer={
          <>
            <button onClick={() => { setAddDayOpen(false); setSelectedDays(new Set()); }} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)]">
              Cancelar
            </button>
            <button
              onClick={addSelectedDays}
              disabled={selectedDays.size === 0}
              className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
            >
              {selectedDays.size === 0 ? "Agregar" : `Agregar ${selectedDays.size} día${selectedDays.size > 1 ? "s" : ""}`}
            </button>
          </>
        }
      >
        <DayCalendarPicker
          viewMonth={viewMonth}
          setViewMonth={setViewMonth}
          selectedDays={selectedDays}
          toggleDay={toggleSelectedDay}
          existingDays={days}
        />
        <p className="mt-3 text-xs text-[var(--color-muted)]">
          Click sobre los días para seleccionar varios a la vez. Los días ya agregados aparecen en gris.
        </p>
      </Modal>

      <Modal
        open={!!laborForm}
        onClose={() => setLaborForm(null)}
        title={laborForm?.mode === "edit" ? "Editar labor" : "Nueva labor"}
      >
        {laborForm && (
          <form onSubmit={submitLabor} className="space-y-4">
            <TextField
              label="Nombre" required autoFocus
              value={laborForm.data.name}
              onChange={(v) => setLaborForm((s) => ({ ...s, data: { ...s.data, name: v } }))}
            />
            <Select
              label="Tipo" required
              value={laborForm.data.type}
              onChange={(v) => setLaborForm((s) => ({ ...s, data: { ...s.data, type: v } }))}
              options={LABOR_TYPES}
            />
            <div>
              <Select
                label="Grupo de labor (opcional)"
                value={laborForm.data.laborGroupId}
                onChange={(v) => setLaborForm((s) => ({ ...s, data: { ...s.data, laborGroupId: v } }))}
                placeholder="Sin grupo"
                options={[
                  ...laborGroups.map((g) => ({ value: g.id, label: g.name })),
                  { value: "__new__", label: "+ Crear grupo nuevo…" },
                ]}
              />
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                Hila esta labor con las de mismo nombre en otros ciclos de esta subfaena (ej. "Poda" del ciclo pasado
                con "Poda" del actual), para poder ver su historial junto.
              </p>
              {laborForm.data.laborGroupId === "__new__" && (
                <div className="mt-2">
                  <TextField
                    label="Nombre del grupo nuevo" required autoFocus
                    value={laborForm.data.newGroupName}
                    onChange={(v) => setLaborForm((s) => ({ ...s, data: { ...s.data, newGroupName: v } }))}
                  />
                </div>
              )}
            </div>
            {laborForm.data.type === "cosecha" && (
              <Select
                label="Modo por defecto al agregar tipos"
                value={laborForm.data.cosechaMode}
                onChange={(v) => setLaborForm((s) => ({ ...s, data: { ...s.data, cosechaMode: v } }))}
                options={COSECHA_MODES}
              />
            )}
            {laborForm.data.type === "trato" && (
              <>
                <Select
                  label="Tipo de trato"
                  value={laborForm.data.tratoType}
                  onChange={(v) => setLaborForm((s) => ({ ...s, data: { ...s.data, tratoType: Number(v) } }))}
                  options={(catalogs.tratoTypes || []).map((t) => ({ value: t.value, label: t.label }))}
                />
                <p className="text-xs text-[var(--color-muted)]">
                  ¿No está en la lista? Agrégalo desde el botón ⚙ Catálogos.
                </p>
                <Select
                  label="Modo por defecto"
                  value={laborForm.data.tratoMode}
                  onChange={(v) => setLaborForm((s) => ({ ...s, data: { ...s.data, tratoMode: v } }))}
                  options={COSECHA_MODES}
                />
              </>
            )}
            {laborForm.data.type === "tratoEtapas" && (
              <StagesEditor
                stages={laborForm.data.stages || []}
                onChange={(next) => setLaborForm((s) => ({ ...s, data: { ...s.data, stages: next } }))}
              />
            )}
            {["main", "supervision", "extra"].includes(laborForm.data.type) && (
              <TextField
                label="Precio diario default ($)" type="number"
                value={laborForm.data.baseDayDefault}
                onChange={(v) => setLaborForm((s) => ({ ...s, data: { ...s.data, baseDayDefault: v } }))}
              />
            )}
            {laborForm.data.type === "tratoHE" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  label="Base diaria default ($)" type="number"
                  value={laborForm.data.baseDayDefault}
                  onChange={(v) => setLaborForm((s) => ({ ...s, data: { ...s.data, baseDayDefault: v } }))}
                />
                <TextField
                  label="Tarifa hora extra ($/h)" type="number"
                  value={laborForm.data.overtimeRate}
                  onChange={(v) => setLaborForm((s) => ({ ...s, data: { ...s.data, overtimeRate: v } }))}
                />
                <TextField
                  label="Bono manejo ($)" type="number"
                  value={laborForm.data.bonusManejo}
                  onChange={(v) => setLaborForm((s) => ({ ...s, data: { ...s.data, bonusManejo: v } }))}
                />
                <TextField
                  label="Bono supervisión/líder ($)" type="number"
                  value={laborForm.data.bonusSupervision}
                  onChange={(v) => setLaborForm((s) => ({ ...s, data: { ...s.data, bonusSupervision: v } }))}
                />
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setLaborForm(null)} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2 text-sm hover:bg-[var(--color-accent-soft)]">
                Cancelar
              </button>
              <button type="submit" className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]">
                Guardar
              </button>
            </div>
          </form>
        )}
      </Modal>

      <WorkerPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={pickWorker}
        excludeRuts={workers.map((w) => w.id || w.rut)}
        allowTemp
        availableLeaders={enabledLeaders}
      />

      <WorkerPickerModal
        open={!!assignTempRut}
        onClose={() => !assignBusy && setAssignTempRut(null)}
        onPick={convertTempToReal}
        excludeRuts={workers.filter((w) => w.rut !== assignTempRut).map((w) => w.id || w.rut)}
        allowTemp={false}
        title="Asignar RUT al trabajador temporal"
        availableLeaders={enabledLeaders}
      />

      <ConfirmDialog
        open={!!pisoRemove}
        title="Quitar el piso del día"
        message={
          pisoRemove
            ? [
                pisoRemove.libres.length
                  ? `Se quitará el piso del ${pisoRemove.date} y se eliminará el bono de ` +
                    `${pisoRemove.libres.length} trabajador${pisoRemove.libres.length === 1 ? "" : "es"} ` +
                    `(${fmtCurrency(pisoRemove.libres.reduce((a, w) => a + (Number(w.amount) || 0), 0))}).`
                  : `Se quitará el piso del ${pisoRemove.date}.`,
                pisoRemove.liquidados.length
                  ? `${pisoRemove.liquidados.length} bono${pisoRemove.liquidados.length === 1 ? " ya está" : "s ya están"} ` +
                    "en una nómina y se mantienen: hay que eliminar o editar esa nómina para tocarlos."
                  : "",
              ]
                .filter(Boolean)
                .join(" ")
            : ""
        }
        confirmLabel="Quitar piso"
        danger busy={pisoRemoveBusy}
        onCancel={() => !pisoRemoveBusy && setPisoRemove(null)}
        onConfirm={removeDayPiso}
      />

      <ConfirmDialog
        open={!!pisoBulk}
        title="Asignar piso a todos"
        message={
          pisoBulk
            ? `Se le asignará el piso de ${fmtCurrency(pisoBulk.amount)} a ${pisoBulk.ruts.length} ` +
              `trabajador${pisoBulk.ruts.length === 1 ? "" : "es"} con producción del ${pisoBulk.date} ` +
              `que todavía no lo tienen. Total: ${fmtCurrency(pisoBulk.amount * pisoBulk.ruts.length)}. ` +
              "Los que ya tienen piso quedan como están, y después se puede quitar uno por uno desde la columna 🪙."
            : ""
        }
        confirmLabel="Asignar piso"
        busy={pisoBulkBusy}
        onCancel={() => !pisoBulkBusy && setPisoBulk(null)}
        onConfirm={applyPisoToAll}
      />

      <ConfirmDialog
        open={!!removeWorker}
        title="Quitar trabajador"
        message={
          removeWorker
            ? removeWorker.isTemp
              ? `¿Eliminar al trabajador temporal "${removeWorker.name}"? Se borrará junto con toda la producción cargada en este ciclo.`
              : `¿Quitar a ${removeWorker.name} de "${activeLabor?.name}"?`
            : ""
        }
        confirmLabel="Quitar"
        danger busy={removeBusy}
        onCancel={() => !removeBusy && setRemoveWorker(null)}
        onConfirm={confirmRemoveWorker}
      />

      <ConfirmDialog
        open={!!removeLabor}
        title="Quitar labor"
        message={removeLabor ? `¿Quitar la labor "${removeLabor.name}"? Solo si no tiene producción.` : ""}
        confirmLabel="Quitar"
        danger
        onCancel={() => setRemoveLabor(null)}
        onConfirm={confirmRemoveLabor}
      />

      <ConfirmDialog
        open={closeFlow}
        title="Cerrar ciclo"
        message={`¿Cerrar "${cycle.label}"? No se podrá editar a menos que seas admin.`}
        confirmLabel="Cerrar ciclo"
        danger busy={closeBusy}
        onCancel={() => !closeBusy && setCloseFlow(false)}
        onConfirm={handleCloseCycle}
      />

      <ConfirmDialog
        open={!!confirmRemoveDay}
        title="Quitar día"
        message={confirmRemoveDay ? `¿Quitar la columna ${confirmRemoveDay}?` : ""}
        confirmLabel="Quitar"
        danger
        onCancel={() => setConfirmRemoveDay(null)}
        onConfirm={() => {
          const d = confirmRemoveDay;
          setConfirmRemoveDay(null);
          doRemoveDay(d);
        }}
      />

      <ConfirmDialog
        open={confirmReopen}
        title="Reabrir ciclo"
        message="¿Reabrir el ciclo?"
        confirmLabel="Reabrir"
        onCancel={() => setConfirmReopen(false)}
        onConfirm={() => { setConfirmReopen(false); doReopenCycle(); }}
      />

      <ConfirmDialog
        open={!!removeCombo}
        title="Quitar tipo de cosecha"
        message={removeCombo ? `¿Quitar "${removeCombo.label}" del día ${removeCombo.date}?` : ""}
        confirmLabel="Quitar"
        danger
        onCancel={() => setRemoveCombo(null)}
        onConfirm={async () => {
          if (!removeCombo) return;
          await removeComboFromDay(removeCombo.laborId, removeCombo.date, removeCombo.comboKey);
          setRemoveCombo(null);
        }}
      />

      <AddComboModal
        open={!!addComboFor}
        onClose={() => setAddComboFor(null)}
        catalogs={catalogs}
        existingCombos={addComboFor ? (dayCombosByDate[addComboFor.date] || []) : []}
        date={addComboFor?.date}
        onAddCatalogEntry={addCatalogEntry}
        onAdd={async (x, y) => {
          if (!addComboFor) return;
          await addComboToDay(addComboFor.laborId, addComboFor.date, x, y);
          setAddComboFor(null);
        }}
      />

      <CatalogsModal
        open={catalogsOpen}
        onClose={() => setCatalogsOpen(false)}
        catalogs={catalogs}
        onAddEntry={addCatalogEntry}
        onRenameEntry={renameCatalogEntry}
      />

      <BonusEditModal
        open={!!bonusEdit}
        onClose={() => setBonusEdit(null)}
        labor={activeLabor}
        wd={bonusEdit ? (workdaysByLabor[bonusEdit.laborId] || {})[workdayMapKey(bonusEdit.workerRut, bonusEdit.date, SINGLE_COMBO)] : null}
        workerName={bonusEdit ? workers.find((w) => w.rut === bonusEdit.workerRut)?.name : ""}
        date={bonusEdit?.date}
        readOnly={readOnly}
        onSave={async (patch) => {
          if (!bonusEdit) return;
          await upsertTratoHEWorkday(bonusEdit.laborId, bonusEdit.date, bonusEdit.workerRut, patch);
          setBonusEdit(null);
        }}
      />

      <CycleWorkerEditModal
        workerRut={editingCycleWorkerRut}
        onClose={() => setEditingCycleWorkerRut(null)}
        activeLabor={activeLabor}
        row={editingCycleWorkerRut ? rowDataRaw.find((r) => r.rut === editingCycleWorkerRut) : null}
        days={days}
        dayPrices={dayPrices}
        dayCombosByDate={dayCombosByDate}
        dayTiersByDate={dayTiersByDate}
        dayStagesByDate={dayStagesByDate}
        daysWithPiso={daysWithPiso}
        catalogs={catalogs}
        readOnly={readOnly}
        fmtCurrency={fmtCurrency}
        commitCosechaCombo={commitCosechaCombo}
        commitTratoTier={commitTratoTier}
        commitEtapaQty={commitEtapaQty}
        commitNormalAmount={commitNormalAmount}
        upsertTratoHEWorkday={upsertTratoHEWorkday}
        toggleAttendance={toggleAttendance}
        togglePiso={togglePiso}
        persistComboConfig={persistComboConfig}
        addComboToDay={addComboToDay}
        removeComboFromDay={removeComboFromDay}
        persistStagePrice={persistStagePrice}
        persistDayPiso={persistDayPiso}
        persistNormalDayPrice={persistNormalDayPrice}
        persistTratoHEDay={persistTratoHEDay}
        toggleMonthly={toggleMonthly}
        onRemoveWorker={removeWorkerByRut}
        useGrouped={useGrouped}
        currentLeader={editingCycleWorkerRut ? rutToLeader.get(editingCycleWorkerRut) || null : null}
        enabledLeaders={enabledLeaders}
        leaderBusy={groupBusy}
        assignLeaderToWorker={assignLeaderToWorker}
        LEADER_LOCAL={LEADER_LOCAL}
        onNavigate={navigateCycleWorker}
        canGoPrev={editingWorkerIndex > 0}
        canGoNext={editingWorkerIndex !== -1 && editingWorkerIndex < sortedWorkerRuts.length - 1}
      />

      <DayModeModal
        open={!!dayModeEdit}
        onClose={() => setDayModeEdit(null)}
        date={dayModeEdit?.date}
        labor={activeLabor}
        cfg={dayModeEdit ? getDaySingle(dayPrices, dayModeEdit.laborId, dayModeEdit.date, "normal") : null}
        readOnly={readOnly}
        onSave={async (patch) => {
          if (!dayModeEdit) return;
          await persistTratoHEDay(dayModeEdit.laborId, dayModeEdit.date, patch);
          setDayModeEdit(null);
        }}
      />

      <DefaultLeadersModal
        open={defaultLeadersOpen}
        onClose={() => setDefaultLeadersOpen(false)}
        labor={activeLabor}
        readOnly={readOnly}
        onSave={async (defaults) => {
          if (!activeLabor) return;
          await persistTratoHEBonusDefaults(activeLabor.id, defaults);
          setDefaultLeadersOpen(false);
        }}
      />

      <TransportsModal
        open={transportsOpen}
        onClose={async () => {
          setTransportsOpen(false);
          await reloadTransports();
        }}
        cycle={cycle}
        faena={faena}
        subfaena={subfaena}
        days={days}
        readOnly={readOnly}
      />

      <CycleSummaryModal
        open={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        cycle={cycle}
        workdaysByLabor={workdaysByLabor}
        dayPrices={dayPrices}
        catalogs={catalogs}
        faena={faena}
        subfaena={subfaena}
      />

      <WorkerEditModal
        open={!!editingWorkerRut}
        mode="edit"
        worker={editingWorkerRut ? allWorkers.find((w) => w.id === editingWorkerRut) : null}
        allWorkers={allWorkers}
        onClose={() => setEditingWorkerRut(null)}
        onSaved={async () => {
          const rut = editingWorkerRut;
          setEditingWorkerRut(null);
          if (!rut) return;
          // Relee el trabajador y lo reemplaza en allWorkers: la grilla toma el
          // nombre y el líder de ahí (rutToName, rutToLeader).
          try {
            const updated = await workersService.getById(rut);
            if (updated) {
              setAllWorkers((prev) => {
                const idx = prev.findIndex((w) => w.id === rut);
                if (idx === -1) return [...prev, updated];
                const next = prev.slice();
                next[idx] = updated;
                return next;
              });
            }
          } catch {
            /* noop */
          }
        }}
      />

      {copyToast && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 -translate-x-1/2 rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] shadow-lg">
          {copyToast}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Subcomponentes
// ============================================================

function AddComboModal({ open, onClose, catalogs, existingCombos, date, onAdd, onAddCatalogEntry }) {
  const qualities = catalogs.qualities || [];
  const containers = catalogs.containers || [];
  const [x, setX] = useState(qualities[0]?.value ?? 0);
  const [y, setY] = useState(containers[0]?.value ?? 0);
  const [newQuality, setNewQuality] = useState("");
  const [newContainer, setNewContainer] = useState("");
  const [showNewQ, setShowNewQ] = useState(false);
  const [showNewC, setShowNewC] = useState(false);

  useEffect(() => {
    if (open) {
      setX(qualities[0]?.value ?? 0);
      setY(containers[0]?.value ?? 0);
      setNewQuality(""); setNewContainer("");
      setShowNewQ(false); setShowNewC(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const existingKeys = new Set(existingCombos.map((c) => c.key));
  const targetKey = `${x}_${y}`;
  const duplicate = existingKeys.has(targetKey);

  const handleAddQuality = async () => {
    if (!newQuality.trim()) return;
    const newVal = await onAddCatalogEntry("qualities", newQuality);
    if (newVal != null) setX(newVal);
    setNewQuality(""); setShowNewQ(false);
  };

  const handleAddContainer = async () => {
    if (!newContainer.trim()) return;
    const newVal = await onAddCatalogEntry("containers", newContainer);
    if (newVal != null) setY(newVal);
    setNewContainer(""); setShowNewC(false);
  };

  return (
    <Modal open={open} onClose={onClose} title={`Agregar tipo de cosecha · ${date || ""}`}>
      <div className="space-y-4">
        <div>
          <Select
            label="Calidad" value={x} onChange={(v) => setX(Number(v))}
            options={qualities.map((q) => ({ value: q.value, label: q.label }))}
          />
          {!showNewQ ? (
            <button type="button" onClick={() => setShowNewQ(true)} className="mt-1 text-xs text-[var(--color-accent)] hover:underline">
              + Nueva calidad
            </button>
          ) : (
            <div className="mt-2 flex gap-2">
              <input
                value={newQuality} onChange={(e) => setNewQuality(e.target.value)}
                placeholder="Ej: Premium"
                className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm outline-none focus:border-[var(--color-accent)]"
              />
              <button type="button" onClick={handleAddQuality} className="rounded-md bg-[var(--color-accent)] px-3 py-1 text-xs font-medium text-[var(--color-accent-fg)]">
                Agregar
              </button>
              <button type="button" onClick={() => setShowNewQ(false)} className="text-xs text-[var(--color-muted)]">
                Cancelar
              </button>
            </div>
          )}
        </div>

        <div>
          <Select
            label="Envase / unidad" value={y} onChange={(v) => setY(Number(v))}
            options={containers.map((c) => ({ value: c.value, label: c.label }))}
          />
          {!showNewC ? (
            <button type="button" onClick={() => setShowNewC(true)} className="mt-1 text-xs text-[var(--color-accent)] hover:underline">
              + Nuevo envase
            </button>
          ) : (
            <div className="mt-2 flex gap-2">
              <input
                value={newContainer} onChange={(e) => setNewContainer(e.target.value)}
                placeholder="Ej: caja"
                className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm outline-none focus:border-[var(--color-accent)]"
              />
              <button type="button" onClick={handleAddContainer} className="rounded-md bg-[var(--color-accent)] px-3 py-1 text-xs font-medium text-[var(--color-accent-fg)]">
                Agregar
              </button>
              <button type="button" onClick={() => setShowNewC(false)} className="text-xs text-[var(--color-muted)]">
                Cancelar
              </button>
            </div>
          )}
        </div>

        {duplicate && (
          <div className="rounded-md border border-[var(--color-warning)] bg-[var(--color-warning-soft)] px-2 py-1 text-xs text-[var(--color-warning)]">
            Este combo ya existe para este día.
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2 text-sm hover:bg-[var(--color-accent-soft)]">
            Cancelar
          </button>
          <button
            onClick={() => onAdd(x, y)}
            disabled={duplicate}
            className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
          >
            Agregar tipo
          </button>
        </div>
      </div>
    </Modal>
  );
}

function CatalogsModal({ open, onClose, catalogs, onAddEntry, onRenameEntry }) {
  return (
    <Modal open={open} onClose={onClose} title="Catálogos globales" size="xl">
      <p className="mb-5 text-sm text-[var(--color-muted)]">
        Estos catálogos son compartidos por toda la aplicación. Cualquier supervisor puede
        agregar entradas; renombrar afecta los datos históricos (los workdays guardan el
        número de índice, no el label).
      </p>

      <CatalogGroup
        emoji="🫐"
        title="Cosecha"
        description="Definen cómo se clasifica cada kilo cosechado: a qué calidad y en qué envase se midió. Aparecen como selectores al cargar producción de una labor de tipo cosecha, y se muestran en los resúmenes y comprobantes."
      >
        <CatalogSection
          title="Calidades"
          subtitle="Categoría comercial de cada kilo (Exportación, IQF, Repaso, Consumo, Semilla…)"
          field="qualities" entries={catalogs.qualities || []}
          onAddEntry={onAddEntry} onRenameEntry={onRenameEntry}
        />
        <CatalogSection
          title="Envases"
          subtitle="Recipiente donde se midió (saco, capacho, bandeja, kilo). Define la unidad en los resúmenes."
          field="containers" entries={catalogs.containers || []}
          onAddEntry={onAddEntry} onRenameEntry={onRenameEntry}
        />
      </CatalogGroup>

      <CatalogGroup
        emoji="✂️"
        title="Trato"
        description="Definen qué se hace a trato (poda, amarre…) y cómo se cuenta el qty diario (por metro, por polín, por planta…). Aparecen en la configuración de la labor y, la unidad, junto al precio por día."
      >
        <CatalogSection
          title="Tipos de trato"
          subtitle="Etiqueta de la labor a trato (Poda, Amarre, Desmalezado, Carpas…). Se elige al crear/editar una labor de tipo trato."
          field="tratoTypes" entries={catalogs.tratoTypes || []}
          onAddEntry={onAddEntry} onRenameEntry={onRenameEntry}
        />
        <CatalogSection
          title="Unidades de trato"
          subtitle="Qué representa el qty cada día (Metro, Polín, Planta, Hilera…). Se elige junto al precio en el panel de Precios por día."
          field="tratoUnits" entries={catalogs.tratoUnits || []}
          onAddEntry={onAddEntry} onRenameEntry={onRenameEntry}
        />
      </CatalogGroup>

      <div className="mt-6 flex justify-end">
        <button onClick={onClose} className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]">
          Cerrar
        </button>
      </div>
    </Modal>
  );
}

function CatalogSection({ title, subtitle, field, entries, onAddEntry, onRenameEntry }) {
  const [adding, setAdding] = useState("");
  const [editing, setEditing] = useState(null);

  return (
    <div>
      <h3 className="mb-1 text-base font-semibold">{title}</h3>
      <p className="mb-3 text-xs leading-snug text-[var(--color-muted)]">{subtitle}</p>
      <div className="space-y-1.5 max-h-80 overflow-auto pr-1">
        {entries.map((e) => (
          <div key={e.value} className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1.5 text-sm">
            <span className="text-[10px] text-[var(--color-muted)] w-7 tabular-nums">#{e.value}</span>
            {editing?.value === e.value ? (
              <>
                <input
                  value={editing.label}
                  onChange={(ev) => setEditing({ ...editing, label: ev.target.value })}
                  className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1 py-0.5 text-sm outline-none focus:border-[var(--color-accent)]"
                  autoFocus
                />
                <button
                  onClick={async () => {
                    if (editing.label.trim()) await onRenameEntry(field, editing.value, editing.label);
                    setEditing(null);
                  }}
                  className="text-xs text-[var(--color-accent)] hover:underline"
                >
                  ✓
                </button>
                <button onClick={() => setEditing(null)} className="text-xs text-[var(--color-muted)]">✕</button>
              </>
            ) : (
              <>
                <span className="flex-1">{e.label}</span>
                <button
                  onClick={() => setEditing({ value: e.value, label: e.label })}
                  className="text-[10px] text-[var(--color-muted)] hover:text-[var(--color-accent)]"
                >
                  editar
                </button>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-1.5">
        <input
          value={adding} onChange={(e) => setAdding(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key === "Enter" && adding.trim()) {
              e.preventDefault();
              await onAddEntry(field, adding);
              setAdding("");
            }
          }}
          placeholder="Agregar..."
          className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
        />
        <button
          onClick={async () => {
            if (!adding.trim()) return;
            await onAddEntry(field, adding);
            setAdding("");
          }}
          className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]"
        >
          + Agregar
        </button>
      </div>
    </div>
  );
}

// Agrupa catálogos relacionados (Cosecha, Trato) en el modal de catálogos:
// encabezado con emoji, título y descripción, y un fondo que lo separa del
// bloque siguiente.
function CatalogGroup({ emoji, title, description, children }) {
  return (
    <section className="mb-5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/50 p-4">
      <div className="mb-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <span aria-hidden>{emoji}</span>
          <span>{title}</span>
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-[var(--color-muted)]">{description}</p>
      </div>
      <div className="grid gap-5 md:grid-cols-2">{children}</div>
    </section>
  );
}

// ============================================================
// Modales de tratoHE
// ============================================================

function BonusEditModal({ open, onClose, labor, wd, workerName, date, readOnly, onSave }) {
  const [hasManejo, setHasManejo] = useState(false);
  const [hasSupervision, setHasSupervision] = useState(false);
  const [extras, setExtras] = useState("");

  useEffect(() => {
    if (open) {
      const defaults = labor?.bonusDefaults?.[wd?.workerRut] || {};
      setHasManejo(wd ? !!wd.hasManejo : !!defaults.manejo);
      setHasSupervision(wd ? !!wd.hasSupervision : !!defaults.supervision);
      setExtras(wd?.extras ? String(wd.extras) : "");
    }
  }, [open, wd, labor]);

  if (!labor) return null;
  const bonusManejo = labor.bonusManejo ?? DEFAULT_BONUS_MANEJO;
  const bonusSupervision = labor.bonusSupervision ?? DEFAULT_BONUS_SUPERVISION;

  return (
    <Modal open={open} onClose={onClose} title={`Bonos · ${date || ""}`}>
      <div className="space-y-3">
        {workerName && <div className="text-sm text-[var(--color-muted)]">{workerName}</div>}
        <label className="flex items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2">
          <div>
            <div className="text-sm font-medium">Bono manejo</div>
            <div className="text-xs text-[var(--color-muted)]">${bonusManejo.toLocaleString("es-CL")}</div>
          </div>
          <input type="checkbox" checked={hasManejo} disabled={readOnly}
            onChange={(e) => setHasManejo(e.target.checked)}
            className="h-5 w-5 accent-[var(--color-accent)]" />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2">
          <div>
            <div className="text-sm font-medium">Bono supervisión / líder</div>
            <div className="text-xs text-[var(--color-muted)]">${bonusSupervision.toLocaleString("es-CL")}</div>
          </div>
          <input type="checkbox" checked={hasSupervision} disabled={readOnly}
            onChange={(e) => setHasSupervision(e.target.checked)}
            className="h-5 w-5 accent-[var(--color-accent)]" />
        </label>
        <div>
          <label className="block text-sm font-medium">Bono extras (imprevistos)</label>
          <p className="mb-1 text-xs text-[var(--color-muted)]">
            Monto positivo (bono adicional) o negativo (descuento, ej: media jornada).
          </p>
          <input type="number" disabled={readOnly}
            value={extras} onChange={(e) => setExtras(e.target.value)} placeholder="0"
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] disabled:opacity-50" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2 text-sm hover:bg-[var(--color-accent-soft)]">
            Cancelar
          </button>
          <button onClick={() => onSave({ hasManejo, hasSupervision, extras: Number(extras) || 0 })}
            disabled={readOnly}
            className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50">
            Guardar
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Piso opcional por día. Sin piso configurado muestra solo el botón "+ piso",
// que abre la edición. Con piso, muestra el monto y las acciones editar,
// asignar a todos y quitar.
function PisoDayRow({ labor, dayPrices, date, readOnly, onPersist, pendingCount = 0, onApplyAll }) {
  const dayPiso = getDayPiso(dayPrices, labor.id, date);
  const hasPiso = dayPiso != null && dayPiso > 0;
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState("");
  useEffect(() => {
    if (!editing) setLocal(hasPiso ? String(dayPiso) : "");
  }, [editing, dayPiso, hasPiso]);

  if (!hasPiso && !editing) {
    if (readOnly) return null;
    return (
      <button
        onClick={() => { setLocal(""); setEditing(true); }}
        className="self-start text-[var(--color-muted)] text-[10px] hover:text-[var(--color-accent)] hover:underline"
        title="Agregar bono piso para este día"
      >
        + piso
      </button>
    );
  }

  if (editing) {
    const commit = () => {
      const next = local === "" ? 0 : Number(local) || 0;
      onPersist(next);
      setEditing(false);
    };
    return (
      <div className="mt-1 flex items-center gap-1 rounded-md border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-2 py-1 text-[10px]">
        <span className="font-medium text-[var(--color-muted)]">🪙 Piso $</span>
        <input
          type="number" min="0" autoFocus disabled={readOnly}
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
          className="w-20 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1 py-0.5 text-right tabular-nums outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
        />
      </div>
    );
  }

  return (
    <div className="mt-1 flex items-center gap-1 rounded-md border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-2 py-1 text-[10px]">
      <span className="font-medium text-[var(--color-text)]">🪙 Piso {fmtCurrency(dayPiso)}</span>
      {!readOnly && (
        <>
          <button
            onClick={() => { setLocal(String(dayPiso)); setEditing(true); }}
            className="ml-auto text-[var(--color-muted)] hover:text-[var(--color-accent)] hover:underline"
            title="Editar"
          >
            ✎
          </button>
          <button
            onClick={onApplyAll}
            disabled={!pendingCount}
            className="text-[var(--color-muted)] hover:text-[var(--color-accent)] hover:underline disabled:opacity-40 disabled:no-underline disabled:hover:text-[var(--color-muted)]"
            title={
              pendingCount
                ? `Asignar este piso a los ${pendingCount} con producción que aún no lo tienen`
                : "Todos los que tienen producción ese día ya tienen el piso"
            }
          >
            👥 a todos{pendingCount ? ` (${pendingCount})` : ""}
          </button>
          <button
            onClick={() => onPersist(0)}
            className="text-[var(--color-danger)] hover:underline"
            title="Quitar piso del día"
          >
            ✕
          </button>
        </>
      )}
    </div>
  );
}

function DayModeModal({ open, onClose, date, labor, cfg, readOnly, onSave }) {
  const [price, setPrice] = useState("");
  const [mode, setMode] = useState("normal");
  const [isHoliday, setIsHoliday] = useState(false);

  useEffect(() => {
    if (open && cfg) {
      setPrice(cfg.price ? String(cfg.price) : String(labor?.baseDayDefault ?? DEFAULT_BASE_DAY));
      setMode(cfg.mode || "normal");
      setIsHoliday(!!cfg.isHoliday);
    }
  }, [open, cfg, labor]);

  if (!labor) return null;
  const weekend = isWeekendDate(date);

  return (
    <Modal open={open} onClose={onClose} title={`Configurar día · ${date || ""}`}>
      <div className="space-y-4">
        {weekend && (
          <div className="rounded-md border border-[var(--color-danger)] bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">
            ⚠ Es {date && new Date(date + "T00:00:00").getDay() === 0 ? "domingo" : "sábado"}. Probable jornada especial.
          </div>
        )}
        <div>
          <label className="block text-sm font-medium">Base diaria ($)</label>
          <input type="number" min="0" disabled={readOnly}
            value={price} onChange={(e) => setPrice(e.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Modo</label>
          <div className="space-y-2">
            {TRATO_HE_MODES.map((m) => (
              <label key={m.value} className="flex items-start gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 cursor-pointer">
                <input type="radio" name="mode" value={m.value} checked={mode === m.value}
                  disabled={readOnly}
                  onChange={(e) => setMode(e.target.value)}
                  className="mt-0.5 accent-[var(--color-accent)]" />
                <span className="text-sm">{m.label}</span>
              </label>
            ))}
          </div>
        </div>
        <label className="flex items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 cursor-pointer">
          <div>
            <div className="text-sm font-medium">Marcar como feriado</div>
            <div className="text-xs text-[var(--color-muted)]">Resalta el día en rojo (Chile).</div>
          </div>
          <input type="checkbox" checked={isHoliday} disabled={readOnly}
            onChange={(e) => setIsHoliday(e.target.checked)}
            className="h-5 w-5 accent-[var(--color-accent)]" />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2 text-sm hover:bg-[var(--color-accent-soft)]">
            Cancelar
          </button>
          <button onClick={() => onSave({ price: Number(price) || 0, mode, isHoliday })}
            disabled={readOnly}
            className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50">
            Guardar
          </button>
        </div>
      </div>
    </Modal>
  );
}

function DefaultLeadersModal({ open, onClose, labor, readOnly, onSave }) {
  const [draft, setDraft] = useState({});
  useEffect(() => {
    if (open && labor) setDraft({ ...(labor.bonusDefaults || {}) });
  }, [open, labor]);
  if (!labor) return null;

  const toggle = (rut, key) => {
    setDraft((d) => {
      const next = { ...d };
      const cur = next[rut] || {};
      const updated = { ...cur, [key]: !cur[key] };
      if (!updated.manejo && !updated.supervision) delete next[rut];
      else next[rut] = updated;
      return next;
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Líderes y manejo (defaults)" size="lg">
      <p className="mb-3 text-sm text-[var(--color-muted)]">
        Los trabajadores marcados reciben automáticamente el bono cuando se ingrese una jornada nueva.
        Para una excepción puntual, abre el bono de esa celda y desmárcalo manualmente.
        Cambiar este default no actualiza días ya guardados.
      </p>
      <div className="max-h-96 overflow-auto rounded-md border border-[var(--color-border)]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[var(--color-surface-2)]">
            <tr className="text-left text-[var(--color-muted)]">
              <th className="px-3 py-2 font-medium">Trabajador</th>
              <th className="px-3 py-2 font-medium text-center">Manejo</th>
              <th className="px-3 py-2 font-medium text-center">Supervisión / Líder</th>
            </tr>
          </thead>
          <tbody>
            {(labor.workers || []).map((w) => {
              const e = draft[w.rut] || {};
              return (
                <tr key={w.rut} className="border-t border-[var(--color-border)]">
                  <td className="px-3 py-2">{w.name}</td>
                  <td className="px-3 py-2 text-center">
                    <input type="checkbox" checked={!!e.manejo} disabled={readOnly}
                      onChange={() => toggle(w.rut, "manejo")}
                      className="h-4 w-4 accent-[var(--color-accent)]" />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input type="checkbox" checked={!!e.supervision} disabled={readOnly}
                      onChange={() => toggle(w.rut, "supervision")}
                      className="h-4 w-4 accent-[var(--color-accent)]" />
                  </td>
                </tr>
              );
            })}
            {(labor.workers || []).length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-[var(--color-muted)]">
                  Aún no hay trabajadores en esta labor.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2 text-sm hover:bg-[var(--color-accent-soft)]">
          Cancelar
        </button>
        <button onClick={() => onSave(draft)} disabled={readOnly}
          className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50">
          Guardar
        </button>
      </div>
    </Modal>
  );
}

// ============================================================
// Selector de días en calendario (selección múltiple)
// ============================================================
const MONTHS_ES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const WEEKDAYS_ES = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];

function pad2(n) { return String(n).padStart(2, "0"); }
function isoDate(y, m, d) { return `${y}-${pad2(m + 1)}-${pad2(d)}`; }

function DayCalendarPicker({ viewMonth, setViewMonth, selectedDays, toggleDay, existingDays }) {
  const { year, month } = viewMonth;
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Semana ISO: lunes = 0, domingo = 6
  const firstWeekday = (firstDay.getDay() + 6) % 7;
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const existingSet = new Set(existingDays);
  const todayIso = new Date().toISOString().slice(0, 10);

  const prevMonth = () =>
    setViewMonth(({ year, month }) =>
      month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 },
    );
  const nextMonth = () =>
    setViewMonth(({ year, month }) =>
      month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 },
    );

  return (
    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <div className="mb-2 flex items-center justify-between">
        <button onClick={prevMonth} className="rounded px-2 py-1 text-sm hover:bg-[var(--color-accent-soft)]">‹</button>
        <div className="text-sm font-semibold">{MONTHS_ES[month]} {year}</div>
        <button onClick={nextMonth} className="rounded px-2 py-1 text-sm hover:bg-[var(--color-accent-soft)]">›</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-[var(--color-muted)]">
        {WEEKDAYS_ES.map((w) => <div key={w} className="py-1">{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d == null) return <div key={i} className="aspect-square" />;
          const iso = isoDate(year, month, d);
          const isExisting = existingSet.has(iso);
          const isSelected = selectedDays.has(iso);
          const isToday = iso === todayIso;
          let cls = "aspect-square rounded text-sm transition-colors flex items-center justify-center cursor-pointer ";
          if (isExisting) {
            cls += "bg-[var(--color-surface-2)] text-[var(--color-muted)] cursor-not-allowed line-through";
          } else if (isSelected) {
            cls += "bg-[var(--color-accent)] text-[var(--color-accent-fg)] font-semibold";
          } else {
            cls += "hover:bg-[var(--color-accent-soft)] " + (isToday ? "ring-1 ring-[var(--color-accent)]" : "");
          }
          return (
            <button
              key={i}
              type="button"
              disabled={isExisting}
              onClick={() => toggleDay(iso)}
              className={cls}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}
