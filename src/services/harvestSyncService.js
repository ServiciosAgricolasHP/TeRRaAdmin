// Lleva los pesajes de `harvestWeights` a las jornadas del ciclo y la labor a
// los que apunta cada prefijo.
import { cyclesService, harvestWeightsService, workdaysService } from "./index";
import { findWorkerByRut } from "./workersService";
import { comboKey, mapHarvestCodes, workdayDocId, getDayCombos } from "../utils/cosechaCombos";

// ============================================================
// Espejo pesaje → jornada
// ============================================================
//
// Una jornada es el agregado de (trabajador × día × combo). Al guardar un
// pesaje se conocen las claves afectadas —la de antes y la de después—, así
// que alcanza con recalcular esas dos desde los pesajes que existen ahora; no
// hace falta recorrer el rango.

const keyOf = (k) => `${k.prefixId}__${k.rut}__${k.dateKey}__${comboKey(k.x, k.y)}`;

async function loadSyncTarget(prefixDoc) {
  const cycle = prefixDoc?.cycleId ? await cyclesService.getById(prefixDoc.cycleId) : null;
  const labor = (cycle?.labors || []).find((l) => l.id === prefixDoc?.laborId) || null;
  return cycle && labor ? { cycle, labor } : null;
}

// Deja las jornadas de `keys` iguales a los pesajes que existen ahora mismo.
// Un grupo que se quedó sin pesajes borra su jornada en vez de dejarla con el
// valor viejo.
async function syncWorkdayKeys(prefixDoc, target, keys) {
  const { cycle, labor } = target;
  const report = { written: 0, removed: 0, blocked: [], unknownRuts: [], daysAdded: [], workersAdded: 0, zeroPriceDays: [] };

  const groups = new Map();
  for (const date of [...new Set(keys.map((k) => k.dateKey))]) {
    const weights = await harvestWeightsService.list({
      wheres: [["prefix", "==", prefixDoc.id], ["dateKey", ">=", date], ["dateKey", "<=", date]],
    });
    for (const w of weights) {
      if (!w.rut || !w.dateKey) continue;
      const { x, y } = mapHarvestCodes(prefixDoc, w);
      const gk = `${w.rut}__${w.dateKey}__${comboKey(x, y)}`;
      const g = groups.get(gk) || { rut: w.rut, dateKey: w.dateKey, x, y, qty: 0 };
      g.qty += Number(w.amount) || 0;
      groups.set(gk, g);
    }
  }

  const rosterKeys = new Set((labor.workers || []).flatMap((w) => [w.rut, w.id].filter(Boolean)));
  const attachDays = new Set();
  const attachWorkers = new Map();

  for (const key of keys) {
    const ck = comboKey(key.x, key.y);
    const docId = workdayDocId(cycle.id, labor.id, key.rut, key.dateKey, ck);
    const existing = await workdaysService.getById(docId);

    // Una jornada ya liquidada no se toca por detrás: dejaría el ciclo
    // diciendo algo distinto de la nómina que la pagó.
    if (existing?.payrollId) {
      report.blocked.push(`${key.rut} · ${key.dateKey}`);
      continue;
    }

    const g = groups.get(`${key.rut}__${key.dateKey}__${ck}`);
    if (!g || g.qty <= 0) {
      if (existing) { await workdaysService.remove(docId); report.removed += 1; }
      continue;
    }

    const combos = getDayCombos(cycle.dayPrices, labor.id, key.dateKey, "unit");
    const combo = combos.find((c) => c.key === ck) || { price: 0, mode: "unit" };
    const amount = combo.mode === "flat" ? combo.price : g.qty * combo.price;
    if (amount === 0 && !report.zeroPriceDays.includes(key.dateKey)) report.zeroPriceDays.push(key.dateKey);
    const worker = await findWorkerByRut(key.rut);
    await workdaysService.upsert(docId, {
      cycleId: cycle.id,
      laborId: labor.id,
      workerRut: key.rut,
      workerId: worker?.id || key.rut,
      date: key.dateKey,
      qualityX: g.x,
      containerY: g.y,
      qty: g.qty,
      amount,
      harvestSynced: true,
      harvestPrefix: prefixDoc.id,
    });
    report.written += 1;

    if (!(cycle.days || []).includes(key.dateKey)) attachDays.add(key.dateKey);
    if (!rosterKeys.has(key.rut)) {
      if (!worker) report.unknownRuts.push(key.rut);
      else if (!attachWorkers.has(worker.id || key.rut)) {
        attachWorkers.set(worker.id || key.rut, { id: worker.id || key.rut, rut: key.rut, name: worker.name || key.rut });
      }
    }
  }

  report.zeroPriceDays.sort();

  if (attachDays.size || attachWorkers.size) {
    const nextLabor = { ...labor, workers: [...(labor.workers || []), ...attachWorkers.values()] };
    await cyclesService.update(cycle.id, {
      days: [...(cycle.days || []), ...attachDays].sort(),
      labors: (cycle.labors || []).map((l) => (l.id === labor.id ? nextLabor : l)),
    });
    report.daysAdded = [...attachDays].sort();
    report.workersAdded = attachWorkers.size;
  }

  return report;
}

// Lleva cada clave tocada a su jornada, creándola si no existía. Un prefijo
// sin ciclo y labor asignados no tiene dónde escribir y se reporta en
// `noTarget`; si ningún prefijo tiene destino, devuelve null.
export async function mirrorWeightToWorkdays(prefixes, keys) {
  const byPrefix = new Map();
  const seen = new Set();
  for (const k of keys) {
    if (seen.has(keyOf(k))) continue;
    seen.add(keyOf(k));
    if (!byPrefix.has(k.prefixId)) byPrefix.set(k.prefixId, []);
    byPrefix.get(k.prefixId).push(k);
  }

  const total = {
    written: 0, removed: 0, blocked: [], unknownRuts: [],
    daysAdded: [], workersAdded: 0, zeroPriceDays: [], noTarget: [],
  };
  let reached = false;
  for (const [prefixId, group] of byPrefix) {
    const doc = prefixes.find((p) => p.id === prefixId);
    const t = doc ? await loadSyncTarget(doc) : null;
    if (!t) { total.noTarget.push(prefixId); continue; }
    reached = true;
    const r = await syncWorkdayKeys(doc, t, group);
    total.written += r.written;
    total.removed += r.removed;
    total.workersAdded += r.workersAdded;
    total.blocked.push(...r.blocked);
    total.unknownRuts.push(...r.unknownRuts);
    total.daysAdded.push(...r.daysAdded);
    total.zeroPriceDays.push(...r.zeroPriceDays);
  }
  total.zeroPriceDays = [...new Set(total.zeroPriceDays)].sort();
  return reached ? total : null;
}
