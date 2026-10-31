import { doc, collection, serverTimestamp } from "firebase/firestore";
import { writeBatch } from "./readMeter";
import { db, auth } from "../firebase";
import { createService } from "./firestoreBase";
import { mergeListItem } from "./cache";
import { logAction } from "./logger";
import { phoneContactFields } from "../utils/phoneBook";

// Agenda telefónica (`phoneContacts`). Las altas, ediciones y borrados de a
// uno pasan por el servicio común; la importación escribe en lotes.

const COLLECTION = "phoneContacts";

export const phoneContactsService = createService("phoneContact", COLLECTION);

// La agenda completa, cacheada 2 horas también en `localStorage`: son cerca
// de 1.200 lecturas la primera vez. Las escrituras la actualizan en su lugar
// (`additive`).
export const PHONE_CONTACTS_LIST = { cache: true, persist: true, ttl: 2 * 60 * 60 * 1000 };

export const listPhoneContacts = () => phoneContactsService.list(PHONE_CONTACTS_LIST);

const CHUNK = 450;

// Escribe un plan de `planPhoneBookImport` (`utils/phoneBook.js`): crea los
// contactos nuevos y reescribe los que se actualizan, en lotes de 450. Deja
// un solo registro de auditoría para toda la importación, con los conteos y
// los archivos, en vez de uno por contacto. Devuelve los contactos escritos,
// con su id, para que la pantalla los muestre sin releer la agenda.
export async function importPhoneContacts(plan, { files = [] } = {}) {
  const uid = auth.currentUser?.uid || null;
  const writes = [
    ...plan.create.map(({ contact }) => ({ ref: doc(collection(db, COLLECTION)), contact: phoneContactFields(contact), isNew: true })),
    ...plan.update.map(({ id, contact }) => ({ ref: doc(db, COLLECTION, id), contact: phoneContactFields(contact), isNew: false })),
  ];
  for (let i = 0; i < writes.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const w of writes.slice(i, i + CHUNK)) {
      const stamp = { updatedAt: serverTimestamp(), updatedBy: uid };
      if (w.isNew) batch.set(w.ref, { ...w.contact, createdAt: serverTimestamp(), createdBy: uid, ...stamp });
      else batch.update(w.ref, { ...w.contact, ...stamp });
    }
    await batch.commit();
  }
  const saved = writes.map((w) => ({ id: w.ref.id, ...w.contact }));
  for (const c of saved) mergeListItem(COLLECTION, c);
  const sources = [...new Set(writes.flatMap((w) => w.contact.sources))];
  await logAction({
    action: "import",
    entity: "phoneContact",
    entityId: null,
    meta: { created: plan.create.length, updated: plan.update.length, unchanged: plan.unchanged, sources, files },
  });
  return { created: plan.create.length, updated: plan.update.length, saved };
}
