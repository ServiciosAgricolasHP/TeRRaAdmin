import { describe, it, expect } from "vitest";
import { estimateCashBreakdown, DEFAULT_AVAILABLE, isBill } from "./cashBreakdown";

const item = (amount, rut = "1-9") => ({ rut, name: rut, amount });
const total = (counts) => [...counts].reduce((s, [d, n]) => s + d * n, 0);

describe("estimateCashBreakdown", () => {
  it("con lo disponible por defecto, redondea a $100 y usa los billetes más grandes", () => {
    const est = estimateCashBreakdown([item(37650)], DEFAULT_AVAILABLE);
    expect(est.perWorker[0]).toMatchObject({ original: 37650, rounded: 37700, delta: 50 });
    expect(est.perWorker[0].breakdown).toEqual({ 10000: 3, 5000: 1, 1000: 2, 500: 1, 100: 2 });
    expect([...est.counts.keys()]).toEqual([10000, 5000, 1000, 500, 100]);
    expect(total(est.counts)).toBe(est.totalNeeded);
  });

  it("con billetes de $20.000 los usa, y las denominaciones sin uso quedan en 0", () => {
    const est = estimateCashBreakdown([item(45000)], [20000, 10000, 5000, 1000]);
    expect(est.perWorker[0].breakdown).toEqual({ 20000: 2, 5000: 1 });
    expect(est.counts.get(10000)).toBe(0);
  });

  it("sin monedas, redondea hacia arriba a lo que se puede armar con billetes", () => {
    const est = estimateCashBreakdown([item(12300)], [10000, 5000, 1000]);
    expect(est.perWorker[0]).toMatchObject({ rounded: 13000, delta: 700 });
    expect(est.perWorker[0].breakdown).toEqual({ 10000: 1, 1000: 3 });
  });

  it("arma montos que de mayor a menor no calzan", () => {
    // Con $5.000 y $2.000: $6.000 son tres de $2.000, no $5.000 y un resto.
    const est = estimateCashBreakdown([item(6000)], [5000, 2000]);
    expect(est.perWorker[0]).toMatchObject({ rounded: 6000, delta: 0 });
    expect(est.perWorker[0].breakdown).toEqual({ 2000: 3 });
  });

  it("si un monto no se puede armar justo, sube al siguiente que sí", () => {
    // Con $5.000 y $2.000, $3.000 no se arma: el siguiente es $4.000.
    const est = estimateCashBreakdown([item(3000)], [5000, 2000]);
    expect(est.perWorker[0]).toMatchObject({ rounded: 4000, delta: 1000 });
    expect(est.perWorker[0].breakdown).toEqual({ 2000: 2 });
  });

  it("usa la menor cantidad de piezas", () => {
    const est = estimateCashBreakdown([item(40000)], [20000, 10000]);
    expect(est.perWorker[0].breakdown).toEqual({ 20000: 2 });
  });

  it("suma los totales de todos y cuadra con las piezas", () => {
    const est = estimateCashBreakdown([item(10000, "a"), item(2350, "b"), item(0, "c")], DEFAULT_AVAILABLE);
    expect(est.totalOriginal).toBe(12350);
    expect(est.totalNeeded).toBe(12400);
    expect(total(est.counts)).toBe(12400);
    expect(est.perWorker.find((w) => w.rut === "c")).toMatchObject({ rounded: 0, breakdown: {} });
  });

  it("sin nada disponible no arma nada", () => {
    const est = estimateCashBreakdown([item(5000)], []);
    expect(est).toMatchObject({ totalNeeded: 0, totalOriginal: 0, perWorker: [] });
    expect(est.counts.size).toBe(0);
  });
});

describe("isBill", () => {
  it("distingue billetes de monedas", () => {
    expect(isBill(2000)).toBe(true);
    expect(isBill(500)).toBe(false);
  });
});
