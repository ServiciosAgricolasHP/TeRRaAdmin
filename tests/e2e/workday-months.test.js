import { describe, it, expect } from "vitest";
import { deleteDoc, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../src/firebase";
import { syncWorkdayMonth } from "../../src/services/workdayMonths";

// Las jornadas de un mes que guarda el Calendario: se leen enteras la primera
// vez y después se ponen al día con lo que cambió y con un conteo del mes. Lo
// que hace "otro equipo" se escribe directo en Firestore.
const write = (id, date, data = {}, { stamp = true } = {}) =>
  setDoc(doc(db, "workdays", id), {
    cycleId: "C1", laborId: "L1", workerRut: "11111111-1", date, qty: 1, amount: 20000, ...data,
    ...(stamp ? { updatedAt: serverTimestamp() } : {}),
  });

async function seed() {
  await write("w1", "2026-10-01");
  await write("w2", "2026-10-02");
  await write("w3", "2026-09-30");
}

const ids = (list) => list.map((d) => d.id).sort();

describe("las jornadas de un mes en el Calendario", () => {
  it("se leen enteras una vez y después salen de la copia", async () => {
    await seed();
    const first = await syncWorkdayMonth("2026-10");
    expect(ids(first.data)).toEqual(["w1", "w2"]);
    // La jornada escrita más recientemente (la marca) y el mes.
    expect(first.reads).toBe(1 + 2);
    expect((await syncWorkdayMonth("2026-10")).reads).toBe(0);
  });

  it("lo que cambió en otro equipo llega con una consulta para todos los meses", async () => {
    await seed();
    await syncWorkdayMonth("2026-10");
    await syncWorkdayMonth("2026-09");
    await write("w2", "2026-10-02", { qty: 7 });
    await write("w4", "2026-09-15");

    const oct = await syncWorkdayMonth("2026-10", { fresh: true });
    expect(oct.data.find((d) => d.id === "w2").qty).toBe(7);
    // Lo escrito desde cinco minutos antes de la marca (acá, las cuatro
    // jornadas) y el conteo del mes.
    expect(oct.reads).toBe(4 + 1);
    const sep = await syncWorkdayMonth("2026-09", { fresh: true });
    expect(ids(sep.data)).toEqual(["w3", "w4"]);
  });

  it("lo eliminado o escrito sin updatedAt entra porque el conteo no calza", async () => {
    await seed();
    await syncWorkdayMonth("2026-10");
    await deleteDoc(doc(db, "workdays", "w1"));
    expect(ids((await syncWorkdayMonth("2026-10", { fresh: true })).data)).toEqual(["w2"]);

    await write("w5", "2026-10-20", {}, { stamp: false });
    expect(ids((await syncWorkdayMonth("2026-10", { fresh: true })).data)).toEqual(["w2", "w5"]);
  });
});
