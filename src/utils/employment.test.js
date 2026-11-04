import { describe, it, expect } from "vitest";
import {
  isActiveOn,
  isActiveIn,
  activeByWorker,
  matchesEmploymentFilter,
  matchesPrincipal,
  NO_PRINCIPAL,
  listCompanyLabel,
  employmentGroupOf,
  overlapping,
  employmentError,
  planStartEmployments,
  planEndEmployments,
  workedDays,
  earnedByDay,
  datesWithEarnings,
  contributionPay,
  isBelowMinimum,
  feeAmounts,
  feeRows,
  monthRange,
  contributionRows,
} from "./employment";

const contract = (over = {}) => ({ id: "c1", workerId: "w1", type: "contract", employerId: "hp", startDate: "2026-09-01", endDate: "", ...over });

describe("vigencia", () => {
  it("un período sin término sigue vigente, y con término lo está hasta ese día", () => {
    expect(isActiveOn(contract(), "2026-08-31")).toBe(false);
    expect(isActiveOn(contract(), "2026-09-01")).toBe(true);
    expect(isActiveOn(contract(), "2030-01-01")).toBe(true);
    const fixed = contract({ endDate: "2026-11-30" });
    expect(isActiveOn(fixed, "2026-11-30")).toBe(true);
    expect(isActiveOn(fixed, "2026-12-01")).toBe(false);
  });

  it("en un rango cuenta lo vigente en algún día", () => {
    const ended = contract({ endDate: "2026-09-10" });
    expect(isActiveIn(ended, "2026-09-10", "2026-09-20")).toBe(true);
    expect(isActiveIn(ended, "2026-09-11", "2026-09-20")).toBe(false);
    expect(isActiveIn(contract({ startDate: "2026-09-20" }), "2026-09-01", "2026-09-19")).toBe(false);
  });

  it("filtra por tipo, por empleador y a quien no tiene nada", () => {
    const list = [
      contract(),
      { id: "f1", workerId: "w2", type: "fees", employerId: "aguada", startDate: "2026-09-01", endDate: "" },
      contract({ id: "old", workerId: "w3", endDate: "2026-08-01" }),
    ];
    const active = activeByWorker(list, "2026-09-15");
    expect([...active.keys()]).toEqual(["w1", "w2"]);
    expect(matchesEmploymentFilter(active.get("w1"), { type: "contract" })).toBe(true);
    expect(matchesEmploymentFilter(active.get("w1"), { type: "fees" })).toBe(false);
    expect(matchesEmploymentFilter(active.get("w2"), { employerId: "aguada" })).toBe(true);
    expect(matchesEmploymentFilter(active.get("w3"), { type: "none" })).toBe(true);
    expect(matchesEmploymentFilter(active.get("w1"), { type: "none" })).toBe(false);
    expect(matchesEmploymentFilter(active.get("w3"), {})).toBe(true);
  });

  it("filtra por mandante, también a los que no tienen", () => {
    const withPrincipal = contract({ principalId: "m1" });
    expect(matchesPrincipal(withPrincipal, "")).toBe(true);
    expect(matchesPrincipal(withPrincipal, "m1")).toBe(true);
    expect(matchesPrincipal(withPrincipal, "m2")).toBe(false);
    expect(matchesPrincipal(withPrincipal, NO_PRINCIPAL)).toBe(false);
    expect(matchesPrincipal(contract(), NO_PRINCIPAL)).toBe(true);
    expect(matchesPrincipal(contract({ principalId: "" }), NO_PRINCIPAL)).toBe(true);
    expect(matchesEmploymentFilter([withPrincipal], { type: "contract", principalId: "m1" })).toBe(true);
    expect(matchesEmploymentFilter([withPrincipal], { type: "fees", principalId: "m1" })).toBe(false);
    expect(matchesEmploymentFilter([contract()], { principalId: "m1" })).toBe(false);
    expect(matchesEmploymentFilter([], { principalId: NO_PRINCIPAL })).toBe(false);
  });

  it("una lista lleva el empleador y, si es de un solo mandante, el mandante", () => {
    expect(listCompanyLabel({ employerName: "HP", principalName: "Frutícola" })).toBe("HP · Frutícola");
    expect(listCompanyLabel({ employerName: "HP", principalName: "" })).toBe("HP");
    expect(listCompanyLabel({ employerName: "HP" })).toBe("HP");
  });
});

describe("grupos de la grilla", () => {
  it("con contrato antes que honorarios, y sin nada al final", () => {
    expect(employmentGroupOf([{ type: "fees" }, { type: "contract" }])).toBe("contract");
    expect(employmentGroupOf([{ type: "fees" }])).toBe("fees");
    expect(employmentGroupOf([])).toBe("none");
    expect(employmentGroupOf(undefined)).toBe("none");
  });
});

describe("períodos que se cruzan", () => {
  const list = [contract({ endDate: "2026-09-30" })];

  it("no deja dos períodos de la misma persona que se cruzan", () => {
    expect(overlapping(list, { workerId: "w1", startDate: "2026-09-30" })).toMatchObject({ id: "c1" });
    expect(overlapping(list, { workerId: "w1", startDate: "2026-10-01" })).toBe(null);
    expect(overlapping(list, { workerId: "w2", startDate: "2026-09-15" })).toBe(null);
    expect(overlapping([contract()], { workerId: "w1", startDate: "2026-01-01", endDate: "2026-08-31" })).toBe(null);
  });

  it("al editar un período no choca consigo mismo", () => {
    expect(overlapping(list, { ...list[0], endDate: "2026-10-15" })).toBe(null);
  });

  it("explica el error", () => {
    const draft = { workerId: "w1", type: "fees", employerId: "hp", startDate: "2026-09-15" };
    expect(employmentError(list, draft)).toBe("Se cruza con contrato del 2026-09-01 al 2026-09-30.");
    expect(employmentError(list, { ...draft, startDate: "2026-10-01" })).toBe("");
    expect(employmentError(list, { ...draft, startDate: "2026-10-05", endDate: "2026-10-01" })).toBe("La fecha de término es anterior a la de inicio.");
    expect(employmentError(list, { ...draft, employerId: "" })).toBe("Falta el empleador.");
  });
});

describe("acciones masivas", () => {
  it("contrata a varios y deja afuera a quien se cruzaría con otro período", () => {
    const existing = [contract({ workerId: "w2", endDate: "" })];
    const people = [{ workerId: "w1", rut: "1-9", name: "Ana" }, { workerId: "w2", rut: "2-7", name: "Beto" }, { workerId: "w1", rut: "1-9", name: "Ana" }];
    const plan = planStartEmployments(existing, people, { type: "fees", employerId: "hp", principalId: "m1", startDate: "2026-10-01" });
    expect(plan.create).toEqual([
      { workerId: "w1", workerRut: "1-9", workerName: "Ana", type: "fees", employerId: "hp", principalId: "m1", startDate: "2026-10-01", endDate: "", endReason: null, settlementStatus: null, notes: "" },
    ]);
    expect(plan.skipped.map((s) => [s.person.name, s.reason])).toEqual([
      ["Beto", "Se cruza con contrato del 2026-09-01 sin término."],
      ["Ana", "Se cruza con honorarios del 2026-10-01 sin término."],
    ]);
  });

  it("termina varios: el contrato queda con finiquito pendiente y los honorarios sin finiquito", () => {
    const plan = planEndEmployments(
      [contract(), { ...contract({ id: "f1", type: "fees" }) }, contract({ id: "late", startDate: "2026-10-05" })],
      { endDate: "2026-10-01", endReason: "jobEnd" },
    );
    expect(plan.update).toEqual([
      { id: "c1", patch: { endDate: "2026-10-01", endReason: "jobEnd", settlementStatus: "pending" } },
      { id: "f1", patch: { endDate: "2026-10-01", endReason: "jobEnd", settlementStatus: null } },
    ]);
    expect(plan.skipped.map((s) => s.employment.id)).toEqual(["late"]);
  });
});

describe("días trabajados", () => {
  const faenaOfCycle = new Map([["c-a", "aguada"], ["c-b", "lingues"]]);

  it("un día cuenta una vez, en la faena de la jornada de mayor monto", () => {
    const worked = workedDays(
      [
        { workerId: "w1", cycleId: "c-a", date: "2026-09-01", amount: 20000 },
        { workerId: "w1", cycleId: "c-a", date: "2026-09-01", amount: 5000 },
        { workerId: "w1", cycleId: "c-b", date: "2026-09-02", amount: 1000 },
        { workerId: "w1", cycleId: "c-a", date: "2026-09-02", amount: 9000 },
        { workerRut: "w2", cycleId: "c-b", date: "2026-09-03", amount: 0, attendanceOnly: true },
      ],
      faenaOfCycle,
    );
    expect([...worked.get("w1")]).toEqual([["2026-09-01", "aguada"], ["2026-09-02", "aguada"]]);
    expect([...worked.get("w2")]).toEqual([["2026-09-03", "lingues"]]);
  });

  it("lo ganado cada día suma todas las jornadas del día, en cualquier faena", () => {
    const earned = earnedByDay([
      { workerId: "w1", cycleId: "c-a", date: "2026-09-01", amount: 20000 },
      { workerId: "w1", cycleId: "c-b", date: "2026-09-01", amount: 5000 },
      { workerId: "w1", cycleId: "c-a", date: "2026-09-02", amount: 9000 },
      { workerRut: "w2", cycleId: "c-b", date: "2026-09-03", amount: 0, attendanceOnly: true },
    ]);
    expect([...earned.get("w1")]).toEqual([["2026-09-01", 25000], ["2026-09-02", 9000]]);
    expect([...earned.get("w2")]).toEqual([["2026-09-03", 0]]);
    expect(datesWithEarnings(["2026-09-02", "2026-09-01", "2026-09-05"], earned.get("w1"))).toEqual([
      { date: "2026-09-01", amount: 25000 },
      { date: "2026-09-02", amount: 9000 },
      { date: "2026-09-05", amount: 0 },
    ]);
  });
});

describe("honorarios", () => {
  it("calza con la planilla: tarifa líquida por día y bruto redondeado por día", () => {
    expect(feeAmounts(1, 18452, 0.1525)).toEqual({ net: 18452, gross: 21772, withholding: 3320 });
    expect(feeAmounts(3, 18452, 0.1525)).toEqual({ net: 55356, gross: 65316, withholding: 9960 });
    expect(feeAmounts(31, 18452, 0.1525)).toEqual({ net: 572012, gross: 674932, withholding: 102920 });
    expect(feeAmounts(0, 18452, 0.1525)).toEqual({ net: 0, gross: 0, withholding: 0 });
  });

  it("toma los días a honorarios con el empleador, dentro del rango y del período", () => {
    const employments = [
      { id: "f1", workerId: "w1", type: "fees", employerId: "hp", startDate: "2026-09-02", endDate: "" },
      { id: "f2", workerId: "w2", type: "fees", employerId: "otra", startDate: "2026-09-01", endDate: "" },
      { id: "c3", workerId: "w3", type: "contract", employerId: "hp", startDate: "2026-09-01", endDate: "" },
    ];
    const worked = new Map([
      ["w1", new Map([["2026-09-01", "aguada"], ["2026-09-02", "aguada"], ["2026-09-03", "lingues"], ["2026-09-20", "aguada"]])],
      ["w2", new Map([["2026-09-02", "aguada"]])],
      ["w3", new Map([["2026-09-02", "aguada"]])],
    ]);
    expect(feeRows(employments, worked, { employerId: "hp", from: "2026-09-01", to: "2026-09-15" })).toEqual([
      { workerId: "w1", faenaId: "aguada", days: 1, dates: ["2026-09-02"] },
      { workerId: "w1", faenaId: "lingues", days: 1, dates: ["2026-09-03"] },
    ]);
  });

  it("con un mandante, toma solo los días de los períodos de ese mandante", () => {
    const employments = [
      { id: "f1", workerId: "w1", type: "fees", employerId: "hp", principalId: "m1", startDate: "2026-09-01", endDate: "2026-09-10" },
      { id: "f2", workerId: "w1", type: "fees", employerId: "hp", principalId: "m2", startDate: "2026-09-11", endDate: "" },
      { id: "f3", workerId: "w2", type: "fees", employerId: "hp", startDate: "2026-09-01", endDate: "" },
    ];
    const worked = new Map([
      ["w1", new Map([["2026-09-05", "aguada"], ["2026-09-12", "aguada"], ["2026-09-13", "aguada"]])],
      ["w2", new Map([["2026-09-05", "aguada"]])],
    ]);
    const range = { employerId: "hp", from: "2026-09-01", to: "2026-09-30" };
    expect(feeRows(employments, worked, { ...range, principalId: "m2" }).map((r) => [r.workerId, r.days])).toEqual([["w1", 2]]);
    expect(feeRows(employments, worked, { ...range, principalId: NO_PRINCIPAL }).map((r) => [r.workerId, r.days])).toEqual([["w2", 1]]);
    expect(feeRows(employments, worked, range).map((r) => [r.workerId, r.days])).toEqual([["w1", 3], ["w2", 1]]);
  });
});

describe("imposiciones", () => {
  it("el mes va del primero al último día", () => {
    expect(monthRange("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(monthRange("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(monthRange("2026-12")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });

  it("lleva los días con contrato del mes, pide finiquito si terminó y deja en 0 a quien no trabajó", () => {
    const employments = [
      { id: "c1", workerId: "w1", type: "contract", employerId: "hp", startDate: "2026-08-15", endDate: "2026-09-10", endReason: "jobEnd" },
      { id: "c2", workerId: "w2", type: "contract", employerId: "hp", startDate: "2026-09-01", endDate: "" },
      { id: "c3", workerId: "w3", type: "contract", employerId: "hp", startDate: "2026-10-01", endDate: "" },
    ];
    const worked = new Map([
      ["w1", new Map([["2026-09-05", "aguada"], ["2026-09-12", "aguada"], ["2026-08-30", "aguada"]])],
    ]);
    expect(contributionRows(employments, worked, { employerId: "hp", month: "2026-09" })).toEqual([
      { workerId: "w1", request: "payslipAndSettlement", endDate: "2026-09-10", endReason: "jobEnd", faenaId: "aguada", days: 1, dates: ["2026-09-05"] },
      { workerId: "w2", request: "payslip", endDate: "", endReason: null, faenaId: "", days: 0, dates: [] },
    ]);
  });

  it("con un mandante, lleva solo los contratos de ese mandante", () => {
    const employments = [
      { id: "c1", workerId: "w1", type: "contract", employerId: "hp", principalId: "m1", startDate: "2026-09-01", endDate: "" },
      { id: "c2", workerId: "w2", type: "contract", employerId: "hp", principalId: "m2", startDate: "2026-09-01", endDate: "" },
    ];
    const worked = new Map([["w1", new Map([["2026-09-05", "aguada"]])], ["w2", new Map([["2026-09-05", "aguada"]])]]);
    expect(contributionRows(employments, worked, { employerId: "hp", principalId: "m1", month: "2026-09" }).map((r) => r.workerId)).toEqual(["w1"]);
  });

  it("declara el mínimo por día y lo que ganó por sobre eso va como bono", () => {
    expect(contributionPay(10, 250000, 17967)).toEqual({ baseSalary: 179670, bonus: 70330 });
    expect(contributionPay(10, 150000, 17967)).toEqual({ baseSalary: 179670, bonus: 0 });
    expect(contributionPay(0, 0, 17967)).toEqual({ baseSalary: 0, bonus: 0 });
    expect(contributionPay(3, 60000, 0)).toEqual({ baseSalary: 0, bonus: 60000 });
  });

  it("marca la fila que ganó menos que el mínimo", () => {
    expect(isBelowMinimum({ earned: 150000, baseSalary: 179670 })).toBe(true);
    expect(isBelowMinimum({ earned: 250000, baseSalary: 179670 })).toBe(false);
    expect(isBelowMinimum({ earned: 0, baseSalary: 0 })).toBe(false);
    expect(isBelowMinimum({ days: 3 })).toBe(false);
  });
});
