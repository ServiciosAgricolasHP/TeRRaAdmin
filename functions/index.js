// Cloud Functions for TeRRaAdmin.
//
// El backend se invoca **escribiendo un documento**, no llamando un endpoint.
// `functionJobs/{jobId}` es la cola: la app crea un job, esta función lo toma,
// lo ejecuta y escribe el resultado en el mismo documento. La UI mira el doc
// con un listener y ve el progreso.
//
// === Por qué así, y no un callable ===
//
// Las tres alternativas obvias están todas cerradas, y conviene dejar escrito
// el porqué para no volver a intentarlas:
//
//   1. **Callable v2**: corre sobre Cloud Run y para que el navegador la invoque
//      necesita un binding IAM `allUsers`. La org policy del proyecto GCP
//      prohíbe acceso público, así que una v2 desplegada devuelve 403 con cuerpo
//      HTML antes de llegar al código. Verificado con curl contra el endpoint.
//   2. **Callable v1**: Cloud Functions 1ª gen **no existe en
//      `southamerica-west1`**: Santiago no está entre sus 23 regiones, y encima
//      esa región tampoco soporta App Engine, que gen1 necesita para el bucket
//      de staging. El deploy falla con un 403 sobre
//      `locations/southamerica-west1` que termina en "or it may not exist" —
//      hay que leerlo por esa segunda mitad.
//   3. **Trigger de Firestore en v1**: solo dispara sobre la base `(default)`,
//      y este proyecto tiene una sola base y se llama `hpdatabase`.
//
// Lo que sí funciona: un trigger de Firestore en v2. Eventarc lo invoca con una
// service account, así que **no necesita el invoker público** que la org policy
// bloquea. Es el único camino que no pelea contra una restricción de plataforma.
//
// === La autorización se mudó a las reglas ===
//
// Con un callable el portero era `context.auth` dentro de la función. Acá el
// portero es la regla de Firestore que decide quién puede crear un doc en
// `functionJobs` — o sea el mismo lugar donde ya vive la autorización del resto
// de la app. La función confía en que si el doc existe, alguien con permiso lo
// creó. Las reglas viven solo en la consola de Firebase (ver AGENTS.md → Tests),
// así que ese permiso hay que configurarlo a mano; está anotado en el README.

import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

// La base NO se llama `(default)`: es `hpdatabase`. Sin esto el trigger se
// suscribe a una base que no existe y nunca dispara — falla en silencio, que es
// la peor forma de fallar.
const DATABASE = "hpdatabase";

// `hpdatabase` está en **`nam5`**, el multi-región de Estados Unidos. No en
// Chile, aunque la empresa lo esté. Un trigger de Firestore tiene que vivir en
// la ubicación de la base, y `nam5` son us-central1 + us-central2.
//
// O sea que poner la función en Santiago no habría acercado nada: los datos
// nunca estuvieron ahí. Acá queda pegada a la base, que es lo que importa
// cuando una función lee decenas de miles de documentos.
const REGION = "us-central1";

initializeApp();
const db = getFirestore(DATABASE);

const JOBS = "functionJobs";

// ── Handlers ────────────────────────────────────────────────────────────────
// Cada uno recibe el job y devuelve lo que va al campo `result`. Si lanza, el
// job queda en `error` con el mensaje.

const handlers = {
  // Verifica el plomo: que la función exista, que haya disparado, que esté en
  // la región correcta y suscrita a la base correcta. Reemplaza al viejo
  // callable `ping`.
  //
  // Ojo con qué prueba y qué no: `requestedBy` sale del documento, que lo
  // escribió el cliente, así que no es una prueba de identidad — es la regla de
  // Firestore la que decide quién pudo crear el job. Lo que sí prueba es el
  // camino completo, que es lo que estaba roto.
  async ping(job) {
    return {
      ok: true,
      region: REGION,
      database: DATABASE,
      gen: 2,
      requestedBy: job.requestedBy || null,
      serverTime: new Date().toISOString(),
    };
  },
};

export const runFunctionJob = onDocumentCreated(
  {
    document: JOBS + "/{jobId}",
    database: DATABASE,
    region: REGION,
    memory: "256MiB",
    timeoutSeconds: 120,
    // Sin reintento automático: un job que falló se vuelve a pedir a mano desde
    // la Consola. Reintentar solo es seguro cuando la operación es idempotente,
    // y eso hay que decidirlo por handler, no de entrada para todos.
    retry: false,
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const ref = snap.ref;
    const jobId = event.params.jobId;

    // Eventarc entrega **al menos una vez**: el mismo job puede llegar dos
    // veces. Reclamarlo en una transacción es lo que separa "un backup" de
    // "dos backups". El snapshot del evento siempre viene `pending` (es el doc
    // recién creado), así que mirarlo a él no sirve — hay que leer el vivo.
    const job = await db.runTransaction(async (tx) => {
      const actual = await tx.get(ref);
      const data = actual.data();
      if (!data || data.status !== "pending") return null;
      tx.update(ref, { status: "running", startedAt: FieldValue.serverTimestamp() });
      return data;
    });

    if (!job) {
      logger.info("job " + jobId + " ya fue tomado, se ignora esta entrega");
      return;
    }

    const handler = handlers[job.type];
    if (!handler) {
      await ref.update({
        status: "error",
        error: "Tipo de job desconocido: " + job.type,
        finishedAt: FieldValue.serverTimestamp(),
      });
      return;
    }

    try {
      const result = await handler(job);
      // Esto es un `update`, y el trigger es `onDocumentCreated`: no se
      // redispara. Si algún día se pasa a `onDocumentWritten` hay que agregar
      // un corte explícito o el job entra en bucle.
      await ref.update({
        status: "done",
        result,
        finishedAt: FieldValue.serverTimestamp(),
      });
    } catch (err) {
      logger.error("job " + jobId + " (" + job.type + ") falló", err);
      await ref.update({
        status: "error",
        error: (err && err.message) || String(err),
        finishedAt: FieldValue.serverTimestamp(),
      });
    }
  },
);

// TODO: backup manual en JSON — sumar `backup` a `handlers`.
//
// Complementa al backup nativo de Firestore (schedule diario, retención 7d,
// creado vía `firebase firestore:backups:schedules:create` — sin código, sin
// bucket propio). Ese backup nativo cubre "restaurar la base completa a un
// punto anterior" pero NO es legible/inspeccionable ni permite restaurar una
// sola colección.
//
// El handler:
//   - Lee cada colección con el admin SDK (ver createService/firestoreBase.js
//     en src/services para la lista: faenas, subfaenas, cycles, worker,
//     workdays, groupLeader, payrollSnapshots, interestLinks, companies,
//     dteDocuments, contactCards, indicators, advances, carriers, payrolls,
//     transports, transportPayments, transportPayrolls — dejar fuera `logs`,
//     es auditoría, no data operativa).
//   - Serializa Timestamps a ISO string (y de vuelta con Timestamp.fromDate()
//     al restaurar).
//   - Sube el JSON a Cloud Storage con nombre timestamped y deja la URL en
//     `result`, en vez de devolverlo entero (son ~68k documentos).
//   - Va escribiendo progreso en el propio doc del job: la UI ya lo está
//     mirando, así que una colección terminada es un campo más. Es lo que este
//     patrón da gratis y un callable no.
//   - El restore se hace colección por colección (acción de admin normal, con
//     confirmación) — nunca "restaurar todo" de un clic.
//
// Antes de subirlo: sumarle sus chequeos a `functions/verify.mjs`.
