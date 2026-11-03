// Los datos de las capturas de la ayuda: una faena, un ciclo y su gente,
// inventados de punta a punta (el repo es público). Escribe solo en los
// emuladores: sin FIRESTORE_EMULATOR_HOST y FIREBASE_AUTH_EMULATOR_HOST no
// hace nada.
import { createRequire } from "node:module";

const require = createRequire(new URL("../../functions/package.json", import.meta.url));
const { initializeApp, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { FieldValue, getFirestore, Timestamp } = require("firebase-admin/firestore");

export const DEMO_PROJECT = "demo-terra-test";
export const DEMO_USER = { email: "demo@terra.test", password: "demo1234", alias: "Demo" };
export const DEMO_CYCLE = "C1";
export const DEMO_DAYS = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"];

// Dígito verificador de un RUT (módulo 11).
function rutDv(num) {
  let sum = 0;
  let mul = 2;
  for (const d of String(num).split("").reverse()) {
    sum += Number(d) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const r = 11 - (sum % 11);
  return r === 11 ? "0" : r === 10 ? "K" : String(r);
}
export const rut = (num) => `${num}-${rutDv(num)}`;

export const DEMO_WORKERS = [
  { num: 15234561, name: "Ana Pérez Soto", leader: "GRUPO NORTE" },
  { num: 16345672, name: "Bruno Díaz Mella", leader: "GRUPO NORTE" },
  { num: 17456783, name: "Carla Rojas Fuentes", leader: "GRUPO NORTE" },
  { num: 18567894, name: "Diego Muñoz Vera", leader: "GRUPO SUR" },
  { num: 19678905, name: "Elena Castro Paz", leader: "GRUPO SUR", monthly: true },
  { num: 20789016, name: "Felipe Torres Lagos", leader: "GRUPO SUR" },
  { num: 21890127, name: "Gloria Herrera Pino", leader: "GRUPO SUR", notInCycle: true },
].map((w) => ({ ...w, rut: rut(w.num), id: rut(w.num) }));

// Vacía la base del emulador, para que cada guía parta de los mismos datos.
export async function clearDemo() {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  if (!host) throw new Error("Los datos de la ayuda se borran solo en el emulador (falta FIRESTORE_EMULATOR_HOST).");
  const res = await fetch(`http://${host}/emulator/v1/projects/${DEMO_PROJECT}/databases/hpdatabase/documents`, { method: "DELETE" });
  if (!res.ok) throw new Error(`No se pudo vaciar el emulador (${res.status}).`);
}

export async function seedDemo() {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error("Los datos de la ayuda se siembran solo en los emuladores (falta FIRESTORE_EMULATOR_HOST o FIREBASE_AUTH_EMULATOR_HOST).");
  }
  if (!getApps().length) initializeApp({ projectId: DEMO_PROJECT });
  const db = getFirestore("hpdatabase");
  const auth = getAuth();

  let user;
  try {
    user = await auth.getUserByEmail(DEMO_USER.email);
  } catch {
    user = await auth.createUser({ email: DEMO_USER.email, password: DEMO_USER.password });
  }
  await db.collection("users").doc(user.uid).set({ role: "admin", email: DEMO_USER.email, alias: DEMO_USER.alias });
  await db.collection("indicators").doc("main").set({ sueldoBase: 539000, dia: 17967, hora: 4790 });

  for (const leader of ["GRUPO NORTE", "GRUPO SUR"]) {
    await db.collection("groupLeader").doc(leader.replace(/\s+/g, "_")).set({ name: leader, habilitado: true });
  }
  for (const w of DEMO_WORKERS) {
    await db.collection("worker").doc(w.id).set({
      rut: w.rut, name: w.name, groupLeader: [w.leader], email: "", idQr: [],
      bankDetails: [w.rut, String(w.num), 3, "012"],
    });
  }

  await db.collection("faenas").doc("F1").set({ name: "Fundo Los Aromos", createdAt: new Date("2026-09-01") });
  await db.collection("subfaenas").doc("S1").set({ name: "Cuartel Norte", faenaId: "F1", createdAt: new Date("2026-09-01") });

  const inCycle = DEMO_WORKERS.filter((w) => !w.notInCycle);
  await db.collection("cycles").doc(DEMO_CYCLE).set({
    label: "Fundo Los Aromos/Cuartel Norte/Ciclo 1",
    faenaId: "F1",
    subfaenaId: "S1",
    status: "open",
    startDate: DEMO_DAYS[0],
    days: DEMO_DAYS,
    labors: [{
      id: "L1",
      name: "Principal",
      type: "main",
      workers: inCycle.map((w) => ({ rut: w.rut, id: w.id, name: w.name, ...(w.monthly ? { monthly: true } : {}) })),
    }],
    dayPrices: { L1: Object.fromEntries(DEMO_DAYS.map((d) => [d, { "0_0": { price: 30000, mode: "unit" } }])) },
    dayNotesByLabor: {},
    createdAt: new Date("2026-10-04"),
  });

  // Los tres primeros días ya anotados; el resto, por anotar en la guía.
  const batch = db.batch();
  for (const w of inCycle) {
    for (const d of DEMO_DAYS.slice(0, 3)) {
      const data = w.monthly
        ? { amount: 0, attendanceOnly: true }
        : { amount: 30000, qty: 1 };
      batch.set(db.collection("workdays").doc(`${DEMO_CYCLE}__L1__${w.rut}__${d}`), {
        cycleId: DEMO_CYCLE, laborId: "L1", workerRut: w.rut, workerId: w.id, date: d, payrollId: null, ...data,
      });
    }
  }
  await batch.commit();
  return { uid: user.uid };
}

// Un ciclo con una labor de cada tipo que tiene precios propios (cosecha, a
// trato, a trato por etapas y jornadas con horas extras), en otra faena, para
// la guía de precios. Tres días, cuatro personas y algo de producción.
export const LABOR_TYPES_CYCLE = "C2";

export async function seedLaborTypes() {
  const db = getFirestore("hpdatabase");
  const days = DEMO_DAYS.slice(0, 3);
  const people = DEMO_WORKERS.slice(0, 4);
  const workers = people.map((w) => ({ rut: w.rut, id: w.id, name: w.name }));
  await db.collection("faenas").doc("F2").set({ name: "Agrícola Santa Elena", createdAt: new Date("2026-09-15") });
  await db.collection("subfaenas").doc("S2").set({ name: "Parronal", faenaId: "F2", createdAt: new Date("2026-09-15") });

  const perDay = (entry) => Object.fromEntries(days.map((d, i) => [d, typeof entry === "function" ? entry(d, i) : entry]));
  await db.collection("cycles").doc(LABOR_TYPES_CYCLE).set({
    label: "Agrícola Santa Elena/Parronal/Ciclo 1",
    faenaId: "F2",
    subfaenaId: "S2",
    status: "open",
    startDate: days[0],
    days,
    labors: [
      { id: "L2", name: "Cosecha", type: "cosecha", workers },
      { id: "L3", name: "Poda", type: "trato", tratoType: 0, workers },
      {
        id: "L4", name: "Embalaje", type: "tratoEtapas", workers,
        stages: [{ id: "s1", name: "Armado", counts: false }, { id: "s2", name: "Embalado", counts: true }],
      },
      { id: "L5", name: "Riego", type: "tratoHE", workers, baseDayDefault: 30000, overtimeRate: 5000, bonusManejo: 5000, bonusSupervision: 8000 },
    ],
    dayPrices: {
      L2: perDay({ "0_1": { price: 350, mode: "unit" }, "1_0": { price: 200, mode: "unit" } }),
      L3: perDay((d, i) => ({
        t0: { price: 120, mode: "unit", unit: 3 },
        ...(i === 0 ? { t1: { price: 15000, mode: "flat" } } : {}),
      })),
      L4: perDay({ s1: { price: 50, mode: "unit" }, s2: { price: 80, mode: "unit" } }),
      L5: {
        [days[0]]: { "0_0": { price: 30000, mode: "normal", isHoliday: false } },
        [days[1]]: { "0_0": { price: 0, mode: "overtimeOnly", isHoliday: false } },
        [days[2]]: { "0_0": { price: 45000, mode: "normal", isHoliday: true } },
      },
    },
    dayNotesByLabor: {},
    createdAt: new Date("2026-10-04"),
  });

  const batch = db.batch();
  const wd = (labor, w, date, ck, data) =>
    batch.set(db.collection("workdays").doc(`${LABOR_TYPES_CYCLE}__${labor}__${w.rut}__${date}__${ck}`), {
      cycleId: LABOR_TYPES_CYCLE, laborId: labor, workerRut: w.rut, workerId: w.id, date, payrollId: null, ...data,
    });
  people.forEach((w, i) => {
    days.forEach((d, j) => {
      const kilos = 18 + i * 3 + j * 2;
      wd("L2", w, d, "0_1", { qualityX: 0, containerY: 1, qty: kilos, amount: kilos * 350 });
      const plants = 90 + i * 10 + j * 5;
      wd("L3", w, d, "t0", { qty: plants, amount: plants * 120 });
      const boxes = 40 + i * 4;
      wd("L4", w, d, "s2", { stageId: "s2", qty: boxes, amount: boxes * 80 });
    });
  });
  await batch.commit();
}

// Para las guías de Nómina: dos personas del Grupo Sur cobran en efectivo, así
// la nómina tiene transferencias y efectivo.
export async function seedCashWorkers() {
  const db = getFirestore("hpdatabase");
  for (const w of DEMO_WORKERS.filter((x) => ["Diego Muñoz Vera", "Felipe Torres Lagos"].includes(x.name))) {
    await db.collection("worker").doc(w.id).update({ bankDetails: [w.rut, "", 0, "EFE"] });
  }
}

// La fecha de creación de las nóminas la pone el servidor: se fija al día de
// las capturas, así no cambian con el día en que se generan.
export async function pinPayrollDates() {
  const db = getFirestore("hpdatabase");
  const snap = await db.collection("payrolls").get();
  for (const d of snap.docs) {
    await d.ref.update({ createdAt: Timestamp.fromDate(new Date("2026-10-09T10:30:00-03:00")), updatedAt: FieldValue.serverTimestamp() });
  }
}

// Una corrección en la grilla después de generar la nómina: el último día
// anotado de Ana Pérez pasa de $30.000 a $35.000.
export async function correctDemoDay() {
  const db = getFirestore("hpdatabase");
  const ana = DEMO_WORKERS[0];
  await db.collection("workdays").doc(`${DEMO_CYCLE}__L1__${ana.rut}__${DEMO_DAYS[2]}`)
    .update({ amount: 35000, updatedAt: FieldValue.serverTimestamp() });
}

// Para la guía de anticipos y bonos: un anticipo en dos cuotas, uno sin
// cuotas y un bono, todos pendientes.
export async function seedAdvances() {
  const db = getFirestore("hpdatabase");
  const [ana, bruno, carla] = DEMO_WORKERS;
  const base = (w) => ({ workerRut: w.rut, workerId: w.id, workerName: w.name, status: "pending", amountPaid: 0, payments: [], appliedPayrollId: null });
  await db.collection("advances").doc("A1").set({
    ...base(ana), type: "anticipo", amount: 50000, date: "2026-10-01", note: "Arreglo de la bicicleta",
    installments: { count: 2, amount: 25000, cadence: "porPago" }, createdAt: new Date("2026-10-01T12:00:00-03:00"),
  });
  await db.collection("advances").doc("A2").set({
    ...base(bruno), type: "anticipo", amount: 20000, date: "2026-10-03", note: "", installments: null,
    createdAt: new Date("2026-10-03T12:00:00-03:00"),
  });
  await db.collection("advances").doc("B1").set({
    ...base(carla), type: "bono", amount: 15000, date: "2026-10-06", note: "Bono de asistencia", installments: null,
    createdAt: new Date("2026-10-06T12:00:00-03:00"),
  });
}

// Para las guías de Transportes: dos transportistas contratados y uno propio,
// con vueltas pendientes en el ciclo de demo (una sin tarifa) y una en el de
// Santa Elena (`seedLaborTypes`), que queda suelta para la quincena.
export const DEMO_CARRIERS = [
  {
    id: "K1", alias: "Ríos", name: "Transportes Ríos Ltda.", type: "contracted", defaultRate: 25000,
    vehicles: [{ alias: "Bus 1", plate: "KXTR12", capacity: "40" }, { alias: "Bus 2", plate: "LBPT34", capacity: "40" }],
  },
  { id: "K2", alias: "Furgón Norte", name: "Furgones del Norte", type: "contracted", defaultRate: 18000, vehicles: [{ alias: "Van", plate: "JJKL56", capacity: "12" }] },
  { id: "K3", alias: "Camioneta del Fundo", name: "Vehículos del fundo", type: "own", defaultRate: 0, vehicles: [{ alias: "Hilux" }] },
];

export async function seedTransports() {
  const db = getFirestore("hpdatabase");
  const at = new Date("2026-10-04T12:00:00-03:00");
  for (const { id, ...c } of DEMO_CARRIERS) {
    await db.collection("carriers").doc(id).set({ ...c, notes: "", active: true, createdAt: at, updatedAt: at });
  }
  const trip = (id, data) => {
    const qty = data.qty || 1;
    return db.collection("transports").doc(id).set({
      cycleId: DEMO_CYCLE, faenaId: "F1", subfaenaId: "S1", kind: "regular", lugar: "Rengo", destino: "Fundo Los Aromos",
      notes: "", status: "pending", paymentId: null, createdAt: at, updatedAt: at, ...data, qty, amount: qty * data.rate,
    });
  };
  const [d1, d2, d3] = DEMO_DAYS;
  for (const [i, date] of [d1, d2, d3].entries()) {
    await trip(`T${i + 1}`, { carrierId: "K1", vehicleAlias: "Bus 1", date, qty: 2, rate: 25000, personCount: 38 });
  }
  await trip("T4", { carrierId: "K2", vehicleAlias: "Van", date: d1, rate: 18000, personCount: 11 });
  await trip("T5", { carrierId: "K2", vehicleAlias: "Van", date: d2, rate: 18000, personCount: 10 });
  await trip("T6", { carrierId: "K2", vehicleAlias: "Van", date: d3, rate: 0, personCount: 11 });
  await trip("T7", { carrierId: "K3", vehicleAlias: "Hilux", date: d2, rate: 0, personCount: 4, kind: "approach" });
  await trip("T8", {
    carrierId: "K1", vehicleAlias: "Bus 2", date: d2, rate: 25000, personCount: 36,
    cycleId: LABOR_TYPES_CYCLE, faenaId: "F2", subfaenaId: "S2", destino: "Parronal",
  });
}

// Para la guía del resumen del ciclo: una nota en un día del ciclo de demo,
// que el resumen para pagar muestra en las observaciones.
export async function seedDayNote() {
  const db = getFirestore("hpdatabase");
  await db.collection("cycles").doc(DEMO_CYCLE).update({
    dayNotesByLabor: { L1: { [DEMO_DAYS[1]]: "Llovió en la tarde; se trabajó hasta las 15:00." } },
  });
}

// Para la guía de Trabajadores: los datos personales de Ana, Bruno cobra en la
// cuenta de otra persona con su nombre anotado y Elena en la de otra sin él.
export async function seedWorkerDetails() {
  const db = getFirestore("hpdatabase");
  const [ana, bruno, , , elena] = DEMO_WORKERS;
  await db.collection("worker").doc(ana.id).update({
    email: "ana.perez@correo.test", address: "Los Aromos 1234, Villa El Sol", commune: "Rengo", nationality: "Chilena",
    maritalStatus: "single", birthDate: "1990-04-12", pensionFund: "Modelo", healthInsurance: "Fonasa",
  });
  const rosa = rut(14567892);
  await db.collection("worker").doc(bruno.id).update({ bankDetails: [rosa, "14567892", 3, "012"], paymentName: "Rosa Mella Díaz" });
  const other = rut(13456781);
  await db.collection("worker").doc(elena.id).update({ bankDetails: [other, "13456781", 3, "012"] });
}

// Para la guía de contratos: dos empleadores, Ana y Bruno con contrato, Carla
// y Diego a honorarios (Carla con la dirección que pide la boleta), y el
// contrato de Gloria terminado en septiembre con el finiquito solicitado.
export const DEMO_EMPLOYERS = [
  { id: "E1", name: "Agrícola Los Aromos SpA", rut: rut(76543218) },
  { id: "E2", name: "Servicios del Valle Ltda.", rut: rut(77654329) },
];

export async function seedEmployments() {
  const db = getFirestore("hpdatabase");
  for (const e of DEMO_EMPLOYERS) {
    await db.collection("employers").doc(e.id).set({ name: e.name, rut: e.rut, enabled: true, createdAt: new Date("2026-08-01") });
  }
  const [ana, bruno, carla, diego, , , gloria] = DEMO_WORKERS;
  const period = (id, w, data) => db.collection("employments").doc(id).set({
    workerId: w.id, workerRut: w.rut, workerName: w.name, employerId: "E1", endDate: "", endReason: null,
    settlementStatus: null, notes: "", createdAt: new Date("2026-09-01T12:00:00-03:00"), updatedAt: new Date("2026-09-01T12:00:00-03:00"), ...data,
  });
  await period("P1", ana, { type: "contract", startDate: "2026-09-01" });
  await period("P2", bruno, { type: "contract", startDate: "2026-09-01" });
  await period("P3", carla, { type: "fees", startDate: "2026-09-15" });
  await period("P4", diego, { type: "fees", startDate: "2026-09-15" });
  await period("P5", gloria, {
    type: "contract", startDate: "2026-03-02", endDate: "2026-09-30", endReason: "jobEnd",
    settlementStatus: "requested", settlementRequestedAt: "2026-10-02",
  });
  await db.collection("worker").doc(carla.id).update({ address: "Pasaje Las Rosas 45", commune: "Requínoa" });
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  await seedDemo();
  console.log("datos de la ayuda sembrados");
  process.exit(0);
}
