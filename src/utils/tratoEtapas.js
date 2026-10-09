// Helpers del tipo de labor "tratoEtapas" (trato por etapas).
//
// Una labor por etapas define una lista fija de etapas (nombre y si cuenta en
// las unidades). El PRECIO de cada etapa varía por día, igual que en trato, y
// se configura en la barra de precios por día. Ejemplo (carpas):
//   stages: [
//     { id, name: "Preparación", counts: false },
//     { id, name: "Instalación", counts: true  },
//     { id, name: "Completo",    counts: true  },
//   ]
//   dayPrices[laborId][date] = { [stageId]: { price, mode } }   // "unit" | "flat"
//
// Las dos sumas viven aquí, para que todas las vistas cuenten igual:
//   • PAGO      = Σ (qty × precio del día) de TODAS las etapas.
//   • UNIDADES  = Σ qty solo de las etapas con `counts === true`.
//
// Preparación paga pero no suma unidades; instalación y completo sí. Cada
// unidad física se carga una sola vez (por etapas o como completo), así que no
// hay doble conteo.

export function newStageId() {
  // Id único (Date.now + random). Se llama desde handlers (agregar etapa,
  // abrir modal), no en render, para que el id quede estable.
  return `st_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function defaultStages() {
  return [
    { id: newStageId(), name: "Preparación", counts: false },
    { id: newStageId(), name: "Instalación", counts: true },
  ];
}

// Normaliza la lista de etapas: les da id a las que no tienen, descarta las
// que no tienen nombre y, si ninguna tiene `counts`, marca la última: siempre
// cuenta al menos una.
export function normalizeStages(stages) {
  const list = (Array.isArray(stages) ? stages : [])
    .map((s) => ({
      id: s.id || newStageId(),
      name: String(s.name || "").trim(),
      counts: !!s.counts,
    }))
    .filter((s) => s.name);
  if (list.length > 0 && !list.some((s) => s.counts)) {
    list[list.length - 1].counts = true;
  }
  return list;
}

export function stageById(labor, stageId) {
  const stages = Array.isArray(labor?.stages) ? labor.stages : [];
  return stages.find((s) => String(s.id) === String(stageId)) || null;
}

export function countingStageIds(labor) {
  const stages = Array.isArray(labor?.stages) ? labor.stages : [];
  return new Set(stages.filter((s) => s.counts).map((s) => String(s.id)));
}

// Precio configurado de una etapa en un día. Devuelve { price, mode }.
export function getStageDayPrice(dayPrices, laborId, date, stageId) {
  const entry = dayPrices?.[laborId]?.[date]?.[stageId];
  return { price: Number(entry?.price) || 0, mode: entry?.mode === "flat" ? "flat" : "unit" };
}

// Monto de un día para una etapa: qty × precio (o precio fijo si mode === flat).
export function computeStageDayAmount(mode, price, qty) {
  const q = Number(qty) || 0;
  const p = Number(price) || 0;
  if (mode === "flat") return q > 0 ? p : 0;
  return q * p;
}

// Etapas de un día con su precio/modo resueltos: [{ id, name, counts, price, mode }].
// El orden respeta el de las etapas de la labor.
export function getDayStages(labor, dayPrices, date) {
  const stages = normalizeStages(labor?.stages);
  return stages.map((s) => {
    const p = getStageDayPrice(dayPrices, labor.id, date, s.id);
    return { ...s, price: p.price, mode: p.mode };
  });
}

// Totales de un conjunto de workdays de una labor por etapas.
// `workdays`: array de workday docs (con `stageId`, `qty`, `amount`).
// Devuelve { pago, unidades }.
export function getEtapasTotals(labor, workdays) {
  const counting = countingStageIds(labor);
  let pago = 0;
  let unidades = 0;
  for (const wd of workdays || []) {
    pago += Number(wd?.amount) || 0;
    if (counting.has(String(wd?.stageId ?? ""))) {
      unidades += Number(wd?.qty) || 0;
    }
  }
  return { pago, unidades };
}

// Metadatos de una etapa para mostrarla en un desglose: nombre, si cuenta para
// el conteo de la empresa y su posición según la definición de la labor (no
// según el orden en que aparezcan los workdays). La usan los tres desgloses
// —resumen del trabajador, detalle de pago y grilla del ciclo— para que
// muestren lo mismo.
export function describeStage(labor, stageId, orden = null) {
  const sid = String(stageId ?? "");
  const lista = orden || normalizeStages(labor?.stages).map((st) => String(st.id));
  const st = stageById(labor, sid);
  return {
    stageId: sid,
    name: st?.name || "Etapa",
    // Una etapa que no está en la definición cuenta: es producción real que
    // quedó huérfana.
    counts: st ? !!st.counts : true,
    order: lista.indexOf(sid),
  };
}

// Etiqueta visible de una etapa en las vistas del trabajador: resumen de
// producción, comprobante de efectivo y detalle de pago.
//
// Va SOLO el nombre, sin "(no cuenta)": `counts` es una distinción de
// facturación de la empresa, y al lado de la producción de alguien se lee como
// que su trabajo no vale. Ese rótulo va solo en las vistas de la empresa: el
// resumen por faena de `CycleSummaryModal` y el tooltip de la grilla del ciclo.
export function stageTag(etapa) {
  if (!etapa) return "";
  return etapa.name || "Etapa";
}
