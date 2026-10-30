import { describe, it, expect } from "vitest";
import {
  fmtNumber,
  dateLabel,
  medianOf,
  activityLabel,
  laborQtyUnit,
  formatRowMetric,
  formatTotalsMetric,
  buildDailyRows,
  laborTotals,
  buildWorkerLaborGrid,
  laborsDataOf,
  laborWorkerGridsOf,
  transportByCarrier,
  payTotal,
  dayNotesSummaryOf,
} from "./cycleSummary";

const catalogs = {
  containers: [{ value: 2, label: "Saco" }, { value: 3, label: "Caja" }],
  tratoTypes: [{ value: 0, label: "Poda" }],
  tratoUnits: [{ value: 1, label: "Metro" }, { value: 2, label: "Polín" }],
};

const D1 = "2026-10-01";
const D2 = "2026-10-02";

describe("formatos", () => {
  it("fmtNumber usa hasta dos decimales con coma", () => {
    expect(fmtNumber(1234.567)).toBe("1.234,57");
    expect(fmtNumber("abc")).toBe("0");
  });

  it("dateLabel da día y mes corto, y devuelve tal cual lo que no es fecha", () => {
    expect(dateLabel("2026-10-05")).toBe("05-oct");
    expect(dateLabel("")).toBe("");
    expect(dateLabel("bad")).toBe("bad");
  });

  it("medianOf toma el del medio, o el promedio de los dos del medio", () => {
    expect(medianOf([])).toBe(0);
    expect(medianOf([3, 1, 2])).toBe(2);
    expect(medianOf([4, 1, 3, 2])).toBe(2.5);
  });
});

describe("unidades y etiquetas por tipo de labor", () => {
  it("laborQtyUnit en cosecha usa el envase si es uno solo", () => {
    expect(laborQtyUnit({ type: "cosecha" }, catalogs, new Set([2]))).toBe("Saco");
    expect(laborQtyUnit({ type: "cosecha" }, catalogs, new Set([2, 3]))).toBe("Unid.");
  });

  it("laborQtyUnit en trato usa la unidad común o, si no hay, el tipo de trato", () => {
    expect(laborQtyUnit({ type: "trato", tratoType: 0 }, catalogs, null, new Set([1]))).toBe("Metro");
    expect(laborQtyUnit({ type: "trato", tratoType: 0 }, catalogs, null, new Set([1, 2]))).toBe("Poda");
  });

  it("laborQtyUnit cuenta jornadas en las labores al día y en tratoHE", () => {
    expect(laborQtyUnit({ type: "main" })).toBe("Jornadas");
    expect(laborQtyUnit({ type: "tratoHE" })).toBe("Jornadas");
    expect(laborQtyUnit({ type: "tratoEtapas" })).toBe("Unidades");
  });

  it("activityLabel arma la etiqueta del editor de tarifas", () => {
    expect(activityLabel({ type: "cosecha" }, catalogs, new Set([2]))).toBe("Cosecha — Saco");
    expect(activityLabel({ type: "cosecha" }, catalogs, new Set([2, 3]))).toBe("Cosecha");
    expect(activityLabel({ type: "trato", tratoType: 0 }, catalogs, null, new Set([1]))).toBe("Trato — Poda × Metro");
    expect(activityLabel({ type: "trato", tratoType: 0 }, catalogs, null, new Set())).toBe("Trato — Poda");
    expect(activityLabel({ type: "main" })).toBe("Jornada simple");
    expect(activityLabel({ type: "other" })).toBe("other");
    expect(activityLabel(null)).toBe("—");
  });
});

describe("métricas de fila y de subtotal", () => {
  it("formatRowMetric muestra la cantidad con la unidad del día en trato", () => {
    expect(formatRowMetric({ qty: 20, unit: 1 }, "trato", catalogs)).toBe("20 Metro");
    expect(formatRowMetric({ qty: 20 }, "trato", catalogs)).toBe("20");
    expect(formatRowMetric({ qty: 1234.5 }, "cosecha", catalogs)).toBe("1.234,5");
  });

  it("formatRowMetric rotula la etapa que no cuenta y separa jornadas de HE", () => {
    expect(formatRowMetric({ qty: 5, stageName: "Corte", stageCounts: false }, "tratoEtapas")).toBe("5 Corte (no cuenta)");
    expect(formatRowMetric({ qty: 5, stageName: "Corte", stageCounts: true }, "tratoEtapas")).toBe("5 Corte");
    expect(formatRowMetric({ qty: 3, overtimeHours: 2.5 }, "tratoHE")).toBe("3 jornadas + 2,5 HE");
    expect(formatRowMetric({ qty: 0, overtimeHours: 2 }, "tratoHE")).toBe("2 HE");
  });

  it("formatTotalsMetric agrupa por unidad en trato", () => {
    const rows = [{ unit: 1, qty: 12 }, { unit: 2, qty: 8 }, { unit: 1, qty: 3 }];
    expect(formatTotalsMetric({ qty: 23 }, "trato", rows, catalogs)).toBe("15 Metro + 8 Polín");
    expect(formatTotalsMetric({ qty: 23 }, "trato", [{ qty: 23 }], catalogs)).toBe("23");
  });

  it("formatTotalsMetric en etapas cuenta solo las unidades que cuentan", () => {
    expect(formatTotalsMetric({ qty: 10, countedQty: 7 }, "tratoEtapas")).toBe("7 unid.");
    expect(formatTotalsMetric({ qty: 4, overtimeHours: 1 }, "tratoHE")).toBe("4 jornadas + 1 HE");
  });
});

describe("buildDailyRows", () => {
  it("en una labor al día cuenta una jornada por workday y deja el piso aparte", () => {
    const labor = { id: "L1", type: "main" };
    const wdMap = {
      a: { date: D2, workerRut: "1-9", workerId: "w1", amount: 30000 },
      b: { date: D1, workerRut: "1-9", workerId: "w1", amount: 30000 },
      c: { date: D1, workerRut: "2-7", workerId: "w2", amount: 25000 },
      d: { date: D1, workerRut: "2-7", workerId: "w2", amount: 5000, pisoOnly: true },
    };
    const { rows } = buildDailyRows(labor, wdMap);
    expect(rows.map((r) => r.date)).toEqual([D1, D2]);
    expect(rows[0]).toMatchObject({ qty: 2, amount: 55000, pisoAmount: 5000, pisoCount: 1, workerCount: 2 });
    expect(rows[1]).toMatchObject({ qty: 1, amount: 30000, pisoAmount: 0, workerCount: 1 });
  });

  it("en cosecha suma la cantidad y junta los envases usados", () => {
    const labor = { id: "L1", type: "cosecha" };
    const wdMap = {
      a: { date: D1, workerRut: "1-9", qty: 40, amount: 4000, containerY: 2 },
      b: { date: D1, workerRut: "2-7", qty: 10, amount: 1500, containerY: 3 },
    };
    const { rows, containers } = buildDailyRows(labor, wdMap);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ qty: 50, amount: 5500 });
    expect([...containers].sort()).toEqual([2, 3]);
  });

  it("en trato arma una fila por día y tier, con la unidad del tier", () => {
    const labor = { id: "L1", type: "trato" };
    const dayPrices = { L1: { [D1]: { t0: { price: 100, mode: "unit", unit: 1 }, t1: { price: 200, mode: "unit", unit: 2 } } } };
    const wdMap = {
      "1-9__2026-10-01__t1": { date: D1, workerRut: "1-9", qty: 5, amount: 1000 },
      "1-9__2026-10-01__t0": { date: D1, workerRut: "1-9", qty: 10, amount: 1000 },
      "2-7__2026-10-01__t0": { date: D1, workerRut: "2-7", qty: 4, amount: 400 },
    };
    const { rows } = buildDailyRows(labor, wdMap, dayPrices);
    expect(rows.map((r) => [r.rowKey, r.unit, r.qty, r.amount])).toEqual([
      ["2026-10-01__t0", 1, 14, 1400],
      ["2026-10-01__t1", 2, 5, 1000],
    ]);
  });

  it("en tratoHE separa las horas extras y deriva los bonos del monto", () => {
    const labor = { id: "L1", type: "tratoHE" };
    const wdMap = { a: { date: D1, workerRut: "1-9", qty: 30000, overtimeHours: 2, amount: 40000 } };
    const { rows } = buildDailyRows(labor, wdMap);
    // Sin tarifa propia, la HE vale 3.500: 2 × 3.500 = 7.000; bonos = 40.000 − 30.000 − 7.000.
    expect(rows[0]).toMatchObject({ qty: 30000, overtimeHours: 2, heTotal: 7000, bonosTotal: 3000 });

    const { rows: withRate } = buildDailyRows({ ...labor, overtimeRate: 5000 }, wdMap);
    expect(withRate[0]).toMatchObject({ heTotal: 10000, bonosTotal: 0 });
  });

  it("en tratoHE cuenta como jornada solo el día con base", () => {
    const labor = { id: "L1", type: "tratoHE" };
    const { rows } = buildDailyRows(labor, {
      a: { date: D1, workerRut: "1-9", qty: 30000, overtimeHours: 2, amount: 37000 },
      b: { date: D1, workerRut: "2-7", qty: 30000, amount: 30000 },
      c: { date: D1, workerRut: "3-5", qty: 0, overtimeHours: 3, amount: 10500 },
    });
    expect(rows[0]).toMatchObject({ workdayCount: 2, workerCount: 3, qty: 60000, overtimeHours: 5 });
  });

  it("en etapas arma una fila por etapa con su nombre y si cuenta", () => {
    const labor = { id: "L1", type: "tratoEtapas", stages: [{ id: "s1", name: "Corte", counts: true }, { id: "s2", name: "Amarre", counts: false }] };
    const wdMap = {
      "1-9__2026-10-01__s1": { date: D1, workerRut: "1-9", qty: 6, amount: 600 },
      "1-9__2026-10-01__s2": { date: D1, workerRut: "1-9", qty: 4, amount: 200 },
    };
    const { rows } = buildDailyRows(labor, wdMap);
    expect(rows.map((r) => [r.stageName, r.stageCounts, r.qty])).toEqual(
      expect.arrayContaining([["Corte", true, 6], ["Amarre", false, 4]]),
    );
  });
});

describe("laborTotals", () => {
  it("suma todo y cuenta como unidades solo las etapas que cuentan", () => {
    const totals = laborTotals([
      { qty: 6, amount: 600, stageCounts: true, workerCount: 1 },
      { qty: 4, amount: 200, stageCounts: false, workerCount: 1, pisoAmount: 50, pisoCount: 1 },
      { qty: 2, amount: 100, workerCount: 2, heTotal: 10, bonosTotal: 5, overtimeHours: 1, workdayCount: 2 },
    ]);
    expect(totals).toEqual({
      qty: 12, countedQty: 8, overtimeHours: 1, amount: 900, pisoAmount: 50, pisoCount: 1, workerDays: 4, heTotal: 10, bonosTotal: 5, workdayCount: 2,
    });
  });
});

describe("buildWorkerLaborGrid", () => {
  it("agrupa por workerId aunque el RUT del workday haya cambiado", () => {
    const labor = { id: "L1", type: "main", workers: [{ id: "w1", rut: "1-9", name: "Ana Pérez" }] };
    const wdMap = {
      a: { date: D1, workerId: "w1", workerRut: "1-8", amount: 30000 },
      b: { date: D2, workerId: "w1", workerRut: "1-9", amount: 30000 },
    };
    const { workers, dates } = buildWorkerLaborGrid(labor, wdMap);
    expect(dates).toEqual([D1, D2]);
    expect(workers).toHaveLength(1);
    expect(workers[0]).toMatchObject({ rut: "1-9", name: "Ana Pérez" });
    expect(workers[0].totals).toMatchObject({ jornadas: 2, amount: 60000 });
  });

  it("toma el nombre del workday si la persona ya no está en la labor, y ordena por nombre", () => {
    const labor = { id: "L1", type: "main", workers: [] };
    const wdMap = {
      a: { date: D1, workerRut: "2-7", workerName: "Zoe Rojas", amount: 1 },
      b: { date: D1, workerRut: "1-9", workerName: "Beto Soto", amount: 1 },
    };
    expect(buildWorkerLaborGrid(labor, wdMap).workers.map((w) => w.name)).toEqual(["Beto Soto", "Zoe Rojas"]);
  });

  it("en tratoHE cuenta una jornada por workday y suma manejo, supervisión y extras", () => {
    const labor = { id: "L1", type: "tratoHE", bonusManejo: 4000, bonusSupervision: 2000, workers: [] };
    const wdMap = {
      a: { date: D1, workerRut: "1-9", qty: 30000, overtimeHours: 2, hasManejo: true, extras: 500, amount: 41500 },
      b: { date: D2, workerRut: "1-9", qty: 30000, hasSupervision: true, amount: 32000 },
    };
    const [w] = buildWorkerLaborGrid(labor, wdMap).workers;
    expect(w.totals).toMatchObject({ jornadas: 2, base: 60000, overtimeHours: 2, extras: 6500, amount: 73500 });
  });

  it("en cosecha desglosa por combo y marca el piso", () => {
    const labor = { id: "L1", type: "cosecha", workers: [] };
    const wdMap = {
      a: { date: D1, workerRut: "1-9", qty: 40, amount: 4000, qualityX: 1, containerY: 2 },
      b: { date: D1, workerRut: "1-9", amount: 3000, pisoOnly: true },
    };
    const { workers, anyPiso, containers } = buildWorkerLaborGrid(labor, wdMap);
    const cell = workers[0].byDate.get(D1);
    expect(cell).toMatchObject({ kilos: 40, pisoAmount: 3000, amount: 7000 });
    expect(cell.byCombo.get("1_2")).toEqual({ qx: 1, cy: 2, kilos: 40 });
    expect(anyPiso).toBe(true);
    expect([...containers]).toEqual([2]);
  });
});

describe("datos del resumen por labor y transportista", () => {
  const labors = [
    { id: "L1", name: "Principal", type: "main", workers: [] },
    { id: "LT", name: "Poda", type: "trato", tratoType: 0, workers: [] },
  ];
  const workdaysByLabor = {
    L1: { "1-9__2026-10-01__0_0": { date: D1, workerRut: "1-9", amount: 30000 } },
    LT: { "1-9__2026-10-02__t0": { date: D2, workerRut: "1-9", qty: 10, amount: 3000 } },
  };
  const dayPrices = { LT: { [D2]: { t0: { price: 300, mode: "unit", unit: 1 } } } };

  it("laborsDataOf arma las filas, los totales y la unidad de cada labor", () => {
    const [main, trato] = laborsDataOf(labors, workdaysByLabor, dayPrices, catalogs);
    expect(main.totals.amount).toBe(30000);
    expect(main.unit).toBe("Jornadas");
    expect(main.tratoUnitsSet).toBe(null);
    expect([...trato.tratoUnitsSet]).toEqual([1]);
    expect(trato.unit).toBe("Metro");
    expect(laborsDataOf(undefined, {}, {}, catalogs)).toEqual([]);
  });

  it("laborWorkerGridsOf arma la grilla trabajador × día de cada labor", () => {
    const [grid] = laborWorkerGridsOf(labors, workdaysByLabor);
    expect(grid.labor.id).toBe("L1");
    expect(grid.dates).toEqual([D1]);
    expect(grid.workers.map((w) => w.rut)).toEqual(["1-9"]);
    expect(laborWorkerGridsOf(undefined, {})).toEqual([]);
  });

  it("transportByCarrier agrupa por transportista y fecha, con una vuelta si no dice cuántas", () => {
    const groups = transportByCarrier([
      { carrierId: "K1", date: D2, qty: 2, amount: 40000 },
      { carrierId: "K2", date: D1, amount: 15000 },
      { carrierId: "K1", date: D1, qty: 1, amount: 20000 },
      { carrierId: "K1", date: D2, amount: 20000 },
    ]);
    expect(groups.map((g) => [g.carrierId, g.totalCount, g.totalAmount])).toEqual([["K1", 4, 80000], ["K2", 1, 15000]]);
    expect(groups[0].rows).toEqual([
      { date: D1, count: 1, amount: 20000 },
      { date: D2, count: 3, amount: 60000 },
    ]);
  });

  it("payTotal suma lo pagado de cada labor, su piso y el transporte", () => {
    const laborsData = [{ totals: { amount: 1000, pisoAmount: 200 } }, { totals: { amount: 50 } }];
    expect(payTotal(laborsData, [{ totalAmount: 7 }])).toBe(1257);
  });
});

describe("dayNotesSummaryOf", () => {
  const laborsData = [
    { labor: { id: "L1", name: "Principal" }, rows: [{ date: D1 }, { date: D2 }] },
    { labor: { id: "L2", name: "Riego" }, rows: [{ date: D1 }] },
  ];

  it("junta las notas de cada labor y la compartida del día, una sola vez", () => {
    const notes = dayNotesSummaryOf(
      "pay",
      laborsData,
      { L1: { [D1]: "  Llovió  ", "2026-10-03": "Sin gente" } },
      { [D1]: "Corte de luz", [D2]: "Feriado" },
      { L1: "Principal Norte" },
    );
    expect(notes).toEqual([
      { date: D1, shared: "Corte de luz", entries: [{ laborId: "L1", name: "Principal Norte", text: "Llovió" }] },
      { date: D2, shared: "Feriado", entries: [] },
      // Un día sin producción también lleva su observación.
      { date: "2026-10-03", shared: "", entries: [{ laborId: "L1", name: "Principal Norte", text: "Sin gente" }] },
    ]);
  });

  it("en cobrar no hay observaciones", () => {
    expect(dayNotesSummaryOf("charge", laborsData, { L1: { [D1]: "x" } }, {}, {})).toEqual([]);
  });
});
