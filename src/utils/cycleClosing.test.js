import { describe, it, expect } from "vitest";
import { firstWorkedDay, lastWorkedDay, closedCyclePatch, settledOpenCycles, splitTaken, payrollStatusMap } from "./cycleClosing";

describe("fechas al cerrar un ciclo", () => {
  const today = "2026-10-17";

  it("toma el rango de lo trabajado aunque los días estén desordenados", () => {
    const cycle = { days: ["2026-10-05", "2026-10-01", "2026-10-09"], startDate: "2026-09-20" };
    expect(firstWorkedDay(cycle, today)).toBe("2026-10-01");
    expect(lastWorkedDay(cycle, today)).toBe("2026-10-09");
    expect(closedCyclePatch(cycle, today)).toEqual({ status: "closed", startDate: "2026-10-01", endDate: "2026-10-09" });
  });

  it("sin días deja las fechas que tenía, o hoy si faltan", () => {
    expect(closedCyclePatch({ days: [], startDate: "2026-09-01", endDate: "2026-09-30" }, today)).toEqual({
      status: "closed",
      startDate: "2026-09-01",
      endDate: "2026-09-30",
    });
    expect(closedCyclePatch({}, today)).toEqual({ status: "closed", startDate: today, endDate: today });
  });
});

const payrolls = [
  { id: "pagada", status: "paid" },
  { id: "pendiente", status: "pending" },
];

describe("en nómina no es pagado", () => {
  const statusOf = payrollStatusMap(payrolls);

  it("separa lo de nóminas pagadas de lo que está en una nómina sin pagar", () => {
    expect(splitTaken({ takenByPayroll: { pagada: 100, pendiente: 30 } }, statusOf)).toEqual({
      paid: 100,
      inPayroll: 30,
      openPayrollIds: ["pendiente"],
    });
  });

  it("una nómina más antigua que las cargadas cuenta como pagada, y lo de $0 no cuenta", () => {
    expect(splitTaken({ takenByPayroll: { vieja: 80, pendiente: 0 } }, statusOf)).toEqual({ paid: 80, inPayroll: 0, openPayrollIds: [] });
    expect(splitTaken({}, statusOf)).toEqual({ paid: 0, inPayroll: 0, openPayrollIds: [] });
  });
});

describe("ciclos pagados por completo", () => {
  const stat = (unpaid, takenByPayroll) => ({ unpaid, firstDay: "2026-10-01", lastDay: "2026-10-09", takenByPayroll });
  const cycles = [
    { id: "listo", status: "open" },
    { id: "conPendiente", status: "open" },
    { id: "enNominaSinPagar", status: "open" },
    { id: "cerrado", status: "closed" },
    { id: "nominaAntigua", status: "open" },
    { id: "sinNada", status: "open" },
    { id: "ceroEnPendiente" },
  ];
  const stats = {
    listo: stat(0, { pagada: 100 }),
    conPendiente: stat(50, { pagada: 100 }),
    enNominaSinPagar: stat(0, { pagada: 100, pendiente: 30 }),
    cerrado: stat(0, { pagada: 100 }),
    nominaAntigua: stat(0, { vieja: 80 }),
    sinNada: stat(0, {}),
    ceroEnPendiente: stat(0, { pagada: 100, pendiente: 0 }),
  };

  it("ofrece los que no tienen pendiente y están en nóminas pagadas", () => {
    const { settled } = settledOpenCycles(cycles, stats, payrolls);
    expect(settled.map((r) => r.cycle.id)).toEqual(["listo", "nominaAntigua", "ceroEnPendiente"]);
    expect(settled[0]).toMatchObject({ paid: 100, inPayroll: 0, firstDay: "2026-10-01", lastDay: "2026-10-09" });
  });

  it("deja aparte los que siguen en una nómina sin pagar, con cuál es", () => {
    const { waiting } = settledOpenCycles(cycles, stats, payrolls);
    expect(waiting.map((r) => [r.cycle.id, r.openPayrollIds, r.inPayroll])).toEqual([["enNominaSinPagar", ["pendiente"], 30]]);
  });

  it("no ofrece los cerrados, los que tienen pendiente ni los que no tienen nada pagado", () => {
    const ids = settledOpenCycles(cycles, stats, payrolls).settled.map((r) => r.cycle.id);
    expect(ids).not.toContain("cerrado");
    expect(ids).not.toContain("conPendiente");
    expect(ids).not.toContain("sinNada");
  });
});
