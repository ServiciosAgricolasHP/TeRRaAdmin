import { collection, deleteField, FieldValue, serverTimestamp } from "firebase/firestore";
import { addDoc } from "./readMeter";
import { db, auth } from "../firebase";
import { fitLog, summarizeChanges } from "../utils/logSummaries";
import { signerName } from "./signer";

const LOGS = "logs";

// Un valor especial de Firestore (borrar el campo, la hora del servidor…) no
// se puede guardar dentro de un registro: va como texto.
const loggable = (v) => {
  if (!(v instanceof FieldValue)) return v;
  return v.isEqual(deleteField()) ? "(borrado)" : "(lo calcula la base)";
};

function diff(before, after) {
  if (!before || !after) return null;
  const changes = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    const a = before[k];
    const b = after[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) changes[k] = { from: loggable(a) ?? null, to: loggable(b) ?? null };
  }
  return Object.keys(changes).length ? changes : null;
}

// Un registro por escritura. En una edición guarda solo lo que cambió, con las
// listas grandes de la nómina y su JSON resumidas (`summarizeChanges`), y
// quien firma (`userName`, su alias o su correo). Si igual no cabe en el
// límite de Firestore, queda sin el detalle (`fitLog`).
export async function logAction({ action, entity, entityId, before = null, after = null, meta = null }) {
  try {
    const user = auth.currentUser;
    const log = fitLog({
      uid: user?.uid || null,
      email: user?.email || null,
      userName: signerName(),
      action,
      entity,
      entityId: entityId || null,
      changes: action === "update" ? summarizeChanges(entity, diff(before, after)) : null,
      before: action === "delete" ? before : null,
      after: action === "create" ? after : null,
      meta,
    });
    await addDoc(collection(db, LOGS), { ...log, timestamp: serverTimestamp() });
  } catch (err) {
    console.error("logAction failed", err);
  }
}
