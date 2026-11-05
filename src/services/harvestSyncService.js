// Lleva los pesajes de `harvestWeights` a las jornadas del ciclo y la labor a
// los que apunta cada prefijo.
import { cyclesService, harvestWeightsService, qrPrefixesService, workdaysService } from "./index";
import { findWorkerByRut, listWorkers } from "./workersService";
import { writeWorkdays } from "./workdayBatches";
import { logAction } from "./logger";
import { comboKey, mapHarvestCodes, workdayDocId, getDayCombos } from "../utils/cosechaCombos";
import { workerByRutResolver } from "../utils/workerRut";

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

  const laborWorkerKeys = new Set((labor.workers || []).flatMap((w) => [w.rut, w.id].filter(Boolean)));
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
    if (!laborWorkerKeys.has(key.rut)) {
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
// `noTarget`; uno cuyo ciclo está cerrado no se toca y se reporta en `closed`,
// porque lo de ese ciclo ya se liquidó o está por liquidarse. Si ningún
// prefijo tiene destino, devuelve null.
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
    daysAdded: [], workersAdded: 0, zeroPriceDays: [], noTarget: [], closed: [],
  };
  let reached = false;
  for (const [prefixId, group] of byPrefix) {
    const doc = prefixes.find((p) => p.id === prefixId);
    const t = doc ? await loadSyncTarget(doc) : null;
    if (!t) { total.noTarget.push(prefixId); continue; }
    reached = true;
    if (t.cycle.status === "closed") { total.closed.push(prefixId); continue; }
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

// Sincroniza un rango de fechas de un prefijo (Sincronizar, en Pesajes QR):
// suma sus pesajes por trabajador, día y combo, y deja esas jornadas en el
// ciclo y la labor del prefijo. Se puede repetir: recalcula desde cero.
// - Lee el ciclo de nuevo, porque reescribe sus días y labores enteros; no
//   escribe en un ciclo cerrado.
// - Las fichas salen de la lista de trabajadores (`listWorkers`); solo un RUT
//   que no está ahí, como uno que el escáner creó hoy, se busca aparte.
// - Agrega al ciclo los días y a la labor las personas que faltan, para que
//   las jornadas se vean en la grilla.
// - Lee cada jornada por su id, en tandas de 25: una que ya está en una
//   nómina no se toca.
// - Escribe las jornadas en lotes y deja un solo registro, `harvestSync`.
//
// `onProgress({ stage, done, total })`: "cycle", "weights", "workers",
// "attach", "check" y "write" (estas dos, con `done` y `total`), y "save".
export async function syncPrefixRange({ prefix, dateFrom, dateTo, onProgress = () => {} }) {
  onProgress({ stage: "cycle" });
  const fresh = prefix.cycleId ? await cyclesService.getById(prefix.cycleId) : null;
  const labor = (fresh?.labors || []).find((l) => l.id === prefix.laborId);
  if (!fresh || !labor) throw new Error("Ciclo/labor vigente no disponible");
  if (fresh.status === "closed") {
    throw new Error("El ciclo vigente se cerró. Reapunta el prefijo al ciclo abierto antes de sincronizar.");
  }

  onProgress({ stage: "weights" });
  const weights = await harvestWeightsService.list({
    wheres: [["prefix", "==", prefix.id], ["dateKey", ">=", dateFrom], ["dateKey", "<=", dateTo]],
  });
  // Sin `qualityMap`/`containerMap` el mapeo es identidad: los catálogos usan
  // la misma numeración que la app de escaneo.
  const groups = new Map();
  for (const w of weights) {
    if (!w.rut || !w.dateKey) continue;
    const { x, y } = mapHarvestCodes(prefix, w);
    const ck = comboKey(x, y);
    const gKey = `${w.rut}__${w.dateKey}__${ck}`;
    const g = groups.get(gKey) || { rut: w.rut, dateKey: w.dateKey, x, y, ck, qty: 0 };
    g.qty += Number(w.amount) || 0;
    groups.set(gKey, g);
  }

  onProgress({ stage: "workers" });
  const fromList = workerByRutResolver(await listWorkers());
  const workerByRut = new Map();
  for (const rut of new Set([...groups.values()].map((g) => g.rut))) {
    workerByRut.set(rut, fromList(rut) || (await findWorkerByRut(rut)));
  }

  // La grilla se dibuja con `cycle.days` (columnas) y `labor.workers`
  // (filas): una jornada cuyo día o persona falte no tiene celda.
  const neededDays = [...new Set([...groups.values()].map((g) => g.dateKey))];
  const laborWorkerKeys = new Set((labor.workers || []).flatMap((w) => [w.rut, w.id].filter(Boolean)));
  const daysAdded = neededDays.filter((d) => !(fresh.days || []).includes(d)).sort();
  const rutsToAdd = [...workerByRut.keys()].filter((r) => !laborWorkerKeys.has(r));
  // Sin ficha no hay con qué armar la entrada de la labor: esos RUT se avisan.
  const unknownRuts = rutsToAdd.filter((r) => !workerByRut.get(r));
  // El `rut` de la entrada es el de los pesajes, no el de la ficha: con él
  // arma la grilla el id de la jornada. Dos RUT pueden ser la misma ficha.
  const workersToAdd = [];
  const seenWorkerIds = new Set();
  for (const r of rutsToAdd) {
    const w = workerByRut.get(r);
    if (!w) continue;
    const entryId = w.id || r;
    if (seenWorkerIds.has(entryId) || laborWorkerKeys.has(entryId)) continue;
    seenWorkerIds.add(entryId);
    workersToAdd.push({ id: entryId, rut: r, name: w.name || r });
  }
  if (daysAdded.length || workersToAdd.length) {
    onProgress({ stage: "attach" });
    const nextLabor = { ...labor, workers: [...(labor.workers || []), ...workersToAdd] };
    await cyclesService.update(fresh.id, {
      days: [...(fresh.days || []), ...daysAdded].sort(),
      labors: (fresh.labors || []).map((l) => (l.id === labor.id ? nextLabor : l)),
    });
  }

  // Una jornada ya liquidada no se toca: con el monto nuevo y el `payrollId`
  // viejo contaría como pagada sin que la diferencia se pague nunca.
  const keys = [...groups.values()].map((g) => ({ g, docId: workdayDocId(fresh.id, labor.id, g.rut, g.dateKey, g.ck) }));
  const existing = new Map();
  onProgress({ stage: "check", done: 0, total: keys.length });
  for (let i = 0; i < keys.length; i += 25) {
    const part = keys.slice(i, i + 25);
    const docs = await Promise.all(part.map((k) => workdaysService.getById(k.docId)));
    docs.forEach((d, j) => existing.set(part[j].docId, d ?? null));
    onProgress({ stage: "check", done: Math.min(i + 25, keys.length), total: keys.length });
  }
  const blocked = keys.filter((k) => existing.get(k.docId)?.payrollId).map((k) => `${k.g.rut} · ${k.g.dateKey}`);

  const zeroPriceDays = new Set();
  const sets = [];
  for (const { g, docId } of keys) {
    if (existing.get(docId)?.payrollId) continue;
    const combos = getDayCombos(fresh.dayPrices, labor.id, g.dateKey, "unit");
    const combo = combos.find((c) => c.key === g.ck) || { price: 0, mode: "unit" };
    const amount = combo.mode === "flat" ? combo.price : g.qty * combo.price;
    if (g.qty > 0 && amount === 0) zeroPriceDays.add(g.dateKey);
    const worker = workerByRut.get(g.rut);
    sets.push({
      id: docId,
      isNew: !existing.get(docId),
      merge: true,
      data: {
        cycleId: fresh.id,
        laborId: labor.id,
        workerRut: g.rut,
        workerId: worker?.id || g.rut,
        date: g.dateKey,
        qualityX: g.x,
        containerY: g.y,
        qty: g.qty,
        amount,
        harvestSynced: true,
        harvestPrefix: prefix.id,
      },
    });
  }
  onProgress({ stage: "write", done: 0, total: sets.length });
  await writeWorkdays({ sets, onProgress: (done, total) => onProgress({ stage: "write", done, total }) });

  onProgress({ stage: "save" });
  await qrPrefixesService.update(prefix.id, {
    lastSync: { at: new Date().toISOString(), days: [...neededDays].sort(), written: sets.length },
  });
  const result = {
    weightsRead: weights.length,
    groups: groups.size,
    written: sets.length,
    daysAdded,
    workersAdded: workersToAdd.length,
    unknownRuts,
    blocked,
    zeroPriceDays: [...zeroPriceDays].sort(),
  };
  await logAction({
    action: "harvestSync",
    entity: "qrPrefix",
    entityId: prefix.id,
    meta: {
      cycleId: fresh.id,
      laborId: labor.id,
      from: dateFrom,
      to: dateTo,
      written: result.written,
      blocked: blocked.length,
      daysAdded,
      workersAdded: result.workersAdded,
    },
  });
  return result;
}
