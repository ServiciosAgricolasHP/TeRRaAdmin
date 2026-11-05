import { describe, it, expect } from "vitest";
import { activeWorkers, mergeBlockers, planWorkerMerge, retargetDocId } from "./workerMerge";

// Datos inventados: el clon lo creó la importación con el RUT provisorio de
// otra empresa; la ficha que queda es la de siempre.
const clone = { id: "100000001-K", rut: "100000001-K", name: "Jose Paredes", fileAliases: [{ rut: "100000001-K", name: "JOSE PAREDES" }] };
const kept = { id: "12345678-5", rut: "12345678-5", name: "Patricio Paredes Lagos", rutHistory: [] };
const C1 = "C1";
const cycles = {
  [C1]: {
    id: C1,
    status: "open",
    labors: [
      { id: "L1", type: "cosecha", workers: [{ id: clone.id, rut: clone.id, name: "Jose Paredes" }, { id: "1-9", rut: "1-9", name: "Otra" }] },
      { id: "L2", type: "main", workers: [{ id: kept.id, rut: "12345678-K", name: "Patricio" }, { id: clone.id, rut: clone.id, name: "Jose", monthly: true }] },
    ],
  },
};
const wd = (laborId, date, ck, extra = {}) => ({
  id: `${C1}__${laborId}__${clone.id}__${date}${ck ? `__${ck}` : ""}`,
  cycleId: C1, laborId, workerRut: clone.id, workerId: clone.id, date, qty: 10, amount: 9000, ...extra,
});

describe("unir fichas", () => {
  it("cambia el RUT del id de la jornada por el de la ficha que queda", () => {
    expect(retargetDocId("C1__L1__100000001-K__2026-03-02__0_2", [clone.id], kept.id)).toBe("C1__L1__12345678-5__2026-03-02__0_2");
    expect(retargetDocId("C1__L1__otro__2026-03-02", [clone.id], kept.id)).toBe(null);
  });

  it("pasa las jornadas sin nómina con el RUT que la ficha usa en cada labor", () => {
    const p = planWorkerMerge({ clone, kept, workdays: [wd("L1", "2026-03-02", "0_2"), wd("L2", "2026-03-02", null)], cycles });
    expect(p.moves.map((m) => [m.toId, m.data.workerRut, m.data.workerId])).toEqual([
      ["C1__L1__12345678-5__2026-03-02__0_2", kept.rut, kept.id],
      // En L2 ya figura con su RUT anterior: la jornada usa ese, como la grilla.
      ["C1__L2__12345678-K__2026-03-02", "12345678-K", kept.id],
    ]);
    expect(p.deletes).toHaveLength(2);
    expect(p.moves[0].data.id).toBeUndefined();
  });

  it("lo que está en una nómina no se toca, y el clon sigue en esa labor", () => {
    const p = planWorkerMerge({ clone, kept, workdays: [wd("L1", "2026-03-02", "0_2", { payrollId: "N1" }), wd("L1", "2026-03-03", "0_2")], cycles });
    expect(p.paid).toHaveLength(1);
    expect(p.moves).toHaveLength(1);
    const l1 = p.rosters[0].labors.find((l) => l.id === "L1").workers.map((w) => w.id);
    expect(l1).toEqual([clone.id, kept.id, "1-9"]);
  });

  it("en las labores, la ficha que queda toma el lugar del clon", () => {
    const p = planWorkerMerge({ clone, kept, workdays: [wd("L1", "2026-03-02", "0_2")], cycles });
    const [r] = p.rosters;
    expect(r.labors.find((l) => l.id === "L1").workers).toEqual([
      { id: kept.id, rut: kept.rut, name: kept.name },
      { id: "1-9", rut: "1-9", name: "Otra" },
    ]);
    // Donde ya estaba, solo sale el clon.
    expect(r.labors.find((l) => l.id === "L2").workers.map((w) => w.id)).toEqual([kept.id]);
  });

  it("un ciclo cerrado no se toca", () => {
    const p = planWorkerMerge({ clone, kept, workdays: [], cycles: { [C1]: { ...cycles[C1], status: "closed" } } });
    expect(p.rosters).toEqual([]);
  });

  it("un choque queda con la jornada de la ficha que queda, salvo que se elija otra cosa", () => {
    const toId = "C1__L1__12345678-5__2026-03-02__0_2";
    const existing = { [toId]: { id: toId, cycleId: C1, laborId: "L1", workerRut: kept.id, date: "2026-03-02", qty: 4, amount: 3600 } };
    const workdays = [wd("L1", "2026-03-02", "0_2")];
    const byDefault = planWorkerMerge({ clone, kept, workdays, existing, cycles });
    expect(byDefault.conflicts).toHaveLength(1);
    expect(byDefault.conflicts[0]).toMatchObject({ choice: "kept", canSum: true, keptPaid: false });
    expect(byDefault.writes).toEqual([]);
    expect(byDefault.deletes).toEqual([workdays[0].id]);

    const summed = planWorkerMerge({ clone, kept, workdays, existing, cycles, decisions: { [toId]: "sum" } });
    expect(summed.writes[0]).toMatchObject({ toId, data: { qty: 14, amount: 12600, workerRut: kept.id } });

    const theirs = planWorkerMerge({ clone, kept, workdays, existing, cycles, decisions: { [toId]: "clone" } });
    expect(theirs.writes[0].data).toMatchObject({ qty: 10, amount: 9000, workerId: kept.id });
  });

  it("si la jornada de la ficha que queda está en una nómina, manda esa; y no se suma fuera de cosecha", () => {
    const toId = "C1__L1__12345678-5__2026-03-02__0_2";
    const paidPrev = { [toId]: { id: toId, qty: 4, amount: 3600, payrollId: "N9" } };
    const p = planWorkerMerge({ clone, kept, workdays: [wd("L1", "2026-03-02", "0_2")], existing: paidPrev, cycles, decisions: { [toId]: "clone" } });
    expect(p.conflicts[0]).toMatchObject({ choice: "kept", keptPaid: true });
    expect(p.writes).toEqual([]);

    const dayId = "C1__L2__12345678-K__2026-03-02";
    const day = planWorkerMerge({ clone, kept, workdays: [wd("L2", "2026-03-02", null)], existing: { [dayId]: { id: dayId, qty: 1, amount: 30000 } }, cycles, decisions: { [dayId]: "sum" } });
    expect(day.conflicts[0]).toMatchObject({ canSum: false, choice: "kept" });
  });

  it("la ficha que queda guarda los RUT y el nombre del clon; el clon queda marcado", () => {
    const p = planWorkerMerge({ clone, kept, workdays: [], cycles: {} });
    expect(p.keptPatch.rutHistory).toEqual([clone.id]);
    expect(p.keptPatch.fileAliases).toEqual([{ rut: clone.id, name: "JOSE PAREDES" }]);
    expect(p.clonePatch).toEqual({ mergedInto: kept.id });
  });

  it("no deja unir si el clon tiene QR, saldos, contratos o jornadas sin nómina en un ciclo cerrado", () => {
    expect(mergeBlockers({ clone, kept, advances: [], employments: [], workdays: [], cycles })).toEqual([]);
    const msgs = mergeBlockers({
      clone: { ...clone, idQr: ["XX-1"] },
      kept,
      advances: [{ status: "partial", amount: 10000, amountPaid: 4000 }, { status: "applied", amount: 5000, amountPaid: 5000 }],
      employments: [{ id: "E1" }],
      workdays: [wd("L1", "2026-03-02", "0_2")],
      cycles: { [C1]: { ...cycles[C1], status: "closed", label: "Cerezas" } },
    });
    expect(msgs).toHaveLength(4);
    expect(msgs.join(" ")).toMatch(/QR.*anticipo.*contrato.*Cerezas/);
    expect(mergeBlockers({ clone, kept: clone, advances: [], employments: [], workdays: [], cycles })[0]).toMatch(/misma/);
  });

  it("las listas no muestran las fichas unidas", () => {
    expect(activeWorkers([clone, { ...clone, id: "x", mergedInto: kept.id }, kept]).map((w) => w.id)).toEqual([clone.id, kept.id]);
  });
});
