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
//   5. Que el aviso de Cheques y pagos junte en un solo correo lo que vence en
//      los días configurados y los vencidos, más los próximos 7 días con los
//      aplazados, que no se repita el mismo día, que no se envíe nada si no hay
//      vencimientos (aunque haya próximos o aplazados), que extienda los pagos
//      recurrentes, y que el correo de prueba salga desde la cola solo para un
//      admin. El correo no sale: se reemplaza el transporte.
//   6. Que `publishPortal` deje una ficha por trabajador con solo lo suyo (la
//      cuenta en 4 dígitos, sin correo ni RUT de pago), la cabecera con el
//      nombre y el estado vivos de la nómina, borre las fichas de quienes ya
//      no están y lo pida solo un admin.
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
import { runCommitmentDigest } from "./commitments.js";

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

let failures = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FALLA ${name}`);
    if (detail !== undefined) console.log(`        ${JSON.stringify(detail)}`);
  }
}

// Espera a que el backend deje de considerar el job pendiente. Se hace por
// sondeo y no con un listener porque un script que termina tiene que poder
// cerrarse solo; un `onSnapshot` abierto deja el proceso colgado.
async function waitForResolution(ref, { timeout = TIMEOUT_MS } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const snap = await ref.get();
    const data = snap.data();
    if (data && data.status !== "pending" && data.status !== "running") return data;
    if (Date.now() > deadline) return data || null;
    await new Promise((r) => setTimeout(r, 250));
  }
}

async function enqueue(job) {
  return db.collection(JOBS).add({ status: "pending", ...job });
}

console.log("ping");
{
  const uid = `verify-${Date.now()}`;
  const ref = await enqueue({ type: "ping", requestedBy: uid });
  const d = await waitForResolution(ref);

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
  const ref = await enqueue({ type: "ping", status: "done", requestedBy: "ya-tomado" });
  await new Promise((r) => setTimeout(r, 3000));
  const d = (await ref.get()).data();

  check("no lo vuelve a ejecutar", d?.result === undefined, d?.result);
  check("no lo marca como iniciado", d?.startedAt === undefined, d?.startedAt);
}

console.log("");
console.log("tipo desconocido");
{
  const ref = await enqueue({ type: "estoNoExiste" });
  const d = await waitForResolution(ref);

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
  const request = async (requestedBy, params) =>
    waitForResolution(
      await enqueue({ type: "createUser", requestedBy, requestedByEmail: "admin@terra.test", params }),
    );
  const accountOf = (email) => auth.getUserByEmail(email).catch(() => null);

  const email = `nueva-${stamp}@terra.test`;
  const d = await request("verify-admin", { email, role: "user", alias: "Nueva" });
  const uid = d?.result?.uid;
  check("crea la cuenta", d?.status === "done" && typeof uid === "string", d);
  check("la cuenta queda en Authentication con ese UID", (await accountOf(email))?.uid === uid);
  const profile = uid ? (await db.collection("users").doc(uid).get()).data() : null;
  check(
    "crea el perfil con rol, correo y alias",
    profile?.role === "user" && profile?.email === email && profile?.alias === "Nueva",
    profile,
  );
  check("el perfil registra quién lo creó", profile?.createdBy === "verify-admin", profile?.createdBy);
  const logs = uid ? await db.collection("logs").where("entityId", "==", uid).get() : null;
  const log = logs?.docs[0]?.data();
  check(
    "deja un registro en la auditoría",
    logs?.size === 1 && log?.uid === "verify-admin" && log?.meta?.jobId != null,
    log,
  );

  const duplicate = await request("verify-admin", { email, role: "user" });
  check("un correo que ya tiene cuenta pide confirmación", duplicate?.errorCode === "account-exists", duplicate);

  const withAccess = await request("verify-admin", { email, role: "user", useExisting: true });
  check("una cuenta que ya tiene perfil no se duplica", withAccess?.errorCode === "profile-exists", withAccess);
  check("y esa cuenta sigue existiendo", (await accountOf(email))?.uid === uid);

  const existingEmail = `existente-${stamp}@terra.test`;
  const previousAccount = await auth.createUser({ email: existingEmail, password: "clave-de-prueba" });
  const granted = await request("verify-admin", { email: existingEmail, role: "user", useExisting: true });
  check(
    "con confirmación, le da acceso a una cuenta existente",
    granted?.status === "done" && granted?.result?.uid === previousAccount.uid && granted?.result?.existingAccount === true,
    granted,
  );

  const outsider = `ajeno-${stamp}@terra.test`;
  const noAdmin = await request("verify-user", { email: outsider, role: "user" });
  check("si no lo pide un admin, falla", noAdmin?.errorCode === "not-admin", noAdmin);
  check("y no crea la cuenta", (await accountOf(outsider)) === null);

  const badRole = await request("verify-admin", { email: `rol-${stamp}@terra.test`, role: "root" });
  check("un rol desconocido falla", badRole?.errorCode === "invalid-role", badRole);

  const badEmail = await request("verify-admin", { email: "no-es-correo", role: "user" });
  check("un correo inválido falla", badEmail?.errorCode === "invalid-email", badEmail);
}

console.log("");
console.log("avisos de Cheques y pagos");
{
  const sent = [];
  const mailer = {
    sendMail: async (m) => {
      sent.push(m);
      return { messageId: "fake-" + sent.length };
    },
  };
  // 09:00 en Chile del 16 de octubre.
  const now = new Date("2026-10-16T12:00:00Z");
  await db.collection("commitmentConfig").doc("main").set({
    recipients: ["avisos@terra.test"],
    sender: "envia@terra.test",
    offsets: [3, 1, 0],
    includeOverdue: true,
  });
  const dueItem = (id, data) =>
    db.collection("commitments").doc(id).set({ kind: "chequeIssued", status: "pending", amount: 1000, counterparty: "Biosur", ...data });
  await dueItem("v-today", { dueDate: "2026-10-16" });
  await dueItem("v-in-3", { dueDate: "2026-10-19", kind: "personalDebt", partialPayments: [{ id: "p1", amount: 400, date: "2026-10-01" }] });
  await dueItem("v-in-2", { dueDate: "2026-10-18" });
  await dueItem("v-overdue", { dueDate: "2026-10-10" });
  await dueItem("v-paid", { dueDate: "2026-10-16", status: "paid" });
  await dueItem("v-postponed", { dueDate: "2026-09-01", status: "postponed", counterparty: "Ferretería" });
  await db.collection("commitmentSeries").doc("series-2").set({
    kind: "payment",
    counterparty: "Bodega",
    amount: 700,
    firstDate: "2026-09-05",
    dayOfMonth: 20,
    count: null,
    active: true,
    generatedUntil: "2026-10-20",
  });
  await db.collection("commitmentSeries").doc("series-1").set({
    kind: "payment",
    counterparty: "Arriendo",
    amount: 500,
    firstDate: "2026-10-05",
    count: null,
    active: true,
    generatedUntil: "2026-11-05",
  });

  const first = await runCommitmentDigest(db, { now, mailer });
  check("envía un solo correo", first.sent === true && sent.length === 1, first);
  check("avisa lo de hoy, lo de 3 días y lo vencido; no lo de 2 días ni lo pagado", first.count === 3, first.count);
  check(
    "el asunto cuenta vencimientos y vencidos",
    (sent[0]?.subject || "").includes("3 vencimiento(s), 1 vencido(s)"),
    sent[0]?.subject,
  );
  check("va a los destinatarios configurados", sent[0]?.to === "avisos@terra.test", sent[0]?.to);
  check(
    "suma los aplazados al correo, rotulados como ya vencidos",
    (sent[0]?.subject || "").includes("1 aplazado(s)") && (sent[0]?.text || "").includes("01-09-2026 (ya vencido)"),
    sent[0]?.subject,
  );
  check(
    "lo abonado se descuenta: avisa lo que falta, con lo abonado al lado",
    (sent[0]?.text || "").includes("Deuda personal · Biosur · $600 (abonado $400 de $1.000"),
    sent[0]?.text,
  );
  check(
    "trae los próximos 7 días que no tocaba avisar hoy",
    (sent[0]?.text || "").includes("PRÓXIMOS 7 DÍAS") && (sent[0]?.text || "").includes("18-10-2026"),
    sent[0]?.text,
  );
  const record = (await db.collection("commitmentNotifications").doc("2026-10-16").get()).data();
  check("deja registro del envío del día", record?.status === "sent" && record?.count === 3, record);
  const upcomingIds = record?.sections?.find((s) => s.key === "upcoming")?.ids || [];
  check(
    "el registro incluye los próximos, con los aplazados primero y sin repetir lo ya avisado",
    upcomingIds.join(",") === "v-postponed,v-in-2",
    upcomingIds,
  );

  const second = await runCommitmentDigest(db, { now, mailer });
  check(
    "no repite el correo el mismo día",
    second.sent === false && second.reason === "already-sent" && sent.length === 1,
    second,
  );

  const series = (await db.collection("commitmentSeries").doc("series-1").get()).data();
  check("extiende el pago recurrente hasta 60 días", series?.generatedUntil === "2026-12-15", series?.generatedUntil);
  check("crea el vencimiento que faltaba", (await db.collection("commitments").doc("series-1_2026-12-05").get()).exists);
  check(
    "no recrea lo que ya se había generado",
    !(await db.collection("commitments").doc("series-1_2026-11-05").get()).exists,
  );
  const moved = (await db.collection("commitments").doc("series-2_2026-11-20").get()).data();
  check("un recurrente con día cambiado se genera en el día nuevo y con su monto", moved?.amount === 700, moved);

  await db.collection("commitmentConfig").doc("main").update({ includeOverdue: false });
  const empty = await runCommitmentDigest(db, { now: new Date("2026-10-21T12:00:00Z"), mailer });
  check(
    "sin vencimientos para avisar no envía nada, aunque haya próximos o aplazados",
    empty.sent === false && empty.reason === "empty" && sent.length === 1,
    empty,
  );

  const testRun = await waitForResolution(await enqueue({ type: "sendCommitmentDigest", requestedBy: "verify-admin" }));
  check("el correo de prueba sale desde la cola", testRun?.status === "done" && testRun?.result?.sent === true, testRun);
  check("y va marcado como prueba", (testRun?.result?.subject || "").startsWith("[Prueba]"), testRun?.result?.subject);
  const outsider = await waitForResolution(await enqueue({ type: "sendCommitmentDigest", requestedBy: "verify-user" }));
  check("solo un admin pide el correo de prueba", outsider?.errorCode === "not-admin", outsider);
}

console.log("");
console.log("portal de trabajadores");
{
  await db.collection("payrolls").doc("pay-42").set({ name: "Semana 42 Corregida", status: "paid" });
  await db.collection("payrollSnapshots").doc("pay-42").set({
    version: 1,
    payrollId: "pay-42",
    generatedAt: "2026-10-15T13:45:04.512Z",
    payroll: { name: "Semana 42", status: "pending", total: 300 },
    cycles: [
      { id: "c1", label: "Fundo/Norte/Ciclo 1", faenaName: "Fundo", subfaenaName: "Norte", dayPrices: { l1: {} }, labors: [{ id: "l1", name: "Principal", type: "main" }] },
      { id: "c2", label: "Fundo/Sur/Ciclo 2", faenaName: "Fundo", subfaenaName: "Sur", dayPrices: {}, labors: [{ id: "l2", name: "Poda", type: "trato" }] },
    ],
    workers: [
      {
        rut: "11111111-1", name: "Ana", groupLeader: "GRUPO A", bankCode: "012", accountType: 3, accountNumber: "000123456789",
        email: "ana@terra.test", paymentRut: "22222222-2", grossAmount: 200, advance: 50, bonus: 0, amount: 150,
        byCycle: { c1: 200 }, workdayIds: ["w1", "w2"], advanceIds: ["a1"], anticipoApplications: [{ advanceId: "a1", amount: 50 }], bonoApplications: [],
      },
      {
        rut: "3.333.333-3", name: "Beto", bankCode: "EFE", accountNumber: "", grossAmount: 100, advance: 0, bonus: 0, amount: 100,
        byCycle: { c2: 100 }, workdayIds: ["w3"],
      },
    ],
    workdays: [
      { id: "w1", cycleId: "c1", laborId: "l1", workerRut: "11111111-1", date: "2026-10-10", amount: 100 },
      { id: "w2", cycleId: "c1", laborId: "l1", workerRut: "11.111.111-1", date: "2026-10-11", amount: 100 },
      { id: "w3", cycleId: "c2", laborId: "l2", workerRut: "3333333-3", date: "2026-10-12", amount: 100, qty: 10 },
    ],
    advances: [{ id: "a1", workerRut: "11111111-1", type: "anticipo", amount: 50, date: "2026-10-01", note: "Adelanto" }],
  });
  await db.collection("portalPayslips").doc("99999999-9").set({ payrollId: "old" });

  const done = await waitForResolution(await enqueue({ type: "publishPortal", requestedBy: "verify-admin", params: { payrollId: "pay-42" } }));
  check("publica desde la cola", done?.status === "done" && done?.result?.published === 2, done);
  check("borra las fichas de quienes ya no están", done?.result?.removed === 1 && !(await db.collection("portalPayslips").doc("99999999-9").get()).exists, done?.result);

  const ana = (await db.collection("portalPayslips").doc("11111111-1").get()).data();
  const worker = ana?.workers?.[0] || {};
  check("una ficha por trabajador, con la forma del JSON", ana?.workers?.length === 1 && ana?.payrollId === "pay-42", ana);
  check("la cuenta va en 4 dígitos, sin correo ni RUT de pago", worker.accountNumber === "6789" && !("email" in worker) && !("paymentRut" in worker), worker);
  check(
    "solo sus jornadas, también las guardadas con otro formato de RUT",
    ana?.workdays?.map((w) => w.id).join(",") === "w1,w2" && ana.workdays.every((w) => w.workerRut === "11111111-1"),
    ana?.workdays,
  );
  check("solo sus ciclos, sin los precios del día", ana?.cycles?.map((c) => c.id).join(",") === "c1" && !("dayPrices" in ana.cycles[0]), ana?.cycles);
  check("solo sus anticipos", ana?.advances?.map((a) => a.id).join(",") === "a1", ana?.advances);
  check("nombre y estado vivos de la nómina", ana?.payroll?.name === "Semana 42 Corregida" && ana?.payroll?.status === "paid", ana?.payroll);
  check("el RUT con puntos queda como id normalizado", (await db.collection("portalPayslips").doc("3333333-3").get()).exists);

  const meta = (await db.collection("portalMeta").doc("current").get()).data();
  check("deja la cabecera de la nómina publicada", meta?.payrollId === "pay-42" && meta?.workerCount === 2 && !!meta?.publishedAt, meta);
  const logs = await db.collection("logs").where("entity", "==", "portalMeta").get();
  check("queda en la auditoría", logs.docs.some((d) => d.data().meta?.payrollId === "pay-42"));

  const denied = await waitForResolution(await enqueue({ type: "publishPortal", requestedBy: "verify-user", params: { payrollId: "pay-42" } }));
  check("solo un admin publica", denied?.errorCode === "not-admin", denied);
  const missing = await waitForResolution(await enqueue({ type: "publishPortal", requestedBy: "verify-admin", params: { payrollId: "no-existe" } }));
  check("una nómina que no existe falla sin tocar lo publicado", missing?.errorCode === "not-found" && (await db.collection("portalMeta").doc("current").get()).data()?.payrollId === "pay-42", missing);
}

console.log("");
if (failures) {
  console.log(`${failures} verificación(es) fallaron — no deployar.`);
  process.exit(1);
}
console.log("Todo OK. El backend está listo para deployar.");
process.exit(0);
