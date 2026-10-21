import { describe, it, expect } from "vitest";
import {
  daysUntil,
  displayStatus,
  urgencyLabel,
  paidLabel,
  monthlyDate,
  buildInstallments,
  recurringDates,
  summarize,
  parseLooseDate,
  bankCodeFromText,
  excelStatus,
  matchCompany,
  mapExcelRow,
  statusLabel,
  buildPaymentReport,
  canPostpone,
  canProtest,
  extraOf,
  groupUpcoming,
  upcomingMonthEnd,
  nextYearEnd,
  partialPaidOf,
  remainingOf,
  allocatePartialPayment,
  shiftMonths,
  withDayOfMonth,
  seriesRows,
  applySeriesTool,
  seriesChanges,
  seriesRowError,
  counterpartyOptions,
  similarCounterparty,
  groupByCounterparty,
} from "./commitments";

describe("vencimientos", () => {
  it("cuenta los días entre fechas sin depender de la zona horaria", () => {
    expect(daysUntil("2026-10-19", "2026-10-16")).toBe(3);
    expect(daysUntil("2026-10-16", "2026-10-16")).toBe(0);
    expect(daysUntil("2026-10-15", "2026-10-16")).toBe(-1);
    expect(daysUntil("2027-01-01", "2026-12-31")).toBe(1);
    expect(daysUntil("", "2026-10-16")).toBe(null);
  });

  it("un pendiente con la fecha pasada se muestra vencido", () => {
    const today = "2026-10-16";
    expect(displayStatus({ status: "pending", dueDate: "2026-10-15" }, today)).toBe("overdue");
    expect(displayStatus({ status: "pending", dueDate: "2026-10-16" }, today)).toBe("pending");
    expect(displayStatus({ status: "paid", dueDate: "2026-10-01" }, today)).toBe("paid");
    expect(displayStatus({ status: "cancelled", dueDate: "2026-10-01" }, today)).toBe("cancelled");
    expect(displayStatus({ status: "postponed", dueDate: "2026-10-01" }, today)).toBe("postponed");
    expect(displayStatus({ status: "protested", dueDate: "2026-10-01" }, today)).toBe("protested");
  });

  it("se aplaza lo que ya venció y se protesta solo un cheque", () => {
    const today = "2026-10-16";
    expect(canPostpone({ status: "pending", dueDate: "2026-10-10" }, today)).toBe(true);
    expect(canPostpone({ status: "pending", dueDate: "2026-10-16" }, today)).toBe(true);
    expect(canPostpone({ status: "pending", dueDate: "2026-10-17" }, today)).toBe(false);
    expect(canPostpone({ status: "paid", dueDate: "2026-10-10" }, today)).toBe(false);
    expect(canProtest({ kind: "chequeIssued", status: "pending" })).toBe(true);
    expect(canProtest({ kind: "chequeReceived", status: "paid" })).toBe(true);
    expect(canProtest({ kind: "payment", status: "pending" })).toBe(false);
    expect(canProtest({ kind: "chequeIssued", status: "cancelled" })).toBe(false);
  });

  it("Próximos: 7 días (con lo aplazado primero), próximo mes y más adelante", () => {
    const today = "2026-10-16";
    const g = groupUpcoming(
      [
        { id: "overdue", status: "pending", dueDate: "2026-10-10" },
        { id: "protested", kind: "chequeIssued", status: "protested", dueDate: "2026-10-01" },
        { id: "week", status: "pending", dueDate: "2026-10-23" },
        { id: "postponed", status: "postponed", dueDate: "2026-09-01" },
        { id: "month", status: "pending", dueDate: "2026-10-24" },
        { id: "monthEnd", status: "pending", dueDate: "2026-11-16" },
        { id: "later", status: "pending", dueDate: "2026-11-17" },
        { id: "paid", status: "paid", dueDate: "2026-10-17" },
      ],
      today,
    );
    const ids = (list) => list.map((c) => c.id);
    expect(upcomingMonthEnd(today)).toBe("2026-11-16");
    expect(ids(g.overdue)).toEqual(["overdue"]);
    expect(ids(g.protested)).toEqual(["protested"]);
    expect(ids(g.week)).toEqual(["postponed", "week"]);
    expect(ids(g.month)).toEqual(["month", "monthEnd"]);
    expect(ids(g.later)).toEqual(["later"]);
  });

  it("más adelante llega por defecto hasta fin del año siguiente, y lo de después queda aparte", () => {
    const today = "2026-10-16";
    expect(nextYearEnd(today)).toBe("2027-12-31");
    const items = [
      { id: "month", status: "pending", dueDate: "2026-11-10" },
      { id: "later", status: "pending", dueDate: "2027-12-31" },
      { id: "beyond", status: "pending", dueDate: "2028-01-01" },
    ];
    const ids = (list) => list.map((c) => c.id);
    const g = groupUpcoming(items, today, { until: nextYearEnd(today) });
    expect(ids(g.month)).toEqual(["month"]);
    expect(ids(g.later)).toEqual(["later"]);
    expect(ids(g.beyond)).toEqual(["beyond"]);
    expect(ids(groupUpcoming(items, today).later)).toEqual(["later", "beyond"]);
  });

  it("el mes siguiente se corta en el último día de un mes corto", () => {
    expect(upcomingMonthEnd("2027-01-31")).toBe("2027-02-28");
  });

  it("el interés solo cuenta en lo pagado", () => {
    expect(extraOf({ status: "paid", amount: 100, extra: 3 })).toBe(3);
    expect(extraOf({ status: "pending", amount: 100, extra: 3 })).toBe(0);
    expect(extraOf({ status: "paid", amount: 100 })).toBe(0);
  });

  it("un cheque se cobra y un pago se paga", () => {
    expect(statusLabel({ kind: "chequeIssued", status: "paid" }, "2026-10-16")).toBe("Cobrado");
    expect(statusLabel({ kind: "installment", status: "paid" }, "2026-10-16")).toBe("Pagado");
  });
});

describe("cuotas y series mensuales", () => {
  it("el día 31 cae el último día de los meses cortos", () => {
    expect(monthlyDate("2026-01-31", 1, 31)).toBe("2026-02-28");
    expect(monthlyDate("2028-01-31", 1, 31)).toBe("2028-02-29");
    expect(monthlyDate("2026-01-31", 2, 31)).toBe("2026-03-31");
    expect(monthlyDate("2026-11-15", 2, 15)).toBe("2027-01-15");
  });

  it("un crédito genera una cuota por mes, numerada", () => {
    const installments = buildInstallments({ firstDate: "2026-11-30", count: 4 });
    expect(installments.map((c) => c.dueDate)).toEqual(["2026-11-30", "2026-12-30", "2027-01-30", "2027-02-28"]);
    expect(installments[3]).toMatchObject({ n: 4, of: 4 });
    expect(buildInstallments({ firstDate: "", count: 3 })).toEqual([]);
  });

  it("un pago recurrente solo genera lo que falta hasta el horizonte", () => {
    const allDates = recurringDates({ firstDate: "2026-10-05", until: "2026-12-31" });
    expect(allDates).toEqual(["2026-10-05", "2026-11-05", "2026-12-05"]);
    const newDates = recurringDates({ firstDate: "2026-10-05", after: "2026-11-05", until: "2027-01-10" });
    expect(newDates).toEqual(["2026-12-05", "2027-01-05"]);
  });
});

describe("resumen", () => {
  it("separa lo que se paga de lo que se cobra y no suma anulados", () => {
    const today = "2026-10-16";
    const r = summarize(
      [
        { kind: "chequeIssued", status: "pending", dueDate: "2026-10-18", amount: 100 },
        { kind: "installment", status: "pending", dueDate: "2026-10-10", amount: 50 },
        { kind: "chequeReceived", status: "pending", dueDate: "2026-10-20", amount: 70 },
        { kind: "chequeIssued", status: "paid", dueDate: "2026-10-01", paidAt: "2026-10-02", amount: 30 },
        { kind: "chequeIssued", status: "paid", dueDate: "2026-09-01", paidAt: "2026-09-02", amount: 999 },
        { kind: "payment", status: "cancelled", dueDate: "2026-10-01", amount: 40 },
      ],
      today,
    );
    expect(r.out.pending).toEqual({ amount: 100, count: 1 });
    expect(r.out.overdue).toEqual({ amount: 50, count: 1 });
    expect(r.out.next7).toEqual({ amount: 100, count: 1 });
    expect(r.in.pending).toEqual({ amount: 70, count: 1 });
    expect(r.paidThisMonth).toEqual({ amount: 30, count: 1 });
    expect(r.cancelled).toEqual({ amount: 40, count: 1 });
  });

  it("aplazado y protestado van aparte, y lo pagado suma su interés", () => {
    const today = "2026-10-16";
    const r = summarize(
      [
        { kind: "payment", status: "postponed", dueDate: "2026-09-01", amount: 200 },
        { kind: "chequeIssued", status: "protested", dueDate: "2026-10-01", amount: 300 },
        { kind: "chequeReceived", status: "protested", dueDate: "2026-10-01", amount: 70 },
        { kind: "installment", status: "paid", dueDate: "2026-09-30", paidAt: "2026-10-05", amount: 100, extra: 3 },
      ],
      today,
    );
    expect(r.out.postponed).toEqual({ amount: 200, count: 1 });
    expect(r.out.protested).toEqual({ amount: 300, count: 1 });
    expect(r.in.protested).toEqual({ amount: 70, count: 1 });
    expect(r.out.overdue).toEqual({ amount: 0, count: 0 });
    expect(r.paidThisMonth).toEqual({ amount: 103, count: 1 });
  });
});

describe("informe de deudas", () => {
  const today = "2026-10-16";
  const installment = (n, dueDate, status = "pending", extra = 0) => ({
    id: `cr_${n}`,
    kind: "installment",
    status,
    dueDate,
    paidAt: status === "paid" ? dueDate : "",
    amount: 100,
    extra,
    counterparty: "Banco Estado",
    seriesId: "cr",
    installment: { n, of: 4 },
  });
  const items = [
    installment(1, "2026-09-30", "paid", 3),
    installment(2, "2026-10-30"),
    installment(3, "2026-11-30"),
    installment(4, "2026-12-30"),
    { id: "ch1", kind: "chequeIssued", status: "pending", dueDate: "2026-10-10", amount: 500, counterparty: "Biosur" },
    { id: "ch2", kind: "chequeIssued", status: "pending", dueDate: "2026-11-05", amount: 300, counterparty: "BIOSUR " },
    { id: "rec", kind: "payment", status: "pending", dueDate: "2027-01-05", amount: 50, counterparty: "Arriendo", seriesId: "arr", installment: null },
    { id: "in", kind: "chequeReceived", status: "pending", dueDate: "2026-10-20", amount: 999, counterparty: "Cliente" },
    { id: "nul", kind: "payment", status: "cancelled", dueDate: "2026-10-20", amount: 777, counterparty: "X" },
  ];

  it("lo que se debe va por el monto original, sin lo que se cobra ni lo anulado", () => {
    const r = buildPaymentReport(items, { today: today });
    expect(r.totals.pending).toEqual({ count: 6, amount: 1150, extra: 0, total: 1150 });
    expect(r.totals.overdue.total).toBe(500);
    expect(r.hasExtra).toBe(false);
    expect(r.paid).toEqual([]);
  });

  it("cada crédito es una deuda, y lo suelto se agrupa por contraparte", () => {
    const r = buildPaymentReport(items, { today: today });
    const credit = r.debts.find((d) => d.key === "s:cr");
    expect(credit).toMatchObject({ installments: 4, nextDue: "2026-10-30", payoffDate: "2026-12-30" });
    expect(credit.pending).toMatchObject({ count: 3, total: 300 });
    expect(credit.paid).toEqual({ count: 1, amount: 100, extra: 3, total: 103 });
    const biosur = r.debts.find((d) => d.key === "c:biosur");
    expect(biosur).toMatchObject({ nextDue: "2026-10-10", payoffDate: "2026-11-05" });
    expect(biosur.overdue.total).toBe(500);
  });

  it("por contraparte, junta lo que se paga a cada una por fecha y resume lo de después del corte", () => {
    const r = buildPaymentReport(items, { today: today, dueUntil: "2026-11-30" });
    expect(r.byCounterparty.map((g) => g.name)).toEqual(["Biosur", "Banco Estado", "Arriendo"]);
    const [biosur, bank, rent] = r.byCounterparty;
    expect(biosur.items.map((c) => c.id)).toEqual(["ch1", "ch2"]);
    expect(biosur.total).toMatchObject({ count: 2, total: 800 });
    expect(bank.items.map((c) => c.id)).toEqual(["cr_2", "cr_3"]);
    expect(bank.later).toMatchObject({ count: 1, total: 100 });
    expect(bank).toMatchObject({ laterEnd: "2026-12-30", total: { count: 3, amount: 300, extra: 0, total: 300 } });
    expect(rent.items).toEqual([]);
  });

  it("un pago recurrente no tiene fecha de término", () => {
    const r = buildPaymentReport(items, { today: today });
    expect(r.debts.find((d) => d.key === "s:arr")).toMatchObject({ recurring: true, payoffDate: "" });
    expect(r.payoffDate).toBe("2026-12-30");
    expect(r.hasRecurring).toBe(true);
  });

  it("por mes, con lo vencido primero", () => {
    const r = buildPaymentReport(items, { today: today });
    expect(r.months.map((m) => [m.month, m.total])).toEqual([
      ["overdue", 500],
      ["2026-10", 100],
      ["2026-11", 400],
      ["2026-12", 100],
      ["2027-01", 50],
    ]);
  });

  it("con una fecha de corte, lo de después va en una sola fila y fuera del detalle; el balance no cambia", () => {
    const r = buildPaymentReport(items, { today: today, dueUntil: "2026-11-30" });
    expect(r.months.map((m) => [m.month, m.total])).toEqual([
      ["overdue", 500],
      ["2026-10", 100],
      ["2026-11", 400],
      ["later", 150],
    ]);
    expect(r.totals.later).toMatchObject({ count: 2, total: 150 });
    expect(r.laterEnd).toBe("2027-01-05");
    expect(r.detail.map((c) => c.id)).toEqual(["ch1", "cr_2", "ch2", "cr_3"]);
    expect(r.pending).toHaveLength(6);
    expect(r.totals.pending.total).toBe(1150);
    expect(r.debts.find((d) => d.key === "s:cr")).toMatchObject({ payoffDate: "2026-12-30" });
    expect(r.payoffDate).toBe("2026-12-30");
  });

  it("lo vencido, aplazado o protestado no se corta aunque su fecha sea anterior a todo", () => {
    const r = buildPaymentReport(
      [
        { id: "a", kind: "payment", status: "postponed", dueDate: "2026-09-01", amount: 10, counterparty: "A" },
        { id: "b", kind: "payment", status: "pending", dueDate: "2026-09-02", amount: 20, counterparty: "B" },
      ],
      { today: today, dueUntil: "2026-08-31" },
    );
    expect(r.detail.map((c) => c.id)).toEqual(["a", "b"]);
    expect(r.totals.later.count).toBe(0);
  });

  it("próximos 7 días (con lo aplazado primero) y próximo mes, como en Próximos", () => {
    const r = buildPaymentReport(
      [
        ...items,
        { id: "apl", kind: "payment", status: "postponed", dueDate: "2026-09-01", amount: 40, counterparty: "Ferretería" },
        { id: "sem", kind: "payment", status: "pending", dueDate: "2026-10-23", amount: 60, counterparty: "Copec" },
      ],
      { today: today },
    );
    expect(r.upcoming.week.map((c) => c.id)).toEqual(["apl", "sem"]);
    expect(r.upcoming.weekTotal.total).toBe(100);
    expect(r.upcoming.weekEnd).toBe("2026-10-23");
    expect(r.upcoming.month.map((c) => c.id)).toEqual(["cr_2", "ch2"]);
    expect(r.upcoming.monthTotal.total).toBe(400);
    expect(r.upcoming.monthEnd).toBe("2026-11-16");
    expect(r.detail[0].id).toBe("apl");
    expect(r.upcoming.week.some((c) => c.kind === "chequeReceived")).toBe(false);
  });

  it("los pagos realizados solo si se piden, por fecha de pago y con su interés", () => {
    const r = buildPaymentReport(items, { today: today, includePaid: true, paidFrom: "2026-09-01", paidTo: "2026-09-30" });
    expect(r.paid.map((c) => c.id)).toEqual(["cr_1"]);
    expect(r.totals.paid).toEqual({ count: 1, amount: 100, extra: 3, total: 103 });
    expect(r.hasExtra).toBe(true);
    const outOfRange = buildPaymentReport(items, { today: today, includePaid: true, paidFrom: "2026-10-01" });
    expect(outOfRange.paid).toEqual([]);
  });

  it("cada deuda lleva su tipo, o ninguno si mezcla tipos", () => {
    const r = buildPaymentReport(
      [
        { id: "d1", kind: "personalDebt", status: "pending", dueDate: "2026-11-01", amount: 100, counterparty: "Juan", seriesId: "dp", installment: { n: 1, of: 2 } },
        { id: "d2", kind: "personalDebt", status: "pending", dueDate: "2026-12-01", amount: 100, counterparty: "Juan", seriesId: "dp", installment: { n: 2, of: 2 } },
        { id: "x1", kind: "chequeIssued", status: "pending", dueDate: "2026-11-05", amount: 50, counterparty: "Biosur" },
        { id: "x2", kind: "payment", status: "pending", dueDate: "2026-11-06", amount: 50, counterparty: "Biosur" },
      ],
      { today: today },
    );
    expect(r.debts.find((d) => d.key === "s:dp")).toMatchObject({ kind: "personalDebt", installments: 2, payoffDate: "2026-12-01" });
    expect(r.debts.find((d) => d.key === "c:biosur").kind).toBe("");
  });

  it("un crédito con cuotas atrasadas queda pagado con su última cuota", () => {
    const installment = (n, dueDate, status = "pending") => ({
      id: `t_${n}`, kind: "installment", status, dueDate, amount: 100, counterparty: "Santander", seriesId: "toy", installment: { n, of: 5 },
    });
    const r = buildPaymentReport(
      [installment(1, "2026-08-10", "paid"), installment(2, "2026-09-10", "postponed"), installment(3, "2026-10-10"), installment(4, "2026-11-10"), installment(5, "2026-12-10")],
      { today: today },
    );
    const d = r.debts[0];
    expect(d).toMatchObject({ nextDue: "2026-10-10", payoffDate: "2026-12-10" });
    expect(d.behind).toMatchObject({ count: 2, total: 200 });
    expect(r.totals.behind).toMatchObject({ count: 2, total: 200 });
    expect(r.payoffDate).toBe("2026-12-10");
  });

  it("lo aplazado y lo protestado siguen debiéndose, con su fecha original", () => {
    const r = buildPaymentReport(
      [
        { id: "a", kind: "payment", status: "postponed", dueDate: "2026-09-10", amount: 200, counterparty: "Ferretería" },
        { id: "p", kind: "chequeIssued", status: "protested", dueDate: "2026-10-01", amount: 300, counterparty: "Biosur" },
        { id: "q", kind: "chequeIssued", status: "pending", dueDate: "2026-11-05", amount: 100, counterparty: "Biosur" },
        { id: "r", kind: "chequeReceived", status: "protested", dueDate: "2026-10-01", amount: 999, counterparty: "Cliente" },
      ],
      { today: today },
    );
    expect(r.totals.pending.total).toBe(600);
    expect(r.totals.overdue.total).toBe(0);
    expect(r.totals.postponed.total).toBe(200);
    expect(r.totals.protested.total).toBe(300);
    expect(r.months.map((m) => [m.month, m.total])).toEqual([
      ["postponed", 200],
      ["protested", 300],
      ["2026-11", 100],
    ]);
    expect(r.debts.map((d) => d.key)).toEqual(["c:ferreteria", "c:biosur"]);
    expect(r.debts[1]).toMatchObject({ nextDue: "2026-11-05", payoffDate: "2026-11-05" });
    expect(r.debts[1].protested.total).toBe(300);
    expect(r.debts[1].behind).toMatchObject({ count: 1, total: 300 });
    expect(r.debts[0]).toMatchObject({ nextDue: "", payoffDate: "2026-09-10" });
    expect(r.debts[0].behind).toMatchObject({ count: 1, total: 200 });
    expect(r.payoffDate).toBe("2026-11-05");
  });
});

describe("abonos", () => {
  const debt = [
    { id: "q2", status: "pending", dueDate: "2026-11-10", amount: 100, installment: { n: 2, of: 3 } },
    { id: "q1", status: "pending", dueDate: "2026-10-10", amount: 100, installment: { n: 1, of: 3 }, partialPayments: [{ id: "a", amount: 30 }] },
    { id: "q3", status: "pending", dueDate: "2026-12-10", amount: 100, installment: { n: 3, of: 3 } },
    { id: "q0", status: "paid", dueDate: "2026-09-10", amount: 100, installment: { n: 0, of: 3 } },
  ];

  it("lo que falta es el monto original menos lo abonado, y solo en lo abierto", () => {
    expect(partialPaidOf(debt[1])).toBe(30);
    expect(remainingOf(debt[1])).toBe(70);
    expect(remainingOf(debt[3])).toBe(0);
    expect(remainingOf({ status: "pending", amount: 100, partialPayments: [{ amount: 150 }] })).toBe(0);
  });

  it("un abono a toda la deuda se reparte de la cuota más antigua a la más nueva", () => {
    const { parts, leftover } = allocatePartialPayment(debt, 150);
    expect(parts).toEqual([
      { id: "q1", amount: 70, closes: true },
      { id: "q2", amount: 80, closes: false },
    ]);
    expect(leftover).toBe(0);
    expect(allocatePartialPayment(debt, 300).leftover).toBe(30);
  });

  it("los totales cuentan lo que falta, no el monto original", () => {
    const s = summarize(debt, "2026-10-16");
    expect(s.out.overdue.amount).toBe(70);
    expect(s.out.pending.amount).toBe(200);
    const r = buildPaymentReport(debt, { today: "2026-10-16" });
    expect(r.totals.pending.total).toBe(270);
  });
});

describe("ajuste de una serie", () => {
  const items = [
    { id: "s_1", status: "paid", dueDate: "2026-09-30", amount: 100, installment: { n: 1, of: 4 } },
    { id: "s_2", status: "pending", dueDate: "2026-10-30", amount: 100, installment: { n: 2, of: 4 }, partialPayments: [{ amount: 40 }] },
    { id: "s_3", status: "postponed", dueDate: "2026-11-30", amount: 100, installment: { n: 3, of: 4 } },
    { id: "s_4", status: "pending", dueDate: "2026-12-31", amount: 100, installment: { n: 4, of: 4 } },
  ];

  it("corre meses y cambia el día recortando a meses cortos", () => {
    expect(shiftMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(shiftMonths("2026-03-15", -2)).toBe("2026-01-15");
    expect(withDayOfMonth("2026-02-10", 31)).toBe("2026-02-28");
  });

  it("las herramientas tocan solo lo abierto desde el vencimiento elegido", () => {
    const rows = seriesRows(items);
    expect(rows.map((r) => r.editable)).toEqual([false, true, true, true]);
    const moved = applySeriesTool(rows, { fromIndex: 2, months: 1 });
    expect(moved.map((r) => r.dueDate)).toEqual(["2026-09-30", "2026-10-30", "2026-12-30", "2027-01-31"]);
    const priced = applySeriesTool(rows, { fromIndex: 0, amount: 120, day: 5 });
    expect(priced.map((r) => [r.dueDate, r.amount])).toEqual([
      ["2026-09-30", 100],
      ["2026-10-05", 120],
      ["2026-11-05", 120],
      ["2026-12-05", 120],
    ]);
  });

  it("guarda solo lo que cambió, y no deja un monto menor que lo abonado", () => {
    const rows = applySeriesTool(seriesRows(items), { fromIndex: 3, amount: 150 });
    expect(seriesChanges(items, rows)).toEqual([{ id: "s_4", patch: { amount: 150 } }]);
    expect(seriesRowError({ ...rows[1], amount: 30 }, items[1])).toBe("Es menos que lo ya abonado");
    expect(seriesRowError({ ...rows[1], amount: 0 }, items[1])).toBe("El monto debe ser mayor a 0");
    expect(seriesRowError({ ...rows[1], dueDate: "" }, items[1])).toBe("Falta la fecha");
    expect(seriesRowError(rows[0], items[0])).toBe("");
  });

  it("un recurrente puede cambiar de día después de creado", () => {
    expect(recurringDates({ firstDate: "2026-10-05", after: "2026-11-05", until: "2027-01-31", dayOfMonth: 20 })).toEqual([
      "2026-11-20",
      "2026-12-20",
      "2027-01-20",
    ]);
  });
});

describe("contrapartes", () => {
  const items = [
    { counterparty: "Banco Estado" },
    { counterparty: "Copec" },
    { counterparty: "BANCO ESTADO" },
    { counterparty: "Agrícola Los Robles" },
    { counterparty: "" },
  ];

  it("lista cada nombre una vez, del más usado al menos usado", () => {
    expect(counterpartyOptions(items)).toEqual(["Banco Estado", "Agrícola Los Robles", "Copec"]);
  });

  it("sugiere el nombre ya usado cuando se escribe una variante", () => {
    const options = counterpartyOptions(items);
    expect(similarCounterparty("Bancoestado", options)).toBe("Banco Estado");
    expect(similarCounterparty("Agricola Los Roble", options)).toBe("Agrícola Los Robles");
  });

  it("no sugiere nada si el nombre ya existe o no se parece a ninguno", () => {
    const options = counterpartyOptions(items);
    expect(similarCounterparty("banco estado", options)).toBe(null);
    expect(similarCounterparty("Agricola los robles", options)).toBe(null);
    expect(similarCounterparty("Ferretería Central", options)).toBe(null);
    expect(similarCounterparty("", options)).toBe(null);
  });
});

describe("próximos por contraparte", () => {
  const today = "2026-10-21";
  const items = [
    { id: "copec-nov", counterparty: "Copec", status: "pending", dueDate: "2026-11-05", amount: 300 },
    { id: "banco-dic", counterparty: "Banco Estado", status: "pending", dueDate: "2026-12-10", amount: 100 },
    { id: "copec-sep", counterparty: "COPEC", status: "postponed", dueDate: "2026-09-20", amount: 200 },
    { id: "banco-oct", counterparty: "Banco Estado", status: "pending", dueDate: "2026-10-10", amount: 100 },
    { id: "banco-pagado", counterparty: "Banco Estado", status: "paid", dueDate: "2026-09-10", amount: 100 },
    { id: "copec-anulado", counterparty: "Copec", status: "cancelled", dueDate: "2026-08-01", amount: 50 },
    { id: "cliente", kind: "chequeReceived", counterparty: "Agrícola Sur", status: "protested", dueDate: "2026-10-01", amount: 80 },
  ];
  const ids = (list) => list.map((c) => c.id);

  it("junta lo abierto de cada contraparte, del vencimiento más antiguo al más nuevo", () => {
    const groups = groupByCounterparty(items, today);
    expect(groups.map((g) => g.name)).toEqual(["Copec", "Agrícola Sur", "Banco Estado"]);
    expect(ids(groups[0].items)).toEqual(["copec-sep", "copec-nov"]);
    expect(ids(groups[2].items)).toEqual(["banco-oct", "banco-dic"]);
  });

  it("la contraparte lleva la forma del nombre más usada, aunque no sea la primera", () => {
    const groups = groupByCounterparty(
      [
        { id: "a", counterparty: "BIOSUR", status: "pending", dueDate: "2026-10-01" },
        { id: "b", counterparty: "Biosur", status: "pending", dueDate: "2026-10-02" },
        { id: "c", counterparty: "Biosur", status: "paid", dueDate: "2026-09-02" },
      ],
      today,
    );
    expect(groups.map((g) => g.name)).toEqual(["Biosur"]);
  });

  it("separa lo que se paga de lo que se cobra y descuenta los abonos", () => {
    const groups = groupByCounterparty([
      ...items,
      { id: "abonado", kind: "personalDebt", counterparty: "Copec", status: "pending", dueDate: "2026-11-20", amount: 400, partialPayments: [{ amount: 150 }] },
    ], today);
    expect(groups[0]).toMatchObject({ payable: 750, receivable: 0 });
    expect(groups[1]).toMatchObject({ payable: 0, receivable: 80 });
  });

  it("con fecha de corte, lo pendiente que vence después queda aparte", () => {
    const groups = groupByCounterparty(
      [...items, { id: "banco-2028", counterparty: "Banco Estado", status: "pending", dueDate: "2028-01-10", amount: 100 }],
      today,
      { until: "2027-12-31" },
    );
    expect(ids(groups[2].items)).toEqual(["banco-oct", "banco-dic"]);
    expect(ids(groups[2].beyond)).toEqual(["banco-2028"]);
    expect(groups[2].payable).toBe(200);
  });

  it("lo vencido no queda después del corte aunque la fecha de corte ya pasó", () => {
    const groups = groupByCounterparty(items, today, { until: "2026-10-05" });
    expect(ids(groups[2].items)).toEqual(["banco-oct"]);
    expect(ids(groups[2].beyond)).toEqual(["banco-dic"]);
  });

  it("los vencimientos sin contraparte van juntos, sin nombre", () => {
    const groups = groupByCounterparty([{ id: "a", status: "pending", dueDate: "2026-10-01" }, { id: "b", counterparty: " ", status: "pending", dueDate: "2026-10-02" }], today);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("");
    expect(ids(groups[0].items)).toEqual(["a", "b"]);
  });
});

describe("import de la planilla de cheques", () => {
  it("reconoce las formas de fecha que trae la planilla", () => {
    expect(parseLooseDate(new Date(Date.UTC(2026, 5, 5)))).toBe("2026-06-05");
    expect(parseLooseDate("20-06-26")).toBe("2026-06-20");
    expect(parseLooseDate("27-08-2026")).toBe("2026-08-27");
    expect(parseLooseDate("27/08/2026")).toBe("2026-08-27");
    expect(parseLooseDate("2026-03-08")).toBe("2026-03-08");
    expect(parseLooseDate(46000)).toBe("2025-12-09");
    expect(parseLooseDate("31-02-26")).toBe("");
    expect(parseLooseDate("mañana")).toBe("");
    expect(parseLooseDate(null)).toBe("");
  });

  it("reconoce el banco escrito a mano", () => {
    expect(bankCodeFromText("bco chile ")).toBe("001");
    expect(bankCodeFromText("BICE ")).toBe("028");
    expect(bankCodeFromText("Banco Estado")).toBe("012");
    expect(bankCodeFromText("Banco de Crédito e Inversiones/Mach")).toBe("016");
    expect(bankCodeFromText("Cooperativa X")).toBe("");
  });

  it("vencido y pendiente quedan pendientes: vencido se deriva", () => {
    expect(excelStatus("Cobrado")).toBe("paid");
    expect(excelStatus("Anulado")).toBe("cancelled");
    expect(excelStatus("Vencido")).toBe("pending");
    expect(excelStatus("Pendiente")).toBe("pending");
    expect(excelStatus("Protestado")).toBe("protested");
    expect(excelStatus("Aplazado")).toBe("postponed");
    expect(excelStatus("")).toBe("pending");
  });

  it("encuentra la empresa por alias sin distinguir mayúsculas", () => {
    const companies = [{ id: "c1", alias: "Transporte HP", razonSocial: "Transportes HP SpA" }];
    expect(matchCompany("TRANSPORTE HP", companies)?.id).toBe("c1");
    expect(matchCompany("SANTA SARA ", companies)).toBe(null);
  });

  it("mapea una fila de la planilla", () => {
    const companies = [{ id: "c1", alias: "Transporte HP" }];
    const row = [21, "21-10-26", "BICE ", 361431, "BIOSUR", "CUOTA N 10 CARRETE ", 3575568, null, "Pendiente", "TRANSPORTE HP", "CUOTA N.º 10 PENDIENTE DE COBRO"];
    const r = mapExcelRow(row, { companies });
    expect(r.id).toBe("chq_028_361431");
    expect(r.data).toMatchObject({
      kind: "chequeIssued",
      dueDate: "2026-10-21",
      amount: 3575568,
      bank: "028",
      chequeNumber: "361431",
      counterparty: "Biosur",
      concept: "Cuota n 10 carrete",
      notes: "Cuota n.º 10 pendiente de cobro",
      companyId: "c1",
      companyLabel: "",
      status: "pending",
    });
  });

  it("una empresa sin match queda como texto y una fila vacía se salta", () => {
    const row = [30, new Date(Date.UTC(2026, 4, 6)), "bco chile ", 2485214, "EDWIN DIAZ ", "PAGO SERVICIO", 690000, null, "Cobrado", "SANTA SARA ", "PAGO TRANSPORTE "];
    const r = mapExcelRow(row, { companies: [] });
    expect(r.data).toMatchObject({ companyId: null, companyLabel: "SANTA SARA", status: "paid", bank: "001", dueDate: "2026-05-06" });
    expect(mapExcelRow([49, null, null, null, null, null, null, null, null, null, null])).toBe(null);
    expect(mapExcelRow([50, "pronto", "BICE", 1, "X", "", 100]).error).toMatch(/Fecha/);
  });
});

describe("textos del vencimiento", () => {
  it("dice cuándo vence, o cuánto hace que venció", () => {
    expect([urgencyLabel(-3), urgencyLabel(-1), urgencyLabel(0), urgencyLabel(1), urgencyLabel(5)]).toEqual([
      "Vencido hace 3 días",
      "Venció ayer",
      "Vence hoy",
      "Vence mañana",
      "Vence en 5 días",
    ]);
    expect(urgencyLabel(null)).toBe("");
  });

  it("un cheque se cobra y lo demás se paga", () => {
    expect([paidLabel("chequeIssued"), paidLabel("chequeReceived"), paidLabel("payment")]).toEqual(["Cobrado", "Cobrado", "Pagado"]);
  });
});
