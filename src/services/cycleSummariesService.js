import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "../firebase";

// Estado editable del "Resumen ciclo" (tarifas de cobro, overrides por fila,
// descuentos, títulos personalizados). Doc id = cycleId, un doc por ciclo.
//
// Colección aparte y no un campo dentro de `cycles/{id}` porque los docs de
// `cycles` se traen enteros en los listados (`cyclesService.list`) y este blob
// —overrides por labor × fecha— pesa varios KB por ciclo. Acá se lee un doc
// suelto, solo al abrir el modal.
//
// Escrito a mano en vez de `createService()`: ese factory emite un `logAction`
// y invalida la caché del scope en cada escritura, y como el guardado es
// debounced mientras se tipea, serían decenas de filas de auditoría por sesión
// con diffs de objetos anidados. La trazabilidad que sí importa acá es "quién
// lo tocó por última vez", que guardamos en updatedBy/updatedByEmail y se
// muestra en el modal.
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
