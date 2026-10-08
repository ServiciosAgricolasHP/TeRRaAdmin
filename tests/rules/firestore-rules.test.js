// Tests de `firestore.rules` por tipo de cliente: cuenta con perfil, cuenta
// sin perfil, sin sesión (escáner y apps de cosecha) y cola del backend. Las
// escrituras replican las de cada app.
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

// Proyecto `demo-`: solo existe en el emulador.
const PROJECT_ID = "demo-terra-rules";

let env;

const anon = () => env.unauthenticatedContext().firestore();
const as = (uid) => env.authenticatedContext(uid).firestore();
// Cuenta de Authentication sin perfil en `users`.
const stranger = () => as("stranger");

// Pesaje con la forma que escribe el escáner.
function weight(extra = {}) {
  return {
    idQr: "HP-001",
    prefix: "HP",
    rut: "11111111-1",
    amount: 12.5,
    dateInsert: Timestamp.fromDate(new Date("2026-10-07T12:00:00Z")),
    dateKey: "2026-10-07",
    supervisor: "Juan",
    deviceId: "dev-1",
    weightType: 1,
    weightProcess: 2,
    paid: false,
    ...extra,
  };
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users/admin1"), { role: "admin", email: "admin@terra.test" });
    await setDoc(doc(db, "users/upperAdmin"), { role: "ADMIN" });
    await setDoc(doc(db, "users/sup1"), { role: "user" });
    await setDoc(doc(db, "worker/11111111-1"), {
      name: "Ana",
      rut: "11111111-1",
      idQr: ["HP-001"],
      groupLeader: ["Juan"],
      bankDetails: ["11111111-1", "123456", "CTA", "012"],
      email: "ana@terra.test",
    });
    await setDoc(doc(db, "worker/22222222-2"), { name: "Beto", idQr: [] });
    await setDoc(doc(db, "qrPrefixes/HP"), {
      cycleId: "c1",
      laborId: "l1",
      padron: { "HP-001": { rut: "11111111-1", name: "Ana" } },
    });
    await setDoc(doc(db, "harvestWeights/w1"), weight());
    await setDoc(doc(db, "payrolls/p1"), { total: 1000 });
    await setDoc(doc(db, "catalogs/qualities"), { entries: [] });
    await setDoc(doc(db, "groupLeader/g1"), { name: "Juan" });
    await setDoc(doc(db, "weights/2026-10-01"), { total: 1 });
    await setDoc(doc(db, "weights/2026-10-01/entry/e1"), { rut: "11111111-1" });
    await setDoc(doc(db, "logs/l1"), { uid: "admin1", action: "create" });
    await setDoc(doc(db, "functionJobs/j1"), { type: "ping", status: "done", requestedBy: "admin1" });
  });
});

describe("cuentas con perfil (TeRRa y Calendario)", () => {
  it("leen y escriben las colecciones de la app, sea cual sea el rol", async () => {
    const db = as("sup1");
    await assertSucceeds(getDoc(doc(db, "payrolls/p1")));
    await assertSucceeds(setDoc(doc(db, "payrolls/p2"), { total: 1 }));
    await assertSucceeds(updateDoc(doc(db, "worker/11111111-1"), { bankDetails: ["11111111-1", "999", "CTA", "012"] }));
    await assertSucceeds(deleteDoc(doc(db, "payrolls/p1")));
  });

  // Tamaño de lote que usa la app.
  it("un lote de 450 escrituras pasa", async () => {
    const db = as("sup1");
    const batch = writeBatch(db);
    for (let i = 0; i < 450; i++) batch.set(doc(db, `workdays/wd-${i}`), { amount: i });
    await assertSucceeds(batch.commit());
  });
});

describe("sin perfil no se entra", () => {
  it("sin sesión no se lee ni se escribe nada de la app", async () => {
    await assertFails(getDoc(doc(anon(), "payrolls/p1")));
    await assertFails(setDoc(doc(anon(), "payrolls/p2"), { total: 1 }));
    await assertFails(getDoc(doc(anon(), "users/admin1")));
    await assertFails(getDoc(doc(anon(), "logs/l1")));
  });

  it("una sesión sin perfil tampoco", async () => {
    await assertFails(getDoc(doc(stranger(), "payrolls/p1")));
    await assertFails(setDoc(doc(stranger(), "payrolls/p2"), { total: 1 }));
    await assertFails(updateDoc(doc(stranger(), "worker/11111111-1"), { bankDetails: [] }));
  });

  it("y no puede crearse un perfil propio", async () => {
    await assertFails(setDoc(doc(stranger(), "users/stranger"), { role: "admin" }));
    await assertFails(setDoc(doc(stranger(), "users/stranger"), { alias: "yo" }, { merge: true }));
  });
});

describe("perfiles (users)", () => {
  it("cada uno lee el suyo; el admin lee todos", async () => {
    await assertSucceeds(getDoc(doc(as("sup1"), "users/sup1")));
    await assertFails(getDoc(doc(as("sup1"), "users/admin1")));
    await assertSucceeds(getDoc(doc(as("admin1"), "users/sup1")));
    await assertSucceeds(getDocs(collection(as("admin1"), "users")));
  });

  it("cada uno guarda sus preferencias, nunca su rol", async () => {
    const db = as("sup1");
    await assertSucceeds(setDoc(doc(db, "users/sup1"), { alias: "Sup" }, { merge: true }));
    await assertSucceeds(
      setDoc(doc(db, "users/sup1"), { faenaLayout: ["f1"], faenaLayoutUpdatedAt: serverTimestamp() }, { merge: true }),
    );
    await assertFails(updateDoc(doc(db, "users/sup1"), { role: "admin" }));
  });

  it("el admin carga saludos, pero no crea perfiles ni cambia roles", async () => {
    const db = as("admin1");
    await assertSucceeds(
      updateDoc(doc(db, "users/sup1"), {
        greetings: { workerAlreadyInLabor: "hola" },
        updatedAt: serverTimestamp(),
        updatedBy: "admin1",
      }),
    );
    await assertFails(updateDoc(doc(db, "users/sup1"), { role: "admin" }));
    await assertFails(setDoc(doc(db, "users/newUser"), { role: "user" }));
  });

  it("'ADMIN' en mayúsculas también es admin", async () => {
    await assertSucceeds(getDoc(doc(as("upperAdmin"), "users/sup1")));
  });
});

describe("auditoría (logs)", () => {
  it("se agrega firmada por quien escribe, y se lee con perfil", async () => {
    const db = as("sup1");
    await assertSucceeds(addDoc(collection(db, "logs"), { uid: "sup1", action: "update", timestamp: serverTimestamp() }));
    await assertFails(addDoc(collection(db, "logs"), { uid: "admin1", action: "update" }));
    await assertSucceeds(getDoc(doc(db, "logs/l1")));
  });

  it("no se edita ni se borra, ni siendo admin", async () => {
    const db = as("admin1");
    await assertFails(updateDoc(doc(db, "logs/l1"), { action: "delete" }));
    await assertFails(deleteDoc(doc(db, "logs/l1")));
  });
});

describe("cola del backend (functionJobs)", () => {
  // Job con la forma que encola la Consola admin.
  const job = (requestedBy, extra = {}) => ({
    type: "ping",
    status: "pending",
    requestedBy,
    requestedByEmail: "admin@terra.test",
    requestedAt: serverTimestamp(),
    ...extra,
  });

  it("un admin encola a su nombre y en pending", async () => {
    const db = as("admin1");
    await assertSucceeds(addDoc(collection(db, "functionJobs"), job("admin1")));
    await assertFails(addDoc(collection(db, "functionJobs"), job("admin1", { status: "done" })));
    await assertFails(addDoc(collection(db, "functionJobs"), job("sup1")));
    await assertSucceeds(getDoc(doc(db, "functionJobs/j1")));
  });

  it("nadie más encola, lee ni toca un job", async () => {
    await assertFails(addDoc(collection(as("sup1"), "functionJobs"), job("sup1")));
    await assertFails(addDoc(collection(anon(), "functionJobs"), job(null)));
    await assertFails(getDoc(doc(as("sup1"), "functionJobs/j1")));
    await assertFails(updateDoc(doc(as("admin1"), "functionJobs/j1"), { status: "pending" }));
  });
});

describe("escáner y apps de cosecha, sin sesión", () => {
  it("leen lo que usan", async () => {
    const db = anon();
    await assertSucceeds(getDoc(doc(db, "worker/11111111-1")));
    await assertSucceeds(getDocs(collection(db, "worker")));
    await assertSucceeds(getDoc(doc(db, "catalogs/qualities")));
    await assertSucceeds(getDocs(collection(db, "groupLeader")));
    await assertSucceeds(getDocs(collection(db, "qrPrefixes")));
    await assertSucceeds(
      getDocs(query(collection(db, "harvestWeights"), where("prefix", "==", "HP"), where("dateKey", "==", "2026-10-07"), limit(1))),
    );
    await assertSucceeds(getDoc(doc(db, "weights/2026-10-01")));
    await assertSucceeds(getDocs(collection(db, "weights/2026-10-01/entry")));
  });

  it("el escáner asigna QR y líder, y completa el RUT si falta", async () => {
    const db = anon();
    await assertSucceeds(updateDoc(doc(db, "worker/11111111-1"), { idQr: ["HP-001", "XX-7"] }));
    await assertSucceeds(updateDoc(doc(db, "worker/11111111-1"), { groupLeader: ["Pedro", "Juan"] }));
    await assertSucceeds(updateDoc(doc(db, "worker/22222222-2"), { idQr: ["HP-002"], rut: "22222222-2" }));
  });

  it("pero no toca cuentas bancarias, nombres ni un RUT que ya está", async () => {
    const db = anon();
    await assertFails(updateDoc(doc(db, "worker/11111111-1"), { bankDetails: ["1", "2", "3", "4"] }));
    await assertFails(updateDoc(doc(db, "worker/11111111-1"), { name: "Otra" }));
    await assertFails(updateDoc(doc(db, "worker/11111111-1"), { rut: "99999999-9" }));
    // Reemplazo completo del documento.
    await assertFails(setDoc(doc(db, "worker/11111111-1"), { name: "Ana", rut: "11111111-1", idQr: ["HP-001"] }));
    await assertFails(deleteDoc(doc(db, "worker/11111111-1")));
  });

  it("da de alta trabajadores con nombre, RUT y QR, nada más", async () => {
    const db = anon();
    await assertSucceeds(setDoc(doc(db, "worker/33333333-3"), { name: "Caro", rut: "33333333-3", idQr: ["HP-003"] }));
    await assertFails(
      setDoc(doc(db, "worker/44444444-4"), { name: "Dani", rut: "44444444-4", idQr: [], bankDetails: ["x"] }),
    );
  });

  it("mueve el padrón del prefijo, no su configuración", async () => {
    const db = anon();
    await assertSucceeds(updateDoc(doc(db, "qrPrefixes/HP"), { "padron.HP-002": { rut: "22222222-2", name: "Beto" } }));
    await assertSucceeds(updateDoc(doc(db, "qrPrefixes/HP"), { "padron.HP-001": deleteField() }));
    // Prefijo nuevo, creado con merge.
    await assertSucceeds(setDoc(doc(db, "qrPrefixes/XX"), { padron: { "XX-1": { rut: "1-9", name: "X" } } }, { merge: true }));
    await assertFails(updateDoc(doc(db, "qrPrefixes/HP"), { cycleId: "otro" }));
    await assertFails(deleteDoc(doc(db, "qrPrefixes/HP")));
  });

  it("crea pesajes con la forma del escáner y nada distinto", async () => {
    const db = anon();
    await assertSucceeds(setDoc(doc(db, "harvestWeights/w2"), weight()));
    await assertFails(setDoc(doc(db, "harvestWeights/w3"), weight({ paid: true })));
    await assertFails(setDoc(doc(db, "harvestWeights/w4"), weight({ amount: -1 })));
    await assertFails(setDoc(doc(db, "harvestWeights/w5"), weight({ dateKey: "07-10-2026" })));
    await assertFails(setDoc(doc(db, "harvestWeights/w6"), weight({ cycleId: "c1" })));
    const { rut: _rut, ...withoutRut } = weight();
    await assertFails(setDoc(doc(db, "harvestWeights/w7"), withoutRut));
  });

  it("reintentar un pesaje tal cual vale; cambiarlo o borrarlo no", async () => {
    const db = anon();
    await assertSucceeds(setDoc(doc(db, "harvestWeights/w1"), weight()));
    await assertFails(updateDoc(doc(db, "harvestWeights/w1"), { amount: 500 }));
    await assertFails(deleteDoc(doc(db, "harvestWeights/w1")));
  });
});
