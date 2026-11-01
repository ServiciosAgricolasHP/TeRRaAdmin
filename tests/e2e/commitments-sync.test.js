import { describe, it, expect } from "vitest";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../src/firebase";
import { markPaid, saveCommitment, syncCommitments } from "../../src/services/commitmentsService";

// Los Cheques y pagos que comparten la pantalla y el Dashboard: se leen enteros
// una vez y después se ponen al día con lo que cambió y con un conteo. Lo que
// hace "otro equipo" o la función diaria se escribe directo en Firestore.
const base = { kind: "payment", amount: 100000, counterparty: "Ferretería Central", concept: "Materiales", status: "pending", paidAt: "" };
const write = (id, data) => setDoc(doc(db, "commitments", id), { ...base, ...data, updatedAt: serverTimestamp() });

const dues = (list) => list.map((c) => c.dueDate);

describe("los Cheques y pagos en el navegador", () => {
  it("se leen enteros una vez, por fecha, y lo que se guarda acá corrige la copia", async () => {
    await write("k1", { dueDate: "2026-11-20" });
    await write("k2", { dueDate: "2026-11-05" });
    const first = await syncCommitments();
    expect(first.reads).toBe(2);
    expect(dues(first.data)).toEqual(["2026-11-05", "2026-11-20"]);

    const created = await saveCommitment({ ...base, dueDate: "2026-11-10" });
    await markPaid("k2", "2026-11-01");
    const local = await syncCommitments();
    expect(local.reads).toBe(0);
    expect(local.data.map((c) => [c.dueDate, c.status])).toEqual([
      ["2026-11-05", "paid"],
      ["2026-11-10", "pending"],
      ["2026-11-20", "pending"],
    ]);
    expect(local.data.some((c) => c.id === created.id)).toBe(true);
  });

  it("lo que genera la función sin updatedAt entra porque el conteo no calza", async () => {
    await write("k1", { dueDate: "2026-11-20" });
    await syncCommitments();
    // Como la función diaria, sin la hora de la última escritura.
    await setDoc(doc(db, "commitments", "serie_2026-12-05"), { ...base, dueDate: "2026-12-05", seriesId: "serie" });

    const { data } = await syncCommitments({ fresh: true });
    expect(dues(data)).toEqual(["2026-11-20", "2026-12-05"]);
  });
});
