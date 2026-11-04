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

// Para la guía de contratos: dos empleadores y dos mandantes, Ana y Bruno con
// contrato, Carla y Diego a honorarios (Carla con la dirección que pide la
// boleta), un día de Ana, Carla y Diego en otra faena (Viña Los Robles), y el
// contrato de Gloria terminado en septiembre con el finiquito solicitado.
export const DEMO_EMPLOYERS = [
  { id: "E1", name: "Agrícola Los Aromos SpA", rut: rut(76543218) },
  { id: "E2", name: "Servicios del Valle Ltda.", rut: rut(77654329) },
];

export const DEMO_PRINCIPALS = [
  { id: "M1", name: "Frutícola Cerro Verde S.A.", rut: rut(96812345) },
  { id: "M2", name: "Exportadora Las Brisas SpA", rut: rut(76987612) },
];

export async function seedEmployments() {
  const db = getFirestore("hpdatabase");
  for (const e of DEMO_EMPLOYERS) {
    await db.collection("employers").doc(e.id).set({ name: e.name, rut: e.rut, enabled: true, createdAt: new Date("2026-08-01") });
  }
  for (const m of DEMO_PRINCIPALS) {
    await db.collection("principals").doc(m.id).set({ name: m.name, rut: m.rut, enabled: true, createdAt: new Date("2026-08-01") });
  }
  const [ana, bruno, carla, diego, , , gloria] = DEMO_WORKERS;
  const period = (id, w, data) => db.collection("employments").doc(id).set({
    workerId: w.id, workerRut: w.rut, workerName: w.name, employerId: "E1", endDate: "", endReason: null,
    settlementStatus: null, notes: "", createdAt: new Date("2026-09-01T12:00:00-03:00"), updatedAt: new Date("2026-09-01T12:00:00-03:00"), ...data,
  });
  await period("P1", ana, { type: "contract", principalId: "M1", startDate: "2026-09-01" });
  await period("P2", bruno, { type: "contract", principalId: "M2", startDate: "2026-09-01" });
  await period("P3", carla, { type: "fees", principalId: "M1", startDate: "2026-09-15" });
  await period("P4", diego, { type: "fees", startDate: "2026-09-15" });
  await period("P5", gloria, {
    type: "contract", principalId: "M1", startDate: "2026-03-02", endDate: "2026-09-30", endReason: "jobEnd",
    settlementStatus: "requested", settlementRequestedAt: "2026-10-02",
  });
  await db.collection("worker").doc(carla.id).update({ address: "Pasaje Las Rosas 45", commune: "Requínoa" });

  await db.collection("faenas").doc("F3").set({ name: "Viña Los Robles", createdAt: new Date("2026-09-01") });
  await db.collection("subfaenas").doc("S3").set({ name: "Cuartel Sur", faenaId: "F3", createdAt: new Date("2026-09-01") });
  const robles = [ana, carla, diego];
  await db.collection("cycles").doc("C3").set({
    label: "Viña Los Robles/Cuartel Sur/Ciclo 1", faenaId: "F3", subfaenaId: "S3", status: "closed",
    startDate: "2026-10-08", days: ["2026-10-08"],
    labors: [{ id: "L1", name: "Principal", type: "main", workers: robles.map((w) => ({ rut: w.rut, id: w.id, name: w.name })) }],
    dayPrices: { L1: { "2026-10-08": { "0_0": { price: 35000, mode: "unit" } } } },
    dayNotesByLabor: {}, createdAt: new Date("2026-10-07"),
  });
  for (const w of robles) {
    await db.collection("workdays").doc(`C3__L1__${w.rut}__2026-10-08`).set({
      cycleId: "C3", laborId: "L1", workerRut: w.rut, workerId: w.id, date: "2026-10-08", payrollId: null, amount: 35000, qty: 1,
    });
  }
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  await seedDemo();
  console.log("datos de la ayuda sembrados");
  process.exit(0);
}

// Para la guía de Facturación: una empresa, dos centros de costo, las ventas y
// compras de octubre (una factura con abono, una solo neto, una que anula una
// nota de crédito y un combustible) y algunas de agosto y septiembre para el
// resumen del año.
export const DEMO_COMPANY = { id: "E1", rut: rut(76543210), razonSocial: "Servicios Agrícolas Demo SpA", alias: "Agrícola Demo" };

export async function seedBilling() {
  const db = getFirestore("hpdatabase");
  const at = new Date("2026-10-08T12:00:00-03:00");
  const { id: companyId, ...company } = DEMO_COMPANY;
  await db.collection("companies").doc(companyId).set({ ...company, enabled: true });
  await db.collection("costCenters").doc("CC1").set({ label: "Arriendo", emoji: "🏠" });
  await db.collection("costCenters").doc("CC2").set({ label: "Mantención", emoji: "🔧" });
  await db.collection("informalExpenses").doc("G1").set({
    costCenterId: "CC2", companyId, date: "2026-10-04", amount: 45000, detail: "Soldadura del portón",
  });

  const sale = (tipo, folio, client, date, neto, extra = {}) => {
    const iva = Math.round(neto * 0.19);
    return db.collection("dteDocuments").doc(`${companyId}_V_${tipo}_${folio}`).set({
      companyId, companyAlias: company.alias, kind: "venta", tipo, tipoLabel: tipo === 61 ? "Nota de Crédito Electrónica" : "Factura Electrónica",
      folio, fechaEmision: date, periodo: date.slice(0, 7),
      rutEmisor: company.rut, razonSocialEmisor: company.razonSocial,
      rutReceptor: rut(client.num), razonSocialReceptor: client.name,
      exento: 0, neto, iva, otrosImpuestos: 0, total: neto + iva,
      source: "sii_import", sourceFile: `RCV_VENTA_${date.slice(0, 7)}.csv`, importedAt: at, updatedAt: at,
      paymentStatus: "unpaid", payments: [], amountPaid: 0, notes: "", ...extra,
    });
  };
  const purchase = (folio, supplier, date, neto, extra = {}) => {
    const iva = Math.round(neto * 0.19);
    const other = extra.otrosImpuestos || 0;
    return db.collection("dteDocuments").doc(`${companyId}_C_${supplier.num}_33_${folio}`).set({
      companyId, companyAlias: company.alias, kind: "compra", tipo: 33, tipoLabel: "Factura Electrónica",
      folio, fechaEmision: date, periodo: date.slice(0, 7),
      rutEmisor: rut(supplier.num), razonSocialEmisor: supplier.name,
      rutReceptor: company.rut, razonSocialReceptor: company.razonSocial,
      exento: 0, neto, iva, otrosImpuestos: other, total: neto + iva + other,
      source: "sii_import", sourceFile: `RCV_COMPRA_${date.slice(0, 7)}.csv`, importedAt: at, updatedAt: at,
      paymentStatus: "unpaid", payments: [], amountPaid: 0, ...extra,
    });
  };

  const cerroVerde = { num: 96123450, name: "Frutícola Cerro Verde S.A." };
  const brisas = { num: 77234561, name: "Exportadora Las Brisas SpA" };
  const sanPedro = { num: 78345672, name: "Agrícola San Pedro Ltda." };
  const roble = { num: 79456783, name: "Comercial El Roble SpA" };
  await sale(33, 1201, cerroVerde, "2026-10-03", 2000000);
  await sale(33, 1202, brisas, "2026-10-06", 1500000, {
    payments: [{ id: "p1", date: "2026-10-08", kind: "abono", amount: 800000, notes: "Transferencia", recordedAt: "2026-10-08T12:00:00.000Z" }],
    amountPaid: 800000,
  });
  await sale(33, 1203, sanPedro, "2026-10-07", 900000, { paymentStatus: "net_only" });
  await sale(33, 1204, roble, "2026-10-07", 300000);
  await sale(61, 46, roble, "2026-10-08", 300000);
  await sale(33, 1190, cerroVerde, "2026-09-15", 2400000, { paymentStatus: "paid" });
  await sale(33, 1185, brisas, "2026-08-20", 1800000, { paymentStatus: "paid" });

  const fuel = { num: 96654320, name: "Combustibles del Valle S.A." };
  const olmos = { num: 76765431, name: "Inmobiliaria Los Olmos Ltda." };
  const parts = { num: 77876542, name: "Repuestos Agrícolas Sur SpA" };
  await purchase(88123, fuel, "2026-10-02", 400000, { otrosImpuestos: 52000, otroImpuestoCodigo: 28, otroImpuestoCategory: "combustible" });
  await purchase(5501, olmos, "2026-10-01", 600000, { costCenterId: "CC1" });
  await purchase(3307, parts, "2026-10-05", 250000, { costCenterId: "CC2" });
  await purchase(5487, olmos, "2026-09-01", 600000, { costCenterId: "CC1" });
  await purchase(87410, fuel, "2026-09-12", 380000, { otrosImpuestos: 49000, otroImpuestoCodigo: 28, otroImpuestoCategory: "combustible" });
  await purchase(5470, olmos, "2026-08-01", 600000, { costCenterId: "CC1" });
}

// Para la guía de Cheques y pagos: un cheque emitido y uno recibido, un pago
// vencido, otro aplazado, un crédito de doce cuotas con dos pagadas y una
// deuda personal con un abono.
export async function seedCommitments() {
  const db = getFirestore("hpdatabase");
  const at = new Date("2026-10-08T12:00:00-03:00");
  const { id: companyId, ...company } = DEMO_COMPANY;
  await db.collection("companies").doc(companyId).set({ ...company, enabled: true });
  const base = {
    concept: "", notes: "", bank: "", chequeNumber: "", companyId, status: "pending", paidAt: "", extra: 0,
    seriesId: null, installment: null, createdAt: at, updatedAt: at,
  };
  const put = (id, data) => db.collection("commitments").doc(id).set({ ...base, ...data });

  await put("A1", { kind: "chequeIssued", counterparty: "Inmobiliaria Los Olmos Ltda.", concept: "Arriendo de octubre", dueDate: "2026-10-12", issueDate: "2026-10-01", amount: 714000, bank: "012", chequeNumber: "004512" });
  await put("A2", { kind: "payment", counterparty: "Combustibles del Valle S.A.", concept: "Petróleo de septiembre", dueDate: "2026-10-06", amount: 481000 });
  await put("A3", { kind: "chequeReceived", counterparty: "Frutícola Cerro Verde S.A.", concept: "Factura 1190", dueDate: "2026-10-20", amount: 2856000, bank: "001", chequeNumber: "118733" });
  await put("A4", { kind: "payment", counterparty: "Repuestos Agrícolas Sur SpA", concept: "Repuestos del tractor", dueDate: "2026-09-30", amount: 297500, status: "postponed" });
  await put("A5", {
    kind: "personalDebt", counterparty: "Mario Fuentes", concept: "Préstamo para la cosecha", dueDate: "2026-10-25", amount: 300000,
    partialPayments: [{ id: "pp1", date: "2026-10-05", amount: 100000, notes: "Efectivo", createdAt: "2026-10-05T12:00:00.000Z", createdBy: null }],
  });

  await db.collection("commitmentSeries").doc("SR1").set({
    kind: "installment", counterparty: "Banco del Estado", concept: "Crédito del tractor", notes: "", amount: 350000, companyId,
    frequency: "monthly", firstDate: "2026-08-15", count: 12, active: true, createdAt: at, updatedAt: at,
  });
  for (let n = 1; n <= 12; n++) {
    const month = 7 + n;
    const dueDate = `${2026 + Math.floor((month - 1) / 12)}-${String(((month - 1) % 12) + 1).padStart(2, "0")}-15`;
    const paid = n <= 2;
    await put(`SR1_${dueDate}`, {
      kind: "installment", counterparty: "Banco del Estado", concept: "Crédito del tractor", dueDate, amount: 350000,
      seriesId: "SR1", installment: { n, of: 12 }, status: paid ? "paid" : "pending", paidAt: paid ? dueDate : "",
    });
  }
}
