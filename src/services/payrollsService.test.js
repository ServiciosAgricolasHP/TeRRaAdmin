import { describe, it, expect, vi } from "vitest";

vi.mock("../firebase", () => ({ db: {}, auth: { currentUser: null } }));

const {
  pendingCashOf,
  pendingCashItemsOf,
  recalcPayrollAggregates,
  assertEditable,
  bankWorkdayIdsOf,
  cashWorkdayIdsOf,
} = await import("./payrollsService");

const item = (over = {}) => ({
  rut: "1-9",
  amount: 100000,
  advance: 0,
  bankCode: "012",
  workdayIds: [],
  advanceIds: [],
  ...over,
});

const banco = (rut, amount, over = {}) => item({ rut, amount, bankCode: "012", ...over });
const efectivo = (rut, amount, over = {}) => item({ rut, amount, bankCode: "EFE", ...over });

describe("recalcPayrollAggregates", () => {
  // Tres mutadores distintos escriben la salida de esto directo a Firestore.
  it("cumple la invariante total === bankTotal + cashTotal === suma de items", () => {
    const items = [banco("1-9", 100000), efectivo("2-7", 50000), banco("3-5", 25000)];
    const agg = recalcPayrollAggregates(items);
    expect(agg.total).toBe(175000);
    expect(agg.bankTotal).toBe(125000);
    expect(agg.cashTotal).toBe(50000);
    expect(agg.bankTotal + agg.cashTotal).toBe(agg.total);
    expect(agg.total).toBe(items.reduce((s, x) => s + x.amount, 0));
  });

  it("cuenta trabajadores por bolsa", () => {
    const agg = recalcPayrollAggregates([banco("1-9", 1), banco("2-7", 1), efectivo("3-5", 1)]);
    expect(agg).toMatchObject({ workerCount: 3, bankCount: 2, cashCount: 1 });
  });

  it("aplana los ids de workdays y anticipos", () => {
    const agg = recalcPayrollAggregates([
      banco("1-9", 1, { workdayIds: ["w1", "w2"], advanceIds: ["a1"] }),
      efectivo("2-7", 1, { workdayIds: ["w3"], advanceIds: [] }),
    ]);
    expect(agg.workdayIds).toEqual(["w1", "w2", "w3"]);
    expect(agg.advanceIds).toEqual(["a1"]);
  });

  it("suma los anticipos aparte del neto", () => {
    const agg = recalcPayrollAggregates([
      banco("1-9", 70000, { advance: 30000 }),
      efectivo("2-7", 50000, { advance: 0 }),
    ]);
    expect(agg.advanceTotal).toBe(30000);
    expect(agg.total).toBe(120000); // el total es el NETO, no el bruto
  });

  it("una nómina vacía da todo en cero, no NaN", () => {
    expect(recalcPayrollAggregates([])).toMatchObject({
      total: 0,
      bankTotal: 0,
      cashTotal: 0,
      advanceTotal: 0,
      workerCount: 0,
    });
  });

  it("un monto no numérico suma cero", () => {
    expect(recalcPayrollAggregates([banco("1-9", "x")]).total).toBe(0);
  });

  it("sin código de banco cuenta como transferencia", () => {
    const agg = recalcPayrollAggregates([item({ bankCode: "", amount: 1000 })]);
    expect(agg.bankTotal).toBe(1000);
    expect(agg.cashTotal).toBe(0);
  });
});

describe("bankWorkdayIdsOf / cashWorkdayIdsOf", () => {
  const p = {
    items: [
      banco("1-9", 1, { workdayIds: ["b1", "b2"] }),
      efectivo("2-7", 1, { workdayIds: ["e1"] }),
    ],
  };

  it("parten los workdays por medio de pago", () => {
    expect(bankWorkdayIdsOf(p)).toEqual(["b1", "b2"]);
    expect(cashWorkdayIdsOf(p)).toEqual(["e1"]);
  });

  it("no se pisan: juntos son todos, sin repetir", () => {
    const todos = [...bankWorkdayIdsOf(p), ...cashWorkdayIdsOf(p)];
    expect(new Set(todos).size).toBe(todos.length);
    expect(todos).toHaveLength(3);
  });

  it("no rompe con nómina vacía", () => {
    expect(bankWorkdayIdsOf(null)).toEqual([]);
    expect(cashWorkdayIdsOf({})).toEqual([]);
  });
});

describe("pendingCashOf / pendingCashItemsOf", () => {
  // La deuda de efectivo se DERIVA siempre, nunca se guarda, justamente para
  // que no exista un campo que pueda quedar desincronizado de los items.
  const conFlag = (over = {}) => ({
    status: "pending",
    bankPaidAt: "2026-09-20T10:00:00.000Z",
    items: [banco("1-9", 100000), efectivo("2-7", 50000), efectivo("3-5", 30000)],
    ...over,
  });

  it("sin el flag no hay deuda: la nómina simplemente no se pagó todavía", () => {
    // Esta es la distinción que justifica el flag. Una nómina recién generada
    // tiene cashTotal > 0 pero eso no es plata adeudada.
    expect(pendingCashOf(conFlag({ bankPaidAt: null }))).toBe(0);
    expect(pendingCashItemsOf(conFlag({ bankPaidAt: null }))).toEqual([]);
  });

  it("con el flag, la deuda es todo el efectivo", () => {
    expect(pendingCashOf(conFlag())).toBe(80000);
    expect(pendingCashItemsOf(conFlag()).map((i) => i.rut)).toEqual(["2-7", "3-5"]);
  });

  it("descuenta a quien ya cobró suelto", () => {
    expect(pendingCashOf(conFlag({ cashPaidRuts: ["2-7"] }))).toBe(30000);
    expect(pendingCashOf(conFlag({ cashPaidRuts: ["2-7", "3-5"] }))).toBe(0);
  });

  it("ignora ruts de cashPaidRuts que no están en la nómina", () => {
    expect(pendingCashOf(conFlag({ cashPaidRuts: ["9-9"] }))).toBe(80000);
  });

  it("pagada entera no debe nada, aunque quede el flag", () => {
    // markPaid deja bankPaidAt como registro histórico a propósito.
    expect(pendingCashOf(conFlag({ status: "paid" }))).toBe(0);
  });

  it("la gente de banco nunca entra en la deuda de efectivo", () => {
    const p = conFlag({ items: [banco("1-9", 999999)] });
    expect(pendingCashOf(p)).toBe(0);
  });

  it("no rompe con entradas vacías", () => {
    expect(pendingCashOf(null)).toBe(0);
    expect(pendingCashOf({})).toBe(0);
    expect(pendingCashOf({ bankPaidAt: "x", items: [] })).toBe(0);
  });
});

describe("assertEditable", () => {
  // Sacar a alguien de banco de una nómina ya transferida liberaría sus días y
  // le restauraría anticipos a quien ya tiene la plata en la cuenta.
  it("deja editar una nómina pendiente sin transferencias", () => {
    expect(() => assertEditable({ status: "pending" })).not.toThrow();
  });

  it("rechaza si está pagada entera", () => {
    expect(() => assertEditable({ status: "paid" })).toThrow(/pagada/i);
  });

  it("rechaza si las transferencias ya salieron", () => {
    expect(() => assertEditable({ status: "pending", bankPaidAt: "2026-09-20" })).toThrow(
      /transferencias/i,
    );
  });

  it("el verbo aparece en el mensaje", () => {
    expect(() => assertEditable({ status: "paid" }, "eliminar")).toThrow(/eliminar/);
  });
});
