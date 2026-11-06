import { describe, it, expect } from "vitest";
import { setPaymentStatusMany } from "../../src/services/dtePaymentStatus";
import { syncDteDocuments } from "../../src/services/dteDocumentsList";
import { set, get, all } from "./helpers/seed";

// Marcar varias facturas de una vez desde la pestaña Pendientes, como
// "✓ Septiembre pagado": cambia el estado de cada una, pone `updatedAt` para
// la lista de los demás equipos, corrige la de este y deja un solo registro de
// auditoría con el estado que tenía cada una.

const factura = (folio, extra = {}) => ({
  companyId: "E1", kind: "venta", tipo: 33, folio, fechaEmision: "2026-09-10", periodo: "2026-09",
  rutReceptor: "77111111-1", razonSocialReceptor: "Cliente Uno", neto: 1000, iva: 190, total: 1190,
  paymentStatus: "net_only", amountPaid: 1000, payments: [], ...extra,
});

describe("marcar varias facturas de una vez", () => {
  it("cambia el estado de las elegidas, con un solo registro, y no toca las demás", async () => {
    await set("dteDocuments", "d1", factura(101));
    await set("dteDocuments", "d2", factura(102, { paymentStatus: "unpaid", amountPaid: 0 }));
    await set("dteDocuments", "d3", factura(103));
    const { data: antes } = await syncDteDocuments();
    const elegidas = antes.filter((d) => d.id !== "d3");

    await setPaymentStatusMany(elegidas, "paid");

    expect((await get("dteDocuments", "d1")).paymentStatus).toBe("paid");
    expect((await get("dteDocuments", "d2")).paymentStatus).toBe("paid");
    expect((await get("dteDocuments", "d3")).paymentStatus).toBe("net_only");
    expect((await get("dteDocuments", "d1")).updatedAt).toBeTruthy();

    const logs = (await all("logs")).filter((l) => l.action === "paymentStatusBatch");
    expect(logs).toHaveLength(1);
    expect(logs[0].meta).toMatchObject({ status: "paid", count: 2 });
    expect(logs[0].meta.docs.map((d) => [d.folio, d.before]).sort()).toEqual([[101, "net_only"], [102, "unpaid"]]);

    // La lista de este equipo queda corregida sin releer.
    const { data: despues, reads } = await syncDteDocuments();
    expect(despues.find((d) => d.id === "d2").paymentStatus).toBe("paid");
    expect(despues.find((d) => d.id === "d3").paymentStatus).toBe("net_only");
    expect(reads).toBeLessThanOrEqual(2);
  });

  it("sin facturas no escribe nada", async () => {
    await setPaymentStatusMany([], "paid");
    expect((await all("logs")).filter((l) => l.action === "paymentStatusBatch")).toHaveLength(0);
  });
});
