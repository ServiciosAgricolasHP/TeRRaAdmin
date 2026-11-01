import { describe, it, expect } from "vitest";
import { deleteDoc, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../src/firebase";
import { fortnightsService, paymentsService } from "../../src/services/transportsService";
import { syncFortnights, syncTransportPayments } from "../../src/services/transportLists";

// Los resúmenes de transporte y las quincenas que lee el Dashboard: se leen
// enteros una vez y después se ponen al día con lo que cambió y con un conteo.
// Lo que hace "otro equipo" se escribe directo en Firestore.
const write = (collection, id, data) =>
  setDoc(doc(db, collection, id), { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });

async function seed() {
  await write("transportPayments", "r1", { carrierId: "c1", total: 120000, status: "pending", abonos: [], payrollId: null, tripIds: [] });
  await write("transportPayments", "r2", { carrierId: "c2", total: 80000, status: "pending", abonos: [], payrollId: null, tripIds: [] });
}

const byId = (list) => Object.fromEntries(list.map((d) => [d.id, d]));

describe("los resúmenes de transporte y las quincenas en el navegador", () => {
  it("se leen enteros una vez y después salen de la copia", async () => {
    await seed();
    const first = await syncTransportPayments();
    expect(first.reads).toBe(2);
    expect((await syncTransportPayments()).reads).toBe(0);
  });

  it("una quincena y un abono hechos en Transportes llegan con la puesta al día", async () => {
    await seed();
    await syncTransportPayments();
    await syncFortnights();

    const fortnight = await fortnightsService.create({ name: "quincena de prueba", paymentIds: ["r1"] });
    await paymentsService.addAbono("r2", { amount: 30000, date: "2026-10-20" });

    const payments = byId((await syncTransportPayments({ fresh: true })).data);
    expect(payments.r1.payrollId).toBe(fortnight.id);
    expect(payments.r2.abonos.map((a) => a.amount)).toEqual([30000]);
    const fortnights = (await syncFortnights({ fresh: true })).data;
    expect(fortnights.map((q) => [q.name, q.total])).toEqual([["Quincena de Prueba", 120000]]);
  });

  it("un resumen eliminado en otro equipo sale con el conteo", async () => {
    await seed();
    await syncTransportPayments();
    await deleteDoc(doc(db, "transportPayments", "r2"));

    const { data } = await syncTransportPayments({ fresh: true });
    expect(data.map((p) => p.id)).toEqual(["r1"]);
  });
});
