import { collection, doc, query, serverTimestamp, Timestamp, where } from "firebase/firestore";
import { db, auth } from "../firebase";
import { getDocs, setDoc } from "./readMeter";

// Las jornadas eliminadas dejan una marca en `workdayDeletions/{id de la
// jornada}`, con la hora. Las copias de jornadas del navegador (Nómina por
// ciclo, services/workdayCycles.js, y el Calendario por mes,
// services/workdayMonths.js) se ponen al día con lo que cambió (`updatedAt`),
// y una jornada eliminada no aparece ahí: la marca les dice qué sacar, sin
// releer el ciclo o el mes entero. El conteo de cada copia sigue como red de
// seguridad, por si un camino elimina sin dejar marca.
//
// Las marcas vencen a los `KEEP_DAYS` días (`expiresAt`, para una política TTL
// de Firestore): las copias se releen enteras una vez por semana.

export const WORKDAY_DELETIONS = "workdayDeletions";
const KEEP_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const markerRef = (id) => doc(db, WORKDAY_DELETIONS, id);

function marker() {
  return {
    deletedAt: serverTimestamp(),
    deletedBy: auth.currentUser?.uid || null,
    expiresAt: Timestamp.fromMillis(Date.now() + KEEP_DAYS * DAY_MS),
  };
}

// Elimina la jornada y deja su marca en el mismo lote: dos operaciones.
export function deleteWorkdayInBatch(batch, id) {
  batch.delete(doc(db, "workdays", id));
  batch.set(markerRef(id), marker());
}

// La marca de una jornada que ya se eliminó por fuera de un lote.
export function markWorkdayDeleted(id) {
  return setDoc(markerRef(id), marker());
}

// Las jornadas eliminadas desde `since` (un Timestamp, sin incluirlo): su id
// y su hora (`deletedAt`), con la que se mueve la marca de la copia.
export async function deletedWorkdaysSince(since) {
  const snap = await getDocs(query(collection(db, WORKDAY_DELETIONS), where("deletedAt", ">", since)));
  return snap.docs.map((d) => ({ id: d.id, deletedAt: d.data().deletedAt }));
}
