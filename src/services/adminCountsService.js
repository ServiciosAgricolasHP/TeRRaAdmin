// Recuentos de la Consola admin con `getCountFromServer`, que cuesta ~1 lectura
// por cada 1.000 documentos contados.
import { getCountFromServer, collection, query, where } from "firebase/firestore";
import { db } from "../firebase";

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
  const corte = new Date();
  corte.setMonth(corte.getMonth() - months);
  const q = query(collection(db, "logs"), where("timestamp", "<", corte));
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

export async function countWorkdaysByCycle(cycleId) {
  const q = query(collection(db, "workdays"), where("cycleId", "==", cycleId));
  const snap = await getCountFromServer(q);
  return snap.data().count;
}
