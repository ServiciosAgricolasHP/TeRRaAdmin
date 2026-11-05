import { describe, it, expect } from "vitest";
import { payoffOf } from "./transportPayoff";

const paidAt = { toDate: () => new Date(2026, 9, 20, 12) };

describe("payoffOf", () => {
  it("un resumen pagado con abonos se liquida por lo que faltaba, el día del pago", () => {
    const p = { status: "paid", total: 150000, paidAt, abonos: [{ amount: 50000 }, { amount: 30000 }] };
    expect(payoffOf(p)).toEqual({ amount: 70000, date: "2026-10-20" });
  });

  it("uno pagado sin abonos se liquida entero", () => {
    expect(payoffOf({ status: "paid", total: 90000, paidAt })).toEqual({ amount: 90000, date: "2026-10-20" });
  });

  it("uno pendiente, o pagado con los abonos cubriendo el total, no tiene liquidación", () => {
    expect(payoffOf({ status: "pending", total: 150000, abonos: [{ amount: 50000 }] })).toBeNull();
    expect(payoffOf({ status: "paid", total: 100, paidAt, abonos: [{ amount: 100 }] })).toBeNull();
    expect(payoffOf({ status: "paid", total: 100, paidAt, abonos: [{ amount: 120 }] })).toBeNull();
  });

  it("usa los abonos y el total que se le pasan, y la fecha guardada en el navegador", () => {
    const p = { status: "paid", total: 999, paidAt: { seconds: new Date(2026, 9, 21, 12).getTime() / 1000 }, abonos: [] };
    expect(payoffOf(p, { abonos: [{ amount: "40" }], total: 100 })).toEqual({ amount: 60, date: "2026-10-21" });
  });

  it("sin fecha de pago, la liquidación va sin día", () => {
    expect(payoffOf({ status: "paid", total: 10 })).toEqual({ amount: 10, date: "" });
  });
});
