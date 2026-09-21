// Siembra de datos para los ciclos end-to-end. Todo va contra el emulador
// (ver tests/e2e/setup.js), que se vacía antes de cada test, así que los ids
// son fijos y legibles a propósito: si un test falla, el mensaje dice
// "ciclo-1" y no un hash.
import { doc, setDoc, getDoc, collection, getDocs } from "firebase/firestore";
import { db } from "../../../src/firebase";
import { workdayDocId } from "../../../src/utils/cosechaCombos";

export const FAENA = "faena-1";
export const SUBFAENA = "sub-1";
export const CICLO = "ciclo-1";
export const LABOR = "labor-1";

// Tres perfiles que cubren las tres ramas del reparto de una nómina.
export const ANA = { id: "11111111-1", name: "Ana Banco", bankCode: "012" };
export const BETO = { id: "12345678-5", name: "Beto Efectivo", bankCode: "EFE" };
export const CARO = { id: "12345670-K", name: "Caro Sin Datos", bankCode: "" };

export const set = (col, id, data) => setDoc(doc(db, col, id), data);

export const get = async (col, id) => {
  const snap = await getDoc(doc(db, col, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

export const all = async (col) => {
  const snap = await getDocs(collection(db, col));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export async function seedWorker(w, { groupLeader = "GRUPO A" } = {}) {
  await set("worker", w.id, {
    rut: w.id,
    name: w.name,
    groupLeader: [groupLeader],
    // [paymentRut, accountNumber, accountType, bankCode] — el orden importa.
    bankDetails: w.bankCode ? [w.id, "12345678", 3, w.bankCode] : [],
  });
  return w;
}

// Un ciclo abierto con una labor de cosecha, que es el caso más común.
export async function seedCycle({ id = CICLO, dias = ["2026-03-02", "2026-03-03"] } = {}) {
  await set("faenas", FAENA, { name: "Faena Uno" });
  await set("subfaenas", SUBFAENA, { name: "Sub Uno", faenaId: FAENA });
  await set("cycles", id, {
    label: `Faena Uno/Sub Uno/${id}`,
    faenaId: FAENA,
    subfaenaId: SUBFAENA,
    status: "open",
    days: dias,
    labors: [
      {
        id: LABOR,
        name: "Cosecha",
        type: "cosecha",
        workers: [],
      },
    ],
    dayPrices: {},
  });
  return id;
}

// Un día de producción. El docId lo arma `workdayDocId`, igual que la app.
export async function seedWorkday({
  cycleId = CICLO,
  laborId = LABOR,
  rut,
  date,
  amount,
  qty = 10,
  combo = "1_1",
}) {
  const id = workdayDocId(cycleId, laborId, rut, date, combo);
  await set("workdays", id, {
    cycleId,
    laborId,
    workerRut: rut,
    workerId: rut,
    date,
    qty,
    amount,
    qualityX: 1,
    containerY: 1,
  });
  return id;
}

export async function seedAdvance(id, { rut, amount, type = "anticipo", date = "2026-01-15", ...rest }) {
  await set("advances", id, {
    type,
    workerRut: rut,
    workerId: rut,
    workerName: rut,
    amount,
    date,
    status: "pending",
    amountPaid: 0,
    payments: [],
    ...rest,
  });
  return id;
}

// Escenario completo listo para armar una nómina: 3 trabajadores con
// producción en un ciclo abierto.
export async function seedEscenarioNomina() {
  await seedCycle();
  for (const w of [ANA, BETO, CARO]) await seedWorker(w);
  const workdays = {
    ana: [
      await seedWorkday({ rut: ANA.id, date: "2026-03-02", amount: 60000 }),
      await seedWorkday({ rut: ANA.id, date: "2026-03-03", amount: 40000 }),
    ],
    beto: [await seedWorkday({ rut: BETO.id, date: "2026-03-02", amount: 50000 })],
    caro: [await seedWorkday({ rut: CARO.id, date: "2026-03-02", amount: 30000 })],
  };
  return { workdays };
}

// Los tipos de labor que pide `aggregateWorkerAmounts`.
export const laborTypes = () => new Map([[LABOR, "cosecha"]]);
