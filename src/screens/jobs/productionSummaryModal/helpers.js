// Ayudas que comparten las piezas del resumen de producción: formatos de
// número y las opciones guardadas en localStorage.

export const fmtNum = (v) =>
  new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 }).format(Number(v) || 0);

// Las opciones del modal (filtros, % de ganancia, "pagan $", IVA, etc.) se
// guardan en localStorage. Las de cada labor (pctOverrides/paidToUs/
// workersPaid) van por colKey = cycleId__laborId, que es estable en el tiempo.
const LS_PREFIX = "productionSummary.";

export const loadJSON = (key, fallback) => {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw != null ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
};

export const saveJSON = (key, value) => {
  try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(value)); } catch { /* noop */ }
};
