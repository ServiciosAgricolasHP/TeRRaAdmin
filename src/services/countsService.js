// Recuentos con `getCountFromServer`, que cuesta ~1 lectura por cada 1.000
// documentos contados. Los usan la Consola admin y el Dashboard.
import { collection, query, where } from "firebase/firestore";
import { getCountFromServer } from "./readMeter";
import { db } from "../firebase";
import { readStoredJson, writeStoredJson } from "../utils/browserStorage";
import { localIsoDate } from "../utils/dates";
import { monthRangeOfKey, workdayMonthsToCount } from "../utils/dashboard";

const WORKDAY_COUNTS_KEY = "workdayMonthCounts";
// Un conteo cobra una lectura por cada 1.000 documentos contados.
const COUNT_BATCH = 1000;

export async function countCollection(collName) {
  const snap = await getCountFromServer(collection(db, collName));
  return snap.data().count;
}

export async function countLogsByEntity(entity) {
  const q = query(collection(db, "logs"), where("entity", "==", entity));
  const snap = await getCountFromServer(q);
  return snap.data().count;
}

export async function countLogsOlderThan(months) {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const q = query(collection(db, "logs"), where("timestamp", "<", cutoff));
  const snap = await getCountFromServer(q);
  return snap.data().count;
}

export async function countWorkdaysInRange(from, to) {
  const q = query(
    collection(db, "workdays"),
    where("date", ">=", from),
    where("date", "<=", to),
  );
  const snap = await getCountFromServer(q);
  return snap.data().count;
}

// Las jornadas de cada mes de `keys` (`YYYY-MM`) y cuántas lecturas costó. El
// mes actual y el anterior se cuentan cada vez; los más viejos se guardan en
// el navegador una semana (`workdayMonthsToCount`).
export async function countWorkdaysByMonth(keys) {
  const today = localIsoDate();
  const saved = readStoredJson(WORKDAY_COUNTS_KEY, {}) || {};
  const pending = workdayMonthsToCount(keys, saved, today);
  const counted = await Promise.all(
    pending.map((k) => {
      const { start, end } = monthRangeOfKey(k);
      return countWorkdaysInRange(start, end);
    }),
  );
  const next = {};
  for (const k of keys) if (saved[k]) next[k] = saved[k];
  pending.forEach((k, i) => {
    next[k] = { count: counted[i], date: today };
  });
  writeStoredJson(WORKDAY_COUNTS_KEY, next);
  return {
    counts: keys.map((k) => next[k].count),
    reads: counted.reduce((sum, c) => sum + Math.max(1, Math.ceil(c / COUNT_BATCH)), 0),
  };
}

export async function countWorkdaysByCycle(cycleId) {
  const q = query(collection(db, "workdays"), where("cycleId", "==", cycleId));
  const snap = await getCountFromServer(q);
  return snap.data().count;
}
