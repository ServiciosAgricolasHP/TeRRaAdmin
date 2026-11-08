import { describe, it, expect } from "vitest";
import { deleteDoc, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../src/firebase";
import { workdaysService } from "../../src/services";
import { tagWorkdaysWithPayroll } from "../../src/services/payrollsService";
import { syncWorkdayCycles } from "../../src/services/workdayCycles";

// Las jornadas de los ciclos que usa Nómina: cada ciclo se lee entero la
// primera vez y después se pone al día con lo que cambió y con un conteo de
// los ciclos. Lo que hace "otro equipo" se escribe directo en Firestore.
const write = (id, cycleId, data = {}, { stamp = true } = {}) =>
  setDoc(doc(db, "workdays", id), {
    cycleId, laborId: "L1", workerRut: "11111111-1", date: "2026-10-01", qty: 1, amount: 20000, ...data,
    ...(stamp ? { updatedAt: serverTimestamp() } : {}),
  });

async function seed() {
  await write("w1", "C1");
  await write("w2", "C1");
  await write("w3", "C2");
  await write("w4", "C3");
}

const ids = (list) => list.map((d) => d.id).sort();

describe("las jornadas de los ciclos de Nómina", () => {
  it("se leen enteras una vez y después salen de la copia", async () => {
    await seed();
    const first = await syncWorkdayCycles(["C1", "C2"]);
    expect(ids(first.data)).toEqual(["w1", "w2", "w3"]);
    // La jornada escrita más recientemente (la marca) y los dos ciclos, en
    // una consulta.
    expect(first.reads).toBe(1 + 3);
    expect((await syncWorkdayCycles(["C1", "C2"])).reads).toBe(0);
    // Un ciclo nuevo se lee entero; el resto sale de la copia.
    const more = await syncWorkdayCycles(["C1", "C3"]);
    expect(ids(more.data)).toEqual(["w1", "w2", "w4"]);
    expect(more.reads).toBe(1);
  });

  it("lo que cambió en otro equipo llega con una consulta para todos los ciclos", async () => {
    await seed();
    await syncWorkdayCycles(["C1", "C2"]);
    await write("w2", "C1", { qty: 7 });
    await write("w5", "C2");

    const next = await syncWorkdayCycles(["C1", "C2"], { fresh: true });
    expect(next.data.find((d) => d.id === "w2").qty).toBe(7);
    expect(ids(next.data)).toEqual(["w1", "w2", "w3", "w5"]);
    // Lo escrito desde cinco minutos antes de la marca (acá, las cinco
    // jornadas) y el conteo de los dos ciclos.
    expect(next.reads).toBe(5 + 1);
  });

  it("lo eliminado entra porque el conteo no calza, y se relee solo ese ciclo", async () => {
    await seed();
    await syncWorkdayCycles(["C1", "C2"]);
    await deleteDoc(doc(db, "workdays", "w3"));

    const next = await syncWorkdayCycles(["C1", "C2"], { fresh: true });
    expect(ids(next.data)).toEqual(["w1", "w2"]);
    // Lo escrito en los últimos minutos que sigue en pie, el conteo de los
    // dos, el de cada uno y la relectura del ciclo que no calzó (vacío).
    expect(next.reads).toBe(3 + 1 + 2 + 1);
  });

  it("una nómina generada en otro equipo llega con la puesta al día", async () => {
    await write("w1", "C1", {}, { stamp: false });
    await write("w2", "C1", {}, { stamp: false });
    await syncWorkdayCycles(["C1"]);
    await tagWorkdaysWithPayroll(["w1"], "nomina-1");

    const { data } = await syncWorkdayCycles(["C1"], { fresh: true });
    expect(data.find((d) => d.id === "w1").payrollId).toBe("nomina-1");
    expect(data.find((d) => d.id === "w2").payrollId).toBeUndefined();
  });

  it("después de una escritura de este equipo se pone al día sin esperar el minuto", async () => {
    await seed();
    await syncWorkdayCycles(["C1"]);
    await workdaysService.update("w1", { qty: 9 });

    const { data } = await syncWorkdayCycles(["C1"]);
    expect(data.find((d) => d.id === "w1").qty).toBe(9);
  });
});
