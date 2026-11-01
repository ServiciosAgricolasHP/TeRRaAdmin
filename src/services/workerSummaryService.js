import { workdayMapKey, tratoUnitLabel, tratoTypeLabel, cosechaUnit } from "../utils/cosechaCombos";
import { workdaysService, cyclesService, jobsService, subjobsService } from "./index";
import { listCycles, listJobs, listSubjobs, pickByIds } from "./jobLists";
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
  const rutKeys = workerKeys(worker);
  if (rutKeys.length === 0) return { data: [], advances: [], grandTotal: 0, netAdvanceBalance: 0 };
  const rutKeySet = new Set(rutKeys);
  const [wds, pendingAdvances] = await Promise.all([
    workdaysService.list({ wheres: [["workerRut", "in", rutKeys]] }),
    listPendingForWorkers(rutKeys).catch(() => []),
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
  const cycles = await pickByIds(await listCycles(), cycleIds, cyclesService);
  const cyclesToShow = cycles.filter((c) => {
    if (c.status !== "closed") return true;
    return includeClosed;
  });
  const jobIds = [...new Set(cyclesToShow.map((c) => c.faenaId).filter(Boolean))];
  const subjobIds = [...new Set(cyclesToShow.map((c) => c.subfaenaId).filter(Boolean))];
  const [allJobs, allSubjobs] = await Promise.all([listJobs(), listSubjobs()]);
  const [jobs, subjobs] = await Promise.all([
    pickByIds(allJobs, jobIds, jobsService),
    pickByIds(allSubjobs, subjobIds, subjobsService),
  ]);
  const jobById = new Map(jobs.map((f) => [f.id, f]));
  const subjobById = new Map(subjobs.map((s) => [s.id, s]));

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
    const { rows, harvestContainers } = buildCycleRows(rutKeySet, c, wdMap, catalogs, payrollById);
    const totals = rows.reduce(
      (acc, r) => ({
        harvestQty: acc.harvestQty + r.harvestQty,
        workdayCount: acc.workdayCount + r.workdayCount,
        pieceworkQty: acc.pieceworkQty + r.pieceworkQty,
        overtimeHours: acc.overtimeHours + r.overtimeHours,
        overtimeAmount: acc.overtimeAmount + r.overtimeAmount,
        amount: acc.amount + r.amount,
        floor: acc.floor + (r.floor || 0),
      }),
      { harvestQty: 0, workdayCount: 0, pieceworkQty: 0, overtimeHours: 0, overtimeAmount: 0, amount: 0, floor: 0 },
    );
    const cols = {
      harvestQty: rows.some((r) => r.harvestQty > 0),
      workdayCount: rows.some((r) => r.workdayCount > 0),
      overtime: rows.some((r) => r.overtimeHours > 0),
      piecework: rows.some((r) => r.pieceworkQty > 0),
      floor: rows.some((r) => (r.floor || 0) > 0),
    };
    // Rótulo de la columna de trato: la unidad, si todos los días usan la
    // misma (Árbol, Metro, Polín…); si no, el tipo de trato, o "Trato" si hay
    // varios.
    const pieceworkRows = rows.filter((r) => r.laborType === "trato");
    const hasEtapas = rows.some((r) => r.laborType === "tratoEtapas");
    const pieceworkUnits = new Set(pieceworkRows.map((r) => r.pieceworkUnit).filter((u) => u != null));
    let pieceworkLabel;
    if (hasEtapas && pieceworkRows.length === 0) {
      // Solo etapas → la columna de cantidad son "Unidades" producidas.
      pieceworkLabel = "Unidades";
    } else if (hasEtapas) {
      // Trato y etapas juntos: el encabezado va neutro, porque la unidad del
      // trato rotularía también la producción por etapas ("4.737 poda"
      // incluyendo carpas). El desglose por fila dice cuál es cuál.
      pieceworkLabel = "Unidades";
    } else if (pieceworkUnits.size === 1) {
      const u = [...pieceworkUnits][0];
      pieceworkLabel = tratoUnitLabel(catalogs, u) || "Trato";
    } else {
      const pieceworkTypes = new Set(pieceworkRows.map((r) => r.tratoType));
      pieceworkLabel = pieceworkTypes.size === 1
        ? tratoTypeLabel(catalogs, [...pieceworkTypes][0])
        : "Trato";
    }
    const harvestLabel = cosechaUnit(catalogs, harvestContainers);
    return {
      cycle: c,
      job: jobById.get(c.faenaId),
      subjob: subjobById.get(c.subfaenaId),
      rows,
      totals,
      cols,
      pieceworkLabel,
      harvestLabel,
      isClosed,
    };
  }).filter(Boolean);
  // Abiertos primero (por label), después cerrados.
  data.sort((a, b) => {
    if (a.isClosed !== b.isClosed) return a.isClosed ? 1 : -1;
    return (a.cycle.label || "").localeCompare(b.cycle.label || "");
  });

  const grandTotal = data.reduce((s, d) => s + (d.totals.amount || 0) + (d.totals.floor || 0), 0);
  let advanceBalance = 0, bonusBalance = 0;
  for (const a of advances) {
    const rem = advanceRemaining(a);
    if (advanceSign(a) > 0) bonusBalance += rem; else advanceBalance += rem;
  }
  const netAdvanceBalance = advanceBalance - bonusBalance;
  return { data, advances, grandTotal, netAdvanceBalance, advanceBalance, bonusBalance };
}
