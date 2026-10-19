// Espejo en localStorage del resumen del ciclo.
//
// La fuente de verdad del estado editable del resumen es Firestore
// (`cycleSummariesService`), compartido entre usuarios y navegadores.
// localStorage es un espejo local: respaldo si falla la red y origen de la
// migración cuando el ciclo no tiene doc en Firestore.

export const chargeStorageKey = (cycleId) => `cobrar_${cycleId}`;

export const titlesStorageKey = (cycleId) => `summary_titles_${cycleId}`;

export const loadJSON = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
};

export const saveJSON = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (err) { console.error(err); }
};
