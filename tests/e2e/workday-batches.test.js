import { describe, it, expect } from "vitest";
import { deleteCascade } from "../../src/services/workdayBatches";
import { ANA, BETO, CICLO, FAENA, SUBFAENA, all, get, seedCycle, seedWorkday } from "./helpers/seed";

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
});
