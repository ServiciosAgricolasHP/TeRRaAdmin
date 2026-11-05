// Importar la cosecha que entrega la empresa en la labor de cosecha de un
// ciclo, desde el archivo ya traducido a la forma común
// (`utils/harvestFormats.js`). Todo el cálculo vive acá, sin Firestore:
// emparejar a las personas y los combos, y armar el plan de lo que se
// escribe. Es un camino aparte de la sincronización de Pesajes QR: no
// comparte pesajes ni prefijos, solo la forma de las jornadas.
import { normalizeRut } from "./rutUtils";
import { rutWithoutDv } from "./banks";
import { nameTokens, tokenNameSimilarity, tokenSimilarity, tokensSimilarity, TOKEN_MATCH } from "./similarity";
import { comboKey, floorKeyOf, getDayCombos, getDayFloorByContainer, getDayPiso, workdayDocId, workdayMapKey, PISO_COMBO_KEY } from "./cosechaCombos";

const num = (v) => Number(v) || 0;
const text = (v) => (v == null ? "" : String(v).trim());
const round2 = (n) => Math.round(n * 100) / 100;

// Normaliza un texto para comparar: sin tildes, en mayúsculas y con espacios
// simples.
const norm = (s) =>
  text(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ");

// Las filas de una hoja; con una sola hoja, todas.
export const rowsOfSheet = (file, sheet) => (sheet ? file.rows.filter((r) => r.sheet === sheet) : file.rows);

// Los contratistas del archivo, del que trae más personas al que trae menos.
export function contractorsOf(rows) {
  const by = new Map();
  for (const r of rows) {
    const c = by.get(r.contractor) || { name: r.contractor, ruts: new Set(), rows: 0 };
    c.ruts.add(r.rut);
    c.rows += 1;
    by.set(r.contractor, c);
  }
  return [...by.values()]
    .map(({ ruts, ...c }) => ({ ...c, people: ruts.size }))
    .sort((a, b) => b.people - a.people || a.name.localeCompare(b.name, "es"));
}

// Clave de un combo del archivo: especie, calidad y envase.
export const fileComboKey = (r) => `${r.species}|${r.quality}|${r.container}`;

// Los combos del archivo (especie, calidad y envase), con sus kilos, sus
// unidades y los precios de la empresa.
export function fileCombosOf(rows) {
  const by = new Map();
  for (const r of rows) {
    const key = fileComboKey(r);
    const c = by.get(key) || { key, species: r.species, quality: r.quality, container: r.container, rows: 0, kilos: 0, units: 0, prices: new Set() };
    c.rows += 1;
    c.kilos += r.kilos;
    c.units += r.units;
    if (r.companyPrice != null) c.prices.add(r.companyPrice);
    by.set(key, c);
  }
  return [...by.values()]
    .map((c) => ({ ...c, prices: [...c.prices].sort((a, b) => a - b) }))
    .sort((a, b) => a.key.localeCompare(b.key, "es"));
}

// La entrada del catálogo que calza con un texto del archivo: igual, o una que
// empieza con la otra ("EXP" y "Exportación", "CAPACHO CZ" y "capacho").
function catalogMatch(entries, value) {
  const v = norm(value);
  if (!v) return null;
  const labels = (entries || []).map((e) => ({ value: e.value, label: norm(e.label) })).filter((e) => e.label);
  const exact = labels.find((e) => e.label === v);
  if (exact) return exact.value;
  const prefix = labels.find((e) => (v.length >= 3 && e.label.startsWith(v)) || (e.label.length >= 3 && v.startsWith(e.label)));
  if (prefix) return prefix.value;
  const word = labels.find((e) => e.label.length >= 3 && v.split(" ").includes(e.label));
  return word ? word.value : null;
}

// Lo que va como cantidad en la jornada: las unidades del envase o los kilos.
export const MEASURES = ["units", "kilos"];

// Para cada combo del archivo, la calidad (`x`) y el envase (`y`) del catálogo
// y la cantidad (`measure`). Usa lo que se eligió antes para el mismo combo
// (`remembered`) y, si no, lo que calza por nombre y la cantidad que dice el
// archivo (`defaultMeasure`); lo que no calza queda en null y hay que
// elegirlo.
export function suggestComboMap(combos, catalogs, defaultMeasure, remembered = {}) {
  const out = {};
  for (const c of combos) {
    const prev = remembered[c.key];
    out[c.key] = {
      x: prev?.x ?? catalogMatch(catalogs?.qualities, c.quality),
      y: prev?.y ?? catalogMatch(catalogs?.containers, c.container),
      measure: MEASURES.includes(prev?.measure) ? prev.measure : MEASURES.includes(defaultMeasure) ? defaultMeasure : "kilos",
    };
  }
  return out;
}

export const comboMapComplete = (combos, comboMap) =>
  combos.every((c) => comboMap[c.key]?.x != null && comboMap[c.key]?.y != null);

// En qué se cuenta la cantidad de un combo, para sumarla sin mezclar: las
// unidades de cada envase de TeRRa por separado ("c:<envase>") y los kilos
// juntos ("kg").
export const unitKeyOf = (m) => (m.measure === "units" ? `c:${m.y}` : "kg");

// Las personas del archivo: una por RUT, con el nombre que más se repite, su
// contratista, los días, los kilos y las unidades de cada envase del archivo.
export function filePeopleOf(rows) {
  const by = new Map();
  for (const r of rows) {
    const p = by.get(r.rut) || { rut: r.rut, names: new Map(), contractors: new Set(), dates: new Set(), kilos: 0, units: new Map() };
    p.names.set(r.name, (p.names.get(r.name) || 0) + 1);
    p.contractors.add(r.contractor);
    p.dates.add(r.date);
    p.kilos += r.kilos;
    p.units.set(r.container, (p.units.get(r.container) || 0) + r.units);
    by.set(r.rut, p);
  }
  return [...by.values()].map((p) => ({
    rut: p.rut,
    name: [...p.names].sort((a, b) => b[1] - a[1])[0][0],
    contractors: [...p.contractors],
    days: p.dates.size,
    kilos: p.kilos,
    units: [...p.units].map(([container, units]) => ({ container, units })).sort((a, b) => b.units - a.units),
  }));
}

// Los RUT con que figura un trabajador en sus propios documentos: el de
// creación, el vigente y los anteriores.
const ownRutKeys = (w) => [w?.id, w?.rut, ...(w?.rutHistory || [])].filter(Boolean).map(normalizeRut);

// Los RUT con que figura un trabajador: los suyos y los de los archivos de
// las empresas (`fileAliases`).
export const workerRutKeys = (w) =>
  [...new Set([...ownRutKeys(w), ...(w?.fileAliases || []).map((a) => normalizeRut(a.rut))].filter(Boolean))];

// Los nombres con que puede venir un trabajador con ese RUT: el de su ficha y
// los que trajo un archivo con ese RUT.
const namesFor = (w, rut) => [w.name, ...(w.fileAliases || []).filter((a) => normalizeRut(a.rut) === rut).map((a) => a.name)];

// Mismo nombre: calza al menos la mitad del nombre más corto, con dos palabras
// (o la única que tenga).
function sameName(a, b) {
  const { score, matched, size } = tokenNameSimilarity(a, b);
  return size > 0 && score >= 0.5 && matched >= Math.min(2, size);
}

// La persona del archivo calza sola con la ficha: su RUT es de la ficha y su
// nombre, el de la ficha o uno que un archivo trajo con ese RUT.
const autoMatches = (person, w) =>
  workerRutKeys(w).includes(person.rut) && namesFor(w, person.rut).some((n) => sameName(person.name, n));

// Busca fichas por nombre sin comparar cada nombre con todas: indexa las
// palabras de los nombres de las fichas y compara a fondo solo las fichas con
// dos o más palabras parecidas a las del nombre buscado. Calzan las que
// comparten dos tercios del nombre más corto y al menos dos palabras.
function nameSearchOf(workers) {
  const tokens = workers.map((w) => nameTokens(w.name));
  const byToken = new Map();
  tokens.forEach((ts, i) => {
    for (const t of new Set(ts)) {
      if (!byToken.has(t)) byToken.set(t, []);
      byToken.get(t).push(i);
    }
  });
  const vocabulary = [...byToken.keys()];
  const similar = new Map();
  const similarTo = (t) => {
    if (!similar.has(t)) similar.set(t, vocabulary.filter((v) => tokenSimilarity(t, v) >= TOKEN_MATCH));
    return similar.get(t);
  };
  return (name) => {
    const own = nameTokens(name);
    const hits = new Map();
    own.forEach((t, k) => {
      for (const v of similarTo(t)) {
        for (const i of byToken.get(v)) {
          if (!hits.has(i)) hits.set(i, new Set());
          hits.get(i).add(k);
        }
      }
    });
    const out = [];
    for (const [i, words] of hits) {
      if (words.size < 2) continue;
      const { score, matched } = tokensSimilarity(own, tokens[i]);
      if (matched >= 2 && score >= 0.66) out.push({ worker: workers[i], score });
    }
    return out.sort((a, b) => b.score - a.score);
  };
}

// Empareja a cada persona del archivo con una ficha:
// - `matched`: el RUT calza (uno de la ficha o uno que trajo un archivo) y el
//   nombre también. Va sola.
// - `review`: el RUT calza pero el nombre no (un RUT reasignado), o no calza
//   el RUT pero hay fichas con el mismo nombre (otro RUT de la misma persona).
//   La decide quien importa, con `candidates`.
// - `new`: ni el RUT ni el nombre calzan con nadie.
// `rutTaken` dice si el RUT ya es de alguna ficha: entonces no se puede crear
// otra con ese RUT.
export function matchFilePeople(people, workers) {
  const list = workers || [];
  const byRut = new Map();
  for (const w of list) {
    for (const k of workerRutKeys(w)) {
      if (!byRut.has(k)) byRut.set(k, []);
      byRut.get(k).push(w);
    }
  }
  const searchName = nameSearchOf(list);
  return people.map((p) => {
    const sameRut = byRut.get(p.rut) || [];
    const named = sameRut.find((w) => autoMatches(p, w));
    const rutTaken = sameRut.some((w) => [w.id, w.rut].some((r) => normalizeRut(r) === p.rut));
    if (named) {
      return { ...p, status: "matched", worker: named, via: ownRutKeys(named).includes(p.rut) ? "rut" : "alias", candidates: [], rutTaken };
    }
    const byName = searchName(p.name)
      .filter((c) => !sameRut.includes(c.worker))
      .slice(0, 5)
      .map((c) => c.worker);
    const candidates = [...sameRut, ...byName];
    if (sameRut.length) return { ...p, status: "review", reason: "nameMismatch", candidates, rutTaken };
    if (byName.length) return { ...p, status: "review", reason: "otherRut", candidates, rutTaken };
    return { ...p, status: "new", candidates: [], rutTaken };
  });
}

// Una ficha nueva de la importación según su RUT: bajo 22 millones es de un
// chileno (líder CHILENOS); sobre 30 millones, de un extranjero (líder
// EXTRANJEROS, sin llenar la nacionalidad) que cobra en efectivo. Entre medio
// queda sin líder ni forma de pago, para completarla a mano.
export const CHILEAN_RUT_BELOW = 22_000_000;
export const FOREIGN_RUT_ABOVE = 30_000_000;

export function newWorkerDefaults(rut) {
  const n = Number(rutWithoutDv(normalizeRut(rut)));
  if (!n) return {};
  if (n < CHILEAN_RUT_BELOW) return { groupLeader: "CHILENOS" };
  if (n > FOREIGN_RUT_ABOVE) return { groupLeader: "EXTRANJEROS", cash: true };
  return {};
}

// La decisión inicial para cada persona: la ficha que calzó, crear una nueva
// si no hay nadie parecido, o nada (`null`) si hay que revisarla.
export function initialDecisions(matches) {
  const out = {};
  for (const m of matches) {
    if (m.status === "matched") out[m.rut] = { action: "use", workerId: m.worker.id };
    else if (m.status === "new") out[m.rut] = { action: "create" };
    else out[m.rut] = null;
  }
  return out;
}

export const pendingDecisions = (matches, decisions) => matches.filter((m) => !decisions[m.rut]).length;

// El envase de TeRRa de un envase del archivo, según los combos ya elegidos.
function containerOfFileContainer(combos, comboMap, container) {
  const c = combos.find((x) => norm(x.container) === norm(container) && comboMap[x.key]?.y != null);
  return c ? comboMap[c.key].y : null;
}

// El valor que más se repite de una lista de montos.
function mostCommon(values) {
  const count = new Map();
  for (const v of values) count.set(v, (count.get(v) || 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? 0;
}

// Suma una cantidad en su unidad (`unitKeyOf`).
function addQty(byUnit, unit, qty) {
  byUnit[unit] = round2((byUnit[unit] || 0) + qty);
}

// El plan de la importación: qué jornadas y pisos se escriben, cuáles se
// borran (las importadas antes que ya no vienen), qué se crea y qué cambia en
// el ciclo. No escribe nada.
// - `rows`: las filas que se importan (hoja y contratistas ya elegidos).
// - `decisions`: por RUT del archivo, `{ action: "use", workerId }`,
//   `{ action: "create" }` o `{ action: "skip" }`. Una ficha nueva lleva el
//   líder y la forma de pago de `newWorkerDefaults`.
// - `workdaysOfLabor`: las jornadas de la labor en la pantalla, con su `id`.
// Una jornada que ya está en una nómina (`payrollId`) no se toca. Cuando se
// elige a mano una ficha que no calzaba sola, el RUT y el nombre del archivo
// van a la ficha (`aliases`), así la próxima importación la calza.
export function buildHarvestImportPlan({ rows, floors, combos, comboMap, decisions, workers, cycle, labor, workdaysOfLabor, dayPrices }) {
  const workerById = new Map((workers || []).map((w) => [w.id, w]));
  const laborRutOf = new Map();
  for (const lw of labor.workers || []) {
    if (lw.id) laborRutOf.set(lw.id, lw.rut);
  }
  // A quién va cada RUT del archivo: el RUT de la jornada (el de la persona en
  // la labor, si ya está) y su id.
  const target = new Map();
  const creates = [];
  const aliasesOf = new Map();
  const laborWorkersToAdd = [];
  const inLabor = new Set((labor.workers || []).flatMap((w) => [w.id, w.rut].filter(Boolean)));
  const people = new Map(filePeopleOf(rows).map((p) => [p.rut, p]));
  for (const [rut, d] of Object.entries(decisions || {})) {
    const person = people.get(rut);
    if (!d || d.action === "skip" || !person) continue;
    if (d.action === "create") {
      target.set(rut, { rut, workerId: rut });
      creates.push({ rut, name: person.name, ...newWorkerDefaults(rut) });
      if (!inLabor.has(rut)) laborWorkersToAdd.push({ id: rut, rut, name: person.name });
      continue;
    }
    const w = workerById.get(d.workerId);
    if (!w) continue;
    const wdRut = laborRutOf.get(w.id) || (labor.workers || []).find((lw) => workerRutKeys(w).includes(normalizeRut(lw.rut)))?.rut || w.rut || w.id;
    target.set(rut, { rut: wdRut, workerId: w.id });
    if (!autoMatches(person, w)) {
      const entry = aliasesOf.get(w.id) || { workerId: w.id, added: [], fileAliases: [...(w.fileAliases || [])] };
      entry.added.push({ rut, name: person.name });
      entry.fileAliases.push({ rut, name: person.name });
      aliasesOf.set(w.id, entry);
    }
    if (!inLabor.has(w.id) && !inLabor.has(wdRut) && !laborWorkersToAdd.some((x) => x.id === w.id)) {
      laborWorkersToAdd.push({ id: w.id, rut: wdRut, name: w.name || wdRut });
    }
  }

  // Producción: una jornada por persona, día y combo.
  const production = new Map();
  for (const r of rows) {
    const t = target.get(r.rut);
    const m = comboMap[fileComboKey(r)];
    if (!t || m?.x == null || m?.y == null) continue;
    const ck = comboKey(m.x, m.y);
    const key = workdayMapKey(t.rut, r.date, ck);
    const p = production.get(key) || { ...t, date: r.date, ck, x: m.x, y: m.y, unit: unitKeyOf(m), qty: 0 };
    p.qty += m.measure === "units" ? r.units : r.kilos;
    production.set(key, p);
  }
  const unpriced = new Set();
  const writes = [];
  for (const p of production.values()) {
    const combo = getDayCombos(dayPrices, labor.id, p.date, "unit").find((c) => c.key === p.ck);
    const qty = round2(p.qty);
    const amount = !combo || !combo.price ? 0 : combo.mode === "flat" ? combo.price : qty * combo.price;
    if (!amount) unpriced.add(`${p.date}|${p.ck}`);
    writes.push({
      mapKey: workdayMapKey(p.rut, p.date, p.ck),
      docId: workdayDocId(cycle.id, labor.id, p.rut, p.date, p.ck),
      unit: p.unit,
      data: { cycleId: cycle.id, laborId: labor.id, workerRut: p.rut, workerId: p.workerId, date: p.date, qualityX: p.x, containerY: p.y, qty, amount, harvestImported: true },
    });
  }

  // Pisos, con el monto de la planilla: por envase, o del día. Los que no
  // tienen fecha no se pueden ubicar y van como aviso.
  const floorWds = new Map();
  const undatedFloors = [];
  const unmappedFloors = [];
  for (const f of floors || []) {
    const t = target.get(f.rut);
    if (!t) continue;
    if (!f.date) {
      undatedFloors.push(f);
      continue;
    }
    let container = null;
    if (f.by === "container") {
      container = containerOfFileContainer(combos, comboMap, f.group);
      if (container == null) unmappedFloors.push(f);
    } else if (f.by) {
      unmappedFloors.push(f);
    }
    const floorKey = floorKeyOf(container);
    const key = workdayMapKey(t.rut, f.date, floorKey);
    const w = floorWds.get(key) || { ...t, date: f.date, floorKey, container, amount: 0 };
    w.amount += f.amount;
    floorWds.set(key, w);
  }
  const floorAmounts = new Map();
  for (const w of floorWds.values()) {
    writes.push({
      mapKey: workdayMapKey(w.rut, w.date, w.floorKey),
      docId: workdayDocId(cycle.id, labor.id, w.rut, w.date, w.floorKey),
      data: {
        cycleId: cycle.id, laborId: labor.id, workerRut: w.rut, workerId: w.workerId, date: w.date,
        qty: 0, amount: w.amount, pisoOnly: true, ...(w.container == null ? {} : { containerY: w.container }), harvestImported: true,
      },
    });
    const k = `${w.date}|${w.floorKey}`;
    if (!floorAmounts.has(k)) floorAmounts.set(k, []);
    floorAmounts.get(k).push(w.amount);
  }

  // Lo que ya hay en la labor: lo que está en una nómina no se toca, lo igual
  // no se vuelve a escribir y lo importado antes que ya no viene se borra.
  const existingByKey = workdaysOfLabor || {};
  const blocked = [];
  const replaced = [];
  const finalWrites = [];
  let unchanged = 0;
  for (const w of writes) {
    const prev = existingByKey[w.mapKey];
    if (prev?.payrollId) {
      blocked.push(w);
      continue;
    }
    if (prev && num(prev.qty) === num(w.data.qty) && num(prev.amount) === num(w.data.amount) && prev.harvestImported) {
      unchanged += 1;
      continue;
    }
    if (prev && !prev.harvestImported) replaced.push(w);
    finalWrites.push({ ...w, docId: prev?.id || w.docId, isNew: !prev });
  }
  const planned = new Set(writes.map((w) => w.mapKey));
  const ruts = new Set([...target.values()].map((t) => t.rut));
  const dates = [...new Set(rows.map((r) => r.date))].sort();
  const deletes = [];
  const blockedDeletes = [];
  for (const [mapKey, wd] of Object.entries(existingByKey)) {
    if (!wd?.harvestImported || planned.has(mapKey) || !ruts.has(wd.workerRut)) continue;
    if (wd.date < dates[0] || wd.date > dates[dates.length - 1]) continue;
    if (wd.payrollId) blockedDeletes.push(wd);
    else deletes.push({ mapKey, docId: wd.id || workdayDocId(cycle.id, labor.id, wd.workerRut, wd.date, mapKey.split("__").slice(2).join("__")) });
  }

  // El ciclo: los días que faltan, las personas que faltan en la labor y el
  // monto de cada piso en los días que todavía no lo tienen.
  const daysToAdd = [...new Set(writes.map((w) => w.data.date))].filter((d) => !(cycle.days || []).includes(d)).sort();
  const floorConfig = [];
  for (const [k, amounts] of floorAmounts) {
    const [date, floorKey] = k.split("|");
    const container = floorKey === PISO_COMBO_KEY ? null : Number(floorKey.slice(PISO_COMBO_KEY.length + 1));
    const configured = container == null
      ? num(getDayPiso(dayPrices, labor.id, date))
      : num(getDayFloorByContainer(dayPrices, labor.id, date)[container]);
    if (!configured) floorConfig.push({ date, container, amount: mostCommon(amounts) });
  }

  // Resumen por día, para la vista previa: la cantidad va por unidad.
  const byDate = new Map();
  for (const w of writes) {
    const d = byDate.get(w.data.date) || { date: w.data.date, people: new Set(), qtyByUnit: {}, amount: 0, floorAmount: 0, floorCount: 0 };
    d.people.add(w.data.workerRut);
    if (w.data.pisoOnly) {
      d.floorAmount += w.data.amount;
      d.floorCount += 1;
    } else {
      addQty(d.qtyByUnit, w.unit, w.data.qty);
      d.amount += w.data.amount;
    }
    byDate.set(w.data.date, d);
  }
  const days = [...byDate.values()].map((d) => ({ ...d, people: d.people.size }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const qtyByUnit = {};
  for (const d of days) for (const [unit, qty] of Object.entries(d.qtyByUnit)) addQty(qtyByUnit, unit, qty);

  return {
    writes: finalWrites,
    deletes,
    blocked,
    blockedDeletes,
    replaced,
    unchanged,
    creates,
    aliases: [...aliasesOf.values()],
    laborWorkersToAdd,
    daysToAdd,
    floorConfig,
    undatedFloors,
    unmappedFloors,
    unpriced: [...unpriced].map((k) => {
      const [date, ck] = k.split("|");
      return { date, ck };
    }),
    days,
    totals: {
      people: target.size,
      qtyByUnit,
      amount: days.reduce((a, d) => a + d.amount, 0),
      floorAmount: days.reduce((a, d) => a + d.floorAmount, 0),
      floorCount: days.reduce((a, d) => a + d.floorCount, 0),
    },
  };
}

// Lo que el archivo dice de las filas elegidas, para comparar con el plan:
// la cantidad por unidad (`unitKeyOf`) y los pisos con fecha.
export function fileTotalsOf(rows, floors, comboMap, decisions) {
  const keep = (rut) => decisions?.[rut] && decisions[rut].action !== "skip";
  const qtyByUnit = {};
  for (const r of rows) {
    const m = comboMap[fileComboKey(r)];
    if (!keep(r.rut) || m?.x == null || m?.y == null) continue;
    addQty(qtyByUnit, unitKeyOf(m), m.measure === "units" ? r.units : r.kilos);
  }
  const ruts = new Set(rows.map((r) => r.rut));
  const floorAmount = (floors || []).filter((f) => f.date && ruts.has(f.rut) && keep(f.rut)).reduce((a, f) => a + f.amount, 0);
  return { qtyByUnit, floorAmount };
}

// Las cantidades de dos totales por unidad calzan.
export function sameQtyByUnit(a, b) {
  const units = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  return [...units].every((u) => Math.abs((a?.[u] || 0) - (b?.[u] || 0)) < 0.01);
}
