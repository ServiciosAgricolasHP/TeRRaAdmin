import { describe, it, expect } from "vitest";
import { payrollsService } from "../../src/services/payrollsService";
import { setSignerAlias } from "../../src/services/signer";
import { payrollHistoryOf } from "../../src/utils/payrollHistory";
import { set, all } from "./helpers/seed";

// El registro de auditoría de una edición de la nómina guarda las personas
// resumidas, no la lista entera dos veces, y quién firma.
const itemOf = (rut, name, amount, days) => ({
  workerId: rut, rut, name, grossAmount: amount, advance: 0, bonus: 0, amount,
  workdayIds: Array.from({ length: days }, (_, i) => `ciclo-1__labor-1__${rut}__2026-11-${String(i + 1).padStart(2, "0")}`),
});
const ana = itemOf("11111111-1", "Ana Banco", 100000, 3);
const beto = itemOf("12345678-5", "Beto Efectivo", 50000, 2);
const caro = itemOf("12345670-K", "Caro Sin Datos", 30000, 1);

describe("el registro de una edición de la nómina", () => {
  it("resume quién entró, quién salió y a quién le cambiaron las cifras, con quién firma", async () => {
    await set("payrolls", "nom-1", { name: "Semana 45", status: "pending", items: [ana, beto], workdayIds: [...ana.workdayIds, ...beto.workdayIds], total: 150000 });
    setSignerAlias("Revisora");

    const anaLater = { ...ana, advance: 20000, amount: 80000 };
    await payrollsService.update("nom-1", {
      items: [anaLater, caro],
      workdayIds: [...ana.workdayIds, ...caro.workdayIds],
      total: 110000,
    });

    const [log] = await all("logs");
    expect(log).toMatchObject({ action: "update", entity: "payroll", entityId: "nom-1", userName: "Revisora" });
    expect(log.changes.items).toMatchObject({
      summary: "items",
      count: { from: 2, to: 2 },
      added: [{ key: "12345670-K", name: "Caro Sin Datos", amount: 30000, days: 1 }],
      removed: [{ key: "12345678-5", amount: 50000 }],
      changed: [{ key: "11111111-1", from: { amount: 100000, advance: 0 }, to: { amount: 80000, advance: 20000 } }],
    });
    expect(log.changes.workdayIds).toEqual({ summary: "list", from: 5, to: 4, added: 1, removed: 2 });
    expect(log.changes.total).toEqual({ from: 150000, to: 110000 });

    // Y la línea de tiempo lo cuenta.
    const [entry] = payrollHistoryOf([log]);
    expect([entry.who, entry.title]).toEqual(["Revisora", "Recalculó"]);
    expect(entry.lines.map((l) => l.text)).toEqual([
      "+ entra Caro Sin Datos · 1 día · $30.000",
      "− sale Beto Efectivo · tenía $50.000",
      "Ana Banco: $100.000 → $80.000 (anticipo $0 → $20.000)",
      "Total: $150.000 → $110.000",
    ]);
    setSignerAlias("");
  });
});
