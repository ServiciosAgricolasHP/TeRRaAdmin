// Las jornadas de un rango de fechas, leídas enteras: una lectura por jornada.
// La usan las listas de honorarios y de imposiciones; el Calendario lee los
// meses de su copia (services/workdayMonths.js).
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
