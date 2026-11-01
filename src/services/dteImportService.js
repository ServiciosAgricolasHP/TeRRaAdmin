// Persistencia del import del RCV del SII. Importar reemplaza el período: los
// documentos del ámbito que no vienen en el CSV se borran, con todo lo que se
// les cargó a mano.
import { doc, serverTimestamp } from "firebase/firestore";
import { writeBatch } from "./readMeter";
import { db } from "../firebase";
import { dteDocumentsService } from "./index";
import { mergeListItem, removeListItem } from "./cache";

// El límite de Firestore es 500 operaciones por batch.
const CHUNK = 450;

const NO_PERIOD = "__no_period__";

// Agrupa por el ámbito del "replace": (kind, periodo). El companyId es el
// mismo para todo el lote, así que no entra en la clave.
export function groupRecordsByScope(records = []) {
  const byScope = new Map();
  for (const r of records) {
    const key = `${r.kind}__${r.periodo || NO_PERIOD}`;
    if (!byScope.has(key)) byScope.set(key, { kind: r.kind, periodo: r.periodo, records: [] });
    byScope.get(key).records.push(r);
  }
  return [...byScope.values()];
}

// Los documentos que estaban en el ámbito y no vienen en el CSV nuevo. Son
// los que el replace borra.
export function findOrphans(existing = [], records = []) {
  const nuevos = new Set(records.map((r) => r.id));
  return existing.filter((e) => !nuevos.has(e.id));
}

// Escribe un ámbito completo: borra huérfanos y hace upsert del resto.
async function writeScope({ records, existingIds, orphans, uid }) {
  const writes = [
    ...orphans.map((o) => ({ op: "delete", id: o.id })),
    ...records.map((r) => ({ op: "set", record: r })),
  ];
  for (let i = 0; i < writes.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const w of writes.slice(i, i + CHUNK)) {
      if (w.op === "delete") {
        batch.delete(doc(db, "dteDocuments", w.id));
        continue;
      }
      const { id, ...rest } = w.record;
      const patch = {
        ...rest,
        importedAt: serverTimestamp(),
        importedBy: uid,
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      };
      // Reimportar no puede pisar el estado de pago que se cargó a mano; solo
      // los documentos nuevos arrancan en "unpaid".
      if (!existingIds.has(id)) patch.paymentStatus = "unpaid";
      batch.set(doc(db, "dteDocuments", id), patch, { merge: true });
    }
    await batch.commit();
  }
}

// Corrige la copia del navegador (`listDteDocuments`) con lo que escribió un
// ámbito: saca los huérfanos, así el conteo sigue calzando, y deja cada
// registro sobre lo que ya tenía el documento (su estado de pago, abonos y
// notas). La siguiente puesta al día trae lo escrito con sus horas.
function patchCopy(existing, records, orphans) {
  for (const o of orphans) removeListItem("dteDocuments", o.id);
  const existingById = new Map(existing.map((e) => [e.id, e]));
  for (const r of records) {
    mergeListItem("dteDocuments", { ...(existingById.get(r.id) || { paymentStatus: "unpaid" }), ...r });
  }
}

// Importa los registros ya parseados y con id asignado. Devuelve el conteo
// que la pantalla muestra en el toast.
export async function importDteRecords({ companyId, records = [], uid = null }) {
  if (!companyId) throw new Error("importDteRecords requiere companyId");
  let totalNew = 0;
  let totalOverwrite = 0;
  let totalDeleted = 0;

  for (const scope of groupRecordsByScope(records)) {
    const existing = await dteDocumentsService.list({
      wheres: [
        ["companyId", "==", companyId],
        ["kind", "==", scope.kind],
        ["periodo", "==", scope.periodo],
      ],
    });
    const orphans = findOrphans(existing, scope.records);
    const existingIds = new Set(existing.map((e) => e.id));

    await writeScope({ records: scope.records, existingIds, orphans, uid });
    patchCopy(existing, scope.records, orphans);

    totalDeleted += orphans.length;
    for (const r of scope.records) {
      if (existingIds.has(r.id)) totalOverwrite++;
      else totalNew++;
    }
  }

  return { totalNew, totalOverwrite, totalDeleted };
}
