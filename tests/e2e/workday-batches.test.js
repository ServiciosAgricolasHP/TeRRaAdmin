import { describe, it, expect } from "vitest";
import { updateDoc, doc } from "firebase/firestore";
import { db } from "../../src/firebase";
import { deleteCascade, moveWorkdaysToCycle } from "../../src/services/workdayBatches";
import { workdayDocId } from "../../src/utils/cosechaCombos";
import { ANA, BETO, CICLO, FAENA, LABOR, SUBFAENA, all, get, seedCycle, seedWorkday } from "./helpers/seed";

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
});
