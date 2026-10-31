import { describe, it, expect } from "vitest";
import { buildCycleRows } from "./workerSummary";

const ANA = "11111111-1";
const BETO = "12345678-5";
const rutKeys = new Set([ANA]);

const cycleWith = (labors, extra = {}) => ({ id: "C1", labors, dayPrices: {}, ...extra });

describe("buildCycleRows", () => {
  it("arma una fila por labor y día, solo con las jornadas del trabajador", () => {
    const cycle = cycleWith([{ id: "L1", name: "Principal", type: "main" }]);
    const workdays = {
      L1: {
        a: { workerRut: ANA, date: "2026-10-02", amount: 30000 },
        b: { workerRut: ANA, date: "2026-10-01", amount: 25000 },
        c: { workerRut: BETO, date: "2026-10-01", amount: 99999 },
      },
    };
    const { rows } = buildCycleRows(rutKeys, cycle, workdays, {}, null);
    expect(rows.map((r) => [r.date, r.workdayCount, r.amount])).toEqual([
      ["2026-10-01", 1, 25000],
      ["2026-10-02", 1, 30000],
    ]);
    expect(rows[0].rowKey).toBe("C1__L1__2026-10-01");
    expect(rows[0].paymentStatus).toBe("unpaid");
  });

  it("en cosecha suma los kilos y anota los envases", () => {
    const cycle = cycleWith([{ id: "L1", name: "Cosecha", type: "cosecha" }]);
    const workdays = {
      L1: {
        a: { workerRut: ANA, date: "2026-10-01", qty: 10, amount: 5000, containerY: 1 },
        b: { workerRut: ANA, date: "2026-10-01", qty: 12, amount: 6000, containerY: 2 },
      },
    };
    const { rows, harvestContainers } = buildCycleRows(rutKeys, cycle, workdays, {}, null);
    expect(rows).toHaveLength(1);
    expect(rows[0].harvestQty).toBe(22);
    expect(rows[0].amount).toBe(11000);
    expect([...harvestContainers].sort()).toEqual([1, 2]);
  });

  it("el piso va aparte y no suma al monto de producción", () => {
    const cycle = cycleWith([{ id: "L1", name: "Cosecha", type: "cosecha" }]);
    const workdays = {
      L1: {
        a: { workerRut: ANA, date: "2026-10-01", qty: 10, amount: 5000 },
        p: { workerRut: ANA, date: "2026-10-01", pisoOnly: true, amount: 3000 },
      },
    };
    const { rows } = buildCycleRows(rutKeys, cycle, workdays, {}, null);
    expect(rows[0].amount).toBe(5000);
    expect(rows[0].floor).toBe(3000);
  });

  it("el estado de pago sale de las nóminas de las jornadas del día", () => {
    const cycle = cycleWith([{ id: "L1", name: "Principal", type: "main" }]);
    const payrollById = new Map([
      ["P1", { name: "Nómina pagada", status: "paid" }],
      ["P2", { name: "Nómina pendiente", status: "pending" }],
    ]);
    const workdays = {
      L1: {
        a: { workerRut: ANA, date: "2026-10-01", amount: 1, payrollId: "P1" },
        b: { workerRut: ANA, date: "2026-10-02", amount: 1, payrollId: "P2" },
        c: { workerRut: ANA, date: "2026-10-03", amount: 1 },
      },
    };
    const { rows } = buildCycleRows(rutKeys, cycle, workdays, {}, payrollById);
    expect(rows.map((r) => r.paymentStatus)).toEqual(["paid", "in_pending", "unpaid"]);
    expect(rows[0].payrollNames).toEqual(["Nómina pagada"]);
  });

  it("en horas extras cada día es una jornada, también uno de solo horas extras", () => {
    // `qty` guarda el monto base del día en pesos, no una cantidad.
    const cycle = cycleWith([{ id: "L1", name: "Jornadas HE", type: "tratoHE", overtimeRate: 5000 }]);
    const workdays = {
      L1: {
        a: { workerRut: ANA, date: "2026-10-01", qty: 30000, overtimeHours: 2, amount: 40000 },
        b: { workerRut: ANA, date: "2026-10-02", qty: 0, overtimeHours: 3, amount: 15000 },
      },
    };
    const { rows } = buildCycleRows(rutKeys, cycle, workdays, {}, null);
    expect(rows.map((r) => [r.date, r.workdayCount, r.overtimeHours, r.overtimeAmount])).toEqual([
      ["2026-10-01", 1, 2, 10000],
      ["2026-10-02", 1, 3, 15000],
    ]);
  });
});
