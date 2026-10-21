import { describe, expect, it, vi } from "vitest";

// `payrollPreview` importa helpers puros de `advancesService`, que importa
// `../firebase`.
vi.mock("../firebase", () => ({ db: {}, auth: { currentUser: null } }));

const {
  installmentCandidatesOf,
  payrollItemOf,
  payrollTotalsOf,
  previewEditCaps,
  previewItemsOf,
  withPreviewEdit,
  withoutInstallments,
} = await import("./payrollPreview");

const workers = [
  { id: "A", name: "Ana", email: "ana@x.cl", groupLeader: ["grupo norte"], bankDetails: ["P-A", "123456", 0, "001"] },
  { id: "B", name: "Beto", groupLeader: [], bankDetails: ["B", "", 3, "EFE"] },
  { id: "C", name: "Caro", bankDetails: ["C", "12", 1, "012"] },
];
const agg = (rut, total, byCycle = {}) => ({ rut, workerId: rut, total, byCycle, workdayIds: [`${rut}-1`] });

describe("previewItemsOf", () => {
  const items = previewItemsOf({
    aggregates: [agg("C", 30000, { K1: 30000 }), agg("A", 100000.4, { K1: 60000, K2: 40000.4 }), agg("B", 50000, { K2: 50000 }), agg("Z", 0)],
    workers,
    payrollCycles: [{ id: "K1" }, { id: "K2" }],
    pendingAdvances: [
      { id: "ADV1", type: "anticipo", workerRut: "A", amount: 30000, amountPaid: 0, date: "2026-09-01" },
      { id: "BON1", type: "bono", workerRut: "B", amount: 5000, amountPaid: 0, date: "2026-09-02" },
    ],
  });

  it("una fila por trabajador con bruto, por nombre, con todos los ciclos", () => {
    expect(items.map((i) => i.name)).toEqual(["Ana", "Beto", "Caro"]);
    expect(items[0].byCycle).toEqual({ K1: 60000, K2: 40000 });
    expect(items[2].byCycle).toEqual({ K1: 30000, K2: 0 });
  });

  it("los datos de pago salen de la ficha", () => {
    const [ana] = items;
    expect([ana.paymentRut, ana.accountNumber, ana.accountType, ana.bankCode, ana.email, ana.groupLeader]).toEqual(["P-A", "123456", 0, "001", "ana@x.cl", "GRUPO NORTE"]);
  });

  it("aplica anticipos y bonos pendientes", () => {
    const [ana, beto] = items;
    expect([ana.grossAmount, ana.advance, ana.amount]).toEqual([100000, 30000, 70000]);
    expect(ana.anticipoApplications.map((a) => [a.advanceId, a.amount])).toEqual([["ADV1", 30000]]);
    expect(ana.allocatedAdvances).toBe(ana.anticipoApplications);
    expect([beto.bonus, beto.amount]).toEqual([5000, 55000]);
  });

  it("marca datos faltantes y cuentas sospechosas, salvo en efectivo", () => {
    expect(items.map((i) => [i.name, i._missing, i._accountIssue])).toEqual([
      ["Ana", false, null],
      ["Beto", false, null],
      ["Caro", false, "muy corta (<4 dígitos)"],
    ]);
    const [sinFicha] = previewItemsOf({ aggregates: [agg("X", 1000)], workers, payrollCycles: [], pendingAdvances: [] });
    expect([sinFicha.name, sinFicha._missing, sinFicha.accountType]).toEqual(["(sin nombre)", true, 3]);
  });
});

describe("withPreviewEdit", () => {
  // V1: cuota de 20.000 con saldo 20.000; V2: cuota de 10.000 con saldo 50.000.
  const allocatedAdvances = [{ advanceId: "V1", amount: 20000, maxAmount: 20000 }, { advanceId: "V2", amount: 10000, maxAmount: 50000 }];
  const allocatedBonuses = [{ advanceId: "B1", amount: 5000 }, { advanceId: "B2", amount: 2000 }];
  const row = {
    grossAmount: 100000, advance: 30000, bonus: 7000, amount: 77000,
    anticipoApplications: allocatedAdvances, bonoApplications: allocatedBonuses, allocatedAdvances, allocatedBonuses,
  };
  const apps = (r, k = "anticipoApplications") => r[k].map((a) => [a.advanceId, a.amount]);

  it("otro campo no toca los montos", () => {
    expect(withPreviewEdit(row, { include: false })).toEqual({ ...row, include: false });
  });

  it("bajar el anticipo se lo quita primero al más nuevo; queda parcial", () => {
    const next = withPreviewEdit(row, { advance: 25000 });
    expect([next.advance, next.amount, next.anticiposTotal]).toEqual([25000, 82000, 25000]);
    expect(apps(next)).toEqual([["V1", 20000], ["V2", 5000]]);
  });

  it("el anticipo sube por encima de la cuota hasta el saldo de cada uno", () => {
    const next = withPreviewEdit(row, { advance: "45000" });
    expect([next.advance, next.amount]).toEqual([45000, 62000]);
    expect(apps(next)).toEqual([["V1", 20000], ["V2", 25000]]);
    expect(next.anticipoApplications[1].maxAmount).toBe(50000);
  });

  it("el anticipo no pasa del saldo ni de bruto + bonos", () => {
    expect(withPreviewEdit(row, { advance: 200000 }).advance).toBe(70000);
    const poco = { ...row, grossAmount: 40000 };
    const next = withPreviewEdit(poco, { advance: 200000 });
    expect([next.advance, next.amount, next.anticiposTotal]).toEqual([47000, 0, 47000]);
  });

  it("bajar a cero y volver a subir recupera el reparto sugerido", () => {
    const cero = withPreviewEdit(row, { advance: 0 });
    expect(cero.anticipoApplications).toEqual([]);
    expect(withPreviewEdit(cero, { advance: 30000 }).anticipoApplications).toEqual(allocatedAdvances);
  });

  it("el bono baja y el resto queda pendiente; nunca sube de su monto", () => {
    const bajo = withPreviewEdit(row, { bonus: 6000 });
    expect([bajo.bonus, bajo.amount, bajo.bonosTotal]).toEqual([6000, 76000, 6000]);
    expect(apps(bajo, "bonoApplications")).toEqual([["B1", 5000], ["B2", 1000]]);
    const alto = withPreviewEdit(row, { bonus: 9000 });
    expect([alto.bonus, alto.amount]).toEqual([7000, 77000]);
  });

  it("sin anticipos ni bonos pendientes no se puede agregar ninguno", () => {
    const sin = { grossAmount: 50000, advance: 0, bonus: 0, amount: 50000, anticipoApplications: [], bonoApplications: [], allocatedAdvances: [], allocatedBonuses: [] };
    const next = withPreviewEdit(sin, { advance: 5000, bonus: 3000 });
    expect([next.advance, next.bonus, next.amount]).toEqual([0, 0, 50000]);
  });

  it("bajar el bono vuelve a topear el anticipo con el bruto + bonos nuevo", () => {
    const justo = { ...row, grossAmount: 20000 };
    const conTodo = withPreviewEdit(justo, { advance: 27000 });
    expect([conTodo.advance, conTodo.amount]).toEqual([27000, 0]);
    const sinBono = withPreviewEdit(conTodo, { bonus: 0 });
    expect([sinBono.advance, sinBono.bonus, sinBono.amount]).toEqual([20000, 0, 0]);
    expect(apps(sinBono)).toEqual([["V1", 20000]]);
  });

  it("los topes se pueden mostrar", () => {
    expect(previewEditCaps(row)).toEqual({ advanceMax: 70000, bonusMax: 7000 });
    expect(previewEditCaps({ ...row, grossAmount: 10000 })).toEqual({ advanceMax: 17000, bonusMax: 7000 });
  });
});

describe("cuotas", () => {
  const items = [
    { name: "Ana", grossAmount: 50000, bonus: 1000, anticipoApplications: [{ advanceId: "Q1", amount: 5000 }, { advanceId: "N1", amount: 3000 }] },
    { name: "Beto", grossAmount: 20000, anticipoApplications: [] },
  ];
  const advances = [
    { id: "Q1", type: "anticipo", amount: 20000, amountPaid: 5000, installments: { count: 4, amount: 5000, cadence: "porPago" } },
    { id: "N1", type: "anticipo", amount: 3000, amountPaid: 0, installments: null },
  ];

  it("solo los anticipos con plan son candidatos", () => {
    expect(installmentCandidatesOf(items, advances)).toEqual([
      { advanceId: "Q1", workerName: "Ana", amount: 5000, progress: expect.objectContaining({ count: 4, paidCount: 1 }) },
    ]);
  });

  it("excluir una cuota la saca y recalcula el neto", () => {
    const [ana, beto] = withoutInstallments(items, ["Q1"]);
    expect(ana.anticipoApplications).toEqual([{ advanceId: "N1", amount: 3000 }]);
    expect([ana.advance, ana.anticiposTotal, ana.amount]).toEqual([3000, 3000, 48000]);
    expect(beto).toBe(items[1]);
  });
});

describe("payrollItemOf y payrollTotalsOf", () => {
  const p = {
    rut: "A", name: "Ana", accountNumber: "1", bankCode: "012", accountType: 3, grossAmount: 1000.6, advance: 200.4, bonus: 0, amount: 800.2,
    anticipoApplications: [{ advanceId: "V1", amount: 200.4, maxAmount: 900 }], bonoApplications: [{ advanceId: "B1", amount: 0 }],
    anticiposTotal: 200.4, byCycle: { K1: 600, K2: 400 }, workdayIds: ["w1"], include: true, _missing: false,
  };
  const item = payrollItemOf(p, new Set(["K1"]));

  it("redondea, junta las aplicaciones y deja solo los ciclos de la nómina", () => {
    expect([item.grossAmount, item.advance, item.amount, item.workerId, item.paymentRut]).toEqual([1001, 200, 800, "A", "A"]);
    expect(item.advanceApplications).toEqual([{ advanceId: "V1", amount: 200 }, { advanceId: "B1", amount: 0 }]);
    expect(item.advanceIds).toEqual(["V1", "B1"]);
    expect(item.byCycle).toEqual({ K1: 600 });
    expect(["include", "_missing", "allocatedAdvances", "allocatedBonuses"].some((k) => k in item)).toBe(false);
  });

  it("los totales separan banco y efectivo", () => {
    const cash = { ...item, rut: "B", bankCode: "EFE", amount: 300, advance: 0, bonus: 50 };
    expect(payrollTotalsOf([item, cash])).toEqual({
      total: 1100, bankTotal: 800, cashTotal: 300, workerCount: 2, bankCount: 1, cashCount: 1, advanceTotal: 200, bonusTotal: 50,
    });
  });
});
