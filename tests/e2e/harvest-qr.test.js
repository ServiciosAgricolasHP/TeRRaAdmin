import { describe, it, expect } from "vitest";
import { updateDoc, doc } from "firebase/firestore";
import { db } from "../../src/firebase";
import { mirrorWeightToWorkdays } from "../../src/services/harvestSyncService";
import { ANA, CICLO, LABOR, all, set, seedCycle, seedWorker } from "./helpers/seed";

// Pesajes QR: el pesaje editado a mano llega a la jornada solo si el ciclo
// está abierto. Datos inventados.

describe("Pesajes QR", () => {
  it("un pesaje editado no cambia las jornadas de un ciclo cerrado", async () => {
    await seedWorker(ANA);
    await seedCycle();
    await updateDoc(doc(db, "cycles", CICLO), { status: "closed" });
    const prefixes = [{ id: "AB", cycleId: CICLO, laborId: LABOR }];
    await set("harvestWeights", "w1", { prefix: "AB", rut: ANA.id, dateKey: "2026-03-02", amount: 7, weightProcess: 1, weightType: 1 });

    const res = await mirrorWeightToWorkdays(prefixes, [{ prefixId: "AB", rut: ANA.id, dateKey: "2026-03-02", x: 1, y: 1 }]);

    expect(res).toMatchObject({ closed: ["AB"], written: 0 });
    expect(await all("workdays")).toEqual([]);
  });

  it("con el ciclo abierto, el pesaje llega a su jornada", async () => {
    await seedWorker(ANA);
    await seedCycle();
    const prefixes = [{ id: "AB", cycleId: CICLO, laborId: LABOR }];
    await set("harvestWeights", "w1", { prefix: "AB", rut: ANA.id, dateKey: "2026-03-02", amount: 7, weightProcess: 1, weightType: 1 });

    const res = await mirrorWeightToWorkdays(prefixes, [{ prefixId: "AB", rut: ANA.id, dateKey: "2026-03-02", x: 1, y: 1 }]);

    expect(res).toMatchObject({ closed: [], written: 1 });
    expect((await all("workdays")).map((w) => w.qty)).toEqual([7]);
  });
});
