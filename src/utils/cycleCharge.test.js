import { describe, it, expect } from "vitest";
import { laborsDataOf, transportByCarrier } from "./cycleSummary";
import { importedLaborsDataOf, chargeLaborsOf, chargeCarriersOf, chargeSubtotal } from "./cycleCharge";

const D1 = "2026-10-01";
const D2 = "2026-10-02";
const D3 = "2026-10-03";
const ANA = "11111111-1";
const BETO = "12345678-5";

// Jornadas indexadas como en la grilla del ciclo: rut__fecha__combo.
const wdMapOf = (list) => Object.fromEntries(list.map(([ck, w]) => [`${w.workerRut}__${w.date}__${ck}`, w]));
const wd = (rut, date, data) => ({ workerRut: rut, workerId: rut, date, ...data });
const chargeOf = (labor, list, laborCharges = {}, dayPrices = {}) => {
  const laborsData = laborsDataOf([labor], { [labor.id]: wdMapOf(list) }, dayPrices, {});
  return chargeLaborsOf(laborsData, [], laborCharges, {})[0];
};

const MAIN = { id: "L1", name: "Principal", type: "main" };
const mainDays = [
  ["0_0", wd(ANA, D1, { amount: 30000 })],
  ["0_0", wd(BETO, D1, { amount: 30000 })],
  ["0_0", wd(ANA, D2, { amount: 20000 })],
];

describe("chargeLaborsOf: tarifa de cobro", () => {
  it("sugiere la mediana del precio por día y cobra cantidad × tarifa", () => {
    const cl = chargeOf(MAIN, mainDays);
    expect(cl.medianRate).toBe(25000);
    expect(cl.meanRate).toBe(26667);
    expect(cl.rate).toBe(25000);
    expect(cl.chargedRows.map((r) => [r.date, r.chargedQty, r.chargedRate, r.chargedAmount])).toEqual([
      [D1, 2, 25000, 50000],
      [D2, 1, 25000, 25000],
    ]);
    expect(cl.chargedTotals.amount).toBe(75000);
    expect(cl.chargedTotals.qty).toBe(3);
    expect(cl.include).toBe(true);
    expect(cl.mergeInto).toBe(null);
    expect(cl.activity).toBe("Jornada simple");
  });

  it("la tarifa fija de la labor manda sobre la sugerida", () => {
    const cl = chargeOf(MAIN, mainDays, { L1: { chargeRate: 32000, include: false, mergeInto: "L9" } });
    expect(cl.rate).toBe(32000);
    expect(cl.defaultRate).toBe(25000);
    expect(cl.chargedTotals.amount).toBe(96000);
    expect(cl.include).toBe(false);
    expect(cl.mergeInto).toBe("L9");
  });

  it("un ajuste por fila cambia la cantidad, la tarifa o el monto de ese día", () => {
    const cl = chargeOf(MAIN, mainDays, {
      L1: { rowOverrides: { [D1]: { qty: 3, rate: "" }, [D2]: { qty: 2, amount: 1000, transport: 500, workerCount: 4 } } },
    });
    const [r1, r2] = cl.chargedRows;
    expect([r1.chargedQty, r1.chargedRate, r1.chargedAmount, r1.hasOverride]).toEqual([3, 25000, 75000, true]);
    expect([r2.chargedQty, r2.chargedAmount, r2.chargedTransport, r2.chargedWorkerCount]).toEqual([2, 1000, 500, 4]);
    // El transporte por fila va aparte del monto de producción.
    expect(cl.chargedTotals.amount).toBe(76000);
    expect(cl.chargedTotals.transport).toBe(500);
    expect(cl.chargedTotals.workerDays).toBe(2 + 4);
  });

  it("las filas manuales usan la tarifa de la labor y las sin fecha van al final", () => {
    const cl = chargeOf(MAIN, mainDays, {
      L1: {
        extraRows: [
          { id: "x1", date: "", qty: 2, rate: "", amount: "" },
          { id: "x2", date: "2026-09-30", qty: 1, rate: 10000, amount: "" },
          { id: "x3", date: D3, qty: 1, rate: "", amount: 7000, workerCount: "" },
        ],
      },
    });
    expect(cl.chargedRows.map((r) => [r.date, r.rowKey, r.chargedAmount, r.isExtra])).toEqual([
      ["2026-09-30", "extra:x2", 10000, true],
      [D1, D1, 50000, false],
      [D2, D2, 25000, false],
      [D3, "extra:x3", 7000, true],
      ["", "extra:x1", 50000, true],
    ]);
    expect(cl.chargedTotals.amount).toBe(142000);
  });
});

describe("chargeLaborsOf: por tipo de labor", () => {
  it("en trato sugiere una mediana por tier y el ajuste va por fecha y tier", () => {
    const LT = { id: "LT", name: "Poda", type: "trato" };
    const dayPrices = {
      LT: {
        [D1]: { t0: { price: 300, mode: "unit", unit: 1 }, t1: { price: 10000, mode: "flat", unit: 2 } },
        [D2]: { t0: { price: 400, mode: "unit", unit: 1 } },
      },
    };
    const days = [
      ["t0", wd(ANA, D1, { qty: 10, amount: 3000 })],
      ["t1", wd(ANA, D1, { qty: 1, amount: 10000 })],
      ["t0", wd(BETO, D2, { qty: 20, amount: 8000 })],
    ];
    const cl = chargeOf(LT, days, {
      LT: { rowOverrides: { [`${D1}__t1`]: { rate: 12000 } }, extraRows: [{ id: "x1", date: D3, qty: 2, rate: "", amount: "" }] },
    }, dayPrices);
    expect(cl.rate).toBe(400);
    expect(cl.chargedRows.map((r) => [r.rowKey, r.chargedRate, r.chargedAmount])).toEqual([
      [`${D1}__t0`, 350, 3500],
      [`${D1}__t1`, 12000, 12000],
      [`${D2}__t0`, 350, 7000],
      ["extra:x1", 400, 800],
    ]);
    // La fila manual de trato toma la unidad más frecuente de la labor.
    expect(cl.chargedRows[3].unit).toBe(1);
  });

  it("en tratoEtapas cobra el precio real de cada etapa y cuenta solo las que cuentan", () => {
    const LE = { id: "LE", name: "Amarre", type: "tratoEtapas", stages: [{ id: "e1", name: "Primera", counts: false }, { id: "e2", name: "Segunda", counts: true }] };
    const cl = chargeOf(LE, [
      ["e1", wd(ANA, D1, { stageId: "e1", qty: 30, amount: 3000 })],
      ["e2", wd(ANA, D1, { stageId: "e2", qty: 30, amount: 6000 })],
    ]);
    expect(cl.chargedRows.map((r) => [r.stageId, r.chargedRate, r.chargedAmount])).toEqual([
      ["e1", 100, 3000],
      ["e2", 200, 6000],
    ]);
    expect(cl.chargedTotals.qty).toBe(60);
    expect(cl.chargedTotals.countedQty).toBe(30);
  });

  it("en tratoHE sugiere la tarifa HE de la labor y cobra base + horas × tarifa, sin los bonos", () => {
    const LH = { id: "LH", name: "Jornadas HE", type: "tratoHE", overtimeRate: 5000, bonusManejo: 4000 };
    const days = [["0_0", wd(ANA, D1, { qty: 30000, overtimeHours: 2, hasManejo: true, amount: 44000 })]];
    const suggested = chargeOf(LH, days);
    expect(suggested.defaultRate).toBe(5000);
    expect(suggested.rate).toBe(5000);
    expect(suggested.chargedRows[0].chargedAmount).toBe(30000 + 2 * 5000);
    // Sin mediana ni promedio: el editor de tarifas no muestra "prom.".
    expect([suggested.medianRate, suggested.meanRate]).toEqual([0, 0]);
    // Sin tarifa HE en la labor, la de la grilla por defecto.
    const noRate = chargeOf({ ...LH, overtimeRate: "" }, days, { LH: { extraRows: [{ id: "x1", date: D2, qty: 25000, overtimeHours: 1, rate: "", amount: "" }] } });
    expect(noRate.rate).toBe(3500);
    expect(noRate.chargedRows.map((r) => r.chargedAmount)).toEqual([30000 + 2 * 3500, 25000 + 3500]);
    const fixed = chargeOf(LH, days, { LH: { chargeRate: 6000, rowOverrides: { [D1]: { overtimeHours: 3 } } } });
    expect(fixed.chargedRows[0].chargedAmount).toBe(30000 + 3 * 6000);
    expect(fixed.chargedTotals.overtimeHours).toBe(3);
    expect(fixed.chargedTotals.heTotal).toBe(10000);
    expect(fixed.chargedTotals.bonosTotal).toBe(4000);
  });

  it("copia el piso de los totales de pago", () => {
    const cl = chargeOf(MAIN, [...mainDays, ["_piso", wd(ANA, D2, { pisoOnly: true, amount: 3000 })]]);
    expect(cl.chargedTotals.pisoAmount).toBe(3000);
    expect(cl.chargedTotals.pisoCount).toBe(1);
  });
});

describe("importedLaborsDataOf", () => {
  it("arma los datos de una labor importada desde su copia guardada", () => {
    const [ld] = importedLaborsDataOf([{
      id: "imp_A", sourceCycleLabel: "Fundo/Sector/Ciclo 0", redDates: [D1],
      labor: { id: "imp_A", name: "Principal (Ciclo 0)", type: "main" },
      rows: [{ date: D1, qty: 2, amount: 56000, pisoAmount: 0, workerCount: 2 }],
      containers: [],
    }], {});
    expect(ld.labor.id).toBe("imp_A");
    expect(ld.totals.amount).toBe(56000);
    expect(ld.unit).toBe("Jornadas");
    expect(ld.importedFrom).toEqual({ cycleLabel: "Fundo/Sector/Ciclo 0", redDates: [D1] });
    expect(importedLaborsDataOf(undefined, {})).toEqual([]);
  });

  it("una labor importada se cobra como cualquier otra", () => {
    const imported = importedLaborsDataOf([{
      id: "imp_A", labor: { id: "imp_A", name: "Principal (Ciclo 0)", type: "main" },
      rows: [{ date: D1, qty: 2, amount: 56000 }],
    }], {});
    const [cl] = chargeLaborsOf([], imported, { imp_A: { chargeRate: 29000 } }, {});
    expect(cl.chargedTotals.amount).toBe(58000);
    expect(cl.importedFrom.cycleLabel).toBe("");
  });
});

describe("chargeCarriersOf", () => {
  const trips = [
    { carrierId: "K1", date: D2, qty: 1, amount: 20000 },
    { carrierId: "K1", date: D1, qty: 2, amount: 40000 },
  ];

  it("sugiere el promedio por vuelta y acepta ajustes y filas manuales", () => {
    const [cc] = chargeCarriersOf(transportByCarrier(trips), {
      K1: { rowOverrides: { [D1]: { count: 3 } }, extraRows: [{ id: "y1", date: "", count: 1, rate: 15000, amount: "" }] },
    });
    expect(cc.defaultRate).toBe(20000);
    expect(cc.chargedRows.map((r) => [r.date, r.chargedCount, r.chargedRate, r.chargedAmount])).toEqual([
      [D1, 3, 20000, 60000],
      [D2, 1, 20000, 20000],
      ["", 1, 15000, 15000],
    ]);
    expect(cc.chargedTotalAmount).toBe(95000);
    expect(cc.chargedTotalCount).toBe(5);
    expect(cc.include).toBe(true);
  });

  it("un transportista excluido conserva sus filas", () => {
    const [cc] = chargeCarriersOf(transportByCarrier(trips), { K1: { include: false, chargeRate: 10000 } });
    expect(cc.include).toBe(false);
    expect(cc.chargedTotalAmount).toBe(30000);
  });
});

describe("chargeSubtotal", () => {
  it("suma las labores y transportistas incluidos, con el transporte por fila", () => {
    const labors = [
      { include: true, chargedTotals: { amount: 1000, transport: 200 } },
      { include: false, chargedTotals: { amount: 5000, transport: 0 } },
      { include: true, chargedTotals: { amount: 300 } },
    ];
    const carriers = [
      { include: true, chargedTotalAmount: 40 },
      { include: false, chargedTotalAmount: 9999 },
    ];
    expect(chargeSubtotal(labors, carriers)).toBe(1540);
    expect(chargeSubtotal([], [])).toBe(0);
  });
});
