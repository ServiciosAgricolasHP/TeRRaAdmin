import { describe, expect, it } from "vitest";
import {
  cloneLabors,
  cycleLabelSuffix,
  importCandidatesOf,
  importedDayPrices,
  movedWorkday,
  nextCycleLabors,
} from "./cycleCreation";

const ids = () => {
  let n = 0;
  return () => `new${++n}`;
};

describe("importCandidatesOf", () => {
  const ts = (iso) => ({ toDate: () => new Date(iso), toMillis: () => Date.parse(iso) });
  const cycles = [
    { id: "a", subfaenaId: "S1", status: "open", startDate: "2026-09-01" },
    { id: "b", subfaenaId: "S1", status: "closed", startDate: "2026-10-01" },
    { id: "c", subfaenaId: "S1", status: "open", startDate: "2026-10-05" },
    { id: "d", subfaenaId: "S2", status: "open", startDate: "2026-12-01" },
    { id: "e", subfaenaId: "S1", status: "open", createdAt: ts("2026-09-15T12:00:00Z") },
    { id: "f", subfaenaId: "S1", status: "open", startDate: "2026-08-01", endDate: "2026-11-01" },
  ];

  it("los abiertos de la subfaena, del más reciente al más antiguo", () => {
    expect(importCandidatesOf(cycles, "S1").map((c) => c.id)).toEqual(["f", "c", "e", "a"]);
  });

  it("sin abiertos en la subfaena no hay candidatos", () => {
    expect(importCandidatesOf(cycles, "S3")).toEqual([]);
  });
});

describe("cloneLabors", () => {
  it("copia cada labor entera con un id nuevo y guarda el mapa", () => {
    const labors = [
      { id: "L1", name: "Principal", type: "main", workers: [{ rut: "1-9" }] },
      { id: "L2", name: "HE", type: "tratoHE", overtimeRate: 5000, bonusManejo: 4000, workers: [] },
    ];
    const { labors: out, oldToNewLaborId } = cloneLabors(labors, ids());
    expect(out).toEqual([
      { id: "new1", name: "Principal", type: "main", workers: [{ rut: "1-9" }] },
      { id: "new2", name: "HE", type: "tratoHE", overtimeRate: 5000, bonusManejo: 4000, workers: [] },
    ]);
    expect([...oldToNewLaborId]).toEqual([["L1", "new1"], ["L2", "new2"]]);
  });
});

describe("importedDayPrices", () => {
  const src = {
    L1: { "2026-10-01": { price: 1 }, "2026-10-02": { price: 2 } },
    L2: { "2026-10-01": { t0: { price: 3, mode: "unit" } } },
    L3: { "2026-10-02": { "0_1": { price: 4 } } },
  };

  it("re-mapea al id nuevo y deja solo los días marcados", () => {
    const map = new Map([["L1", "N1"], ["L2", "N2"]]);
    expect(importedDayPrices(src, map, new Set(["2026-10-02"]))).toEqual({ N1: { "2026-10-02": { price: 2 } } });
    expect(importedDayPrices(src, map, new Set(["2026-10-01", "2026-10-02"]))).toEqual({
      N1: { "2026-10-01": { price: 1 }, "2026-10-02": { price: 2 } },
      N2: { "2026-10-01": { t0: { price: 3, mode: "unit" } } },
    });
  });

  it("sin precios que copiar da undefined", () => {
    expect(importedDayPrices(src, new Map([["L2", "N2"]]), new Set(["2026-10-02"]))).toBeUndefined();
    expect(importedDayPrices(undefined, new Map([["L1", "N1"]]), new Set(["2026-10-01"]))).toBeUndefined();
  });
});

describe("movedWorkday", () => {
  it("una jornada simple queda con id de 4 partes en el ciclo y la labor nuevos", () => {
    const w = { id: "C1__L1__1-9__2026-10-02", cycleId: "C1", laborId: "L1", workerRut: "1-9", date: "2026-10-02", qty: 1, amount: 30000, payrollId: null };
    expect(movedWorkday(w, "C9", "N1")).toEqual({
      id: "C9__N1__1-9__2026-10-02",
      data: { workerRut: "1-9", date: "2026-10-02", qty: 1, amount: 30000, payrollId: null, cycleId: "C9", laborId: "N1" },
    });
  });

  it("conserva el combo o tier del 5.º segmento", () => {
    const w = { id: "C1__L3__1-9__2026-10-03__0_1", cycleId: "C1", laborId: "L3", workerRut: "1-9", date: "2026-10-03", qty: 40 };
    expect(movedWorkday(w, "C9", "N3").id).toBe("C9__N3__1-9__2026-10-03__0_1");
    expect(movedWorkday({ ...w, id: "C1__L3__1-9__2026-10-03__t1" }, "C9", "N3").id).toBe("C9__N3__1-9__2026-10-03__t1");
  });
});

describe("nextCycleLabors", () => {
  const labors = [
    { id: "L1", name: "Principal", type: "main", workers: [{ rut: "1-9" }] },
    { id: "L2", name: "Etapas", type: "tratoEtapas", stages: [{ id: "s1" }] },
  ];

  it("copia la configuración con ids nuevos y, si se pide, los trabajadores", () => {
    expect(nextCycleLabors(labors, true, ids())).toEqual([
      { id: "new1", name: "Principal", type: "main", workers: [{ rut: "1-9" }] },
      { id: "new2", name: "Etapas", type: "tratoEtapas", stages: [{ id: "s1" }], workers: [] },
    ]);
  });

  it("sin copiar trabajadores, todas arrancan vacías", () => {
    expect(nextCycleLabors(labors, false, ids()).map((l) => l.workers)).toEqual([[], []]);
  });
});

describe("cycleLabelSuffix", () => {
  it("saca el prefijo sin distinguir mayúsculas", () => {
    expect(cycleLabelSuffix("Fundo Prueba/Sector Uno/Ciclo 2", "Fundo Prueba/Sector Uno/")).toBe("Ciclo 2");
    expect(cycleLabelSuffix("FUNDO PRUEBA/SECTOR UNO/Ciclo 0", "Fundo Prueba/Sector Uno/")).toBe("Ciclo 0");
  });

  it("con otro prefijo o sin etiqueta, la deja entera", () => {
    expect(cycleLabelSuffix("Otro/Ciclo 1", "Fundo Prueba/Sector Uno/")).toBe("Otro/Ciclo 1");
    expect(cycleLabelSuffix(undefined, "Fundo/")).toBe("");
  });
});
