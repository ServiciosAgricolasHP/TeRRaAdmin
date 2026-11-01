import { describe, it, expect } from "vitest";
import { deleteDoc, doc, serverTimestamp, setDoc, Timestamp } from "firebase/firestore";
import { db } from "../../src/firebase";
import { payrollsService } from "../../src/services/payrollsService";
import { syncPayrolls } from "../../src/services/payrollsList";

// Las nóminas que comparten Nómina, su historial y el Dashboard: se leen
// enteras una vez y después se ponen al día con lo que cambió y con un conteo.
// Lo que hace "otro equipo" se escribe directo en Firestore.
const write = (id, data, createdMs) =>
  setDoc(doc(db, "payrolls", id), {
    status: "pending",
    total: 100000,
    items: [],
    ...data,
    createdAt: Timestamp.fromMillis(createdMs),
    updatedAt: serverTimestamp(),
  });

async function seed() {
  await write("n1", { name: "Nómina Septiembre" }, Date.UTC(2026, 8, 30));
  await write("n2", { name: "Nómina Octubre" }, Date.UTC(2026, 9, 15));
}

const names = (list) => list.map((p) => p.name);

describe("las nóminas en el navegador", () => {
  it("se leen enteras una vez, de la más nueva a la más vieja, y lo que se hace acá corrige la copia", async () => {
    await seed();
    const first = await syncPayrolls();
    expect(first.reads).toBe(2);
    expect(names(first.data)).toEqual(["Nómina Octubre", "Nómina Septiembre"]);

    await payrollsService.create({ name: "Nómina Noviembre", status: "pending", total: 50000, items: [] });
    await payrollsService.update("n2", { status: "paid", paidAt: "2026-10-20T15:00:00.000Z" });
    await payrollsService.remove("n1");
    const local = await syncPayrolls();
    expect(local.reads).toBe(0);
    expect(local.data.map((p) => [p.name, p.status])).toEqual([
      ["Nómina Noviembre", "pending"],
      ["Nómina Octubre", "paid"],
    ]);

    // La puesta al día trae la hora con que el servidor guardó la nueva.
    const fresh = await syncPayrolls({ fresh: true });
    expect(names(fresh.data)).toEqual(["Nómina Noviembre", "Nómina Octubre"]);
    expect(fresh.data[0].createdAt).toBeTruthy();
  });

  it("lo que otro equipo pagó o eliminó llega con la puesta al día", async () => {
    await seed();
    await syncPayrolls();
    await setDoc(doc(db, "payrolls", "n2"), { status: "paid", updatedAt: serverTimestamp() }, { merge: true });
    await deleteDoc(doc(db, "payrolls", "n1"));

    const { data } = await syncPayrolls({ fresh: true });
    expect(data.map((p) => [p.name, p.status])).toEqual([["Nómina Octubre", "paid"]]);
  });
});
