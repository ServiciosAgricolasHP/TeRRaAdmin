import { describe, it, expect } from "vitest";
import { deleteDoc, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../src/firebase";
import { workersService } from "../../src/services";
import { syncWorkers } from "../../src/services/workersService";

// La lista completa de trabajadores se lee entera una vez y después se pone al
// día con lo que cambió (`updatedAt`). Lo que hace "otro equipo" se escribe
// directo en Firestore, sin pasar por la caché.
const write = (id, data) => setDoc(doc(db, "worker", id), { ...data, updatedAt: serverTimestamp() }, { merge: true });

async function seedThree() {
  await write("1-9", { name: "Carla Soto" });
  await write("2-7", { name: "Ana Pérez" });
  await write("3-5", { name: "Beto Ruiz" });
}

const names = (list) => list.map((w) => w.name);

describe("la lista de trabajadores en el navegador", () => {
  it("la primera vez la lee entera, ordenada, y enseguida sale de la copia", async () => {
    await seedThree();
    const first = await syncWorkers();
    expect(first.reads).toBe(3);
    expect(names(first.data)).toEqual(["Ana Pérez", "Beto Ruiz", "Carla Soto"]);

    const again = await syncWorkers();
    expect(again.reads).toBe(0);
    expect(again.data).toBe(first.data);
  });

  it("pone al día lo que otro equipo cambió y agregó", async () => {
    await seedThree();
    await syncWorkers();
    await write("2-7", { name: "Ana Pérez Lagos" });
    await write("4-3", { name: "Dina Mora" });

    const { data } = await syncWorkers({ fresh: true });
    expect(names(data)).toEqual(["Ana Pérez Lagos", "Beto Ruiz", "Carla Soto", "Dina Mora"]);
  });

  it("quien se eliminó en otro equipo sale con la próxima carga completa", async () => {
    await seedThree();
    await syncWorkers();
    await deleteDoc(doc(db, "worker", "3-5"));

    const delta = await syncWorkers({ fresh: true });
    expect(names(delta.data)).toContain("Beto Ruiz");

    workersService.invalidate();
    const full = await syncWorkers();
    expect(names(full.data)).toEqual(["Ana Pérez", "Carla Soto"]);
  });

  it("eliminar en este equipo lo saca de la copia al tiro", async () => {
    await seedThree();
    await syncWorkers();
    await workersService.remove("3-5");
    const { data } = await syncWorkers({ fresh: true });
    expect(names(data)).toEqual(["Ana Pérez", "Carla Soto"]);
  });

  it("lo que se escribe sin updatedAt entra con la próxima carga completa", async () => {
    await seedThree();
    await syncWorkers();
    // Como el escáner, que no marca la hora.
    await setDoc(doc(db, "worker", "6-K"), { name: "Fito Escáner", rut: "6-K", idQr: [] });

    const delta = await syncWorkers({ fresh: true });
    expect(names(delta.data)).not.toContain("Fito Escáner");

    // Borrar la caché (Recargar en Nómina) la vuelve a leer entera.
    workersService.invalidate();
    const full = await syncWorkers();
    expect(full.reads).toBe(4);
    expect(names(full.data)).toContain("Fito Escáner");
  });
});
