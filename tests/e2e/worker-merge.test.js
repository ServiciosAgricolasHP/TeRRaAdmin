import { describe, it, expect } from "vitest";
import { updateDoc, doc } from "firebase/firestore";
import { db } from "../../src/firebase";
import { analyzeWorkerMerge, mergeWorkers } from "../../src/services/workerMergeService";
import { findWorkerByRut } from "../../src/services/workersService";
import { workdayDocId } from "../../src/utils/cosechaCombos";
import { ANA, CICLO, LABOR, all, get, set, seedCycle, seedWorkday, seedWorker } from "./helpers/seed";

// Unir una ficha duplicada a la que queda. Datos inventados: el clon lo creó
// la importación con el RUT provisorio de otra empresa.

const CLONE = { id: "100000001-K", name: "Ana Banco Duplicada", bankCode: "EFE" };

async function seed() {
  await seedWorker(ANA);
  await seedWorker(CLONE);
  await seedCycle({
    dias: ["2026-03-02", "2026-03-03", "2026-03-04"],
    labors: [{ id: LABOR, name: "Cosecha", type: "cosecha", workers: [{ id: CLONE.id, rut: CLONE.id, name: CLONE.name }, { id: ANA.id, rut: ANA.id, name: ANA.name }] }],
  });
  // Del clon: una sin nómina, una pagada y una que choca con la de Ana.
  await seedWorkday({ rut: CLONE.id, date: "2026-03-02", amount: 1000, qty: 10 });
  await seedWorkday({ rut: CLONE.id, date: "2026-03-03", amount: 2000, qty: 20 });
  await seedWorkday({ rut: CLONE.id, date: "2026-03-04", amount: 300, qty: 3 });
  await seedWorkday({ rut: ANA.id, date: "2026-03-04", amount: 500, qty: 5 });
  await updateDoc(doc(db, "workdays", workdayDocId(CICLO, LABOR, CLONE.id, "2026-03-03", "1_1")), { payrollId: "N1" });
}

const workerOf = async (id) => ({ id, ...(await get("worker", id)) });

describe("unir fichas", () => {
  it("pasa las jornadas sin nómina, resuelve el choque y deja al clon apuntando a la ficha que queda", async () => {
    await seed();
    const clone = await workerOf(CLONE.id);
    const kept = await workerOf(ANA.id);
    const analysis = await analyzeWorkerMerge(clone, kept);
    expect(analysis.blockers).toEqual([]);
    const conflictId = workdayDocId(CICLO, LABOR, ANA.id, "2026-03-04", "1_1");
    expect(Object.keys(analysis.existing)).toEqual([conflictId]);

    const progress = [];
    await mergeWorkers({ clone, kept, analysis, decisions: { [conflictId]: "sum" }, onProgress: (p) => progress.push(p) });

    const wds = await all("workdays");
    // La sin nómina pasó a Ana, con un id nuevo; la del clon ya no está.
    const moved = await get("workdays", workdayDocId(CICLO, LABOR, ANA.id, "2026-03-02", "1_1"));
    expect(moved).toMatchObject({ workerRut: ANA.id, workerId: ANA.id, qty: 10, amount: 1000 });
    expect(await get("workdays", workdayDocId(CICLO, LABOR, CLONE.id, "2026-03-02", "1_1"))).toBeNull();
    // La pagada no se tocó.
    expect(await get("workdays", workdayDocId(CICLO, LABOR, CLONE.id, "2026-03-03", "1_1"))).toMatchObject({ workerRut: CLONE.id, payrollId: "N1" });
    // El choque se sumó.
    expect(await get("workdays", conflictId)).toMatchObject({ qty: 8, amount: 800 });
    expect(wds).toHaveLength(3);

    // El clon sigue en la labor por su jornada pagada; Ana ya estaba.
    const cycle = await get("cycles", CICLO);
    expect(cycle.labors[0].workers.map((w) => w.id)).toEqual([CLONE.id, ANA.id]);

    const keptAfter = await get("worker", ANA.id);
    expect(keptAfter.rutHistory).toEqual([CLONE.id]);
    expect(keptAfter.fileAliases).toEqual([{ rut: CLONE.id, name: CLONE.name }]);
    expect(await get("worker", CLONE.id)).toMatchObject({ mergedInto: ANA.id });
    expect((await findWorkerByRut(CLONE.id)).id).toBe(ANA.id);

    const logs = (await all("logs")).filter((l) => l.action === "workerMerge");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ entity: "worker", entityId: ANA.id, meta: { cloneId: CLONE.id, moved: 1, paidLeft: 1, conflicts: [{ id: conflictId, choice: "sum" }] } });
    expect([...new Set(progress.map((p) => p.stage))]).toEqual(["check", "write", "cycles", "workers"]);
  });

  it("donde el clon no tiene jornadas pagadas, la ficha que queda toma su lugar en la labor", async () => {
    await seedWorker(ANA);
    await seedWorker(CLONE);
    await seedCycle({ labors: [{ id: LABOR, name: "Cosecha", type: "cosecha", workers: [{ id: CLONE.id, rut: CLONE.id, name: CLONE.name }] }] });
    await seedWorkday({ rut: CLONE.id, date: "2026-03-02", amount: 1000 });
    const clone = await workerOf(CLONE.id);
    const kept = await workerOf(ANA.id);
    await mergeWorkers({ clone, kept, analysis: await analyzeWorkerMerge(clone, kept), decisions: {} });
    expect((await get("cycles", CICLO)).labors[0].workers).toEqual([{ id: ANA.id, rut: ANA.id, name: ANA.name }]);
  });

  it("no une si el clon tiene QR o anticipos con saldo", async () => {
    await seed();
    await updateDoc(doc(db, "worker", CLONE.id), { idQr: ["XX-1"] });
    await set("advances", "A1", { type: "anticipo", workerRut: CLONE.id, workerId: CLONE.id, amount: 10000, amountPaid: 0, status: "pending" });
    const clone = await workerOf(CLONE.id);
    const kept = await workerOf(ANA.id);
    const analysis = await analyzeWorkerMerge(clone, kept);
    expect(analysis.blockers).toHaveLength(2);
    await expect(mergeWorkers({ clone, kept, analysis, decisions: {} })).rejects.toThrow(/QR/);
    expect((await get("worker", CLONE.id)).mergedInto).toBeUndefined();
  });
});
