import { describe, it, expect, vi } from "vitest";

// `dashboard` toma `pendingCashOf` de `payrollsService`, que arrastra
// `../firebase`. La función es pura; el mock evita levantar Firebase.
vi.mock("../firebase", () => ({ db: {}, auth: { currentUser: null } }));

const {
  commitmentsWeekOf,
  cycleMargins,
  dteMonthlyTotals,
  lastMonthKeys,
  monthRangeOfKey,
  operationStats,
  paymentPeriodDate,
  payrollMoneyStats,
  payrollMonthKey,
  pendingOfPayment,
  transportDebtByMonth,
  transportStats,
  tsToIso,
} = await import("./dashboard");

// 21 de octubre de 2026, hora local.
const NOW = new Date(2026, 9, 21, 12);
const ts = (y, m, d) => ({ toDate: () => new Date(y, m - 1, d, 12) });

describe("meses", () => {
  it("lastMonthKeys devuelve los últimos N meses, del más viejo al más nuevo", () => {
    expect(lastMonthKeys(3, NOW)).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(lastMonthKeys(3, new Date(2026, 0, 5))).toEqual(["2025-11", "2025-12", "2026-01"]);
  });

  it("monthRangeOfKey da el primer y el último día del mes", () => {
    expect(monthRangeOfKey("2026-09")).toEqual({ start: "2026-09-01", end: "2026-09-30" });
    expect(monthRangeOfKey("2026-02").end).toBe("2026-02-28");
    expect(monthRangeOfKey("2028-02").end).toBe("2028-02-29");
  });

  it("tsToIso acepta un Timestamp o `seconds`, y vacío sin fecha", () => {
    expect(tsToIso(ts(2026, 9, 10))).toBe("2026-09-10");
    expect(tsToIso({ seconds: new Date(2026, 8, 10, 12).getTime() / 1000 })).toBe("2026-09-10");
    expect(tsToIso(null)).toBe("");
  });
});

describe("paymentPeriodDate", () => {
  it("fecha el resumen por el punto medio de su período, en el mes con más días", () => {
    expect(paymentPeriodDate({ periodFrom: "2026-08-28", periodTo: "2026-09-03" })).toBe("2026-08-31");
    expect(paymentPeriodDate({ periodFrom: "2026-09-01", periodTo: "2026-09-15" })).toBe("2026-09-08");
  });

  it("con una sola punta usa esa fecha, y sin período cae a createdAt", () => {
    expect(paymentPeriodDate({ periodTo: "2026-09-20" })).toBe("2026-09-20");
    expect(paymentPeriodDate({ createdAt: ts(2026, 10, 2) })).toBe("2026-10-02");
  });
});

describe("payrollMonthKey", () => {
  it("una nómina pagada va en el mes de paidAt; si no, en el de createdAt", () => {
    expect(payrollMonthKey({ paidAt: "2026-10-05T15:00:00.000Z", createdAt: ts(2026, 9, 28) })).toBe("2026-10");
    expect(payrollMonthKey({ createdAt: ts(2026, 9, 28) })).toBe("2026-09");
    expect(payrollMonthKey({})).toBe(null);
  });
});

describe("payrollMoneyStats", () => {
  const cashItem = (rut, amount) => ({ rut, amount, bankCode: "EFE" });
  const payrolls = [
    { id: "a", status: "paid", paidAt: "2026-10-05T12:00:00.000Z", total: 1000, bankTotal: 700, cashTotal: 300, advanceTotal: 100, workerCount: 4 },
    { id: "b", status: "pending", createdAt: ts(2026, 9, 10), total: 500, bankTotal: 500, cashTotal: 0 },
    {
      id: "c",
      status: "pending",
      bankPaidAt: "2026-10-12T12:00:00.000Z",
      createdAt: ts(2026, 10, 10),
      total: 650,
      bankTotal: 400,
      cashTotal: 250,
      items: [{ rut: "3", amount: 400, bankCode: "001" }, cashItem("1", 200), cashItem("2", 50)],
      cashPaidRuts: ["2"],
    },
    { id: "d", status: "paid", paidAt: "2026-07-20T12:00:00.000Z", total: 9999, bankTotal: 9999 },
  ];

  it("suma por mes dentro del período, con banco y efectivo", () => {
    const m = payrollMoneyStats(payrolls, 3, NOW);
    expect(m.months.map((r) => [r.key, r.bank, r.cash, r.total])).toEqual([
      ["2026-08", 0, 0, 0],
      ["2026-09", 500, 0, 500],
      ["2026-10", 1100, 550, 1650],
    ]);
    expect(m.periodTotal).toBe(2150);
    expect(m.periodCash).toBe(550);
    expect(m.periodCount).toBe(3);
    expect(m.cashShare).toBeCloseTo((550 / 2150) * 100);
  });

  it("lo pendiente de una nómina con transferencias hechas es solo el efectivo que falta entregar", () => {
    const m = payrollMoneyStats(payrolls, 3, NOW);
    expect(m.pendingCount).toBe(2);
    expect(m.pendingTotal).toBe(500 + 200);
  });

  it("la composición separa banco, efectivo y anticipos, sin las partes en cero", () => {
    expect(payrollMoneyStats(payrolls, 3, NOW).mix).toEqual([
      { name: "Banco", value: 1600 },
      { name: "Efectivo", value: 550 },
      { name: "Anticipos", value: 100 },
    ]);
    expect(payrollMoneyStats([payrolls[1]], 3, NOW).mix).toEqual([{ name: "Banco", value: 500 }]);
  });

  it("la última nómina es la primera de la lista", () => {
    expect(payrollMoneyStats(payrolls, 1, NOW).lastPayroll.id).toBe("a");
    expect(payrollMoneyStats([], 1, NOW).lastPayroll).toBe(null);
  });
});

describe("operationStats", () => {
  const jobs = [{ id: "f1", name: "Fundo Norte" }, { id: "f2", name: "Fundo Sur" }];
  const cycles = [
    { id: "c1", faenaId: "f1", status: "open", label: "Viejo", days: ["2026-09-30", "2026-10-01"] },
    { id: "c2", faenaId: "f1", status: "open", label: "Al día", days: ["2026-10-15"] },
    { id: "c3", faenaId: "f2", status: "open", label: "Sin días", startDate: "2026-09-01" },
    { id: "c4", faenaId: "f2", status: "closed", label: "Cerrado", days: ["2026-01-01"] },
  ];

  it("cuenta ciclos abiertos y cerrados y los abiertos por faena", () => {
    const ops = operationStats(cycles, jobs, [], NOW);
    expect(ops.openCount).toBe(3);
    expect(ops.closedCount).toBe(1);
    expect(ops.activeJobs).toBe(2);
    expect(ops.cyclesByJob).toEqual([
      { name: "Fundo Norte", cycleCount: 2 },
      { name: "Fundo Sur", cycleCount: 1 },
    ]);
  });

  it("un ciclo abierto sin movimiento hace más de 14 días es estancado; sin días, cuenta su inicio", () => {
    const ops = operationStats(cycles, jobs, [], NOW);
    expect(ops.stale.map((s) => [s.cycle.id, s.last, s.job])).toEqual([
      ["c3", "2026-09-01", "Fundo Sur"],
      ["c1", "2026-10-01", "Fundo Norte"],
    ]);
  });

  it("compara las jornadas del mes con las del anterior", () => {
    const months = [{ workdayCount: 100 }, { workdayCount: 120 }];
    expect(operationStats([], [], months, NOW).workdaysDelta).toBe(20);
    expect(operationStats([], [], [{ workdayCount: 0 }, { workdayCount: 5 }], NOW).workdaysDelta).toBe(null);
    expect(operationStats([], [], [], NOW).workdaysCurrent).toBe(null);
  });
});

describe("transporte", () => {
  const carriers = [{ id: "k1", alias: "JC" }, { id: "k2", alias: "Pedro" }];
  const payments = [
    { id: "p1", carrierId: "k1", periodFrom: "2026-10-01", periodTo: "2026-10-15", total: 1000, status: "pending", abonos: [{ amount: 300, date: "2026-10-18" }] },
    { id: "p2", carrierId: "k2", periodFrom: "2026-10-01", periodTo: "2026-10-15", total: 500, status: "paid", paidAt: ts(2026, 10, 20) },
    { id: "p3", carrierId: "k1", periodFrom: "2026-09-01", periodTo: "2026-09-15", total: 800, status: "pending" },
  ];

  it("pendingOfPayment descuenta los abonos y no baja de cero", () => {
    expect(pendingOfPayment(payments[0])).toBe(700);
    expect(pendingOfPayment({ total: 100, abonos: [{ amount: 150 }] })).toBe(0);
  });

  it("el gasto del período va por transportista, con lo que falta pagar", () => {
    const t = transportStats(payments, [], carriers, 1, NOW);
    expect(t.periodSpend).toBe(1500);
    expect(t.periodPending).toBe(700);
    expect(t.spend).toEqual([
      { name: "JC", total: 1000, pending: 700 },
      { name: "Pedro", total: 500, pending: 0 },
    ]);
    expect(t.carrierCount).toBe(2);
    expect(t.concentration).toBe(100);
  });

  it("el gasto mes a mes cubre 6 meses, fechado por el período del resumen", () => {
    const t = transportStats(payments, [], carriers, 1, NOW);
    expect(t.months.map((r) => [r.key, r.spent])).toEqual([
      ["2026-05", 0], ["2026-06", 0], ["2026-07", 0], ["2026-08", 0], ["2026-09", 800], ["2026-10", 1500],
    ]);
  });

  it("las quincenas pendientes suman su total guardado", () => {
    const fortnights = [{ id: "q1", status: "pending", total: 900 }, { id: "q2", status: "paid", total: 400 }];
    const t = transportStats([], fortnights, carriers, 1, NOW);
    expect(t.pendingFortnightCount).toBe(1);
    expect(t.pendingFortnightTotal).toBe(900);
  });
});

describe("transportDebtByMonth", () => {
  const carriers = [{ id: "k1", alias: "JC" }];
  const fortnights = [{ id: "q1", name: "Quincena 1-15 de Septiembre" }];
  const payments = [
    // Antes de la ventana de 12 meses (nov-2025 a oct-2026): va al saldo inicial.
    { carrierId: "k1", periodFrom: "2025-09-01", periodTo: "2025-09-15", total: 1000, status: "pending" },
    {
      carrierId: "k1",
      payrollId: "q1",
      periodFrom: "2026-09-01",
      periodTo: "2026-09-15",
      total: 600,
      status: "paid",
      paidAt: ts(2026, 10, 10),
      abonos: [{ amount: 200, date: "2026-10-02", notes: "Adelanto" }],
    },
    { carrierId: "k1", periodFrom: "2026-09-01", periodTo: "2026-09-15", total: 0, status: "pending" },
  ];

  it("arrastra lo anterior a la ventana como saldo inicial", () => {
    const rows = transportDebtByMonth(payments, carriers, fortnights, NOW);
    expect(rows).toHaveLength(12);
    expect(rows[0].key).toBe("2025-11");
    expect(rows[0].balance).toBe(1000);
    expect(rows.find((r) => r.key === "2026-08").balance).toBe(1000);
  });

  it("la deuda nace en el mes del período y baja por cada abono y por el remanente al pagar", () => {
    const rows = transportDebtByMonth(payments, carriers, fortnights, NOW);
    const sep = rows.find((r) => r.key === "2026-09");
    const oct = rows.find((r) => r.key === "2026-10");
    expect([sep.generated, sep.paid, sep.balance]).toEqual([600, 0, 1600]);
    expect([oct.generated, oct.paid, oct.balance, oct.net]).toEqual([0, 600, 1000, 600]);
  });

  it("el detalle del mes trae el transportista, el período y la quincena, de mayor a menor monto", () => {
    const oct = transportDebtByMonth(payments, carriers, fortnights, NOW).find((r) => r.key === "2026-10");
    expect(oct.paidItems.map((i) => [i.amount, i.kind, i.date, i.marked || false])).toEqual([
      [400, "summary", "2026-10-10", true],
      [200, "partialPayment", "2026-10-02", false],
    ]);
    expect(oct.paidItems[1]).toMatchObject({ name: "JC", fortnight: "Quincena 1-15 de Septiembre", notes: "Adelanto" });
    const sep = transportDebtByMonth(payments, carriers, fortnights, NOW).find((r) => r.key === "2026-09");
    expect(sep.createdItems).toHaveLength(1);
    expect(sep.createdItems[0].period).toContain("→");
  });
});

describe("cycleMargins", () => {
  it("lista los ciclos con cobro configurado, de mayor a menor margen", () => {
    const cycles = [
      { id: "c1", summaryTotals: { cobrar: 1000, pagar: 800 } },
      { id: "c2", summaryTotals: { cobrar: 500, pagar: 600 } },
      { id: "c3" },
    ];
    const m = cycleMargins(cycles);
    expect(m.rows.map((r) => [r.cycle.id, r.marginAmount, r.pct])).toEqual([
      ["c1", 200, 20],
      ["c2", -100, -20],
    ]);
    expect([m.covered, m.total, m.missing, m.marginSum]).toEqual([2, 3, 1, 100]);
    expect(m.pct).toBeCloseTo((100 / 1500) * 100);
  });
});

describe("dteMonthlyTotals", () => {
  it("suma ventas y compras por mes, y las notas de crédito restan", () => {
    const docs = [
      { periodo: "2026-10", kind: "venta", tipo: 33, total: 1190 },
      { periodo: "2026-10", kind: "venta", tipo: 61, total: 119 },
      { periodo: "2026-10", kind: "compra", tipo: 33, total: 595 },
      { periodo: "2026-09", kind: "compra", tipo: 112, total: 100 },
      { periodo: "2025-01", kind: "venta", tipo: 33, total: 9999 },
    ];
    expect(dteMonthlyTotals(docs, ["2026-09", "2026-10"])).toEqual([
      { key: "2026-09", label: expect.any(String), sales: 0, purchases: -100, difference: 100 },
      { key: "2026-10", label: expect.any(String), sales: 1071, purchases: 595, difference: 476 },
    ]);
  });
});

describe("commitmentsWeekOf", () => {
  it("lista lo que se paga vencido o de la semana, sin cheques recibidos ni lo de más adelante", () => {
    const items = [
      { id: "a", kind: "payment", status: "pending", dueDate: "2026-10-15", amount: 100 },
      { id: "b", kind: "chequeIssued", status: "pending", dueDate: "2026-10-24", amount: 200 },
      { id: "c", kind: "chequeReceived", status: "pending", dueDate: "2026-10-22", amount: 300 },
      { id: "d", kind: "payment", status: "pending", dueDate: "2026-12-01", amount: 400 },
    ];
    const week = commitmentsWeekOf(items, "2026-10-21");
    expect(week.items.map((c) => c.id)).toEqual(["a", "b"]);
    expect(week.today).toBe("2026-10-21");
    expect(week.summary.out.overdue.amount).toBe(100);
  });
});
