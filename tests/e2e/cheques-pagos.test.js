import { describe, it, expect } from "vitest";
import {
  saveCommitment,
  markPaid,
  markPending,
  markPostponed,
  markProtested,
  reschedule,
  createInstallmentPlan,
  createRecurringPlan,
  stopSeries,
  importRows,
  saveCommitmentConfig,
  getCommitmentConfig,
  addPartialPayment,
  addDebtPartialPayment,
  removePartialPayment,
  saveSeriesEdit,
} from "../../src/services/commitmentsService";
import { mapExcelRow, partialPaidOf, seriesRows, applySeriesTool, seriesChanges } from "../../src/utils/commitments";
import { get, all } from "./helpers/seed";

describe("cheques y pagos", () => {
  it("un cheque nace pendiente, con el texto normalizado, y se marca cobrado", async () => {
    const c = await saveCommitment({
      kind: "chequeIssued",
      dueDate: "2026-10-21",
      amount: "3575568",
      bank: "028",
      chequeNumber: "361431",
      counterparty: "BIOSUR",
      concept: "CUOTA N 10",
    });
    let doc = await get("commitments", c.id);
    expect(doc).toMatchObject({ status: "pending", amount: 3575568, counterparty: "Biosur", concept: "Cuota n 10" });

    await markPaid(c.id, "2026-10-22");
    doc = await get("commitments", c.id);
    expect(doc).toMatchObject({ status: "paid", paidAt: "2026-10-22" });

    await markPending(c.id);
    expect((await get("commitments", c.id)).paidAt).toBe("");
  });

  it("rechaza un vencimiento sin monto o sin fecha", async () => {
    await expect(saveCommitment({ kind: "payment", dueDate: "2026-10-21", amount: 0, counterparty: "X" })).rejects.toThrow(/monto/);
    await expect(saveCommitment({ kind: "payment", dueDate: "", amount: 10, counterparty: "X" })).rejects.toThrow(/fecha/);
  });

  it("un crédito crea una cuota por mes, cada una por separado", async () => {
    const { series, count } = await createInstallmentPlan(
      { counterparty: "Salfa Sur", amount: 2408572, concept: "Crédito camioneta" },
      { firstDate: "2026-11-30", count: 3 },
    );
    expect(count).toBe(3);
    const installments = (await all("commitments")).filter((c) => c.seriesId === series.id).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    expect(installments.map((c) => c.dueDate)).toEqual(["2026-11-30", "2026-12-30", "2027-01-30"]);
    expect(installments.map((c) => c.installment)).toEqual([{ n: 1, of: 3 }, { n: 2, of: 3 }, { n: 3, of: 3 }]);
    expect(installments.every((c) => c.kind === "installment" && c.status === "pending")).toBe(true);
  });

  it("una deuda personal es un pago único o se reparte en cuotas", async () => {
    const single = await saveCommitment({ kind: "personalDebt", dueDate: "2026-11-01", amount: 300000, counterparty: "Juan Pérez" });
    expect(await get("commitments", single.id)).toMatchObject({ kind: "personalDebt", status: "pending", amount: 300000 });

    const { series } = await createInstallmentPlan(
      { counterparty: "Juan Pérez", amount: 100000 },
      { firstDate: "2026-11-01", count: 3, kind: "personalDebt" },
    );
    expect((await get("commitmentSeries", series.id)).kind).toBe("personalDebt");
    const installments = (await all("commitments")).filter((c) => c.seriesId === series.id);
    expect(installments.map((c) => c.kind)).toEqual(["personalDebt", "personalDebt", "personalDebt"]);
    expect(installments.map((c) => c.installment.of)).toEqual([3, 3, 3]);
  });

  it("abonos a una cuota y a toda la deuda; quitar uno devuelve lo que había dejado pagado", async () => {
    const { series } = await createInstallmentPlan(
      { counterparty: "Juan Pérez", amount: 100 },
      { firstDate: "2026-11-01", count: 3, kind: "personalDebt" },
    );
    const load = async () =>
      (await all("commitments")).filter((c) => c.seriesId === series.id).sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    let [first] = await load();
    await addPartialPayment(first, { date: "2026-10-20", amount: 30, notes: "EFECTIVO" });
    [first] = await load();
    expect(first.status).toBe("pending");
    expect(first.partialPayments).toHaveLength(1);
    expect(first.partialPayments[0]).toMatchObject({ amount: 30, date: "2026-10-20", notes: "Efectivo" });
    await expect(addPartialPayment(first, { date: "2026-10-20", amount: 80 })).rejects.toThrow("mayor que lo que falta");

    await addDebtPartialPayment(await load(), { date: "2026-10-25", amount: 150 });
    let [, second, third] = await load();
    [first] = await load();
    expect(first).toMatchObject({ status: "paid", paidAt: "2026-10-25", extra: 0, closedByPartials: true });
    expect(partialPaidOf(first)).toBe(100);
    expect(second.status).toBe("pending");
    expect(partialPaidOf(second)).toBe(80);
    expect(partialPaidOf(third)).toBe(0);
    await expect(addDebtPartialPayment(await load(), { date: "2026-10-25", amount: 121 })).rejects.toThrow("mayor que lo que falta");

    await removePartialPayment(await load(), second.partialPayments[0]);
    [first, second, third] = await load();
    expect(first).toMatchObject({ status: "pending", paidAt: "", closedByPartials: false });
    expect(partialPaidOf(first)).toBe(30);
    expect(partialPaidOf(second)).toBe(0);
  });

  it("un abono no se quita de algo marcado pagado a mano hasta volverlo a pendiente", async () => {
    const debt = await saveCommitment({ kind: "personalDebt", dueDate: "2026-11-01", amount: 100, counterparty: "Juan Pérez" });
    await addPartialPayment(await get("commitments", debt.id), { date: "2026-10-20", amount: 40 });
    await markPaid(debt.id, "2026-10-30", 0);
    const paid = await get("commitments", debt.id);
    await expect(removePartialPayment([paid], paid.partialPayments[0])).rejects.toThrow("Vuélvelo a pendiente");
    await markPending(debt.id);
    const reopened = await get("commitments", debt.id);
    await removePartialPayment([reopened], reopened.partialPayments[0]);
    expect(await get("commitments", debt.id)).toMatchObject({ status: "pending", partialPayments: [] });
    await expect(saveCommitment({ ...reopened, partialPayments: [{ amount: 40 }], amount: 30 })).rejects.toThrow("menor que lo ya abonado");
  });

  it("ajustar una serie guarda fechas y montos; un recurrente sigue con el día y el monto nuevos", async () => {
    const { series } = await createInstallmentPlan({ counterparty: "Santander", amount: 100 }, { firstDate: "2026-09-10", count: 3 });
    const load = async (id) =>
      (await all("commitments")).filter((c) => c.seriesId === id).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    let items = await load(series.id);
    await markPostponed(items[0].id);
    items = await load(series.id);
    const rows = applySeriesTool(seriesRows(items), { fromIndex: 0, months: 2, amount: 120 });
    expect(await saveSeriesEdit(null, items, seriesChanges(items, rows))).toBe(3);
    items = await load(series.id);
    expect(items.map((c) => [c.id, c.dueDate, c.amount, c.status])).toEqual([
      [`${series.id}_2026-09-10`, "2026-11-10", 120, "pending"],
      [`${series.id}_2026-10-10`, "2026-12-10", 120, "pending"],
      [`${series.id}_2026-11-10`, "2027-01-10", 120, "pending"],
    ]);

    const recurring = await createRecurringPlan({ counterparty: "Arriendo", amount: 50 }, { firstDate: "2026-10-05", today: "2026-10-16" });
    const recItems = await load(recurring.series.id);
    expect(recItems.map((c) => c.dueDate)).toEqual(["2026-10-05", "2026-11-05", "2026-12-05"]);
    const recRows = applySeriesTool(seriesRows(recItems), { fromIndex: 1, day: 20, amount: 70 });
    const seriesDoc = await get("commitmentSeries", recurring.series.id);
    await saveSeriesEdit(seriesDoc, recItems, seriesChanges(recItems, recRows), { dayOfMonth: 20, amount: 70 });
    expect((await load(recurring.series.id)).map((c) => [c.dueDate, c.amount])).toEqual([
      ["2026-10-05", 50],
      ["2026-11-20", 70],
      ["2026-12-20", 70],
    ]);
    expect(await get("commitmentSeries", recurring.series.id)).toMatchObject({ dayOfMonth: 20, amount: 70, generatedUntil: "2026-12-20" });
  });

  it("pagar con interés guarda el monto original y lo pagado de más aparte", async () => {
    const { series } = await createInstallmentPlan(
      { counterparty: "Banco Estado", amount: 100 },
      { firstDate: "2026-09-15", count: 2 },
    );
    const id = `${series.id}_2026-09-15`;
    await markPaid(id, "2026-09-20", 3);
    expect(await get("commitments", id)).toMatchObject({ status: "paid", amount: 100, extra: 3 });
    await expect(markPaid(id, "2026-09-20", -5)).rejects.toThrow(/menos/);

    await saveCommitment({ ...(await get("commitments", id)), id, extra: 4 });
    expect((await get("commitments", id)).extra).toBe(4);

    await markPending(id);
    expect(await get("commitments", id)).toMatchObject({ status: "pending", amount: 100, extra: 0 });
  });

  it("aplazar y protestar dejan la deuda abierta; reprogramar le pone fecha nueva", async () => {
    const payment = await saveCommitment({ kind: "payment", dueDate: "2026-10-01", amount: 200, counterparty: "Ferretería" });
    await markPostponed(payment.id);
    expect(await get("commitments", payment.id)).toMatchObject({ status: "postponed", dueDate: "2026-10-01" });
    await reschedule(payment.id, "2026-11-10");
    expect(await get("commitments", payment.id)).toMatchObject({ status: "pending", dueDate: "2026-11-10" });
    await expect(reschedule(payment.id, "")).rejects.toThrow(/fecha/);

    const cheque = await saveCommitment({ kind: "chequeIssued", dueDate: "2026-10-01", amount: 300, counterparty: "Biosur", chequeNumber: "1" });
    await markPaid(cheque.id, "2026-10-02");
    await markProtested(cheque.id);
    expect(await get("commitments", cheque.id)).toMatchObject({ status: "protested", paidAt: "" });
  });

  it("detener un pago recurrente borra solo los pendientes futuros", async () => {
    const { series } = await createRecurringPlan(
      { counterparty: "Arriendo campo", amount: 500000 },
      { firstDate: "2026-10-05", today: "2026-10-16" },
    );
    expect((await get("commitmentSeries", series.id)).generatedUntil).toBe("2026-12-15");
    let occ = (await all("commitments")).filter((c) => c.seriesId === series.id);
    expect(occ.map((c) => c.dueDate).sort()).toEqual(["2026-10-05", "2026-11-05", "2026-12-05"]);

    await markPaid(`${series.id}_2026-10-05`, "2026-10-05");
    const n = await stopSeries(series.id, "2026-10-16", occ);
    expect(n).toBe(2);
    occ = (await all("commitments")).filter((c) => c.seriesId === series.id);
    expect(occ.map((c) => c.dueDate)).toEqual(["2026-10-05"]);
    expect((await get("commitmentSeries", series.id)).active).toBe(false);
  });

  it("reimportar la planilla no duplica ni pisa lo marcado en la app", async () => {
    const row = [21, "21-10-26", "BICE ", 361431, "BIOSUR", "CUOTA ", 3575568, null, "Pendiente", "TRANSPORTE HP", ""];
    const rows = [mapExcelRow(row)];
    expect(await importRows(rows, new Set())).toBe(1);
    await markPaid(rows[0].id, "2026-10-21");

    const existingIds = new Set((await all("commitments")).map((c) => c.id));
    expect(await importRows(rows, existingIds)).toBe(0);
    const doc = await get("commitments", rows[0].id);
    expect(doc.status).toBe("paid");
    expect((await all("commitments")).length).toBe(1);
  });

  it("la configuración de avisos limpia correos y días", async () => {
    await saveCommitmentConfig({
      recipients: [" Pagos@Empresa.cl ", "pagos@empresa.cl", ""],
      offsets: [0, 3, 1, 3, -1],
      includeOverdue: true,
      sender: "Avisos@Gmail.com",
    });
    const cfg = await getCommitmentConfig();
    expect(cfg.recipients).toEqual(["pagos@empresa.cl"]);
    expect(cfg.offsets).toEqual([3, 1, 0]);
    expect(cfg.sender).toBe("avisos@gmail.com");
  });
});
