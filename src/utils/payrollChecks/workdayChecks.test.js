import { describe, expect, it } from "vitest";
import { buildCheckContext } from "./checkContext";
import {
  duplicateWorkdays,
  longStreaks,
  outlierQuantities,
  outOfCycleDates,
  sameDayLabors,
  staleQrSync,
  zeroAmountWorkdays,
} from "./workdayChecks";

const cycles = [
  {
    id: "c1",
    label: "Ciclo Uno",
    days: ["2026-11-03", "2026-11-04", "2026-11-05"],
    labors: [
      { id: "cos", name: "Cosecha", type: "cosecha" },
      { id: "poda", name: "Poda", type: "main" },
      { id: "sup", name: "Supervisión", type: "supervision", workers: [{ rut: "3-3", monthly: true }] },
    ],
  },
  { id: "c2", label: "Ciclo Dos", days: [], labors: [{ id: "riego", name: "Riego", type: "main" }, { id: "cos2", name: "Cosecha", type: "cosecha" }] },
];
const workers = [
  { id: "1-9", rut: "1-9", name: "ANA PÉREZ", rutHistory: ["100-1"] },
  { id: "2-7", rut: "2-7", name: "LUIS SOTO" },
  { id: "3-3", rut: "3-3", name: "EVA ROJAS" },
];

const wd = (cycleId, laborId, rut, date, extra = {}) => ({
  id: [cycleId, laborId, rut, date, extra.ck].filter(Boolean).join("__"),
  cycleId,
  laborId,
  workerRut: rut,
  date,
  qty: 10,
  amount: 1000,
  ...extra,
});

const ctxOf = (workdays, openWorkdays = [], extra = {}) =>
  buildCheckContext({ items: [], workdays, openWorkdays, cycles, workers, payrolls: [{ id: "p0", name: "Nómina Vieja" }], today: "2026-11-17", ...extra });

describe("duplicateWorkdays", () => {
  it("marca la misma jornada guardada con el RUT anterior y el vigente", () => {
    const res = duplicateWorkdays(ctxOf([wd("c1", "poda", "1-9", "2026-11-03"), wd("c1", "poda", "100-1", "2026-11-03")]));
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ person: "1-9", severity: "red" });
    expect(res[0].lines[0]).toContain("2 jornadas iguales");
  });

  it("no marca dos envases distintos de la misma cosecha", () => {
    const res = duplicateWorkdays(ctxOf([wd("c1", "cos", "1-9", "2026-11-03", { ck: "1_1" }), wd("c1", "cos", "1-9", "2026-11-03", { ck: "1_2" })]));
    expect(res).toEqual([]);
  });

  it("no marca la cosecha y su piso", () => {
    const res = duplicateWorkdays(ctxOf([wd("c1", "cos", "1-9", "2026-11-03", { ck: "1_1" }), wd("c1", "cos", "1-9", "2026-11-03", { ck: "_piso" })]));
    expect(res).toEqual([]);
  });

  it("ignora un duplicado que no toca la nómina", () => {
    const res = duplicateWorkdays(ctxOf([], [wd("c1", "poda", "1-9", "2026-11-03"), wd("c1", "poda", "100-1", "2026-11-03")]));
    expect(res).toEqual([]);
  });
});

describe("sameDayLabors", () => {
  it("dos labores al día el mismo día son rojas, también contra otra nómina", () => {
    const res = sameDayLabors(ctxOf([wd("c1", "poda", "1-9", "2026-11-03")], [wd("c2", "riego", "1-9", "2026-11-03", { payrollId: "p0" })]));
    expect(res[0].severity).toBe("red");
    expect(res[0].lines[0]).toContain("Poda · Ciclo Uno (en esta nómina)");
    expect(res[0].lines[0]).toContain("Riego · Ciclo Dos (en Nómina Vieja)");
  });

  it("cosecha en dos ciclos el mismo día es naranja", () => {
    const res = sameDayLabors(ctxOf([wd("c1", "cos", "1-9", "2026-11-03", { ck: "1_1" })], [wd("c2", "cos2", "1-9", "2026-11-03", { ck: "1_1" })]));
    expect(res[0].severity).toBe("orange");
    expect(res[0].lines[0]).toContain("pendiente");
  });

  it("varios envases y el piso de una sola cosecha no cuentan como dos labores", () => {
    const res = sameDayLabors(
      ctxOf([wd("c1", "cos", "1-9", "2026-11-03", { ck: "1_1" }), wd("c1", "cos", "1-9", "2026-11-03", { ck: "2_1" }), wd("c1", "cos", "1-9", "2026-11-03", { ck: "_piso" })]),
    );
    expect(res).toEqual([]);
  });

  it("dos labores de otras nóminas no son de esta", () => {
    const res = sameDayLabors(ctxOf([], [wd("c1", "poda", "1-9", "2026-11-03"), wd("c2", "riego", "1-9", "2026-11-03")]));
    expect(res).toEqual([]);
  });
});

describe("zeroAmountWorkdays", () => {
  it("cosecha con cantidad y sin monto: falta el precio", () => {
    const res = zeroAmountWorkdays(ctxOf([wd("c1", "cos", "1-9", "2026-11-03", { ck: "1_1", qty: 150, amount: 0 })]));
    expect(res[0].severity).toBe("red");
    expect(res[0].lines[0]).toContain("150 sin monto");
  });

  it("una jornada al día en $0", () => {
    const res = zeroAmountWorkdays(ctxOf([wd("c1", "poda", "2-7", "2026-11-03", { amount: 0 })]));
    expect(res[0].lines[0]).toContain("jornada en $0");
  });

  it("no marca la asistencia de un sueldo mensual, aunque el JSON no traiga attendanceOnly", () => {
    expect(zeroAmountWorkdays(ctxOf([wd("c1", "sup", "3-3", "2026-11-03", { amount: 0 })]))).toEqual([]);
    expect(zeroAmountWorkdays(ctxOf([wd("c1", "poda", "2-7", "2026-11-03", { amount: 0, attendanceOnly: true })]))).toEqual([]);
  });

  it("no marca una cosecha vacía ni lo que no está en la nómina", () => {
    expect(zeroAmountWorkdays(ctxOf([wd("c1", "cos", "1-9", "2026-11-03", { ck: "1_1", qty: 0, amount: 0 })]))).toEqual([]);
    expect(zeroAmountWorkdays(ctxOf([], [wd("c1", "poda", "2-7", "2026-11-03", { amount: 0 })]))).toEqual([]);
  });
});

describe("outlierQuantities", () => {
  const peers = ["4-1", "5-1", "6-1", "7-1"].map((r) => wd("c1", "cos", r, "2026-11-03", { ck: "1_1", qty: 150 }));

  it("marca una cantidad sobre 3 veces la mediana del día", () => {
    const res = outlierQuantities(ctxOf([wd("c1", "cos", "1-9", "2026-11-03", { ck: "1_1", qty: 1500 })], peers));
    expect(res).toHaveLength(1);
    expect(res[0].lines[0]).toContain("1.500, la mediana del día es 150");
  });

  it("no compara con menos de 5 jornadas", () => {
    const res = outlierQuantities(ctxOf([wd("c1", "cos", "1-9", "2026-11-03", { ck: "1_1", qty: 1500 })], peers.slice(0, 3)));
    expect(res).toEqual([]);
  });

  it("compara cada envase por separado", () => {
    const res = outlierQuantities(ctxOf([wd("c1", "cos", "1-9", "2026-11-03", { ck: "2_2", qty: 1500 })], peers));
    expect(res).toEqual([]);
  });

  it("en una labor al día compara el monto", () => {
    const daily = ["4-1", "5-1", "6-1", "7-1"].map((r) => wd("c1", "poda", r, "2026-11-03", { amount: 25000 }));
    const res = outlierQuantities(ctxOf([wd("c1", "poda", "1-9", "2026-11-03", { amount: 250000 })], daily));
    expect(res[0].lines[0]).toContain("$250.000");
  });
});

describe("outOfCycleDates", () => {
  it("marca una fecha fuera de los días del ciclo y una futura", () => {
    const res = outOfCycleDates(ctxOf([wd("c1", "poda", "1-9", "2026-11-09"), wd("c1", "poda", "1-9", "2026-12-01")]));
    expect(res[0].lines).toEqual([expect.stringContaining("fuera de los días del ciclo"), expect.stringContaining("fecha futura")]);
  });

  it("un ciclo sin la lista de días solo revisa las futuras", () => {
    expect(outOfCycleDates(ctxOf([wd("c2", "riego", "1-9", "2026-11-09")]))).toEqual([]);
  });
});

describe("longStreaks", () => {
  const days = (from, n) => Array.from({ length: n }, (_, i) => `2026-11-${String(from + i).padStart(2, "0")}`);

  it("marca 7 días seguidos, contando los de otros ciclos", () => {
    const own = days(1, 4).map((d) => wd("c2", "riego", "1-9", d));
    const other = days(5, 3).map((d) => wd("c2", "cos2", "1-9", d, { ck: "1_1" }));
    const res = longStreaks(ctxOf(own, other));
    expect(res[0]).toMatchObject({ severity: "info", lines: ["7 días seguidos: 01-nov a 07-nov"] });
  });

  it("6 días seguidos no se marcan", () => {
    expect(longStreaks(ctxOf(days(1, 6).map((d) => wd("c2", "riego", "1-9", d))))).toEqual([]);
  });

  it("los días seguidos que no tocan la nómina no se marcan", () => {
    const other = days(1, 8).map((d) => wd("c2", "riego", "1-9", d));
    expect(longStreaks(ctxOf([wd("c2", "riego", "1-9", "2026-11-20")], other))).toEqual([]);
  });
});

describe("staleQrSync", () => {
  const prefix = (extra = {}) => ({ id: "HP", cycleId: "c1", laborId: "cos", ...extra });
  const own = [wd("c1", "cos", "1-9", "2026-11-04", { ck: "1_1" }), wd("c1", "cos", "2-7", "2026-11-05", { ck: "1_1" })];

  it("avisa por prefijo si se sincronizó el último día que paga la nómina o antes", () => {
    const res = staleQrSync(ctxOf(own, [], { prefixes: [prefix({ lastSync: { at: "2026-11-05T15:00:00Z" } })] }));
    expect(res).toEqual([
      {
        general: "HP",
        label: "Prefijo QR HP",
        severity: "orange",
        lines: ["La última sincronización de HP fue el 05-nov y la nómina paga Cosecha · Ciclo Uno hasta el 05-nov: puede haber pesajes que no llegaron. Se sincroniza en Pesajes QR."],
      },
    ]);
  });

  it("un prefijo que nunca se sincronizó también avisa", () => {
    const [res] = staleQrSync(ctxOf(own, [], { prefixes: [prefix()] }));
    expect(res.lines[0]).toMatch(/^HP nunca se ha sincronizado/);
  });

  it("no avisa si se sincronizó después, si el prefijo está apagado o apunta a otra labor", () => {
    expect(staleQrSync(ctxOf(own, [], { prefixes: [prefix({ lastSync: { at: "2026-11-06T15:00:00Z" } })] }))).toEqual([]);
    expect(staleQrSync(ctxOf(own, [], { prefixes: [prefix({ active: false })] }))).toEqual([]);
    expect(staleQrSync(ctxOf(own, [], { prefixes: [prefix({ laborId: "poda" })] }))).toEqual([]);
  });

  it("sin la lista de prefijos no revisa, y el piso no cuenta como un día pagado", () => {
    expect(staleQrSync(ctxOf(own))).toEqual([]);
    const floorOnly = [wd("c1", "cos", "1-9", "2026-11-09", { ck: "_piso" })];
    expect(staleQrSync(ctxOf(floorOnly, [], { prefixes: [prefix({ lastSync: { at: "2026-11-06T15:00:00Z" } })] }))).toEqual([]);
  });
});
