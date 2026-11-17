import { describe, it, expect } from "vitest";
import { setItemsGroupLeader, setReviewedChecks } from "../../src/services/payrollsService";
import { payrollHistoryOf } from "../../src/utils/payrollHistory";
import { set, get, all } from "./helpers/seed";

// Lo que guarda la revisión en el detalle de una nómina: las alertas
// revisadas y el grupo de cada persona, en la nómina y en su JSON.
const itemOf = (rut, name, groupLeader = "") => ({ workerId: rut, rut, name, grossAmount: 10000, advance: 0, bonus: 0, amount: 10000, groupLeader, workdayIds: [] });
const ana = itemOf("11111111-1", "Ana Efectivo");
const beto = itemOf("12345678-5", "Beto Banco", "SUR");

describe("la revisión en el detalle de una nómina", () => {
  it("asigna el grupo en la nómina y en su JSON, y el historial lo nombra", async () => {
    await set("payrolls", "nom-1", { name: "Semana 46", status: "pending", items: [ana, beto] });
    await set("payrollSnapshots", "nom-1", { payroll: { name: "Semana 46", total: 20000 }, workers: [ana, beto] });

    await setItemsGroupLeader("nom-1", { "11111111-1": "NORTE" });

    const payroll = await get("payrolls", "nom-1");
    expect(payroll.items.map((it) => it.groupLeader)).toEqual(["NORTE", "SUR"]);
    const snapshot = await get("payrollSnapshots", "nom-1");
    expect(snapshot.workers.map((it) => it.groupLeader)).toEqual(["NORTE", "SUR"]);
    expect(snapshot.payroll.total).toBe(20000);

    const logs = (await all("logs")).filter((l) => l.entity === "payroll");
    const [entry] = payrollHistoryOf(logs, []);
    expect(entry.title).toBe("Asignó grupos");
    expect(entry.lines.map((l) => l.text)).toEqual(["Ana Efectivo: mismo líquido (grupo sin grupo → NORTE)"]);
  });

  it("guarda las revisadas, y no con la nómina pagada", async () => {
    await set("payrolls", "nom-2", { name: "Semana 47", status: "pending", items: [ana] });
    const reviewedChecks = [{ keys: ["missingGroup|11111111-1"], by: "u1", byName: "Ana", at: "2026-11-17T10:00:00Z" }];

    await setReviewedChecks("nom-2", reviewedChecks);
    expect((await get("payrolls", "nom-2")).reviewedChecks).toEqual(reviewedChecks);

    await set("payrolls", "nom-3", { name: "Semana 48", status: "paid", items: [ana] });
    await expect(setReviewedChecks("nom-3", reviewedChecks)).rejects.toThrow("pagada");
    await expect(setItemsGroupLeader("nom-3", { "11111111-1": "NORTE" })).rejects.toThrow("pagada");
  });
});
