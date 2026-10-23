import { describe, it, expect } from "vitest";
import { paymentInRange, carrierSummaryPayments, carrierSummaryGroups, carrierSummaryTotals } from "./carrierSummary";

const trip = (id, date, amount, extra = {}) => ({ id, date, qty: 1, amount, status: "pending", paymentId: null, ...extra });
const payment = (id, extra = {}) => ({ id, status: "pending", tripIds: [], abonos: [], payrollId: null, ...extra });

describe("paymentInRange", () => {
  it("entra si su período toca el rango", () => {
    const p = payment("P", { periodFrom: "2026-09-16", periodTo: "2026-09-30" });
    expect(paymentInRange(p, "2026-09-23", "2026-10-23")).toBe(true);
    expect(paymentInRange(p, "2026-10-01", "2026-10-23")).toBe(false);
    expect(paymentInRange(p, "", "2026-09-15")).toBe(false);
    expect(paymentInRange(p, "", "")).toBe(true);
  });

  it("sin período cuenta el día en que se pagó", () => {
    const paidAt = { toMillis: () => new Date(2026, 9, 13, 12).getTime() };
    expect(paymentInRange(payment("P", { paidAt }), "2026-10-01", "2026-10-31")).toBe(true);
    expect(paymentInRange(payment("P", { paidAt }), "2026-10-14", "")).toBe(false);
    expect(paymentInRange(payment("P"), "", "")).toBe(false);
  });
});

describe("carrierSummaryPayments", () => {
  const payments = [
    payment("pendiente", { periodFrom: "2026-08-01", periodTo: "2026-08-05" }),
    payment("pagadoEnAbierta", { status: "paid", payrollId: "QA", periodFrom: "2026-10-10", periodTo: "2026-10-12" }),
    payment("pagadoEnPagada", { status: "paid", payrollId: "QP", periodFrom: "2026-09-16", periodTo: "2026-09-30" }),
    payment("pagadoSueltoViejo", { status: "paid", periodFrom: "2026-08-01", periodTo: "2026-08-05" }),
  ];
  const openFortnightIds = new Set(["QA"]);
  const ids = (opts) => carrierSummaryPayments(payments, { openFortnightIds, ...opts }).map((p) => p.id);

  it("por defecto, lo pendiente y lo de las quincenas abiertas", () => {
    expect(ids({})).toEqual(["pendiente", "pagadoEnAbierta"]);
  });

  it("con lo pagado, suma lo que cae en el rango", () => {
    expect(ids({ includePaid: true, from: "2026-09-23", to: "2026-10-23" })).toEqual(["pendiente", "pagadoEnAbierta", "pagadoEnPagada"]);
    expect(ids({ includePaid: true, from: "", to: "" })).toHaveLength(4);
  });
});

describe("carrierSummaryGroups", () => {
  const trips = [
    trip("T1", "2026-10-01", 40000, { paymentId: "P1" }),
    trip("T2", "2026-10-02", 20000, { paymentId: "P1" }),
    trip("T3", "2026-10-05", 20000, { paymentId: "P2" }),
    trip("T7", "2026-10-10", 30000, { paymentId: "P4", status: "paid" }),
    trip("T0", "2026-09-20", 40000, { paymentId: "P0", status: "paid" }),
    trip("T9", "2026-10-09", 20000),
    trip("T8", "2026-10-08", 15000),
  ];
  const payments = [
    payment("P2", { tripIds: ["T3"], periodFrom: "2026-10-05", periodTo: "2026-10-05" }),
    payment("P4", { tripIds: ["T7"], payrollId: "QA", status: "paid", periodFrom: "2026-10-10", periodTo: "2026-10-12" }),
    payment("P1", {
      tripIds: ["T2", "T1"], payrollId: "QA", periodFrom: "2026-10-01", periodTo: "2026-10-02",
      abonos: [{ id: "a", amount: 10000, date: "2026-10-04" }],
    }),
    payment("P0", { tripIds: ["T0"], payrollId: "QP", status: "paid", periodFrom: "2026-09-16", periodTo: "2026-09-30" }),
  ];
  const fortnightsById = new Map([
    ["QA", { id: "QA", name: "Primera Octubre", periodFrom: "2026-10-01", periodTo: "2026-10-15", status: "pending" }],
    ["QP", { id: "QP", name: "Segunda Septiembre", periodFrom: "2026-09-16", periodTo: "2026-09-30", status: "paid" }],
  ]);
  const groups = carrierSummaryGroups({ payments, fortnightsById, trips });

  it("ordena las quincenas por período, después lo suelto y al final las vueltas sin resumen", () => {
    expect(groups.map((g) => [g.title, g.kind, g.fortnightStatus])).toEqual([
      ["Segunda Septiembre", "fortnight", "paid"],
      ["Primera Octubre", "fortnight", "open"],
      ["Sin quincena", "loose", null],
      ["Vueltas sin resumen", "unlinked", null],
    ]);
  });

  it("una quincena abierta junta lo pendiente y lo pagado, con los abonos como pagado", () => {
    const g = groups[1];
    expect(g.summaries.map((s) => s.payment.id)).toEqual(["P1", "P4"]);
    expect(g.summaries[0].trips.map((t) => t.id)).toEqual(["T1", "T2"]);
    expect([g.summaries[0].total, g.summaries[0].paid, g.summaries[0].pending]).toEqual([60000, 10000, 50000]);
    expect([g.summaries[1].total, g.summaries[1].paid, g.summaries[1].pending]).toEqual([30000, 30000, 0]);
    expect([g.total, g.paid, g.pending]).toEqual([90000, 40000, 50000]);
    expect([g.periodFrom, g.periodTo]).toEqual(["2026-10-01", "2026-10-15"]);
  });

  it("las vueltas sin resumen van por fecha y quedan pendientes enteras", () => {
    const g = groups[3];
    expect(g.trips.map((t) => t.id)).toEqual(["T8", "T9"]);
    expect([g.total, g.paid, g.pending]).toEqual([35000, 0, 35000]);
    expect([g.periodFrom, g.periodTo]).toEqual(["2026-10-08", "2026-10-09"]);
  });

  it("los totales suman los grupos", () => {
    expect(carrierSummaryTotals(groups)).toEqual({ total: 185000, paid: 80000, pending: 105000, qty: 7 });
  });

  it("un abono mayor que el total no deja un pendiente negativo", () => {
    const [g] = carrierSummaryGroups({
      payments: [payment("P", { tripIds: ["T"], abonos: [{ amount: 50000 }] })],
      trips: [trip("T", "2026-10-01", 30000, { paymentId: "P" })],
    });
    expect([g.paid, g.pending]).toEqual([30000, 0]);
  });

  it("una quincena que ya no existe se rotula como eliminada", () => {
    const [g] = carrierSummaryGroups({
      payments: [payment("P", { tripIds: ["T"], payrollId: "QX" })],
      trips: [trip("T", "2026-10-01", 30000, { paymentId: "P" })],
    });
    expect([g.title, g.fortnightStatus]).toEqual(["Quincena eliminada", "missing"]);
  });

  it("una vuelta pagada o con resumen no cuenta como vuelta sin resumen", () => {
    const out = carrierSummaryGroups({
      payments: [],
      trips: [trip("A", "2026-10-01", 1000, { paymentId: "PX" }), trip("B", "2026-10-02", 1000, { status: "paid" })],
    });
    expect(out).toEqual([]);
  });
});
