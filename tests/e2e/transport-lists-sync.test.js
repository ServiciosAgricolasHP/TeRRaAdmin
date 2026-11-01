import { describe, it, expect } from "vitest";
import { deleteDoc, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../src/firebase";
import { fortnightsService, paymentsService, tripsService } from "../../src/services/transportsService";
import { syncFortnights, syncTransportPayments, syncTrips } from "../../src/services/transportLists";

// Las vueltas, los resúmenes de transporte y las quincenas que leen Transportes
// y el Dashboard: se leen enteros una vez y después se ponen al día con lo que
// cambió y con un conteo. Lo que hace "otro equipo" se escribe directo en
// Firestore.
const write = (collection, id, data) =>
  setDoc(doc(db, collection, id), { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });

async function seed() {
  await write("transportPayments", "r1", { carrierId: "c1", total: 120000, status: "pending", abonos: [], payrollId: null, tripIds: [] });
  await write("transportPayments", "r2", { carrierId: "c2", total: 80000, status: "pending", abonos: [], payrollId: null, tripIds: [] });
}

const byId = (list) => Object.fromEntries(list.map((d) => [d.id, d]));

const trip = (over = {}) =>
  tripsService.create({
    carrierId: "c1", vehicleAlias: "Camión 1", cycleId: "ciclo-1", date: "2026-10-05",
    kind: "regular", qty: 1, rate: 40000, status: "pending", ...over,
  });

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

  it("Transportes filtra la copia de vueltas y la pone al día cada vez que la pide", async () => {
    const a = await trip({ date: "2026-10-01" });
    const b = await trip({ date: "2026-10-08", carrierId: "c2" });
    expect((await syncTrips()).reads).toBe(2);

    // Otro equipo agrega una vuelta: la próxima lista de Transportes ya la trae.
    await setDoc(doc(db, "transports", "otra"), {
      carrierId: "c1", date: "2026-10-09", status: "pending", amount: 0, updatedAt: serverTimestamp(),
    });
    expect((await tripsService.listByCarrier("c1")).map((t) => t.id).sort()).toEqual([a.id, "otra"].sort());
    expect((await tripsService.listSince("2026-10-08")).map((t) => t.id).sort()).toEqual([b.id, "otra"].sort());
    expect((await tripsService.listPendingUnlinked()).length).toBe(3);
  });

  it("una vuelta eliminada acá sale de la copia sin volver a leerla entera", async () => {
    const a = await trip();
    const b = await trip();
    await syncTrips();
    await tripsService.remove(a.id);

    const { data, reads } = await syncTrips({ fresh: true });
    expect(data.map((t) => t.id)).toEqual([b.id]);
    expect(reads).toBe(2);
  });
});
