import { comboKey, containerLabel, mapHarvestCodes, qualityLabel } from "./cosechaCombos";

// El explorador de pesajes de Pesajes QR: la búsqueda por QR, los totales
// por combo calidad/envase y las agrupaciones por trabajador y por día.

// Buscar por QR resuelve al trabajador y filtra por su RUT, no por el `idQr`
// del pesaje: los códigos se reciclan y se reemplazan, y así aparecen
// también los pesajes de antes de un cambio de QR.
export function resolveQrSearch(search, workers, weights) {
  const needle = search.trim().toUpperCase();
  if (!needle) return null;
  const owner = workers.find((w) =>
    (w.idQr || []).some((c) => String(c || "").trim().toUpperCase() === needle),
  );
  if (owner) return { code: needle, owners: [owner], keys: new Set([owner.id, owner.rut].filter(Boolean)) };

  // Un código liberado no es de nadie hoy: se resuelve por los pesajes que
  // lo anotaron. Puede traer más de una persona si el código pasó por varias
  // manos.
  const keys = new Set();
  for (const w of weights) {
    if (String(w.idQr || "").trim().toUpperCase() === needle && w.rut) keys.add(w.rut);
  }
  if (keys.size === 0) return null;
  const owners = workers.filter((w) => keys.has(w.id) || keys.has(w.rut));
  for (const w of owners) {
    if (w.id) keys.add(w.id);
    if (w.rut) keys.add(w.rut);
  }
  return { code: needle, owners, keys, freed: true };
}

// Los pesajes que pasan el prefijo y la búsqueda (o el QR resuelto), con los
// totales por combo y las agrupaciones por trabajador y por día. El prefijo se
// filtra también acá porque la consulta puede venir sin él.
export function weightsView(weights, { catalogs, prefixById, prefixFilter, qrMatch, rutOf, search, workerNames }) {
  const needle = search.trim().toLowerCase();
  const combos = new Map();
  const byWorker = new Map();
  const byDay = new Map();
  const detail = [];
  let count = 0;
  const days = new Set();
  const ruts = new Set();

  for (const w of weights) {
    if (!w.dateKey) continue;
    const prefixId = w.prefix || "—";
    if (prefixFilter && prefixId !== prefixFilter) continue;

    const rut = w.rut || "—";
    const name = workerNames.get(rut) || "";
    const displayRut = rut === "—" ? rut : rutOf(rut);
    if (qrMatch) {
      if (!qrMatch.keys.has(rut)) continue;
    } else if (needle && !rut.toLowerCase().includes(needle) && !displayRut.toLowerCase().includes(needle) && !name.toLowerCase().includes(needle)) continue;

    const pfx = prefixById.get(prefixId) || null;
    const { x, y } = mapHarvestCodes(pfx, w);
    const ck = comboKey(x, y);
    const qty = Number(w.amount) || 0;

    if (!combos.has(ck)) {
      combos.set(ck, { key: ck, x, y, label: `${qualityLabel(catalogs, x)} / ${containerLabel(catalogs, y)}`, qty: 0, count: 0 });
    }
    const combo = combos.get(ck);
    combo.qty += qty;
    combo.count += 1;

    count += 1;
    days.add(w.dateKey);
    ruts.add(rut);

    const bucket = (map, key, extra) => {
      if (!map.has(key)) map.set(key, { key, qtyByCombo: new Map(), count: 0, prefixes: new Set(), ...extra });
      const g = map.get(key);
      g.qtyByCombo.set(ck, (g.qtyByCombo.get(ck) || 0) + qty);
      g.count += 1;
      g.prefixes.add(prefixId);
      return g;
    };
    const entry = { id: w.id, rut, displayRut, name, date: w.dateKey, prefixId, comboLabel: combo.label, qty, x, y, idQr: w.idQr || "", supervisor: w.supervisor || "" };

    bucket(byWorker, rut, { rut, displayRut, name, days: new Set() }).days.add(w.dateKey);
    const dayGroup = bucket(byDay, w.dateKey, { date: w.dateKey, ruts: new Set(), entries: [] });
    dayGroup.ruts.add(rut);
    dayGroup.entries.push(entry);

    detail.push(entry);
  }

  const comboList = [...combos.values()].sort((a, b) => (a.x !== b.x ? a.x - b.x : a.y - b.y));
  return {
    comboList,
    count,
    daysCount: days.size,
    workersCount: ruts.size,
    byWorker: [...byWorker.values()].sort((a, b) => (a.name || a.rut).localeCompare(b.name || b.rut)),
    byDay: [...byDay.values()]
      .map((d) => ({ ...d, entries: d.entries.sort((a, b) => (a.name || a.rut).localeCompare(b.name || b.rut)) }))
      .sort((a, b) => b.date.localeCompare(a.date)),
    detail,
  };
}

// Agrupa los pesajes de un día por trabajador. El subtotal solo aparece si
// todos sus pesajes son del mismo combo — sumar kilos con bandejas no da nada.
export function groupDayByWorker(entries) {
  const map = new Map();
  for (const e of entries) {
    if (!map.has(e.rut)) map.set(e.rut, { rut: e.rut, name: e.name, entries: [] });
    map.get(e.rut).entries.push(e);
  }
  return [...map.values()]
    .map((w) => {
      const combos = new Set(w.entries.map((e) => comboKey(e.x, e.y)));
      return { ...w, total: combos.size === 1 ? w.entries.reduce((s, e) => s + e.qty, 0) : null };
    })
    .sort((a, b) => (a.name || a.rut).localeCompare(b.name || b.rut));
}
