import { describe, expect, it } from "vitest";
import { buildCheckContext } from "./checkContext";
import { missingGroup, missingWorker, similarNames, suggestGroupLeader, unknownGroup, withoutEmployment } from "./personChecks";

const cycles = [{ id: "c1", label: "Ciclo Uno", labors: [{ id: "poda", name: "Poda", type: "main" }, { id: "cos", name: "Cosecha", type: "cosecha" }] }];
const workers = [
  { id: "1-9", rut: "1-9", name: "ANA PÉREZ", groupLeader: [] },
  { id: "2-7", rut: "2-7", name: "LUIS SOTO", groupLeader: ["NORTE"] },
  { id: "3-5", rut: "3-5", name: "EVA ROJAS", groupLeader: ["NORTE"] },
  { id: "4-3", rut: "4-3", name: "ANA PERES", groupLeader: ["SUR"] },
  { id: "9-9", rut: "9-9", name: "ANA PEREZ CLON", mergedInto: "1-9" },
];
const leaders = [
  { name: "NORTE", habilitado: true },
  { name: "Sur", habilitado: true },
  { name: "VIEJO", habilitado: false },
  { name: "CHILENOS", habilitado: true },
];

const item = (rut, extra = {}) => ({ rut, workerId: rut, name: workers.find((w) => w.id === rut)?.name || "", bankCode: "012", groupLeader: "", ...extra });
const wd = (rut, date, laborId = "poda") => ({ id: `c1__${laborId}__${rut}__${date}`, cycleId: "c1", laborId, workerRut: rut, date, amount: 1000 });

const ctxOf = (input) => buildCheckContext({ cycles, workers, leaders, ...input });

describe("missingGroup", () => {
  it("sin grupo en efectivo es rojo y en banco naranja", () => {
    const res = missingGroup(ctxOf({ items: [item("1-9", { bankCode: "EFE" }), item("2-7"), item("3-5", { groupLeader: "NORTE" })] }));
    expect(res.map((r) => [r.person, r.severity])).toEqual([
      ["1-9", "red"],
      ["2-7", "orange"],
    ]);
    expect(res[0].lines[0]).toContain("no tiene sobre");
  });
});

describe("unknownGroup", () => {
  it("marca un grupo fuera de la lista y uno deshabilitado, sin distinguir mayúsculas", () => {
    const res = unknownGroup(ctxOf({ items: [item("1-9", { groupLeader: "NORT" }), item("2-7", { groupLeader: "viejo" }), item("3-5", { groupLeader: "sur" })] }));
    expect(res.map((r) => r.lines[0])).toEqual(["El grupo NORT no está en la lista de líderes", "El grupo VIEJO está deshabilitado"]);
    // Solo el que no está se puede agregar a la lista.
    expect(res.map((r) => r.missingLeader)).toEqual(["NORT", undefined]);
  });

  it("sin la lista de líderes no revisa", () => {
    expect(unknownGroup(ctxOf({ leaders: null, items: [item("1-9", { groupLeader: "NORT" })] }))).toEqual([]);
  });
});

describe("similarNames", () => {
  it("marca a los dos de un par de nombres muy parecidos", () => {
    const res = similarNames(ctxOf({ items: [item("1-9"), item("4-3"), item("2-7")] }));
    expect(res.map((r) => r.person)).toEqual(["1-9", "4-3"]);
    expect(res[0]).toMatchObject({ severity: "orange", lines: ["Se parece a ANA PERES (4-3)"] });
  });

  it("dos filas de la misma ficha son rojas", () => {
    const res = similarNames(ctxOf({ items: [item("1-9"), item("9-9", { name: "ANA PEREZ CLON" })] }));
    expect(res[0]).toMatchObject({ person: "1-9", severity: "red" });
    expect(res[0].lines[0]).toContain("Está dos veces en la nómina");
  });
});

describe("missingWorker", () => {
  it("marca una fila sin ficha y una de una ficha unida a otra", () => {
    const res = missingWorker(ctxOf({ items: [item("8-8", { name: "NADIE" }), item("9-9", { name: "ANA PEREZ CLON" }), item("2-7")] }));
    expect(res.map((r) => r.lines[0])).toEqual(["Sin ficha en Trabajadores", "Su ficha está unida a ANA PÉREZ"]);
  });
});

describe("withoutEmployment", () => {
  const employments = [{ workerId: "1-9", startDate: "2026-11-04", endDate: "2026-11-05" }];

  it("junta en tramos los días sin contrato vigente", () => {
    const workdays = ["2026-11-01", "2026-11-02", "2026-11-04", "2026-11-06"].map((d) => wd("1-9", d));
    const res = withoutEmployment(ctxOf({ items: [item("1-9")], workdays, employments }));
    expect(res[0]).toMatchObject({ severity: "orange", lines: ["Sin contrato ni honorarios: 01-nov a 02-nov y 06-nov"] });
  });

  it("con contrato todos los días no marca nada, y sin la lista no revisa", () => {
    const workdays = [wd("1-9", "2026-11-04")];
    expect(withoutEmployment(ctxOf({ items: [item("1-9")], workdays, employments }))).toEqual([]);
    expect(withoutEmployment(ctxOf({ items: [item("1-9")], workdays: [wd("1-9", "2026-11-01")], employments: null }))).toEqual([]);
  });
});

describe("suggestGroupLeader", () => {
  it("prefiere el grupo de su última nómina", () => {
    const payrolls = [
      { id: "p1", createdAt: 1, items: [item("1-9", { groupLeader: "NORTE" })] },
      { id: "p2", createdAt: 2, items: [item("1-9", { groupLeader: "SUR" })] },
    ];
    expect(suggestGroupLeader(ctxOf({ items: [item("1-9")], payrolls }), "1-9")).toEqual({ leader: "SUR", reason: "su última nómina" });
  });

  it("sin historial, el más común entre sus compañeros de labor", () => {
    const workdays = [wd("1-9", "2026-11-03"), wd("2-7", "2026-11-03"), wd("3-5", "2026-11-04"), wd("4-3", "2026-11-03", "cos")];
    const items = [item("1-9"), item("2-7", { groupLeader: "NORTE" }), item("3-5", { groupLeader: "NORTE" }), item("4-3", { groupLeader: "SUR" })];
    expect(suggestGroupLeader(ctxOf({ items, workdays }), "1-9")).toEqual({ leader: "NORTE", reason: "el de sus compañeros de labor" });
  });

  it("sin historial ni compañeros, el de su RUT", () => {
    const ctx = ctxOf({ items: [item("12345678-5")], workers: [] });
    expect(suggestGroupLeader(ctx, "12345678-5")).toEqual({ leader: "CHILENOS", reason: "por su RUT" });
  });

  it("salta un grupo deshabilitado de su última nómina", () => {
    const payrolls = [{ id: "p1", createdAt: 1, items: [item("12345678-5", { groupLeader: "VIEJO" })] }];
    const ctx = ctxOf({ items: [item("12345678-5")], payrolls, workers: [] });
    expect(suggestGroupLeader(ctx, "12345678-5")).toEqual({ leader: "CHILENOS", reason: "por su RUT" });
  });
});
