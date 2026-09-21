import { describe, it, expect } from "vitest";
import {
  tripsService,
  paymentsService,
  transportPayrollsService,
} from "../../src/services/transportsService";
import { set, get } from "./helpers/seed";

const CARRIER = "carrier-1";

async function seedCarrier() {
  await set("carriers", CARRIER, {
    alias: "Don Pedro",
    name: "Pedro Soto",
    type: "contracted",
    vehicles: [{ alias: "Camión 1" }],
    deleted: false,
  });
}

const nuevaVuelta = (over = {}) =>
  tripsService.create({
    carrierId: CARRIER,
    vehicleAlias: "Camión 1",
    cycleId: "ciclo-1",
    faenaId: "faena-1",
    subfaenaId: "sub-1",
    date: "2026-03-02",
    kind: "regular",
    qty: 2,
    rate: 50000,
    status: "pending",
    ...over,
  });

describe("propagación de totales de transporte", () => {
  it("el monto de una vuelta es cantidad por tarifa", async () => {
    await seedCarrier();
    const t = await nuevaVuelta({ qty: 3, rate: 40000 });
    expect(t.amount).toBe(120000);
  });

  it("el resumen suma sus vueltas", async () => {
    await seedCarrier();
    const a = await nuevaVuelta({ qty: 2, rate: 50000 }); // 100.000
    const b = await nuevaVuelta({ qty: 1, rate: 30000 }); // 30.000

    const resumen = await paymentsService.createSummary({
      carrierId: CARRIER,
      periodFrom: "2026-03-01",
      periodTo: "2026-03-31",
      tripIds: [a.id, b.id],
      total: 130000,
    });
    expect((await get("transportPayments", resumen.id)).total).toBe(130000);
  });

  it("editar una vuelta refresca el total del resumen solo", async () => {
    // Esta cadena vive en el servicio justamente porque las pantallas se
    // olvidaban de llamarla y el balance quedaba descuadrado en silencio.
    await seedCarrier();
    const a = await nuevaVuelta({ qty: 2, rate: 50000 });
    const resumen = await paymentsService.createSummary({
      carrierId: CARRIER,
      periodFrom: "2026-03-01",
      periodTo: "2026-03-31",
      tripIds: [a.id],
      total: 100000,
    });

    await tripsService.update(a.id, { paymentId: resumen.id, qty: 4, rate: 50000 });

    expect((await get("transportPayments", resumen.id)).total).toBe(200000);
  });

  it("la quincena se refresca en cascada cuando cambia una vuelta", async () => {
    await seedCarrier();
    const a = await nuevaVuelta({ qty: 2, rate: 50000 });
    const resumen = await paymentsService.createSummary({
      carrierId: CARRIER,
      periodFrom: "2026-03-01",
      periodTo: "2026-03-31",
      tripIds: [a.id],
      total: 100000,
    });
    const quincena = await transportPayrollsService.create({
      name: "Quincena marzo",
      periodFrom: "2026-03-01",
      periodTo: "2026-03-31",
      paymentIds: [resumen.id],
    });

    await tripsService.update(a.id, { paymentId: resumen.id, qty: 1, rate: 50000 });

    expect((await get("transportPayments", resumen.id)).total).toBe(50000);
    expect((await get("transportPayrolls", quincena.id)).total).toBe(50000);
  });

  it("borrar una vuelta la saca del total y del array de ids", async () => {
    // Si el id queda colgado, el conteo de vueltas del resumen miente.
    await seedCarrier();
    const a = await nuevaVuelta({ qty: 2, rate: 50000 });
    const b = await nuevaVuelta({ qty: 1, rate: 30000 });
    const resumen = await paymentsService.createSummary({
      carrierId: CARRIER,
      periodFrom: "2026-03-01",
      periodTo: "2026-03-31",
      tripIds: [a.id, b.id],
      total: 130000,
    });
    await tripsService.update(a.id, { paymentId: resumen.id });
    await tripsService.update(b.id, { paymentId: resumen.id });

    await tripsService.remove(b.id);

    const r = await get("transportPayments", resumen.id);
    expect(r.total).toBe(100000);
    expect(r.tripIds).not.toContain(b.id);
  });
});

describe("congelado al pagar", () => {
  it("no se puede editar ni borrar una vuelta pagada", async () => {
    await seedCarrier();
    const a = await nuevaVuelta({ status: "paid" });
    await expect(tripsService.update(a.id, { qty: 9 })).rejects.toThrow(/pagada/i);
    await expect(tripsService.remove(a.id)).rejects.toThrow(/pagada/i);
  });

  it("marcar pagado el resumen pasa sus vueltas a pagadas", async () => {
    await seedCarrier();
    const a = await nuevaVuelta({ qty: 2, rate: 50000 });
    const resumen = await paymentsService.createSummary({
      carrierId: CARRIER,
      periodFrom: "2026-03-01",
      periodTo: "2026-03-31",
      tripIds: [a.id],
      total: 100000,
    });
    await tripsService.update(a.id, { paymentId: resumen.id });

    await paymentsService.markPaid(resumen.id);

    expect((await get("transportPayments", resumen.id)).status).toBe("paid");
    expect((await get("transports", a.id)).status).toBe("paid");
  });

  it("un resumen pagado ya no recalcula su total", async () => {
    // El early-return por status paid es lo que congela el documento.
    await seedCarrier();
    const a = await nuevaVuelta({ qty: 2, rate: 50000 });
    const resumen = await paymentsService.createSummary({
      carrierId: CARRIER,
      periodFrom: "2026-03-01",
      periodTo: "2026-03-31",
      tripIds: [a.id],
      total: 100000,
    });
    await tripsService.update(a.id, { paymentId: resumen.id });
    await paymentsService.markPaid(resumen.id);

    // Ya no se puede tocar la vuelta, así que el total queda como estaba.
    await expect(tripsService.update(a.id, { qty: 99 })).rejects.toThrow();
    expect((await get("transportPayments", resumen.id)).total).toBe(100000);
  });
});
