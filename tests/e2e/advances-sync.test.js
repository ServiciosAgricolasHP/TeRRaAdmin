import { describe, it, expect } from "vitest";
import { deleteDoc, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../src/firebase";
import {
  advancesService,
  applyAdvancesToPayroll,
  listPendingForWorkers,
  restoreAdvancesFromPayroll,
  syncAdvances,
} from "../../src/services/advancesService";

// Los anticipos y bonos son una lista sincronizada: se leen enteros una vez y
// después se ponen al día con lo que cambió (`updatedAt`), contando los
// documentos para ver lo que se eliminó. Lo que hace "otro equipo" se escribe
// directo en Firestore, sin pasar por la caché.
const write = (id, data) =>
  setDoc(doc(db, "advances", id), { ...data, updatedAt: serverTimestamp() }, { merge: true });

const advance = (rut, amount, extra = {}) => ({
  type: "anticipo",
  workerRut: rut,
  workerId: rut,
  workerName: rut,
  amount,
  date: "2026-03-02",
  status: "pending",
  amountPaid: 0,
  payments: [],
  ...extra,
});

const byId = (list) => Object.fromEntries(list.map((a) => [a.id, a]));

describe("la lista de anticipos y bonos en el navegador", () => {
  it("la primera vez la lee entera, y enseguida sale de la copia", async () => {
    await write("a1", advance("1-9", 50000));
    await write("a2", advance("2-7", 30000));
    const first = await syncAdvances();
    expect(first.reads).toBe(2);
    expect(first.data.map((a) => a.id).sort()).toEqual(["a1", "a2"]);

    const again = await syncAdvances();
    expect(again.reads).toBe(0);
  });

  it("un alta de este equipo entra en la copia sin releerla", async () => {
    await write("a1", advance("1-9", 50000));
    await syncAdvances();
    const created = await advancesService.create(advance("2-7", 20000));

    const { data, reads } = await syncAdvances();
    expect(reads).toBe(0);
    expect(byId(data)[created.id]).toMatchObject({ workerRut: "2-7", amount: 20000 });
  });

  it("lo que una nómina descuenta o suelta en lote llega a los pendientes sin borrar la copia", async () => {
    await write("a1", advance("1-9", 50000));
    expect((await listPendingForWorkers(["1-9"])).map((a) => a.id)).toEqual(["a1"]);

    await applyAdvancesToPayroll([{ advanceId: "a1", amount: 20000 }], "nomina-1");
    const partial = await listPendingForWorkers(["1-9"]);
    expect(partial).toHaveLength(1);
    expect(partial[0]).toMatchObject({ status: "partial", amountPaid: 20000 });

    await applyAdvancesToPayroll([{ advanceId: "a1", amount: 30000 }], "nomina-2");
    expect(await listPendingForWorkers(["1-9"])).toEqual([]);

    await restoreAdvancesFromPayroll(["a1"], "nomina-2");
    const back = await listPendingForWorkers(["1-9"]);
    expect(back[0]).toMatchObject({ status: "partial", amountPaid: 20000 });
  });

  it("pone al día lo que otro equipo cambió, agregó y eliminó", async () => {
    await write("a1", advance("1-9", 50000));
    await write("a2", advance("2-7", 30000));
    await syncAdvances();
    await write("a1", { note: "Compra de botas" });
    await write("a3", advance("3-5", 10000));
    await deleteDoc(doc(db, "advances", "a2"));

    const { data } = await syncAdvances({ fresh: true });
    const all = byId(data);
    expect(Object.keys(all).sort()).toEqual(["a1", "a3"]);
    expect(all.a1.note).toBe("Compra de botas");
  });

  it("los pendientes son solo los de esas personas con saldo", async () => {
    await write("a1", advance("1-9", 50000));
    await write("a2", advance("1-9", 30000, { status: "applied", amountPaid: 30000 }));
    await write("a3", advance("2-7", 10000, { status: "partial", amountPaid: 5000 }));
    await write("a4", advance("3-5", 10000));

    const pending = await listPendingForWorkers(["1-9", "2-7", ""]);
    expect(pending.map((a) => a.id).sort()).toEqual(["a1", "a3"]);
    expect(await listPendingForWorkers([])).toEqual([]);
  });
});
