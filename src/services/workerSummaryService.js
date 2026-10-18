import { workdayMapKey, tratoUnitLabel, tratoTypeLabel, cosechaUnit } from "../utils/cosechaCombos";
import { workdaysService, cyclesService, jobsService, subjobsService } from "./index";
import { payrollsService } from "./payrollsService";
import { workerKeys } from "./workersService";
import { listPendingForWorkers, advanceRemaining, advanceSign } from "./advancesService";
import { buildCycleRows } from "../utils/workerSummary";

// Carga el resumen de un trabajador (workdays, ciclos y anticipos/bonos
// pendientes) con la forma que espera `PrintableWorkerSummary`. Devuelve
// `{ data, advances, grandTotal, advancesSaldo, anticiposSaldo, bonosSaldo }`.
// La usan `WorkerSummaryModal` y `GroupSummaryModal`, que compone varios
// resúmenes seguidos.
//
// `worker`: el trabajador completo, o al menos `{ id, rut }`. Sus claves
// (`workerKeys`) van en una sola consulta `in`.
// `options`:
//   - `includeClosed` (bool, default false): suma los ciclos cerrados a los
//     abiertos.
//   - `closedFrom` / `closedTo` (fecha ISO): rango que se aplica solo a los
//     workdays de ciclos cerrados; los abiertos van completos. Un ciclo
//     cerrado sin workdays en el rango se omite.
export async function loadWorkerSummaryData(worker, catalogs, options = {}) {
  const { includeClosed = false, closedFrom = null, closedTo = null } = options;
  const claves = workerKeys(worker);
  if (claves.length === 0) return { data: [], advances: [], grandTotal: 0, advancesSaldo: 0 };
  const clavesSet = new Set(claves);
  const [wds, pendingAdvances] = await Promise.all([
    workdaysService.list({ wheres: [["workerRut", "in", claves]] }),
    listPendingForWorkers(claves).catch(() => []),
  ]);
  const advances = [...pendingAdvances].sort((a, b) =>
    String(a.date || "").localeCompare(String(b.date || "")),
  );
  const cycleIds = [...new Set(wds.map((w) => w.cycleId).filter(Boolean))];
  // Lee las nóminas referenciadas por los wds (una lectura por nómina) para
  // el estado de pago de cada fila: pagado / en nómina / sin pagar.
  const payrollIds = [...new Set(wds.map((w) => w.payrollId).filter(Boolean))];
  const payrollsRaw = await Promise.all(
    payrollIds.map((id) => payrollsService.getById(id).catch(() => null)),
  );
  const payrollById = new Map();
  for (const p of payrollsRaw) {
    if (p?.id) payrollById.set(p.id, { name: p.name || p.id, status: p.status || "pending" });
  }
  const cycles = (await Promise.all(cycleIds.map((id) => cyclesService.getById(id)))).filter(Boolean);
  const cyclesToShow = cycles.filter((c) => {
    if (c.status !== "closed") return true;
    return includeClosed;
  });
  const faenaIds = [...new Set(cyclesToShow.map((c) => c.faenaId).filter(Boolean))];
  const subIds = [...new Set(cyclesToShow.map((c) => c.subfaenaId).filter(Boolean))];
  const faenas = await Promise.all(faenaIds.map((id) => jobsService.getById(id)));
  const subs = await Promise.all(subIds.map((id) => subjobsService.getById(id)));
  const faenaById = new Map(faenas.filter(Boolean).map((f) => [f.id, f]));
  const subById = new Map(subs.filter(Boolean).map((s) => [s.id, s]));

  const inClosedRange = (wd) => {
    if (closedFrom && wd.date < closedFrom) return false;
    if (closedTo && wd.date > closedTo) return false;
    return true;
  };

  const data = cyclesToShow.map((c) => {
    const isClosed = c.status === "closed";
    const wdMap = {};
    for (const wd of wds) {
      if (wd.cycleId !== c.id) continue;
      if (isClosed && !inClosedRange(wd)) continue;
      const labor = (c.labors || []).find((l) => l.id === wd.laborId);
      if (!labor) continue;
      if (!wdMap[wd.laborId]) wdMap[wd.laborId] = {};
      // La clave es `workdayMapKey(rut, date, ck)`, de 3 partes, y no `wd.id`
      // (`cycleId__laborId__rut__date__ck`): buildCycleRows lee `parts[2]`
      // como tierKey de trato.
      let ck = "0_0";
      if (labor.type === "trato") {
        if (wd.id) {
          const idParts = String(wd.id).split("__");
          ck = idParts.length >= 5 ? idParts.slice(4).join("__") : "t0";
        } else {
          ck = "t0";
        }
      } else if (labor.type === "cosecha") {
        if (wd.id) {
          const idParts = String(wd.id).split("__");
          ck = idParts.length >= 5 ? idParts.slice(4).join("__") : `${Number(wd.qualityX) || 0}_${Number(wd.containerY) || 0}`;
        } else {
          ck = `${Number(wd.qualityX) || 0}_${Number(wd.containerY) || 0}`;
        }
      }
      wdMap[wd.laborId][workdayMapKey(wd.workerRut, wd.date, ck)] = wd;
    }
    // Omite los ciclos cerrados sin workdays dentro del rango.
    if (isClosed && Object.keys(wdMap).length === 0) return null;
    const { rows, cosechaContainers } = buildCycleRows(clavesSet, c, wdMap, catalogs, payrollById);
    const totals = rows.reduce(
      (acc, r) => ({
        kilos: acc.kilos + r.kilos,
        jornadas: acc.jornadas + r.jornadas,
        tratoQty: acc.tratoQty + r.tratoQty,
        overtimeHours: acc.overtimeHours + r.overtimeHours,
        heAmount: acc.heAmount + r.heAmount,
        amount: acc.amount + r.amount,
        piso: acc.piso + (r.piso || 0),
      }),
      { kilos: 0, jornadas: 0, tratoQty: 0, overtimeHours: 0, heAmount: 0, amount: 0, piso: 0 },
    );
    const cols = {
      kilos: rows.some((r) => r.kilos > 0),
      jornadas: rows.some((r) => r.jornadas > 0),
      he: rows.some((r) => r.overtimeHours > 0),
      trato: rows.some((r) => r.tratoQty > 0),
      piso: rows.some((r) => (r.piso || 0) > 0),
    };
    // Rótulo de la columna de trato: la unidad, si todos los días usan la
    // misma (Árbol, Metro, Polín…); si no, el tipo de trato, o "Trato" si hay
    // varios.
    const tratoRows = rows.filter((r) => r.laborType === "trato");
    const hasEtapas = rows.some((r) => r.laborType === "tratoEtapas");
    const tratoUnits = new Set(tratoRows.map((r) => r.tratoUnit).filter((u) => u != null));
    let tratoLabel;
    if (hasEtapas && tratoRows.length === 0) {
      // Solo etapas → la columna de cantidad son "Unidades" producidas.
      tratoLabel = "Unidades";
    } else if (hasEtapas) {
      // Trato y etapas juntos: el encabezado va neutro, porque la unidad del
      // trato rotularía también la producción por etapas ("4.737 poda"
      // incluyendo carpas). El desglose por fila dice cuál es cuál.
      tratoLabel = "Unidades";
    } else if (tratoUnits.size === 1) {
      const u = [...tratoUnits][0];
      tratoLabel = tratoUnitLabel(catalogs, u) || "Trato";
    } else {
      const tratoTypes = new Set(tratoRows.map((r) => r.tratoType));
      tratoLabel = tratoTypes.size === 1
        ? tratoTypeLabel(catalogs, [...tratoTypes][0])
        : "Trato";
    }
    const kilosLabel = cosechaUnit(catalogs, cosechaContainers);
    return {
      cycle: c,
      faena: faenaById.get(c.faenaId),
      subfaena: subById.get(c.subfaenaId),
      rows,
      totals,
      cols,
      tratoLabel,
      kilosLabel,
      isClosed,
    };
  }).filter(Boolean);
  // Abiertos primero (por label), después cerrados.
  data.sort((a, b) => {
    if (a.isClosed !== b.isClosed) return a.isClosed ? 1 : -1;
    return (a.cycle.label || "").localeCompare(b.cycle.label || "");
  });

  const grandTotal = data.reduce((s, d) => s + (d.totals.amount || 0) + (d.totals.piso || 0), 0);
  let anticiposSaldo = 0, bonosSaldo = 0;
  for (const a of advances) {
    const rem = advanceRemaining(a);
    if (advanceSign(a) > 0) bonosSaldo += rem; else anticiposSaldo += rem;
  }
  const advancesSaldo = anticiposSaldo - bonosSaldo;
  return { data, advances, grandTotal, advancesSaldo, anticiposSaldo, bonosSaldo };
}
