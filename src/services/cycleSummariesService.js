import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "../firebase";

// Estado editable del "Resumen ciclo" (tarifas de cobro, overrides por fila,
// descuentos, títulos personalizados). Doc id = cycleId, un doc por ciclo.
// Vive fuera de `cycles/{id}` y se lee suelto, solo al abrir el modal: así sus
// varios KB no pesan en los listados de ciclos.
//
// No pasa por `createService()`: se guarda con debounce mientras se tipea, así
// que no deja log de auditoría ni invalida la caché. Quién lo tocó por última
// vez queda en updatedBy/updatedByEmail y se muestra en el modal.
const ref = (cycleId) => doc(db, "cycleSummaries", cycleId);

export const cycleSummariesService = {
  async get(cycleId) {
    if (!cycleId) return null;
    const snap = await getDoc(ref(cycleId));
    return snap.exists() ? snap.data() : null;
  },
  async save(cycleId, patch) {
    if (!cycleId) return;
    await setDoc(
      ref(cycleId),
      {
        ...patch,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid || null,
        updatedByEmail: auth.currentUser?.email || null,
      },
      { merge: true },
    );
  },
};
