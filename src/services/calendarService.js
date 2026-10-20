// Lecturas del Calendario: las jornadas y las vueltas de un rango de fechas.
import { getDocs, query, collection, where } from "firebase/firestore";
import { db } from "../firebase";

// Trae los workdays del rango: una lectura por workday. Es el único punto de
// la pantalla que lee workdays.
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
