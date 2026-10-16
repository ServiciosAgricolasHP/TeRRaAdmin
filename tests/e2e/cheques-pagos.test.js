import { describe, it, expect } from "vitest";
import {
  saveCommitment,
  markPaid,
  markPending,
  createInstallmentPlan,
  createRecurringPlan,
  stopSeries,
  importRows,
  saveCommitmentConfig,
  getCommitmentConfig,
} from "../../src/services/commitmentsService";
import { mapExcelRow } from "../../src/utils/commitments";
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
    const cuotas = (await all("commitments")).filter((c) => c.seriesId === series.id).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    expect(cuotas.map((c) => c.dueDate)).toEqual(["2026-11-30", "2026-12-30", "2027-01-30"]);
    expect(cuotas.map((c) => c.installment)).toEqual([{ n: 1, of: 3 }, { n: 2, of: 3 }, { n: 3, of: 3 }]);
    expect(cuotas.every((c) => c.kind === "installment" && c.status === "pending")).toBe(true);
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
    const fila = [21, "21-10-26", "BICE ", 361431, "BIOSUR", "CUOTA ", 3575568, null, "Pendiente", "TRANSPORTE HP", ""];
    const rows = [mapExcelRow(fila)];
    expect(await importRows(rows, new Set())).toBe(1);
    await markPaid(rows[0].id, "2026-10-21");

    const existentes = new Set((await all("commitments")).map((c) => c.id));
    expect(await importRows(rows, existentes)).toBe(0);
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
