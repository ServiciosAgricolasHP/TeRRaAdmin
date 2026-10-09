// Cloud Functions de TeRRaAdmin.
//
// El backend se invoca **escribiendo un documento**, no llamando un endpoint.
// `functionJobs/{jobId}` es la cola: la app crea un job, esta función lo toma,
// lo ejecuta y escribe el resultado en el mismo documento. La UI mira el doc
// con un listener y ve el progreso.
//
// Es un trigger de Firestore v2: Eventarc lo invoca con una service account,
// sin el invoker público que la org policy del proyecto prohíbe y que una
// callable necesitaría. Las restricciones de plataforma están en AGENTS.md
// (Despliegue).
//
// === Autorización ===
//
// La decide la regla de Firestore sobre quién puede crear un doc en
// `functionJobs` (`firestore.rules`, en la raíz del repo, con sus tests). La
// función da por hecho que, si el doc existe, alguien con permiso lo creó; un
// handler que necesita más (createUser) vuelve a comprobarlo.

import { randomBytes } from "node:crypto";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

// La base NO se llama `(default)`: es `hpdatabase`. Un trigger que no la
// declara queda suscrito a una base que no existe y nunca dispara, sin dar
// error.
const DATABASE = "hpdatabase";

// Región us-central1: un trigger de Firestore vive en la ubicación de la base,
// y `hpdatabase` está en `nam5`, el multi-región de Estados Unidos
// (us-central1 + us-central2). Así la función queda pegada a los datos que lee.
const REGION = "us-central1";

initializeApp();
const db = getFirestore(DATABASE);

const JOBS = "functionJobs";
const USERS = "users";
const LOGS = "logs";

const ROLES = ["admin", "user"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Error con un código que la app reconoce: va al campo `errorCode` del job.
function jobError(code, message) {
  const err = new Error(message);
  err.jobCode = code;
  return err;
}

// Lanza si `uid` no es un admin con acceso.
async function assertAdmin(uid) {
  const snap = uid ? await db.collection(USERS).doc(uid).get() : null;
  const profile = snap?.exists ? snap.data() : null;
  const isAdmin =
    profile && profile.disabled !== true && String(profile.role || "").toLowerCase() === "admin";
  if (!isAdmin) throw jobError("not-admin", "Solo un admin puede crear cuentas.");
}

// Correo en minúsculas, rol de `ROLES` y alias de hasta 40 caracteres.
function parseNewAccount(params) {
  const email = String(params?.email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw jobError("invalid-email", "El correo no es válido.");
  const role = String(params?.role || "user");
  if (!ROLES.includes(role)) throw jobError("invalid-role", "Rol desconocido: " + role);
  const alias = String(params?.alias || "").trim().slice(0, 40);
  return { email, role, alias };
}

// ── Handlers ────────────────────────────────────────────────────────────────
// Cada uno recibe el job y `{ jobId }`, y devuelve lo que va al campo `result`.
// Si lanza, el job queda en `error` con el mensaje, y con `errorCode` si el
// error viene de `jobError`.

const handlers = {
  // Prueba el camino completo: que la función exista, que haya disparado, que
  // esté en la región correcta y suscrita a la base correcta.
  //
  // `requestedBy` sale del documento: que sea el uid de quien lo creó lo
  // garantiza la regla de Firestore, no esta función.
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

  // Crea la cuenta en Authentication y su perfil en `users/{uid}` con el mismo
  // UID, y lo registra en `logs`. La contraseña es aleatoria y no se guarda: la
  // persona elige la suya con el correo de restablecimiento que envía la app.
  // Un correo que ya tiene cuenta recibe acceso solo con `params.useExisting`.
  async createUser(job, { jobId }) {
    await assertAdmin(job.requestedBy);
    const { email, role, alias } = parseNewAccount(job.params);
    const auth = getAuth();

    const existing = await auth.getUserByEmail(email).catch((err) => {
      if (err?.code === "auth/user-not-found") return null;
      throw err;
    });
    if (existing && job.params?.useExisting !== true) {
      throw jobError("account-exists", "Ya existe una cuenta con ese correo.");
    }
    const account =
      existing || (await auth.createUser({ email, password: randomBytes(24).toString("base64url") }));

    const profile = { role, email, ...(alias ? { alias } : {}) };
    try {
      await db.collection(USERS).doc(account.uid).create({
        ...profile,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: job.requestedBy,
      });
    } catch (err) {
      if (!existing) await auth.deleteUser(account.uid).catch(() => {});
      // 6 = ALREADY_EXISTS
      if (err?.code === 6) throw jobError("profile-exists", "Esa cuenta ya tiene acceso a TeRRa.");
      throw err;
    }

    await db.collection(LOGS).add({
      uid: job.requestedBy,
      email: job.requestedByEmail || null,
      action: "create",
      entity: "user",
      entityId: account.uid,
      changes: null,
      before: null,
      after: profile,
      meta: { jobId, ...(existing ? { existingAccount: true } : {}) },
      timestamp: FieldValue.serverTimestamp(),
    });

    return { uid: account.uid, email, role, existingAccount: !!existing };
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
    // veces, así que se reclama en una transacción leyendo el doc vivo. El
    // snapshot del evento siempre viene `pending` (es el doc recién creado).
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
      const result = await handler(job, { jobId });
      // Es un `update` y el trigger es `onDocumentCreated`, así que no se
      // vuelve a disparar.
      await ref.update({
        status: "done",
        result,
        finishedAt: FieldValue.serverTimestamp(),
      });
    } catch (err) {
      if (err?.jobCode) logger.warn("job " + jobId + " (" + job.type + "): " + err.message);
      else logger.error("job " + jobId + " (" + job.type + ") falló", err);
      await ref.update({
        status: "error",
        error: (err && err.message) || String(err),
        ...(err?.jobCode ? { errorCode: err.jobCode } : {}),
        finishedAt: FieldValue.serverTimestamp(),
      });
    }
  },
);

// TODO: handler `backup` que exporte cada colección (menos `logs`) a un JSON en
// Cloud Storage, con el progreso en el doc del job y restauración colección por
// colección, como complemento del backup nativo diario de Firestore. Con sus
// chequeos en `functions/verify.mjs`.

// TODO: más jobs para Usuarios (`src/screens/Users.jsx`), con el patrón de
// `createUser`: listar las cuentas de Authentication sin perfil, y desactivar o
// borrar una cuenta. Cada uno con sus chequeos en `functions/verify.mjs`.
