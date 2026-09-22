// Verificación local de las Cloud Functions contra los emuladores.
//
// Existe porque deployar functions es caro de iterar: cada corrida pasa por
// Cloud Build, tarda minutos y factura. Antes había que deployar para saber si
// la función siquiera cargaba. Esto prueba lo mismo en segundos y sin tocar
// `arandanos-hp`.
//
// Se corre con `npm run functions:verify` desde la raíz, que levanta los
// emuladores de functions y firestore con un project id `demo-`. Ese prefijo
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
//      menos una vez; sin el reclamo transaccional, un backup podría correr
//      dos veces.
//   3. Que un job que la función no sabe manejar termine en `error` y no
//      colgado en `pending` para siempre.
//
// **Lo que este archivo NO puede probar**: que el trigger esté suscrito a la
// base correcta. El emulador de Firestore todavía no soporta bases múltiples
// —lo dice al arrancar— así que sirve una sola y el nombre le da igual. El
// chequeo de `database` de más abajo compara contra la constante que la propia
// función reporta: pasa aunque el `database` del trigger esté mal.
//
// Importa porque ese es el peor modo de falla que tiene este diseño: la base no
// se llama `(default)`, y un trigger apuntado a la base equivocada no da error
// — simplemente nunca dispara. La única prueba real es en producción, y es
// justo lo que hace el botón de ping de la Consola.

import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const PROJECT = "demo-terra-test";
const DATABASE = "hpdatabase";
const JOBS = "functionJobs";
const TIMEOUT_MS = 30_000;

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(
    "FIRESTORE_EMULATOR_HOST no está puesta. Este script corre bajo " +
      "`firebase emulators:exec`, que la define sola. Correrlo suelto no tiene sentido.",
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
if (fallos) {
  console.log(`${fallos} verificación(es) fallaron — no deployar.`);
  process.exit(1);
}
console.log("Todo OK. El backend está listo para deployar.");
process.exit(0);
