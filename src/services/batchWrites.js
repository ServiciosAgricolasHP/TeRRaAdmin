import { writeBatch } from "./readMeter";
import { db } from "../firebase";

const CHUNK = 450;

// Aplica escrituras en lotes de 450 (el límite de Firestore es 500). Cada
// escritura es una función que recibe el lote (`(batch) => batch.set(…)`).
// Después de cada lote llama a `onProgress` con cuántas van. Una función que
// hace más de una operación (escribir una y borrar otra, juntas en el mismo
// lote) pide un lote más chico con `size`.
export async function commitInChunks(writes, onProgress, size = CHUNK) {
  for (let i = 0; i < writes.length; i += size) {
    const chunk = writes.slice(i, i + size);
    const batch = writeBatch(db);
    for (const w of chunk) w(batch);
    await batch.commit();
    onProgress?.(i + chunk.length);
  }
}
