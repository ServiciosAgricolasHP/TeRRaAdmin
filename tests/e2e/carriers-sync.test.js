import { describe, it, expect } from "vitest";
import { deleteDoc, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../src/firebase";
import { carriersService } from "../../src/services/carriersService";

// Los transportistas son una lista sincronizada: se leen enteros una vez y
// después se ponen al día con lo que cambió (`updatedAt`), contando los
// documentos para ver lo que se eliminó. Lo que hace "otro equipo" se escribe
// directo en Firestore, sin pasar por la caché.
const write = (id, data) =>
  setDoc(doc(db, "carriers", id), { ...data, updatedAt: serverTimestamp() }, { merge: true });

const carrier = (alias, extra = {}) => ({ alias, name: alias, type: "contracted", defaultRate: 0, vehicles: [], active: true, ...extra });
const aliases = (list) => list.map((c) => c.alias).sort();

describe("la lista de transportistas en el navegador", () => {
  it("separa los activos de los desactivados", async () => {
    await write("c1", carrier("Furgón Pérez"));
    await write("c2", carrier("Bus Soto", { active: false }));
    expect(aliases(await carriersService.listAll())).toEqual(["Furgón Pérez"]);
    expect(aliases(await carriersService.listAll({ includeInactive: true }))).toEqual(["Bus Soto", "Furgón Pérez"]);
  });

  it("lo que escribe este equipo entra en la copia sin releerla", async () => {
    await write("c1", carrier("Furgón Pérez"));
    await carriersService.listAll();
    const created = await carriersService.createCarrier({ alias: "bus ruiz", name: "bus ruiz" });
    await carriersService.updateCarrier("c1", { defaultRate: 15000 });
    await carriersService.softDelete(created.id);

    const all = await carriersService.listAll({ includeInactive: true });
    const byId = Object.fromEntries(all.map((c) => [c.id, c]));
    expect(byId.c1.defaultRate).toBe(15000);
    expect(byId[created.id]).toMatchObject({ alias: "Bus Ruiz", active: false });
    expect(aliases(await carriersService.listAll())).toEqual(["Furgón Pérez"]);
  });

  it("pone al día lo que otro equipo cambió, agregó y eliminó", async () => {
    await write("c1", carrier("Furgón Pérez"));
    await write("c2", carrier("Bus Soto"));
    await carriersService.listAll();
    await write("c1", { defaultRate: 20000 });
    await write("c3", carrier("Van Mora"));
    await deleteDoc(doc(db, "carriers", "c2"));

    const all = await carriersService.listAll({ fresh: true });
    expect(aliases(all)).toEqual(["Furgón Pérez", "Van Mora"]);
    expect(all.find((c) => c.id === "c1").defaultRate).toBe(20000);
  });
});
