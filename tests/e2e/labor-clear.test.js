import { describe, it, expect } from "vitest";
import { updateDoc, doc } from "firebase/firestore";
import { db } from "../../src/firebase";
import { clearLabor } from "../../src/services/laborClearService";
import { ANA, BETO, CICLO, LABOR, all, get, set, seedCycle, seedWorkday, seedWorker } from "./helpers/seed";

// Limpiar una labor del ciclo: borra sus jornadas, saca a sus personas y
// quita los días que quedan vacíos, con lo de una nómina y las vueltas de
// transporte intactos. Datos inventados.

const SUPERVISION = "labor-2";

async function seed() {
  await seedWorker(ANA);
  await seedWorker(BETO);
  await seedCycle({
    dias: ["2026-03-02", "2026-03-03", "2026-03-04"],
    labors: [
      { id: LABOR, name: "Cosecha", type: "cosecha", workers: [{ id: ANA.id, rut: ANA.id, name: ANA.name }, { id: BETO.id, rut: BETO.id, name: BETO.name }] },
      { id: SUPERVISION, name: "Supervisión", type: "supervision", workers: [{ id: BETO.id, rut: BETO.id, name: BETO.name }] },
    ],
  });
  await seedWorkday({ rut: ANA.id, date: "2026-03-02", amount: 1000 });
  await seedWorkday({ rut: ANA.id, date: "2026-03-03", amount: 1000 });
  await seedWorkday({ rut: BETO.id, date: "2026-03-04", amount: 1000 });
  await seedWorkday({ laborId: SUPERVISION, rut: BETO.id, date: "2026-03-03", amount: 5000, combo: "0_0" });
}

describe("limpiar una labor", () => {
  it("borra las jornadas de la labor, saca a sus personas y quita los días vacíos", async () => {
    await seed();
    const progress = [];
    const res = await clearLabor({ cycleId: CICLO, laborId: LABOR, onProgress: (p) => progress.push(p) });

    const wds = await all("workdays");
    expect(wds.map((w) => w.laborId)).toEqual([SUPERVISION]);
    const cycle = await get("cycles", CICLO);
    expect(cycle.labors.find((l) => l.id === LABOR).workers).toEqual([]);
    expect(cycle.labors.find((l) => l.id === SUPERVISION).workers.map((w) => w.id)).toEqual([BETO.id]);
    // El 03 lo usa la supervisión.
    expect(cycle.days).toEqual(["2026-03-03"]);
    expect(res.days).toEqual(cycle.days);
    expect([...new Set(progress.map((p) => p.stage))]).toEqual(["read", "delete", "cycle"]);

    const logs = (await all("logs")).filter((l) => l.action === "laborClear");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ entity: "cycle", entityId: CICLO, meta: { laborId: LABOR, deleted: 3, kept: 0, workersRemoved: 2, daysRemoved: ["2026-03-02", "2026-03-04"] } });
  });

  it("lo que está en una nómina queda, con su persona y su día", async () => {
    await seed();
    const paid = (await all("workdays")).find((w) => w.workerRut === BETO.id && w.laborId === LABOR);
    await updateDoc(doc(db, "workdays", paid.id), { payrollId: "N1" });
    await clearLabor({ cycleId: CICLO, laborId: LABOR });

    const left = await all("workdays");
    expect(left).toHaveLength(2);
    expect(left.map((w) => w.id)).toContain(paid.id);
    const cycle = await get("cycles", CICLO);
    expect(cycle.labors.find((l) => l.id === LABOR).workers.map((w) => w.id)).toEqual([BETO.id]);
    expect(cycle.days).toEqual(["2026-03-03", "2026-03-04"]);
  });

  it("un día con vueltas de transporte queda, y las vueltas no se tocan", async () => {
    await seed();
    await set("transports", "t1", { cycleId: CICLO, date: "2026-03-02", status: "pending", carrierId: "car-1", qty: 1, rate: 1000, amount: 1000 });
    const { plan } = await clearLabor({ cycleId: CICLO, laborId: LABOR });

    expect(plan.tripDays).toEqual(["2026-03-02"]);
    expect(plan.pendingTrips.map((t) => t.id)).toEqual(["t1"]);
    expect((await get("cycles", CICLO)).days).toEqual(["2026-03-02", "2026-03-03"]);
    expect(await get("transports", "t1")).toBeTruthy();
  });

  it("no limpia un ciclo cerrado", async () => {
    await seed();
    await updateDoc(doc(db, "cycles", CICLO), { status: "closed" });
    await expect(clearLabor({ cycleId: CICLO, laborId: LABOR })).rejects.toThrow(/cerrado/);
    expect(await all("workdays")).toHaveLength(4);
  });
});
