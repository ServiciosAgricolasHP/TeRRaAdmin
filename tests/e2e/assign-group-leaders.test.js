import { describe, it, expect } from "vitest";
import { doc, getDoc, getDocs, collection, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../src/firebase";
import { assignGroupLeaders, listWorkers } from "../../src/services/workersService";

// Asignar el grupo desde la revisión de la nómina: en las fichas, con el
// historial, un solo registro y la lista del navegador al día.
const write = (id, data) => setDoc(doc(db, "worker", id), { rut: id, ...data, updatedAt: serverTimestamp() });

describe("asignar el grupo a varias fichas", () => {
  it("pone el grupo primero en el historial y salta a quien ya lo tiene", async () => {
    await write("11111111-1", { name: "ANA PÉREZ", groupLeader: [] });
    await write("22222222-2", { name: "LUIS SOTO", groupLeader: ["SUR"] });
    await write("33333333-3", { name: "EVA ROJAS", groupLeader: ["NORTE"] });
    const workers = await listWorkers();
    const byId = Object.fromEntries(workers.map((w) => [w.id, w]));

    const count = await assignGroupLeaders([
      { worker: byId["11111111-1"], leader: "NORTE" },
      { worker: byId["22222222-2"], leader: "NORTE" },
      { worker: byId["33333333-3"], leader: "NORTE" },
    ]);

    expect(count).toBe(2);
    expect((await getDoc(doc(db, "worker", "11111111-1"))).data().groupLeader).toEqual(["NORTE"]);
    expect((await getDoc(doc(db, "worker", "22222222-2"))).data().groupLeader).toEqual(["NORTE", "SUR"]);

    const logs = (await getDocs(collection(db, "logs"))).docs.map((d) => d.data()).filter((l) => l.action === "groupLeaderAssign");
    expect(logs).toHaveLength(1);
    expect(logs[0].meta).toEqual({
      count: 2,
      workers: [
        { id: "11111111-1", leader: "NORTE", before: "" },
        { id: "22222222-2", leader: "NORTE", before: "SUR" },
      ],
    });

    const fresh = Object.fromEntries((await listWorkers()).map((w) => [w.id, w]));
    expect(fresh["22222222-2"].groupLeader).toEqual(["NORTE", "SUR"]);
  });

  it("sin nada que cambiar no escribe", async () => {
    await write("33333333-3", { name: "EVA ROJAS", groupLeader: ["NORTE"] });
    const [eva] = await listWorkers();
    expect(await assignGroupLeaders([{ worker: eva, leader: "NORTE" }])).toBe(0);
  });
});
