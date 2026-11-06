import { doc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "../firebase";
import { commitInChunks } from "./batchWrites";
import { mergeListItem } from "./cache";
import { logAction } from "./logger";

// Cambia el estado de pago de varios documentos del RCV de una vez, como
// "✓ Septiembre pagado" en la pestaña Pendientes. Escribe en lotes
// (`commitInChunks`): cada documento cuesta su escritura, sin la lectura y el
// registro de auditoría de `dteDocumentsService`, y la acción deja un solo
// registro con los documentos y el estado que tenía cada uno. Pone
// `updatedAt`, que pone al día la lista de los demás equipos, y corrige en su
// lugar la de este (`listDteDocuments`).
export async function setPaymentStatusMany(dteDocs, status) {
  if (!dteDocs?.length) return;
  const uid = auth.currentUser?.uid || null;
  const patch = {
    paymentStatus: status,
    paymentStatusSetAt: serverTimestamp(),
    paymentStatusSetBy: uid,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  };
  await commitInChunks(dteDocs.map((d) => (batch) => batch.update(doc(db, "dteDocuments", d.id), patch)));
  for (const d of dteDocs) mergeListItem("dteDocuments", { ...d, paymentStatus: status });
  await logAction({
    action: "paymentStatusBatch",
    entity: "dteDocument",
    entityId: null,
    meta: {
      status,
      count: dteDocs.length,
      docs: dteDocs.map((d) => ({ id: d.id, folio: d.folio ?? null, before: d.paymentStatus || "unpaid" })),
    },
  });
}
