import { describe, it, expect } from "vitest";
import { estimateCashBreakdown, DEFAULT_AVAILABLE, isBill, cashWorkerGroupsOf, cashPiecesText, cashSummaryText, cashListText } from "./cashBreakdown";

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

describe("textos y grupos del estimador", () => {
  const own = [
    { rut: "1", name: "Zoe", groupLeader: "GRUPO B", amount: 15000 },
    { rut: "2", name: "Ana", groupLeader: "GRUPO B", amount: 37650 },
    { rut: "3", name: "Beto", groupLeader: "", amount: 5000 },
  ];
  const pending = [{ rut: "4", name: "Caro", groupLeader: "GRUPO A", amount: 20000, pendingFrom: "Nómina vieja" }];
  const allItems = [...own, ...pending];
  const est = estimateCashBreakdown(allItems, [10000, 5000, 1000, 500, 100]);
  const denominations = [...est.counts.keys()];

  it("agrupa por líder y deja al final, por nómina, a quienes vienen de otra; cada grupo por nombre", () => {
    const groups = cashWorkerGroupsOf(est, allItems);
    expect(groups.map((g) => [g.label, g.pending, g.rows.map((r) => r.name)])).toEqual([
      ["GRUPO B", false, ["Ana", "Zoe"]],
      ["Sin grupo", false, ["Beto"]],
      ["Pendiente de Nómina vieja", true, ["Caro"]],
    ]);
  });

  it("las piezas van de mayor a menor y sin las que no se usan", () => {
    expect(cashPiecesText({ 10000: 3, 5000: 1, 100: 2 }, denominations)).toBe("3 × $10.000 + 1 × $5.000 + 2 × $100");
    expect(cashPiecesText({}, denominations)).toBe("");
  });

  it("el resumen dice la nómina, lo pendiente de otras, el redondeo y las piezas alineadas", () => {
    const text = cashSummaryText({
      payrollName: "Nómina 1", allItems, est, usePending: true, ownTotal: 57650, extraTotal: 20000,
      pendingNote: "Incluye $20.000 de efectivo pendiente.", diff: est.totalNeeded - est.totalOriginal, denominations,
      totalPieces: [...est.counts.values()].reduce((s, v) => s + v, 0),
    });
    expect(text.split("\n")).toEqual([
      "💵 Estimación de efectivo — Nómina 1",
      "4 trabajador(es) · Total: $77.700",
      "Esta nómina: $57.650 · Pendiente de otras nóminas: $20.000",
      "Incluye $20.000 de efectivo pendiente.",
      "(Original $77.650 + redondeo $50)",
      "",
      "Billetes y monedas:",
      "    $10.000 billete ×    6 =     $60.000",
      "     $5.000 billete ×    3 =     $15.000",
      "     $1.000 billete ×    2 =      $2.000",
      "       $500  moneda ×    1 =        $500",
      "       $100  moneda ×    2 =        $200",
      "",
      "Total: 14 billetes/monedas · $77.700",
    ]);
  });

  it("la lista dice cuánto recibe cada uno, con el monto original si se redondeó", () => {
    const text = cashListText({
      payrollName: "Nómina 1", usePending: false, pendingNote: "", workerGroups: cashWorkerGroupsOf(est, allItems), est, denominations,
    });
    expect(text.split("\n")).toEqual([
      "💵 Efectivo por trabajador — Nómina 1",
      "",
      "GRUPO B",
      "  Ana: $37.700 (de $37.650) → 3 × $10.000 + 1 × $5.000 + 2 × $1.000 + 1 × $500 + 2 × $100",
      "  Zoe: $15.000 → 1 × $10.000 + 1 × $5.000",
      "",
      "Sin grupo",
      "  Beto: $5.000 → 1 × $5.000",
      "",
      "Pendiente de Nómina vieja",
      "  Caro: $20.000 → 2 × $10.000",
      "",
      "Total: 4 trabajador(es) · $77.700",
      "Billetes y monedas: 6 × $10.000 + 3 × $5.000 + 2 × $1.000 + 1 × $500 + 2 × $100",
    ]);
  });
});
