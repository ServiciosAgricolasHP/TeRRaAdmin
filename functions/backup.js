// Respaldo en JSON de la base, sin la auditoría.
//
// Complementa el respaldo nativo diario de Firestore, que guarda 7 días y se
// restaura a una base nueva: este es un archivo que se baja y se lee, dura más
// y sirve para recuperar una colección suelta. Cada respaldo es un archivo en
// Cloud Storage (`backups/{id}.json`, guardado con gzip: se baja ya
// descomprimido) y una ficha en la colección `backups`. Se guardan los últimos
// `KEEP_BACKUPS`.
//
// Forma del archivo:
//   { format: "terra-backup", version: 1, createdAt, database, excluded,
//     collections: { <colección>: [{ id, data }] },
//     subcollections: { <grupo>: [{ path, data }] },
//     counts: { collections: { <colección>: n }, subcollections: { <grupo>: n } } }
// Los valores que JSON no tiene (fechas de Firestore, referencias, bytes,
// ubicaciones, NaN e Infinity) van como un objeto con `__type`, para poder
// restaurarlos tal cual.
import { Buffer } from "node:buffer";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { DocumentReference, FieldPath, GeoPoint, Timestamp } from "firebase-admin/firestore";

export const BACKUPS = "backups";
export const KEEP_BACKUPS = 12;
const PREFIX = "backups/";
const FORMAT = "terra-backup";

// La auditoría queda fuera: es la mayor parte de la base, crece con cada
// escritura y nada la restaura.
export const EXCLUDED_COLLECTIONS = ["logs"];

// Las subcolecciones no aparecen al listar las colecciones de la base, así que
// se respaldan por su nombre de grupo. Hoy hay una: los pesajes por fecha que
// lee la app de reportes (`weights/{fecha}/entry`, ver `firestore.rules`). Una
// subcolección nueva se suma acá.
export const SUBCOLLECTION_GROUPS = ["entry"];

// Documentos por consulta: acota la memoria aunque una colección traiga
// documentos grandes (ciclos, JSON de nóminas).
const PAGE_SIZE = 300;

// El id de un respaldo es el instante en que empezó, en UTC, escrito para que
// sirva de nombre de archivo y se ordene como texto: 2026-11-01T06-00-00-000Z.
const ID_RE = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/;

export function backupIdOf(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

const fileOf = (bucket, id) => bucket.file(`${PREFIX}${id}.json`);

function codeError(code, message) {
  const err = new Error(message);
  err.functionJobCode = code;
  return err;
}

// Un error de Cloud Storage al escribir, como uno que la Consola sabe explicar.
function storageError(err) {
  if (err?.code === 404) {
    return codeError("no-bucket", "No existe el bucket de Cloud Storage: hay que activar Storage en la consola de Firebase.");
  }
  if (err?.code === 403) {
    return codeError("storage-denied", "La cuenta de servicio de las funciones no tiene permiso para escribir en Cloud Storage.");
  }
  return err;
}

// Un valor de Firestore como JSON.
export function encodeValue(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : { __type: "number", value: String(value) };
  if (value instanceof Timestamp) {
    return { __type: "timestamp", seconds: value.seconds, nanoseconds: value.nanoseconds, iso: value.toDate().toISOString() };
  }
  if (value instanceof DocumentReference) return { __type: "reference", path: value.path };
  if (value instanceof GeoPoint) return { __type: "geopoint", latitude: value.latitude, longitude: value.longitude };
  if (value instanceof Uint8Array) return { __type: "bytes", base64: Buffer.from(value).toString("base64") };
  if (Array.isArray(value)) return value.map(encodeValue);
  if (typeof value === "object") {
    const out = {};
    for (const [key, v] of Object.entries(value)) out[key] = encodeValue(v);
    return out;
  }
  return String(value);
}

// Los documentos de una consulta, de a una página, ordenados por id para
// seguir desde el último.
async function* pagesOf(query) {
  const ordered = query.orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
  let last = null;
  for (;;) {
    const snap = await (last ? ordered.startAfter(last) : ordered).get();
    if (snap.empty) return;
    yield snap.docs;
    if (snap.size < PAGE_SIZE) return;
    last = snap.docs[snap.docs.length - 1];
  }
}

// El archivo, por partes: una colección después de otra, de a una página.
// Llena `counts` y avisa al terminar cada colección.
async function* backupJson(db, { createdAt, collections, groups, counts, onStep }) {
  const head = JSON.stringify({ format: FORMAT, version: 1, createdAt, database: db.databaseId, excluded: EXCLUDED_COLLECTIONS });
  yield head.slice(0, -1);

  const sections = [
    { key: "collections", names: collections, queryOf: (n) => db.collection(n), entryOf: (d) => ({ id: d.id, data: encodeValue(d.data()) }) },
    { key: "subcollections", names: groups, queryOf: (n) => db.collectionGroup(n), entryOf: (d) => ({ path: d.ref.path, data: encodeValue(d.data()) }) },
  ];
  const total = collections.length + groups.length;
  let step = 0;
  let docs = 0;
  for (const { key, names, queryOf, entryOf } of sections) {
    yield `,${JSON.stringify(key)}:{`;
    for (const [i, name] of names.entries()) {
      yield `${i ? "," : ""}${JSON.stringify(name)}:[`;
      let count = 0;
      for await (const page of pagesOf(queryOf(name))) {
        yield (count ? "," : "") + page.map((d) => JSON.stringify(entryOf(d))).join(",");
        count += page.length;
      }
      yield "]";
      counts[key][name] = count;
      step += 1;
      docs += count;
      await onStep?.({ step, total, collection: name, docs });
    }
    yield "}";
  }
  yield `,"counts":${JSON.stringify(counts)}}`;
}

// Genera un respaldo: el archivo, su ficha en `backups` y la limpieza de los
// más antiguos. `onProgress` recibe { step, total, collection, docs } al
// terminar cada colección.
export async function runBackup(db, bucket, { trigger, requestedBy = null, requestedByEmail = null, onProgress } = {}) {
  const started = new Date();
  const id = backupIdOf(started);
  const collections = (await db.listCollections())
    .map((c) => c.id)
    .filter((name) => !EXCLUDED_COLLECTIONS.includes(name))
    .sort();
  const groups = [...SUBCOLLECTION_GROUPS];
  const counts = { collections: {}, subcollections: {} };
  const file = fileOf(bucket, id);

  try {
    await pipeline(
      Readable.from(backupJson(db, { createdAt: started.toISOString(), collections, groups, counts, onStep: onProgress }), {
        objectMode: false,
      }),
      file.createWriteStream({
        resumable: false,
        gzip: true,
        contentType: "application/json",
        metadata: { cacheControl: "private, no-store" },
      }),
    );
  } catch (err) {
    throw storageError(err);
  }

  const [metadata] = await file.getMetadata();
  const sum = (o) => Object.values(o).reduce((s, n) => s + n, 0);
  const totalDocs = sum(counts.collections) + sum(counts.subcollections);
  const bytes = Number(metadata.size) || 0;
  await db.collection(BACKUPS).doc(id).set({
    path: file.name,
    bucket: bucket.name,
    createdAt: started.toISOString(),
    finishedAt: new Date().toISOString(),
    trigger,
    requestedBy,
    requestedByEmail,
    collections: counts.collections,
    subcollections: counts.subcollections,
    collectionCount: collections.length,
    totalDocs,
    bytes,
  });
  const pruned = await pruneBackups(db, bucket);
  return { id, path: file.name, collectionCount: collections.length, totalDocs, bytes, pruned: pruned.length };
}

// Deja los últimos `keep` respaldos: borra los archivos más antiguos y las
// fichas que quedaron sin archivo. Devuelve los ids de los archivos borrados.
export async function pruneBackups(db, bucket, keep = KEEP_BACKUPS) {
  const [files] = await bucket.getFiles({ prefix: PREFIX });
  const ids = files
    .map((f) => f.name.slice(PREFIX.length).replace(/\.json$/, ""))
    .filter((id) => ID_RE.test(id))
    .sort()
    .reverse();
  const kept = new Set(ids.slice(0, keep));
  const dropped = ids.slice(keep);
  for (const id of dropped) await fileOf(bucket, id).delete({ ignoreNotFound: true });
  const records = await db.collection(BACKUPS).get();
  await Promise.all(records.docs.filter((d) => !kept.has(d.id)).map((d) => d.ref.delete()));
  return dropped;
}

// Enlace para bajar un respaldo, que vence a los `minutes` minutos. Firmarlo
// exige que la cuenta de servicio de las funciones pueda firmar en su propio
// nombre (ver functions/README.md).
export async function backupDownloadLink(bucket, id, { minutes = 15 } = {}) {
  if (!ID_RE.test(String(id || ""))) throw codeError("invalid-params", "Respaldo desconocido.");
  const file = fileOf(bucket, id);
  const [exists] = await file.exists();
  if (!exists) throw codeError("not-found", "Ese respaldo ya no está en Cloud Storage.");
  const expires = Date.now() + minutes * 60_000;
  try {
    const [url] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires,
      responseDisposition: `attachment; filename="terra-respaldo-${id}.json"`,
    });
    return { url, expiresAt: new Date(expires).toISOString() };
  } catch (err) {
    throw codeError(
      "cannot-sign",
      "Las funciones no pueden firmar el enlace: a su cuenta de servicio le falta el rol Creador de tokens de cuenta de servicio. " +
        `(${err?.message || err})`,
    );
  }
}
