// Lecturas por rango de fechas: las jornadas, enteras (una lectura por
// jornada), que usan las listas de honorarios y de imposiciones, y las vueltas
// del mes del Calendario, que lee las jornadas de su copia
// (services/workdayMonths.js).
import { query, collection, where } from "firebase/firestore";
import { getDocs } from "./readMeter";
import { db } from "../firebase";

export async function fetchWorkdaysInRange(start, end) {
  const snap = await getDocs(
    query(
      collection(db, "workdays"),
      where("date", ">=", start),
      where("date", "<=", end),
    ),
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function fetchTripsInRange(start, end) {
  const snap = await getDocs(
    query(
      collection(db, "transports"),
      where("date", ">=", start),
      where("date", "<=", end),
    ),
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
