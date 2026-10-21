// Ayudas que comparten las piezas de Pesajes QR: los TTL de las listas
// compartidas, el contador de lecturas, el alto de toque y las fechas de la
// sincronización.

// TTL de la lista de faenas, que esta pantalla comparte con el resto de la app,
// con el mismo valor que usan las otras pantallas (la de trabajadores sale de
// `WORKERS_LIST`). La clave de caché (`collection::{wheres,order,take}`) no
// incluye el TTL, así que el último que escribe fija el vencimiento para todos.
export const JOBS_TTL_MS = 10 * 60 * 1000;

// Contador de lecturas que ve el admin junto al título. Permite verificar que
// las listas compartidas salen de la caché ("desde caché" = 0 lecturas).
export const readsLabel = (reads) => (reads === 0 ? "· desde caché" : `· ${reads.toLocaleString("es-CL")} lecturas`);

// Alto mínimo de toque (32px) para los botones dentro de celdas y filas, sin
// agrandar la fuente ni ensanchar la columna.
export const TAP = "min-h-[32px] inline-flex items-center justify-center";

export const todayKey = () => new Date().toLocaleDateString("sv-SE");

export const daysAgoKey = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString("sv-SE");
};

// Se arma con el constructor local y no con `new Date("2026-04-19")`, que
// parsea como UTC y en Chile devuelve el día anterior. El desborde de mes lo
// resuelve el propio constructor.
const addDaysKey = (key, n) => {
  const [y, m, d] = String(key || "").split("-").map(Number);
  if (!y || !m || !d) return key;
  return new Date(y, m - 1, d + n).toLocaleDateString("sv-SE");
};

// Rango de la próxima sincronización: desde el día siguiente al último
// sincronizado, por hasta 14 días, sin pasar de hoy. Sin sincronizaciones
// previas, los últimos 14 días.
export const nextSyncRange = (lastSync) => {
  const days = lastSync?.days || [];
  const today = todayKey();
  if (days.length === 0) return { from: daysAgoKey(14), to: today };
  const lastDay = [...days].sort().at(-1);
  const from = [addDaysKey(lastDay, 1), today].sort()[0];
  const to = [addDaysKey(from, 14), today].sort()[0];
  return { from, to };
};

// El rango sincronizado se muestra en día-mes: el año se sobreentiende y así
// entra en la celda sin romper la tabla.
export const dayMonth = (iso) => {
  const [, m, d] = String(iso || "").split("-");
  return d && m ? `${d}-${m}` : null;
};

export const lastSyncLabel = (lastSync) => {
  const days = (lastSync?.days || []).map(dayMonth).filter(Boolean);
  if (days.length === 0) return null;
  if (days.length === 1) return days[0];
  if (days.length <= 3) return days.join(", ");
  return `${days[0]} al ${days[days.length - 1]} · ${days.length} días`;
};
