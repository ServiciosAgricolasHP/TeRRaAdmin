import { describe, expect, it } from "vitest";
import { buildCheckContext } from "./checkContext";
import { pendingElsewhere, unusualAmount, zeroByAdvances } from "./amountChecks";

const workers = [
  { id: "1-9", rut: "1-9", name: "ANA PÉREZ" },
  { id: "2-7", rut: "2-7", name: "LUIS SOTO" },
];
const cycles = [
  { id: "c1", label: "Ciclo Uno", labors: [{ id: "poda", name: "Poda", type: "main" }] },
  { id: "c2", label: "Ciclo Dos", labors: [{ id: "riego", name: "Riego", type: "main" }] },
];
const item = (rut, amount, extra = {}) => ({ rut, workerId: rut, amount, grossAmount: amount, advance: 0, ...extra });
const payroll = (id, createdAt, items) => ({ id, name: id, createdAt, items });

describe("unusualAmount", () => {
  const history = [payroll("p1", 1, [item("1-9", 100000)]), payroll("p2", 2, [item("1-9", 120000)]), payroll("p3", 3, [item("1-9", 80000)])];

  it("marca un líquido sobre el doble de su promedio en las últimas 3 nóminas", () => {
    const res = unusualAmount(buildCheckContext({ items: [item("1-9", 250000)], workers, payrolls: history }));
    expect(res[0]).toMatchObject({ severity: "orange", lines: ["Líquido $250.000; su promedio en sus últimas 3 nóminas es $100.000"] });
  });

  it("el doble justo no se marca, ni una subida menor a $30.000", () => {
    expect(unusualAmount(buildCheckContext({ items: [item("1-9", 200000)], workers, payrolls: history }))).toEqual([]);
    const small = [payroll("p1", 1, [item("1-9", 10000)])];
    expect(unusualAmount(buildCheckContext({ items: [item("1-9", 35000)], workers, payrolls: small }))).toEqual([]);
  });

  it("usa solo las 3 más nuevas", () => {
    const longer = [payroll("p0", 0, [item("1-9", 1000000)]), ...history];
    expect(unusualAmount(buildCheckContext({ items: [item("1-9", 250000)], workers, payrolls: longer }))).toHaveLength(1);
  });
});

describe("zeroByAdvances", () => {
  it("marca a quien los anticipos dejan en $0", () => {
    const res = zeroByAdvances(buildCheckContext({ items: [item("1-9", 0, { grossAmount: 50000, advance: 50000 }), item("2-7", 10000)], workers }));
    expect(res).toEqual([{ person: "1-9", severity: "info", lines: ["Bruto $50.000 y los anticipos descuentan $50.000: queda en $0"] }]);
  });
});

describe("pendingElsewhere", () => {
  it("suma por ciclo lo pendiente fuera de la nómina, sin lo que ya está en otra nómina", () => {
    const own = [{ id: "a", cycleId: "c1", laborId: "poda", workerRut: "1-9", date: "2026-11-03", amount: 20000 }];
    const open = [
      { id: "b", cycleId: "c2", laborId: "riego", workerRut: "1-9", date: "2026-11-04", amount: 20000 },
      { id: "c", cycleId: "c2", laborId: "riego", workerRut: "1-9", date: "2026-11-05", amount: 20000 },
      { id: "d", cycleId: "c1", laborId: "poda", workerRut: "1-9", date: "2026-11-06", amount: 20000, payrollId: "p9" },
      { id: "e", cycleId: "c1", laborId: "poda", workerRut: "1-9", date: "2026-11-07", amount: 0 },
    ];
    const res = pendingElsewhere(buildCheckContext({ items: [item("1-9", 20000)], workdays: own, openWorkdays: open, workers, cycles }));
    expect(res[0].lines).toEqual(["Le quedan pendientes $40.000 en Ciclo Dos (2 días)"]);
  });
});
