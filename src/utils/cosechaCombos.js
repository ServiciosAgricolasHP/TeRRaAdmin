// Combo = (calidad, envase). Se guarda con claves `${qualityX}_${containerY}`.
// Los catálogos vienen de la colección global de catálogos (vía CatalogsContext).

export const COSECHA_MODES = [
  { value: "unit", label: "Por unidad (cantidad × precio/día)" },
  { value: "flat", label: "Por día fijo (mismo monto, la cantidad es informativa)" },
];

export const comboKey = (x, y) => `${x}_${y}`;

export const parseComboKey = (key) => {
  const [x, y] = String(key).split("_").map(Number);
  return { x: x || 0, y: y || 0 };
};

export const qualityLabel = (catalogs, x) => {
  const cat = catalogs?.qualities || [];
  return cat.find((q) => q.value === x)?.label || `Calidad ${x}`;
};

export const containerLabel = (catalogs, y) => {
  const cat = catalogs?.containers || [];
  return cat.find((c) => c.value === y)?.label || `Envase ${y}`;
};

// Unidad a mostrar en totales y métricas de cosecha: el label del envase si
// todos los workdays usaron el mismo (saco, caja, kilo…), o el genérico
// "Unid." si hay mezcla.
export const cosechaUnit = (catalogs, containersSet) => {
  if (!containersSet || containersSet.size === 0) return "Unid.";
  if (containersSet.size === 1) return containerLabel(catalogs, [...containersSet][0]);
  return "Unid.";
};

// Piso = bono fijo por trabajador y día, para cuando la producción fue baja.
// Vive en un workday aparte con `comboKey: "_piso"` y `pisoOnly: true`. Se
// configura día por día, solo en los que lo llevan (botón "+ piso" del panel
// de Precios).
export const PISO_COMBO_KEY = "_piso";

// Piso por envase: además del piso del día, un día de cosecha puede tener uno
// por envase (`floorByContainer`, { [envase]: monto }, en
// `dayPrices[laborId][date]`), cada bono en su propio workday con comboKey
// `_piso_<envase>`. Es para cuando la regla de la empresa cuenta cada envase
// por separado: una persona puede tener los dos el mismo día, y se suman.
export const floorKeyOf = (container = null) => (container == null ? PISO_COMBO_KEY : `${PISO_COMBO_KEY}_${container}`);

export const isFloorKey = (key) => key === PISO_COMBO_KEY || String(key ?? "").startsWith(`${PISO_COMBO_KEY}_`);

// El envase de un piso por envase; null para el piso del día.
export function floorContainerOf(key) {
  if (!isFloorKey(key) || key === PISO_COMBO_KEY) return null;
  const n = Number(String(key).slice(PISO_COMBO_KEY.length + 1));
  return Number.isInteger(n) ? n : null;
}

// Campo de la fila de la grilla con el monto de un piso (`2026-03-02__piso`,
// `2026-03-02__piso_2`).
export const floorField = (date, key) => `${date}__${String(key).slice(1)}`;

export const getDayPiso = (dayPrices, laborId, date) => {
  const entry = dayPrices?.[laborId]?.[date];
  if (!entry || typeof entry !== "object") return null;
  const raw = entry.piso;
  return raw == null ? null : Number(raw) || 0;
};

export const effectivePiso = (labor, dayPrices, date) =>
  Number(getDayPiso(dayPrices, labor?.id, date)) || 0;

// Los pisos por envase configurados en un día, con monto mayor que cero.
export function getDayFloorByContainer(dayPrices, laborId, date) {
  const raw = dayPrices?.[laborId]?.[date]?.floorByContainer;
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [container, value] of Object.entries(raw)) {
    const amount = Number(value) || 0;
    if (amount > 0) out[container] = amount;
  }
  return out;
}

// Monto configurado de un piso del día: el del día (`_piso`) o el de su envase.
export function dayFloorAmount(dayPrices, laborId, date, key = PISO_COMBO_KEY) {
  const container = floorContainerOf(key);
  if (container == null) return Number(getDayPiso(dayPrices, laborId, date)) || 0;
  return getDayFloorByContainer(dayPrices, laborId, date)[container] || 0;
}

// Los envases que pueden llevar su propio piso en un día de cosecha, para
// ofrecerlos en Precios: con dos o más envases en los combos del día, cada
// uno; además, los que ya tienen piso (`floors`, de `floorsByDateOf`). Con un
// solo envase, el piso del día ya es el de ese envase.
export function floorContainersOf(combos, floors) {
  const fromCombos = [...new Set((combos || []).map((c) => c.y))];
  const withFloor = (floors || []).filter((f) => f.container != null).map((f) => f.container);
  return [...new Set([...(fromCombos.length > 1 ? fromCombos : []), ...withFloor])].sort((a, b) => a - b);
}

// Clave de combo de una entrada de `workdaysByLabor[laborId]`, que es
// `rut__fecha__combo`.
const comboOfMapKey = (mapKey) => String(mapKey).split("__").slice(2).join("__");

// Qué piso es una entrada del mapa, o null si es producción. Un piso se
// reconoce por la clave aunque no traiga `pisoOnly`.
function floorKeyOfEntry(mapKey, wd) {
  const ck = comboOfMapKey(mapKey);
  if (isFloorKey(ck)) return ck;
  return wd?.pisoOnly ? PISO_COMBO_KEY : null;
}

// El envase de una jornada de producción de cosecha.
function containerOfEntry(mapKey, wd) {
  const ck = comboOfMapKey(mapKey);
  return /^\d+_\d+$/.test(ck) ? parseComboKey(ck).y : Number(wd?.containerY) || 0;
}

// Los pisos de cada día de la labor: el del día y uno por envase, en ese
// orden, con su monto configurado. Entra también un piso sin monto que ya
// tiene bonos, para que se vean y se puedan quitar.
export function floorsByDateOf(dayPrices, laborId, workdaysOfLabor) {
  const byDate = {};
  const add = (date, key, amount) => {
    if (!byDate[date]) byDate[date] = new Map();
    const day = byDate[date];
    if (!day.has(key) || amount > 0) day.set(key, amount);
  };
  for (const [date, entry] of Object.entries(dayPrices?.[laborId] || {})) {
    const dayAmount = Number(entry?.piso) || 0;
    if (dayAmount > 0) add(date, PISO_COMBO_KEY, dayAmount);
    for (const [container, amount] of Object.entries(getDayFloorByContainer(dayPrices, laborId, date))) {
      add(date, floorKeyOf(Number(container)), amount);
    }
  }
  for (const [mapKey, wd] of Object.entries(workdaysOfLabor || {})) {
    const key = wd?.date ? floorKeyOfEntry(mapKey, wd) : null;
    if (key) add(wd.date, key, 0);
  }
  const out = {};
  for (const [date, day] of Object.entries(byDate)) {
    out[date] = [...day]
      .map(([key, amount]) => ({ key, container: floorContainerOf(key), amount }))
      .sort((a, b) => (a.container ?? -1) - (b.container ?? -1));
  }
  return out;
}

// A quiénes les toca el piso de un día: los que tienen producción cargada y
// no tienen el bono. Lo usa el botón "a todos" del panel de Precios.
//
// "Tiene producción" usa la misma regla que habilita el toggle de la columna
// del piso en la grilla: alcanza con que exista el workday, sin mirar `qty`
// ni `amount` (un día en cero es justo el caso que el piso compensa). Con el
// mismo criterio, el botón equivale a apretar todos los toggles habilitados.
//
// Con un piso por envase (`floorKey` = `_piso_<envase>`), cuentan los que
// tienen producción en ese envase.
export function pisoTargets(workdaysOfLabor, date, floorKey = PISO_COMBO_KEY) {
  const container = floorContainerOf(floorKey);
  const conProduccion = new Set();
  const yaTienen = new Set();
  for (const [key, wd] of Object.entries(workdaysOfLabor || {})) {
    if (!wd || !wd.workerRut || wd.date !== date) continue;
    const entryFloor = floorKeyOfEntry(key, wd);
    if (entryFloor) {
      if (entryFloor === floorKey) yaTienen.add(wd.workerRut);
    } else if (container == null || containerOfEntry(key, wd) === container) {
      conProduccion.add(wd.workerRut);
    }
  }
  return [...conProduccion].filter((rut) => !yaTienen.has(rut)).sort();
}

// Los bonos de piso ya asignados en un día, separados según si una nómina se
// los llevó (`payrollId`). Lo usa el ✕ del panel de Precios: quitar el piso
// del día se lleva también los bonos `libres`.
//
// Los `liquidados` no se tocan: borrar un workday que una nómina referencia le
// descuadra el total a algo que ya se pagó.
export function pisoAssigned(workdaysOfLabor, date, floorKey = PISO_COMBO_KEY) {
  const libres = [];
  const liquidados = [];
  for (const [key, wd] of Object.entries(workdaysOfLabor || {})) {
    if (!wd || !wd.workerRut || wd.date !== date) continue;
    if (floorKeyOfEntry(key, wd) !== floorKey) continue;
    (wd.payrollId ? liquidados : libres).push(wd);
  }
  return { libres, liquidados };
}

export const tratoTypeLabel = (catalogs, t) => {
  const cat = catalogs?.tratoTypes || [];
  return cat.find((e) => e.value === t)?.label || `Trato ${t}`;
};

// Label de la unidad de medida de un workday de trato (Metro / Polín /
// Planta…). La unidad vive junto al precio, en `dayPrices[labor][date].tN.unit`.
// Devuelve el label del catálogo (`Unidad N` si no está en el catálogo), o
// `null` si no hay unidad configurada.
export const tratoUnitLabel = (catalogs, u) => {
  if (u == null) return null;
  const cat = catalogs?.tratoUnits || [];
  return cat.find((e) => e.value === u)?.label || `Unidad ${u}`;
};

// Traduce un pesaje crudo de `harvestWeights` a (calidad, envase).
//
// `weightProcess` es la calidad y `weightType` el envase. El remapeo es por
// prefijo: sin `qualityMap`/`containerMap` es identidad (los catálogos usan la
// numeración del scan), y con ellos se traduce un lote de QR que use otra
// numeración. Cada pesaje se mapea con su propio prefijo, nunca con uno
// global: un mismo trabajador puede traer dos numeraciones en una consulta.
export function mapHarvestCodes(prefix, weight) {
  const x = prefix?.qualityMap?.[String(weight?.weightProcess)] ?? weight?.weightProcess;
  const y = prefix?.containerMap?.[String(weight?.weightType)] ?? weight?.weightType;
  return { x: Number(x) || 0, y: Number(y) || 0 };
}

// Inversa de mapHarvestCodes: dado un combo del CATÁLOGO (x, y), devuelve los
// códigos crudos que hay que guardar para que ese prefijo los lea como ese
// combo. Hace falta al escribir un pesaje a mano desde la app admin: el doc
// guarda la numeración del scan, no la del catálogo.
//
// Si el prefijo no tiene maps es identidad. Si los tiene y el combo elegido no
// es representable, esto devuelve el valor crudo tal cual — por eso quien llama
// SIEMPRE debe verificar el ida y vuelta con mapHarvestCodes antes de guardar.
export function invertHarvestCodes(prefix, { x, y }) {
  const inv = (map, v) => {
    if (!map) return v;
    const hit = Object.keys(map).find((k) => Number(map[k]) === Number(v));
    return hit == null ? v : Number(hit);
  };
  return {
    weightProcess: inv(prefix?.qualityMap, x),
    weightType: inv(prefix?.containerMap, y),
  };
}

export const comboLabel = (catalogs, x, y) =>
  `${qualityLabel(catalogs, x)} / ${containerLabel(catalogs, y)}`;

// Combos activos de (laborId, date), ordenados por calidad y envase:
// - una entrada plana { price, mode } se toma como el combo 0_0
// - sin entrada, o sin combos → un único 0_0 con precio 0 y el modo por defecto
export function getDayCombos(dayPrices, laborId, date, defaultMode = "unit") {
  const entry = dayPrices?.[laborId]?.[date];
  if (!entry || typeof entry !== "object") {
    return [{ key: "0_0", x: 0, y: 0, price: 0, mode: defaultMode }];
  }
  if ("price" in entry || "mode" in entry) {
    return [{
      key: "0_0", x: 0, y: 0,
      price: Number(entry.price) || 0,
      mode: entry.mode || defaultMode,
    }];
  }
  const out = [];
  for (const [k, v] of Object.entries(entry)) {
    if (!/^\d+_\d+$/.test(k)) continue;
    const { x, y } = parseComboKey(k);
    out.push({
      key: k, x, y,
      price: Number(v?.price) || 0,
      mode: v?.mode || defaultMode,
    });
  }
  if (!out.length) return [{ key: "0_0", x: 0, y: 0, price: 0, mode: defaultMode }];
  out.sort((a, b) => a.x - b.x || a.y - b.y);
  return out;
}

// Los combos guardados de (laborId, date): los de `getDayCombos` sin el 0_0
// que agrega cuando el día no tiene ninguno.
export function storedDayCombos(dayPrices, laborId, date, defaultMode = "unit") {
  const entry = dayPrices?.[laborId]?.[date];
  if (!entry || typeof entry !== "object") return [];
  const flat = "price" in entry || "mode" in entry;
  if (!flat && !Object.keys(entry).some((k) => /^\d+_\d+$/.test(k))) return [];
  return getDayCombos(dayPrices, laborId, date, defaultMode);
}

// Config de precio del día para una labor sin combos (un solo precio por día).
// Lee dayPrices[laborId][date]["0_0"] o la entrada plana { price, mode }.
export function getDaySingle(dayPrices, laborId, date, defaultMode = "unit") {
  const entry = dayPrices?.[laborId]?.[date];
  if (!entry || typeof entry !== "object") return { price: 0, mode: defaultMode };
  if ("price" in entry || "mode" in entry) {
    return { ...entry, price: Number(entry.price) || 0, mode: entry.mode || defaultMode };
  }
  const v = entry["0_0"];
  if (!v) return { price: 0, mode: defaultMode };
  return { ...v, price: Number(v.price) || 0, mode: v.mode || defaultMode };
}

export function normalizeDayPricesEntry(entry) {
  if (!entry || typeof entry !== "object") return {};
  if ("price" in entry || "mode" in entry) {
    return { "0_0": { price: Number(entry.price) || 0, mode: entry.mode || "unit" } };
  }
  return entry;
}

export const workdayDocId = (cycleId, laborId, rut, date, ck = "0_0") =>
  ck === "0_0"
    ? `${cycleId}__${laborId}__${rut}__${date}`
    : `${cycleId}__${laborId}__${rut}__${date}__${ck}`;

export const workdayMapKey = (rut, date, ck = "0_0") =>
  `${rut}__${date}__${ck}`;

// Clave de combo/tier de una jornada leída de Firestore, para armar su
// `workdayMapKey`. Sale del 5.º segmento del docId; sin él, en trato es el
// tier "t0" y en el resto el combo calidad/envase guardado en el documento.
export function workdayComboKeyOf(wd, laborType) {
  const parts = String(wd?.id || "").split("__");
  if (parts.length >= 5) return parts.slice(4).join("__");
  if (laborType === "trato") return "t0";
  return comboKey(Number(wd?.qualityX) || 0, Number(wd?.containerY) || 0);
}

// ============================================================
// Tiers de precio para labores a trato
// ============================================================

// Lleva una entrada de dayPrices al formato por tiers
// { t0: { price, mode }, t1: … }. Las entradas { price, mode } y
// { "0_0": { price, mode } } pasan a t0.
export function normalizeTratoDayPrices(entry, defaultMode = "unit") {
  if (!entry || typeof entry !== "object") return { t0: { price: 0, mode: defaultMode } };
  // Ya trae claves de tier (t0, t1…).
  if (Object.keys(entry).some((k) => k.startsWith("t") && /^\d+$/.test(k.slice(1)))) return entry;
  if ("price" in entry || "mode" in entry) {
    return { t0: { price: Number(entry.price) || 0, mode: entry.mode || defaultMode } };
  }
  const single = entry["0_0"];
  if (single) return { t0: { price: Number(single.price) || 0, mode: single.mode || defaultMode } };
  return { t0: { price: 0, mode: defaultMode } };
}

// Tiers de precio de una labor en una fecha, ordenados por índice:
// [{ key: "t0", index: 0, price, mode, unit }, …]
export function getTratoTiers(dayPrices, laborId, date, defaultMode = "unit") {
  const entry = dayPrices?.[laborId]?.[date];
  const normalized = normalizeTratoDayPrices(entry, defaultMode);
  return Object.entries(normalized)
    .filter(([k]) => k.startsWith("t") && /^\d+$/.test(k.slice(1)))
    .map(([k, v]) => ({
      key: k,
      index: Number(k.slice(1)),
      price: Number(v?.price) || 0,
      mode: v?.mode || defaultMode,
      // Unidad de medida del tier; `null` si no tiene una configurada.
      unit: v?.unit ?? null,
    }))
    .sort((a, b) => a.index - b.index);
}

// Lleva un workday de trato { qty, amount } al formato por tiers
// { tiers: { "0": { qty, amount } }, totalAmount }. Si ya trae `tiers`, lo
// devuelve tal cual.
export function normalizeTratoWorkday(wd) {
  if (!wd) return wd;
  if (wd.tiers) return wd;
  const qty = Number(wd.qty) || 0;
  const amount = Number(wd.amount) || 0;
  return { ...wd, tiers: { "0": { qty, amount } }, totalAmount: amount };
}

// formatLaborDayPrice: el precio configurado de (labor, día) en formato corto,
// tipo "$300/árbol", para mostrar bajo el encabezado de la fecha en resúmenes
// y comprobantes. En cosecha cubre los combos calidad×envase; en trato
// prioriza la `unit` del tier (Árbol/Metro/…) sobre el tratoType
// (Poda/Amarre/…). Devuelve "" si no hay precio configurado. El texto sale
// listo para pegar en la etiqueta, con "$" como único símbolo de moneda.
const _fmtMoneyShort = (v) => "$" + (Number(v) || 0).toLocaleString("es-CL");

export function formatLaborDayPrice(labor, date, dayPrices, catalogs = {}) {
  if (!labor) return "";
  if (labor.type === "cosecha") {
    const combos = getDayCombos(dayPrices, labor.id, date, "unit");
    if (!combos.length) return "";
    if (combos.length === 1) {
      const c = combos[0];
      if (!c.price) return "";
      if (c.mode === "flat") return `${_fmtMoneyShort(c.price)}/día`;
      const unit = containerLabel(catalogs, c.y).toLowerCase();
      return `${_fmtMoneyShort(c.price)}/${unit}`;
    }
    return combos
      .filter((c) => c.price)
      .map((c) => {
        const lbl = comboLabel(catalogs, c.x, c.y);
        if (c.mode === "flat") return `${lbl}: ${_fmtMoneyShort(c.price)}/día`;
        return `${lbl}: ${_fmtMoneyShort(c.price)}`;
      })
      .join(" · ");
  }
  if (labor.type === "trato") {
    const tiers = getTratoTiers(dayPrices, labor.id, date, "unit");
    const used = tiers.filter((t) => t.price);
    if (!used.length) return "";
    const unitFor = (t) => {
      const u = t.unit;
      const label = u == null ? null : tratoUnitLabel(catalogs, u);
      if (label) return label.toLowerCase();
      return tratoTypeLabel(catalogs, labor.tratoType ?? 0).toLowerCase();
    };
    if (used.length === 1) {
      const t = used[0];
      if (t.mode === "flat") return `${_fmtMoneyShort(t.price)}/día`;
      return `${_fmtMoneyShort(t.price)}/${unitFor(t)}`;
    }
    return used.map((t) => `T${t.index + 1}: ${_fmtMoneyShort(t.price)}/${unitFor(t)}`).join(" · ");
  }
  if (labor.type === "main" || labor.type === "supervision" || labor.type === "extra") {
    const cfg = getDaySingle(dayPrices, labor.id, date, "normal");
    const price = Number(cfg?.price) || Number(labor.baseDayDefault) || 0;
    if (!price) return "";
    return _fmtMoneyShort(price) + "/día";
  }
  return "";
}

// Total de qty/amount de un workday de trato.
//
// El dato está dos veces: `qty`/`amount` de primer nivel (lo que escribe el
// editor y muestra la grilla) y `tiers["0"]`, un espejo que puede quedar
// desincronizado. Manda el primer nivel, así resumen, nómina y grilla
// coinciden. `tiers` se suma solo si el doc trae más de un tier o no trae
// qty/amount de primer nivel.
export function getTratoTierTotals(wd) {
  if (!wd) return { qty: 0, amount: 0 };
  const tierKeys = wd.tiers ? Object.keys(wd.tiers) : [];
  if (tierKeys.length > 1) {
    let qty = 0, amount = 0;
    for (const t of Object.values(wd.tiers)) {
      qty += Number(t?.qty) || 0;
      amount += Number(t?.amount) || 0;
    }
    return { qty, amount };
  }
  if (wd.qty != null || wd.amount != null) {
    return { qty: Number(wd.qty) || 0, amount: Number(wd.amount) || 0 };
  }
  if (tierKeys.length === 1) {
    const t = wd.tiers[tierKeys[0]];
    return { qty: Number(t?.qty) || 0, amount: Number(t?.amount) || 0 };
  }
  return { qty: 0, amount: 0 };
}
