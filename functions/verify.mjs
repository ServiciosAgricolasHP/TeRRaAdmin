// Verificación local de las Cloud Functions contra los emuladores.
//
// Prueba en segundos, y sin tocar `arandanos-hp`, lo que de otro modo exigiría
// un deploy (cada uno pasa por Cloud Build, tarda minutos y factura).
//
// Se corre con `npm run functions:verify` desde la raíz, que levanta los
// emuladores de functions, firestore y auth con un project id `demo-`. Ese prefijo
// hace que el SDK nunca contacte servidores de Google, la misma barrera que
// usan los tests e2e (ver AGENTS.md → Tests).
//
// El backend se invoca escribiendo un documento, así que acá no hay ningún
// endpoint que golpear: se encola un job y se espera el resultado, exactamente
// como lo hace la Consola. Lo que se fija:
//
//   1. Que la función cargue, registre su trigger y resuelva un job de punta a
//      punta, dejando marcas de inicio y fin.
//   2. Que un job ya tomado **no se ejecute de nuevo**. Eventarc entrega al
//      menos una vez; el reclamo transaccional evita que un job corra dos
//      veces.
//   3. Que un job que la función no sabe manejar termine en `error` y no
//      colgado en `pending` para siempre.
//   4. Que `createUser` cree la cuenta y su perfil con el mismo UID, lo deje en
//      la auditoría, pida confirmación para un correo que ya tiene cuenta, y
//      rechace un pedido que no viene de un admin, un rol desconocido o un
//      correo inválido.
//
// **Lo que este archivo NO puede probar**: que el trigger esté suscrito a la
// base correcta. El emulador de Firestore no soporta bases múltiples —lo dice
// al arrancar—, así que sirve una sola y el nombre le da igual. El chequeo de
// `database` de más abajo compara contra la constante que la propia función
// reporta: pasa aunque el `database` del trigger esté mal.
//
// Un trigger apuntado a la base equivocada no da error: nunca dispara. Eso solo
// se prueba en producción, con el botón de ping de la Consola.

import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const PROJECT = "demo-terra-test";
const DATABASE = "hpdatabase";
const JOBS = "functionJobs";
const TIMEOUT_MS = 30_000;

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error(
    "FIRESTORE_EMULATOR_HOST o FIREBASE_AUTH_EMULATOR_HOST no están puestas. Este script " +
      "corre bajo `firebase emulators:exec`, que las define solas. Correrlo suelto no tiene sentido.",
  );
  process.exit(1);
}

initializeApp({ projectId: PROJECT });
const db = getFirestore(DATABASE);

let fallos = 0;
function check(nombre, condicion, detalle) {
  if (condicion) {
    console.log(`  ok   ${nombre}`);
  } else {
    fallos += 1;
    console.log(`  FALLA ${nombre}`);
    if (detalle !== undefined) console.log(`        ${JSON.stringify(detalle)}`);
  }
}

// Espera a que el backend deje de considerar el job pendiente. Se hace por
// sondeo y no con un listener porque un script que termina tiene que poder
// cerrarse solo; un `onSnapshot` abierto deja el proceso colgado.
async function esperarResolucion(ref, { timeout = TIMEOUT_MS } = {}) {
  const hasta = Date.now() + timeout;
  for (;;) {
    const snap = await ref.get();
    const data = snap.data();
    if (data && data.status !== "pending" && data.status !== "running") return data;
    if (Date.now() > hasta) return data || null;
    await new Promise((r) => setTimeout(r, 250));
  }
}

async function encolar(job) {
  return db.collection(JOBS).add({ status: "pending", ...job });
}

console.log("ping");
{
  const uid = `verify-${Date.now()}`;
  const ref = await encolar({ type: "ping", requestedBy: uid });
  const d = await esperarResolucion(ref);

  check("el job se resuelve de punta a punta", d?.status === "done", d);
  check("devuelve ok", d?.result?.ok === true, d?.result);
  // Ojo: esto NO prueba el enrutamiento por base — ver la nota del encabezado.
  // Solo verifica que la función reporte la base que tiene configurada.
  check("reporta la base configurada", d?.result?.database === DATABASE, d?.result?.database);
  check("reporta su región", typeof d?.result?.region === "string" && d.result.region.length > 0, d?.result?.region);
  check("eco de quién lo pidió", d?.result?.requestedBy === uid, { esperado: uid, fue: d?.result?.requestedBy });
  check(
    "trae serverTime ISO",
    typeof d?.result?.serverTime === "string" && !Number.isNaN(Date.parse(d.result.serverTime)),
    d?.result?.serverTime,
  );
  check("deja marca de inicio", d?.startedAt != null, d?.startedAt);
  check("deja marca de fin", d?.finishedAt != null, d?.finishedAt);
}

console.log("");
console.log("job ya tomado (entrega duplicada)");
{
  // Un job que nace con `status` distinto de `pending` es lo que ve la función
  // cuando Eventarc le entrega dos veces el mismo evento: el reclamo
  // transaccional lo encuentra tomado y se retira. Crearlo así es la única
  // forma de ejercitar esa rama desde afuera.
  const ref = await encolar({ type: "ping", status: "done", requestedBy: "ya-tomado" });
  await new Promise((r) => setTimeout(r, 3000));
  const d = (await ref.get()).data();

  check("no lo vuelve a ejecutar", d?.result === undefined, d?.result);
  check("no lo marca como iniciado", d?.startedAt === undefined, d?.startedAt);
}

console.log("");
console.log("tipo desconocido");
{
  const ref = await encolar({ type: "estoNoExiste" });
  const d = await esperarResolucion(ref);

  check("queda en error, no colgado en pending", d?.status === "error", d?.status);
  check("dice cuál era el tipo", typeof d?.error === "string" && d.error.includes("estoNoExiste"), d?.error);
}

console.log("");
console.log("createUser");
{
  const auth = getAuth();
  const stamp = Date.now();
  await db.collection("users").doc("verify-admin").set({ role: "admin" });
  await db.collection("users").doc("verify-user").set({ role: "user" });
  const pedir = async (requestedBy, params) =>
    esperarResolucion(
      await encolar({ type: "createUser", requestedBy, requestedByEmail: "admin@terra.test", params }),
    );
  const cuentaDe = (email) => auth.getUserByEmail(email).catch(() => null);

  const email = `nueva-${stamp}@terra.test`;
  const d = await pedir("verify-admin", { email, role: "user", alias: "Nueva" });
  const uid = d?.result?.uid;
  check("crea la cuenta", d?.status === "done" && typeof uid === "string", d);
  check("la cuenta queda en Authentication con ese UID", (await cuentaDe(email))?.uid === uid);
  const perfil = uid ? (await db.collection("users").doc(uid).get()).data() : null;
  check(
    "crea el perfil con rol, correo y alias",
    perfil?.role === "user" && perfil?.email === email && perfil?.alias === "Nueva",
    perfil,
  );
  check("el perfil registra quién lo creó", perfil?.createdBy === "verify-admin", perfil?.createdBy);
  const logs = uid ? await db.collection("logs").where("entityId", "==", uid).get() : null;
  const log = logs?.docs[0]?.data();
  check(
    "deja un registro en la auditoría",
    logs?.size === 1 && log?.uid === "verify-admin" && log?.meta?.jobId != null,
    log,
  );

  const repetido = await pedir("verify-admin", { email, role: "user" });
  check("un correo que ya tiene cuenta pide confirmación", repetido?.errorCode === "account-exists", repetido);

  const conAcceso = await pedir("verify-admin", { email, role: "user", useExisting: true });
  check("una cuenta que ya tiene perfil no se duplica", conAcceso?.errorCode === "profile-exists", conAcceso);
  check("y esa cuenta sigue existiendo", (await cuentaDe(email))?.uid === uid);

  const existente = `existente-${stamp}@terra.test`;
  const previa = await auth.createUser({ email: existente, password: "clave-de-prueba" });
  const dada = await pedir("verify-admin", { email: existente, role: "user", useExisting: true });
  check(
    "con confirmación, le da acceso a una cuenta existente",
    dada?.status === "done" && dada?.result?.uid === previa.uid && dada?.result?.existingAccount === true,
    dada,
  );

  const ajeno = `ajeno-${stamp}@terra.test`;
  const noAdmin = await pedir("verify-user", { email: ajeno, role: "user" });
  check("si no lo pide un admin, falla", noAdmin?.errorCode === "not-admin", noAdmin);
  check("y no crea la cuenta", (await cuentaDe(ajeno)) === null);

  const rol = await pedir("verify-admin", { email: `rol-${stamp}@terra.test`, role: "root" });
  check("un rol desconocido falla", rol?.errorCode === "invalid-role", rol);

  const correo = await pedir("verify-admin", { email: "no-es-correo", role: "user" });
  check("un correo inválido falla", correo?.errorCode === "invalid-email", correo);
}

console.log("");
if (fallos) {
  console.log(`${fallos} verificación(es) fallaron — no deployar.`);
  process.exit(1);
}
console.log("Todo OK. El backend está listo para deployar.");
process.exit(0);
