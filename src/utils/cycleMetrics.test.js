import { describe, it, expect } from "vitest";
import {
  peopleByDateOf,
  daysWithFloorOf,
  dayCombosOf,
  dayTiersOf,
  dayStagesOf,
  orphanWorkersOf,
  laborAmountTotals,
  harvestQtyByContainer,
  laborQtyTotals,
  stagesDaySummaryOf,
  pieceworkPeopleCounts,
  floorMetricsOf,
  overtimeDayMetricsOf,
  harvestQtyByDayCombo,
  pieceworkTierMetricsOf,
} from "./cycleMetrics";

// Un ciclo de dos días (lunes y martes) con una labor de cada tipo, armado
// como lo deja en memoria la grilla: `workdaysByLabor[laborId][rut__fecha__ck]`.
const D1 = "2026-10-05";
const D2 = "2026-10-06";
const ANA = "11111111-1";
const BETO = "12345678-5";
const CARLA = "22222222-2";
const workers = [{ rut: ANA, name: "Ana Pérez" }, { rut: BETO, name: "Beto Soto" }];

const harvest = { id: "LC", type: "cosecha", workers };
const piecework = { id: "LT", type: "trato", workers };
const stages = {
  id: "LE", type: "tratoEtapas", workers,
  stages: [{ id: "e1", name: "Primera", counts: false }, { id: "e2", name: "Segunda", counts: true }],
};
const overtime = { id: "LH", type: "tratoHE", workers };
const normal = { id: "LM", type: "main", workers };
const labors = [harvest, piecework, stages, overtime, normal];

const dayPrices = {
  LC: {
    [D1]: { "1_1": { price: 500, mode: "unit" }, "1_2": { price: 800, mode: "unit" }, piso: 5000 },
    [D2]: { "1_1": { price: 500, mode: "unit" } },
  },
  LT: {
    [D1]: { t0: { price: 300, mode: "unit" }, t1: { price: 10000, mode: "flat" } },
    [D2]: { t0: { price: 300, mode: "unit" }, piso: 3000 },
  },
  LE: {
    [D1]: { e1: { price: 100, mode: "unit" }, e2: { price: 200, mode: "unit" } },
    [D2]: { e2: { price: 200, mode: "unit" } },
  },
  LH: { [D2]: { "0_0": { price: 35000, mode: "normal", isHoliday: true } } },
  LM: { [D1]: { "0_0": { price: 30000, mode: "unit" } } },
};

const entry = (rut, date, ck, data) => [`${rut}__${date}__${ck}`, { workerRut: rut, date, ...data }];
const workdaysByLabor = {
  LC: Object.fromEntries([
    entry(ANA, D1, "1_1", { qualityX: 1, containerY: 1, qty: 40, amount: 20000 }),
    entry(ANA, D1, "1_2", { qualityX: 1, containerY: 2, qty: 10, amount: 8000 }),
    entry(BETO, D1, "1_1", { qualityX: 1, containerY: 1, qty: 30, amount: 15000 }),
    entry(ANA, D1, "_piso", { comboKey: "_piso", pisoOnly: true, qty: 0, amount: 5000 }),
    entry(BETO, D2, "2_1", { qualityX: 2, containerY: 1, qty: 5, amount: 0 }),
    entry(CARLA, D2, "1_1", { qualityX: 1, containerY: 1, qty: 12, amount: 6000 }),
  ]),
  LT: Object.fromEntries([
    entry(ANA, D1, "t0", { qty: 50, amount: 15000, tiers: { 0: { qty: 50, amount: 15000 } } }),
    entry(ANA, D1, "t1", { qty: 1, amount: 10000, tiers: { 0: { qty: 1, amount: 10000 } } }),
    entry(BETO, D2, "t0", { qty: 20, amount: 6000, tiers: { 0: { qty: 20, amount: 6000 } } }),
    entry(BETO, D2, "_piso", { comboKey: "_piso", pisoOnly: true, qty: 0, amount: 3000 }),
  ]),
  LE: Object.fromEntries([
    entry(ANA, D1, "e1", { stageId: "e1", qty: 30, amount: 3000 }),
    entry(ANA, D1, "e2", { stageId: "e2", qty: 30, amount: 6000 }),
    entry(BETO, D2, "e2", { stageId: "e2", qty: 10, amount: 2000 }),
  ]),
  LH: Object.fromEntries([
    entry(ANA, D1, "0_0", { qty: 30000, overtimeHours: 2, hasManejo: true, amount: 44000 }),
    entry(BETO, D2, "0_0", { qty: 35000, overtimeHours: 1, hasSupervision: true, amount: 42000 }),
  ]),
  LM: Object.fromEntries([
    entry(ANA, D1, "0_0", { qty: 1, amount: 30000 }),
    entry(BETO, D1, "0_0", { qty: 1, amount: 0, attendanceOnly: true }),
  ]),
};
const days = [D1, D2];

describe("totales por labor", () => {
  it("suma el monto de cada labor, con el piso y los tiers del trato", () => {
    expect(laborAmountTotals(labors, workdaysByLabor)).toEqual({ LC: 54000, LT: 34000, LE: 11000, LH: 86000, LM: 30000 });
  });

  it("sin labores devuelve un objeto vacío", () => {
    expect(laborAmountTotals(undefined, workdaysByLabor)).toEqual({});
  });

  it("cuenta la cosecha por envase", () => {
    expect(harvestQtyByContainer(labors, workdaysByLabor)).toEqual({ LC: { 0: 0, 1: 87, 2: 10 } });
  });

  it("cuenta las unidades del trato y solo las etapas que cuentan del trato por etapas", () => {
    expect(laborQtyTotals(labors, workdaysByLabor)).toEqual({ LT: 71, LE: 40 });
  });

  it("cuenta a las personas con producción del trato, sin el piso", () => {
    expect(pieceworkPeopleCounts(labors, workdaysByLabor)).toEqual({ LT: 2 });
  });

  it("cuenta y suma los pisos de cada labor", () => {
    expect(floorMetricsOf(labors, workdaysByLabor)).toEqual({
      LC: { count: 1, amount: 5000 },
      LT: { count: 1, amount: 3000 },
      LE: { count: 0, amount: 0 },
      LH: { count: 0, amount: 0 },
      LM: { count: 0, amount: 0 },
    });
  });

  it("separa las jornadas y horas extras normales de las del feriado", () => {
    expect(overtimeDayMetricsOf(labors, workdaysByLabor, dayPrices)).toEqual({
      LH: { normalQty: 30000, holidayQty: 35000, normalHE: 2, holidayHE: 1, workersWithBonus: 2 },
    });
  });

  it("agrupa el trato por tier según la clave del mapa, sin el piso", () => {
    expect(pieceworkTierMetricsOf(labors, workdaysByLabor)).toEqual({
      LT: { 0: { qty: 70, amount: 21000, workerCount: 2 }, 1: { qty: 1, amount: 10000, workerCount: 1 } },
    });
  });
});

describe("días de la labor activa", () => {
  it("cuenta a las personas de cada fecha, incluida la asistencia de un mensual", () => {
    const byDate = peopleByDateOf(workdaysByLabor, "LM");
    expect([...byDate.keys()]).toEqual([D1]);
    expect([...byDate.get(D1)].sort()).toEqual([ANA, BETO].sort());
  });

  it("muestra la columna Piso en los días con piso configurado o asignado", () => {
    expect([...daysWithFloorOf(harvest, true, false, dayPrices, workdaysByLabor.LC)]).toEqual([D1]);
    expect([...daysWithFloorOf(piecework, false, true, dayPrices, workdaysByLabor.LT)]).toEqual([D2]);
    expect(daysWithFloorOf(normal, false, false, dayPrices, workdaysByLabor.LM).size).toBe(0);
    expect(daysWithFloorOf(null, true, false, dayPrices, {}).size).toBe(0);
  });

  it("suma a los combos con precio los que solo tienen producción", () => {
    expect(dayCombosOf(true, harvest, days, dayPrices, "unit", workdaysByLabor)).toEqual({
      [D1]: [
        { key: "1_1", x: 1, y: 1, price: 500, mode: "unit" },
        { key: "1_2", x: 1, y: 2, price: 800, mode: "unit" },
      ],
      [D2]: [
        { key: "1_1", x: 1, y: 1, price: 500, mode: "unit" },
        { key: "2_1", x: 2, y: 1, price: 0, mode: "unit" },
      ],
    });
    expect(dayCombosOf(false, harvest, days, dayPrices, "unit", workdaysByLabor)).toEqual({});
  });

  it("devuelve los tiers del trato de cada día", () => {
    expect(dayTiersOf(true, piecework, days, dayPrices, "unit", workdaysByLabor)).toEqual({
      [D1]: [
        { key: "t0", index: 0, price: 300, mode: "unit", unit: null },
        { key: "t1", index: 1, price: 10000, mode: "flat", unit: null },
      ],
      [D2]: [{ key: "t0", index: 0, price: 300, mode: "unit", unit: null }],
    });
    expect(dayTiersOf(false, piecework, days, dayPrices, "unit", workdaysByLabor)).toEqual({});
  });

  it("muestra las etapas con precio o con producción ese día", () => {
    expect(dayStagesOf(true, stages, days, dayPrices, workdaysByLabor)).toEqual({
      [D1]: [
        { id: "e1", name: "Primera", counts: false, price: 100, mode: "unit" },
        { id: "e2", name: "Segunda", counts: true, price: 200, mode: "unit" },
      ],
      [D2]: [{ id: "e2", name: "Segunda", counts: true, price: 200, mode: "unit" }],
    });
  });

  it("resume cada día del trato por etapas", () => {
    expect(stagesDaySummaryOf(true, stages, workdaysByLabor)).toEqual({
      [D1]: { counted: 30, amount: 9000, people: 1 },
      [D2]: { counted: 10, amount: 2000, people: 1 },
    });
    expect(stagesDaySummaryOf(false, stages, workdaysByLabor)).toEqual({});
  });

  it("suma la cosecha de cada combo de cada día entre los trabajadores de la labor", () => {
    const combos = dayCombosOf(true, harvest, days, dayPrices, "unit", workdaysByLabor);
    expect(harvestQtyByDayCombo(true, harvest, workdaysByLabor, days, workers, combos)).toEqual({
      [D1]: { "1_1": 70, "1_2": 10 },
      [D2]: { "1_1": 0, "2_1": 5 },
    });
  });
});

describe("trabajadores huérfanos", () => {
  it("suma a quien tiene jornadas en la labor sin estar en su lista", () => {
    const names = new Map([[CARLA, "Carla Díaz"]]);
    expect(orphanWorkersOf(harvest, workers, workdaysByLabor.LC, names)).toEqual([
      { rut: CARLA, name: "Carla Díaz", isOrphan: true },
    ]);
    expect(orphanWorkersOf(harvest, workers, workdaysByLabor.LC, new Map())).toEqual([
      { rut: CARLA, name: CARLA, isOrphan: true },
    ]);
    expect(orphanWorkersOf(null, workers, workdaysByLabor.LC, names)).toEqual([]);
  });
});
