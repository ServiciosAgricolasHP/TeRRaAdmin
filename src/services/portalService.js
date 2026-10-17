// Portal de trabajadores: qué nómina está publicada y el pedido para publicar
// otra. Publicar lo hace la función `publishPortal` (functions/portal.js), que
// escribe una ficha por RUT en `portalPayslips` y la cabecera en
// `portalMeta/current`; la app no puede escribirlas (`firestore.rules`).
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { enqueueJob, waitForJob } from "./functionJobsService";

// La cabecera de la nómina publicada, o `null` si no hay ninguna o no se pudo
// leer: es informativa y no puede trabar la pantalla.
export async function getPublishedPortal() {
  try {
    const snap = await getDoc(doc(db, "portalMeta", "current"));
    return snap.exists() ? snap.data() : null;
  } catch {
    return null;
  }
}

// Publica una nómina y espera el resultado (`{ status, result, error, errorCode }`).
export async function publishPayrollToPortal(payrollId, user) {
  const ref = await enqueueJob("publishPortal", { payrollId }, user);
  return waitForJob(ref, { timeoutMs: 90_000 });
}
