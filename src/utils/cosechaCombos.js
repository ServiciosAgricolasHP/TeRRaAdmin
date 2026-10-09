// Combo = (calidad, envase). Se guarda con claves `${qualityX}_${containerY}`.
// Los catálogos vienen de la colección global de catálogos (vía CatalogsContext).

export const COSECHA_MODES = [
  { value: "unit", label: "Por unidad (qty × precio/día)" },
  { value: "flat", label: "Por día fijo (mismo monto, qty informativo)" },
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

export const getDayPiso = (dayPrices, laborId, date) => {
  const entry = dayPrices?.[laborId]?.[date];
  if (!entry || typeof entry !== "object") return null;
  const raw = entry.piso;
  return raw == null ? null : Number(raw) || 0;
};

export const effectivePiso = (labor, dayPrices, date) =>
  Number(getDayPiso(dayPrices, labor?.id, date)) || 0;

// A quiénes les toca el piso de un día: los que tienen producción cargada y
// no tienen el bono. Lo usa el botón "a todos" del panel de Precios.
//
// "Tiene producción" usa la misma regla que habilita el toggle de la columna
// del piso en la grilla: alcanza con que exista el workday, sin mirar `qty`
// ni `amount` (un día en cero es justo el caso que el piso compensa). Con el
// mismo criterio, el botón equivale a apretar todos los toggles habilitados.
export function pisoTargets(workdaysOfLabor, date) {
  const conProduccion = new Set();
  const yaTienen = new Set();
  for (const [key, wd] of Object.entries(workdaysOfLabor || {})) {
    if (!wd || !wd.workerRut || wd.date !== date) continue;
    // Un piso sin `pisoOnly` se reconoce por la clave del mapa.
    if (wd.pisoOnly || String(key).endsWith(`__${PISO_COMBO_KEY}`)) yaTienen.add(wd.workerRut);
    else conProduccion.add(wd.workerRut);
  }
  return [...conProduccion].filter((rut) => !yaTienen.has(rut)).sort();
}

// Los bonos de piso ya asignados en un día, separados según si una nómina se
// los llevó (`payrollId`). Lo usa el ✕ del panel de Precios: quitar el piso
// del día se lleva también los bonos `libres`.
//
// Los `liquidados` no se tocan: borrar un workday que una nómina referencia le
// descuadra el total a algo que ya se pagó.
export function pisoAssigned(workdaysOfLabor, date) {
  const libres = [];
  const liquidados = [];
  for (const [key, wd] of Object.entries(workdaysOfLabor || {})) {
    if (!wd || !wd.workerRut || wd.date !== date) continue;
    if (!wd.pisoOnly && !String(key).endsWith(`__${PISO_COMBO_KEY}`)) continue;
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
