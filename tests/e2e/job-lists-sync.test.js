import { describe, it, expect } from "vitest";
import { deleteDoc, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../src/firebase";
import { cyclesService, jobsService, subjobsService } from "../../src/services";
import { syncCycles, syncJobs, syncSubjobs } from "../../src/services/jobLists";
import { newestFirst } from "../../src/utils/syncedList";

// Las faenas y subfaenas que comparten las pantallas: se leen enteras una vez
// y después se ponen al día con lo que cambió y con un conteo. Lo que hace
// "otro equipo" se escribe directo en Firestore, sin pasar por la caché.
const write = (collection, id, data) =>
  setDoc(doc(db, collection, id), { ...data, updatedAt: serverTimestamp() }, { merge: true });

async function seed() {
  await write("faenas", "f1", { name: "Fundo Los Robles" });
  await write("faenas", "f2", { name: "Agrícola El Peumo" });
  await write("subfaenas", "s1", { name: "Cuartel Norte", faenaId: "f1" });
  await write("subfaenas", "s2", { name: "Cuartel Sur", faenaId: "f1" });
}

const names = (list) => list.map((d) => d.name);

describe("las faenas y subfaenas en el navegador", () => {
  it("se leen enteras una vez, ordenadas por nombre, y después salen de la copia", async () => {
    await seed();
    const first = await syncJobs();
    expect(first.reads).toBe(2);
    expect(names(first.data)).toEqual(["Agrícola El Peumo", "Fundo Los Robles"]);
    expect((await syncJobs()).reads).toBe(0);
  });

  it("ponen al día lo que otro equipo agregó, y una eliminada sale con el conteo", async () => {
    await seed();
    await syncJobs();
    await syncSubjobs();
    await write("faenas", "f3", { name: "Viña Santa Clara" });
    await deleteDoc(doc(db, "subfaenas", "s2"));

    expect(names((await syncJobs({ fresh: true })).data)).toEqual(["Agrícola El Peumo", "Fundo Los Robles", "Viña Santa Clara"]);
    expect(names((await syncSubjobs({ fresh: true })).data)).toEqual(["Cuartel Norte"]);
  });

  it("crear, renombrar y eliminar en este equipo corrigen la copia, en su lugar por nombre", async () => {
    await seed();
    await syncJobs();
    await syncSubjobs();

    const created = await subjobsService.create({ name: "Cuartel Centro", faenaId: "f1" });
    await jobsService.update("f2", { name: "Viña El Peumo" });
    expect(names((await syncSubjobs()).data)).toEqual(["Cuartel Centro", "Cuartel Norte", "Cuartel Sur"]);
    expect(names((await syncJobs()).data)).toEqual(["Fundo Los Robles", "Viña El Peumo"]);

    await subjobsService.remove(created.id);
    const after = await syncSubjobs({ fresh: true });
    expect(names(after.data)).toEqual(["Cuartel Norte", "Cuartel Sur"]);
    // Sin la carga completa: lo escrito en los últimos 5 minutos y el conteo.
    expect(after.reads).toBe(3);
  });

  it("los ciclos: lo que otro equipo cambia llega, y lo que se edita acá corrige la copia", async () => {
    await write("cycles", "c1", { label: "Fundo Los Robles/Cuartel Norte/Ciclo 1", faenaId: "f1", status: "open", days: [], createdAt: serverTimestamp() });
    await write("cycles", "c2", { label: "Fundo Los Robles/Cuartel Norte/Ciclo 2", faenaId: "f1", status: "open", days: [], createdAt: serverTimestamp() });
    await syncCycles();

    await write("cycles", "c1", { status: "closed" });
    await deleteDoc(doc(db, "cycles", "c2"));
    const synced = await syncCycles({ fresh: true });
    expect(synced.data.map((c) => [c.id, c.status])).toEqual([["c1", "closed"]]);

    const created = await cyclesService.create({ label: "Fundo Los Robles/Cuartel Norte/Ciclo 3", faenaId: "f1", status: "open", days: [] });
    await cyclesService.update(created.id, { days: ["2026-10-05"] });
    const local = await syncCycles();
    expect(local.reads).toBe(0);
    expect(newestFirst(local.data).map((c) => [c.id, c.days])).toEqual([[created.id, ["2026-10-05"]], ["c1", []]]);
  });
});
