import { describe, it, expect } from "vitest";
import { updateDoc, doc } from "firebase/firestore";
import { db } from "../../src/firebase";
import { workersService } from "../../src/services";
import { addFloorBonuses, deleteCascade, moveWorkdaysToCycle, removeFloorBonuses } from "../../src/services/workdayBatches";
import { syncPrefixRange } from "../../src/services/harvestSyncService";
import { workdayDocId } from "../../src/utils/cosechaCombos";
import { ANA, BETO, CICLO, FAENA, LABOR, SUBFAENA, all, get, set, seedCycle, seedWorkday, seedWorker } from "./helpers/seed";

// Las acciones que escriben muchas jornadas lo hacen en lotes, con un solo
// registro de auditoría por acción. Datos inventados.

const logsOf = async (action) => (await all("logs")).filter((l) => l.action === action);

describe("jornadas en lotes", () => {
  it("eliminar un ciclo en cascada borra sus jornadas y el ciclo, con un registro por las jornadas", async () => {
    await seedCycle();
    await seedWorkday({ rut: ANA.id, date: "2026-03-02", amount: 1000 });
    await seedWorkday({ rut: BETO.id, date: "2026-03-03", amount: 2000 });
    const cycle = await get("cycles", CICLO);
    const workdays = await all("workdays");
    const progress = [];
    await deleteCascade({ entity: "cycle", entityId: CICLO, cycles: [cycle], workdays, onProgress: (p) => progress.push(p) });

    expect(await all("workdays")).toEqual([]);
    expect(await get("cycles", CICLO)).toBeNull();
    expect(await logsOf("cascadeDelete")).toMatchObject([{ entity: "cycle", entityId: CICLO, meta: { workdays: 2, byCycle: { [CICLO]: 2 } } }]);
    // Las jornadas no dejan un registro cada una; el ciclo, sí.
    expect((await logsOf("delete")).map((l) => l.entity)).toEqual(["cycle"]);
    expect([...new Set(progress.map((p) => p.stage))]).toEqual(["workdays", "cycles"]);
  });

  it("eliminar una faena en cascada también borra sus subfaenas", async () => {
    await seedCycle();
    await seedWorkday({ rut: ANA.id, date: "2026-03-02", amount: 1000 });
    await deleteCascade({
      entity: "faena",
      entityId: FAENA,
      cycles: [await get("cycles", CICLO)],
      subjobs: [await get("subfaenas", SUBFAENA)],
      workdays: await all("workdays"),
    });
    expect(await all("workdays")).toEqual([]);
    expect(await get("subfaenas", SUBFAENA)).toBeNull();
    expect(await logsOf("cascadeDelete")).toMatchObject([{ entity: "faena", entityId: FAENA, meta: { workdays: 1 } }]);
  });

  it("mover jornadas al ciclo nuevo: solo los días elegidos, y las de una nómina quedan", async () => {
    await seedCycle();
    await seedCycle({ id: "ciclo-2", labors: [{ id: "labor-n", name: "Cosecha", type: "cosecha" }] });
    const moved = await seedWorkday({ rut: ANA.id, date: "2026-03-02", amount: 1000 });
    const paid = await seedWorkday({ rut: BETO.id, date: "2026-03-02", amount: 2000 });
    const otherDay = await seedWorkday({ rut: ANA.id, date: "2026-03-03", amount: 3000 });
    await updateDoc(doc(db, "workdays", paid), { payrollId: "N1" });

    const progress = [];
    const res = await moveWorkdaysToCycle({
      fromCycleId: CICLO,
      toCycleId: "ciclo-2",
      labors: [{ from: LABOR, to: "labor-n" }],
      days: new Set(["2026-03-02"]),
      onProgress: (p) => progress.push(p),
    });

    expect(res).toEqual({ moved: 1, skippedPaid: 1 });
    expect(await get("workdays", moved)).toBeNull();
    const target = await get("workdays", workdayDocId("ciclo-2", "labor-n", ANA.id, "2026-03-02", "1_1"));
    expect(target).toMatchObject({ cycleId: "ciclo-2", laborId: "labor-n", workerRut: ANA.id, amount: 1000, qty: 10 });
    expect(target.updatedAt).toBeTruthy();
    expect(await get("workdays", paid)).toMatchObject({ payrollId: "N1" });
    expect(await get("workdays", otherDay)).toBeTruthy();
    expect(await logsOf("workdaysMove")).toMatchObject([{ entity: "cycle", entityId: "ciclo-2", meta: { fromCycleId: CICLO, moved: 1, skippedPaid: 1 } }]);
    expect([...new Set(progress.map((p) => p.stage))]).toEqual(["read", "move"]);
  });

  it("asignar un piso a todos y quitarlo escriben en lotes, con un registro cada uno", async () => {
    await seedCycle();
    const ids = [ANA.id, BETO.id].map((rut) => workdayDocId(CICLO, LABOR, rut, "2026-03-02", "_piso"));
    const workdays = [ANA.id, BETO.id].map((rut, i) => ({
      id: ids[i],
      data: { cycleId: CICLO, laborId: LABOR, workerRut: rut, workerId: rut, date: "2026-03-02", qty: 0, amount: 15000, pisoOnly: true },
    }));
    const done = [];
    await addFloorBonuses({ cycleId: CICLO, laborId: LABOR, date: "2026-03-02", floorKey: "_piso", amount: 15000, workdays, onProgress: (n, total) => done.push([n, total]) });
    const written = await all("workdays");
    expect(written.map((w) => w.id).sort()).toEqual([...ids].sort());
    expect(written.every((w) => w.pisoOnly && w.amount === 15000 && w.createdAt && w.updatedAt)).toBe(true);
    expect(done).toEqual([[2, 2]]);
    expect(await logsOf("floorApplyAll")).toMatchObject([{ entity: "cycle", entityId: CICLO, meta: { laborId: LABOR, floorKey: "_piso", amount: 15000, workers: 2 } }]);

    await removeFloorBonuses({ cycleId: CICLO, laborId: LABOR, date: "2026-03-02", floorKey: "_piso", ids });
    expect(await all("workdays")).toEqual([]);
    expect(await logsOf("floorRemove")).toMatchObject([{ meta: { deleted: 2 } }]);
    // Sin ninguna jornada en un registro propio.
    expect((await all("logs")).filter((l) => l.entity === "workday")).toEqual([]);
  });

  it("sincronizar pesajes escribe las jornadas en lotes, agrega días y personas, y no toca lo de una nómina", async () => {
    workersService.invalidate();
    await seedWorker(ANA);
    await seedWorker(BETO);
    await seedCycle({ dias: ["2026-03-02"] });
    await set("qrPrefixes", "AB", { cycleId: CICLO, laborId: LABOR });
    const weight = (id, rut, dateKey, amount) =>
      set("harvestWeights", id, { prefix: "AB", rut, dateKey, amount, weightProcess: 1, weightType: 1 });
    await weight("w1", ANA.id, "2026-03-02", 4);
    await weight("w2", ANA.id, "2026-03-02", 6);
    await weight("w3", BETO.id, "2026-03-03", 5);
    await weight("w4", "99999999-9", "2026-03-03", 2);
    // La de Beto ya está en una nómina.
    const paid = await seedWorkday({ rut: BETO.id, date: "2026-03-03", amount: 500, qty: 5 });
    await updateDoc(doc(db, "workdays", paid), { payrollId: "N1" });

    const progress = [];
    const res = await syncPrefixRange({
      prefix: { id: "AB", cycleId: CICLO, laborId: LABOR },
      dateFrom: "2026-03-01",
      dateTo: "2026-03-05",
      onProgress: (p) => progress.push(p),
    });

    expect(res).toMatchObject({ weightsRead: 4, groups: 3, written: 2, daysAdded: ["2026-03-03"], workersAdded: 2, unknownRuts: ["99999999-9"] });
    expect(res.blocked).toEqual([`${BETO.id} · 2026-03-03`]);
    expect(await get("workdays", workdayDocId(CICLO, LABOR, ANA.id, "2026-03-02", "1_1"))).toMatchObject({ qty: 10, harvestSynced: true, harvestPrefix: "AB", workerId: ANA.id });
    expect(await get("workdays", paid)).toMatchObject({ qty: 5, amount: 500, payrollId: "N1" });
    const cycle = await get("cycles", CICLO);
    expect(cycle.days).toEqual(["2026-03-02", "2026-03-03"]);
    expect(cycle.labors[0].workers.map((w) => w.id).sort()).toEqual([ANA.id, BETO.id].sort());
    expect((await get("qrPrefixes", "AB")).lastSync).toMatchObject({ written: 2 });
    expect(await logsOf("harvestSync")).toMatchObject([{ entity: "qrPrefix", entityId: "AB", meta: { cycleId: CICLO, written: 2, blocked: 1 } }]);
    expect((await all("logs")).filter((l) => l.entity === "workday")).toEqual([]);
    expect(progress.filter((p) => p.stage === "write").at(-1)).toMatchObject({ done: 2, total: 2 });
  });
});
