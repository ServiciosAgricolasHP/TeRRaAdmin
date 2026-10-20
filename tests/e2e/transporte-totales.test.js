import { describe, it, expect } from "vitest";
import {
  tripsService,
  paymentsService,
  fortnightsService,
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
    // La propagación vive en el servicio: las pantallas no recalculan totales.
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
    const fortnight = await fortnightsService.create({
      name: "Quincena marzo",
      periodFrom: "2026-03-01",
      periodTo: "2026-03-31",
      paymentIds: [resumen.id],
    });

    await tripsService.update(a.id, { paymentId: resumen.id, qty: 1, rate: 50000 });

    expect((await get("transportPayments", resumen.id)).total).toBe(50000);
    expect((await get("transportPayrolls", fortnight.id)).total).toBe(50000);
  });

  it("borrar una vuelta la saca del total y del array de ids", async () => {
    // El conteo de vueltas del resumen sale de `tripIds`.
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

describe("resúmenes y quincenas que se quedan vacíos", () => {
  // Arma una vuelta dentro de un resumen, y el resumen dentro de una quincena.
  async function tripInFortnight({ otrosResumenes = [] } = {}) {
    await seedCarrier();
    const v = await nuevaVuelta({ qty: 1, rate: 40000 });
    const resumen = await paymentsService.createSummary({
      carrierId: CARRIER,
      periodFrom: "2026-03-01",
      periodTo: "2026-03-15",
      tripIds: [v.id],
      total: 40000,
    });
    await tripsService.update(v.id, { paymentId: resumen.id });
    const fortnight = await fortnightsService.create({
      name: "Quincena marzo",
      periodFrom: "2026-03-01",
      periodTo: "2026-03-15",
      paymentIds: [resumen.id, ...otrosResumenes],
    });
    return { v, resumen, fortnight };
  }

  it("borrar la única vuelta elimina el resumen y la quincena que quedó vacía", async () => {
    const { v, resumen, fortnight } = await tripInFortnight();

    await tripsService.remove(v.id);

    expect(await get("transportPayments", resumen.id)).toBe(null);
    expect(await get("transportPayrolls", fortnight.id)).toBe(null);
  });

  it("si la quincena tiene otros resúmenes, solo sale el vacío", async () => {
    await seedCarrier();
    const otra = await nuevaVuelta({ qty: 1, rate: 25000, date: "2026-03-03" });
    const otroResumen = await paymentsService.createSummary({
      carrierId: CARRIER,
      periodFrom: "2026-03-01",
      periodTo: "2026-03-15",
      tripIds: [otra.id],
      total: 25000,
    });
    await tripsService.update(otra.id, { paymentId: otroResumen.id });
    const { v, resumen, fortnight } = await tripInFortnight({ otrosResumenes: [otroResumen.id] });

    await tripsService.remove(v.id);

    expect(await get("transportPayments", resumen.id)).toBe(null);
    const q = await get("transportPayrolls", fortnight.id);
    expect(q.paymentIds).toEqual([otroResumen.id]);
    expect(q.total).toBe(25000);
  });

  it("un resumen con abonos no se elimina aunque se quede sin vueltas", async () => {
    // Los abonos son pagos ya hechos: borrar el resumen los perdería.
    const { v, resumen, fortnight } = await tripInFortnight();
    await paymentsService.addAbono(resumen.id, { amount: 10000, date: "2026-03-05" });

    await tripsService.remove(v.id);

    const r = await get("transportPayments", resumen.id);
    expect(r).not.toBe(null);
    expect(r.tripIds).toEqual([]);
    expect(r.total).toBe(0);
    expect(await get("transportPayrolls", fortnight.id)).not.toBe(null);
  });

  it("un abono se corrige sin perder su identidad", async () => {
    const { resumen } = await tripInFortnight();
    const conAbono = await paymentsService.addAbono(resumen.id, { amount: 10000, date: "2026-03-05", notes: "efectivo" });
    const original = conAbono.abonos[0];

    await paymentsService.updateAbono(resumen.id, original.id, { amount: 15000, notes: "TRANSFERENCIA" });

    const [editado] = (await get("transportPayments", resumen.id)).abonos;
    expect(editado.id).toBe(original.id);
    expect(editado.createdAt).toBe(original.createdAt);
    expect(editado.amount).toBe(15000);
    expect(editado.date).toBe("2026-03-05");
    expect(editado.notes).toBe("Transferencia");
    await expect(paymentsService.updateAbono(resumen.id, original.id, { amount: 0 })).rejects.toThrow(/mayor a 0/);
  });

  it("eliminar un resumen lo saca de su quincena", async () => {
    await seedCarrier();
    const otra = await nuevaVuelta({ qty: 1, rate: 25000, date: "2026-03-03" });
    const otroResumen = await paymentsService.createSummary({
      carrierId: CARRIER,
      periodFrom: "2026-03-01",
      periodTo: "2026-03-15",
      tripIds: [otra.id],
      total: 25000,
    });
    const { resumen, fortnight } = await tripInFortnight({ otrosResumenes: [otroResumen.id] });

    await paymentsService.deleteSummary(resumen.id);

    const q = await get("transportPayrolls", fortnight.id);
    expect(q.paymentIds).toEqual([otroResumen.id]);
    expect(q.total).toBe(25000);
  });

  it("eliminar el único resumen de una quincena elimina la quincena", async () => {
    const { v, resumen, fortnight } = await tripInFortnight();

    await paymentsService.deleteSummary(resumen.id);

    expect(await get("transportPayrolls", fortnight.id)).toBe(null);
    // La vuelta sigue existiendo, suelta.
    expect((await get("transports", v.id))?.paymentId ?? null).toBe(null);
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
