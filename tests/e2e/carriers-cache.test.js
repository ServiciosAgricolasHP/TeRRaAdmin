import { describe, it, expect } from "vitest";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../src/firebase";
import { carriersService } from "../../src/services/carriersService";

// La lista de transportistas se guarda en el navegador: lo que se escribe en
// este equipo la corrige sin releerla, y lo que cambia en otro equipo (escrito
// directo en Firestore) no se ve hasta que vence.
const fromOtherDevice = (id, data) =>
  setDoc(doc(db, "carriers", id), { ...data, active: true, updatedAt: serverTimestamp() });

const aliases = (list) => list.map((c) => c.alias).sort();

describe("la lista de transportistas en el navegador", () => {
  it("después de la primera carga sale de la copia guardada", async () => {
    await fromOtherDevice("c1", { alias: "Camión Norte", type: "own" });
    expect(aliases(await carriersService.listAll())).toEqual(["Camión Norte"]);

    await fromOtherDevice("c2", { alias: "Fletes Sur", type: "contracted" });
    expect(aliases(await carriersService.listAll())).toEqual(["Camión Norte"]);
  });

  it("crear, editar, desactivar y reactivar en este equipo corrigen la copia", async () => {
    await fromOtherDevice("c1", { alias: "Camión Norte", type: "own" });
    await carriersService.listAll();

    const created = await carriersService.createCarrier({ alias: "fletes sur", type: "contracted" });
    expect(aliases(await carriersService.listAll())).toEqual(["Camión Norte", "Fletes Sur"]);

    await carriersService.updateCarrier(created.id, { alias: "fletes del sur" });
    expect(aliases(await carriersService.listAll())).toEqual(["Camión Norte", "Fletes del Sur"]);

    await carriersService.softDelete("c1");
    expect(aliases(await carriersService.listAll())).toEqual(["Fletes del Sur"]);
    const all = await carriersService.listAll({ includeInactive: true });
    expect(all.find((c) => c.id === "c1")).toMatchObject({ alias: "Camión Norte", active: false });

    await carriersService.restore("c1");
    expect(aliases(await carriersService.listAll())).toEqual(["Camión Norte", "Fletes del Sur"]);
  });
});
