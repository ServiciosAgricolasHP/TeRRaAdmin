import { describe, it, expect, vi } from "vitest";
import { deleteDoc, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../src/firebase";
import { workdaysService } from "../../src/services";
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
    // Lo escrito desde un minuto antes de la marca (acá, las cuatro
    // jornadas), las marcas de lo eliminado (ninguna) y el conteo del mes.
    expect(oct.reads).toBe(4 + 1 + 1);
    const sep = await syncWorkdayMonth("2026-09", { fresh: true });
    expect(ids(sep.data)).toEqual(["w3", "w4"]);
  });

  it("pasado un minuto sin escrituras, no vuelve a traer lo último escrito", async () => {
    await seed();
    await syncWorkdayMonth("2026-10");
    // Recién escritas, las tres jornadas caen en el minuto antes de la marca;
    // más la consulta de las marcas de lo eliminado y el conteo.
    expect((await syncWorkdayMonth("2026-10", { fresh: true })).reads).toBe(3 + 1 + 1);
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(Date.now() + 60 * 1000 + 1000);
      // Esta las ve todas por última vez y asienta la marca.
      expect((await syncWorkdayMonth("2026-10", { fresh: true })).reads).toBe(3 + 1 + 1);
      // Las dos consultas vacías y el conteo del mes.
      expect((await syncWorkdayMonth("2026-10", { fresh: true })).reads).toBe(1 + 1 + 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("un mes que toca contar se pone al día antes, aunque no haya pasado el minuto", async () => {
    await seed();
    await syncWorkdayMonth("2026-10");
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      // Pasado el minuto, otro mes pone al día las copias y octubre queda sin
      // revisar desde su lectura.
      vi.setSystemTime(Date.now() + 2 * 60 * 1000);
      await syncWorkdayMonth("2026-09");
      await write("w1", "2026-10-01", { qty: 7 });
      vi.setSystemTime(Date.now() + 10 * 1000);

      // El conteo de octubre calza igual: lo cambiado llega por la puesta al día.
      const { data } = await syncWorkdayMonth("2026-10");
      expect(data.find((d) => d.id === "w1").qty).toBe(7);
    } finally {
      vi.useRealTimers();
    }
  });

  it("lo eliminado con su marca sale de la copia sin releer el mes", async () => {
    await seed();
    await syncWorkdayMonth("2026-10");
    await workdaysService.remove("w1");

    const oct = await syncWorkdayMonth("2026-10", { fresh: true });
    expect(ids(oct.data)).toEqual(["w2"]);
    // Lo escrito en los últimos minutos que sigue en pie (w2 y w3), la marca y
    // el conteo del mes, que ya calza.
    expect(oct.reads).toBe(2 + 1 + 1);
  });

  it("lo eliminado sin marca o escrito sin updatedAt entra porque el conteo no calza", async () => {
    await seed();
    await syncWorkdayMonth("2026-10");
    await deleteDoc(doc(db, "workdays", "w1"));
    expect(ids((await syncWorkdayMonth("2026-10", { fresh: true })).data)).toEqual(["w2"]);

    await write("w5", "2026-10-20", {}, { stamp: false });
    expect(ids((await syncWorkdayMonth("2026-10", { fresh: true })).data)).toEqual(["w2", "w5"]);
  });
});
