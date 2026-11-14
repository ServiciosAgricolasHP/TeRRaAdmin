// Portal de trabajadores: qué nóminas están publicadas y los pedidos para
// publicar o retirar una. Lo hacen las funciones `publishPortal` y
// `unpublishPortal` (functions/portal.js), que escriben una ficha por RUT y
// por nómina en `portalPayslips` y la lista de publicadas en
// `portalMeta/current`; la app no puede escribirlas (`firestore.rules`).
import { doc } from "firebase/firestore";
import { getDoc } from "./readMeter";
import { db } from "../firebase";
import { enqueueFunctionJob, waitForFunctionJob } from "./functionJobsService";
import { publishedPayrollsOf } from "../utils/portalPublished";

// Las nóminas publicadas (`publishedPayrollsOf`), o ninguna si no se pudo
// leer: es informativo y no puede trabar la pantalla.
export async function getPublishedPayrolls() {
  try {
    const snap = await getDoc(doc(db, "portalMeta", "current"));
    return publishedPayrollsOf(snap.exists() ? snap.data() : null);
  } catch {
    return [];
  }
}

// Publica una nómina, o la actualiza si ya estaba, y espera el resultado
// (`{ status, result, error, errorCode }`).
export async function publishPayrollToPortal(payrollId, user) {
  const ref = await enqueueFunctionJob("publishPortal", { payrollId }, user);
  return waitForFunctionJob(ref, { timeoutMs: 90_000 });
}

// Retira una nómina del portal y espera el resultado; las demás siguen.
export async function unpublishPayrollFromPortal(payrollId, user) {
  const ref = await enqueueFunctionJob("unpublishPortal", { payrollId }, user);
  return waitForFunctionJob(ref, { timeoutMs: 90_000 });
}
