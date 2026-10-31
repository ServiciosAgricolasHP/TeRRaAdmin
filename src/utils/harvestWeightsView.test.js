import { describe, expect, it } from "vitest";
import { groupDayByWorker, resolveQrSearch, weightsView } from "./harvestWeightsView";

const workers = [
  { id: "W1", rut: "11111111-1", name: "Ana", idQr: ["A001"] },
  { id: "W2", rut: "22222222-2", name: "Beto", idQr: [] },
];
const weights = [
  { id: "p1", dateKey: "2026-10-05", prefix: "P1", rut: "W1", amount: 10, weightProcess: 1, weightType: 2, idQr: "A001" },
  { id: "p2", dateKey: "2026-10-05", prefix: "P1", rut: "W2", amount: 4, weightProcess: 1, weightType: 2, idQr: "B007" },
  { id: "p3", dateKey: "2026-10-06", prefix: "P2", rut: "W1", amount: 6, weightProcess: 2, weightType: 2, idQr: "A001" },
  { id: "p4", dateKey: "2026-10-06", prefix: "P1", rut: "W2", amount: 1, weightProcess: 1, weightType: 3, idQr: "B007" },
  { id: "p5", prefix: "P1", rut: "W2", amount: 99 },
];
const catalogs = {
  qualities: [{ value: 1, label: "Primera" }, { value: 5, label: "Segunda" }],
  containers: [{ value: 2, label: "Kilos" }, { value: 3, label: "Bandeja" }],
};
// El prefijo P2 traduce la calidad 2 de la app a la 5 del catálogo.
const prefixById = new Map([["P1", { id: "P1" }], ["P2", { id: "P2", qualityMap: { 2: 5 } }]]);
const workerNames = new Map([["W1", "Ana"], ["W2", "Beto"]]);
const rutOf = (rut) => `rut:${rut}`;
const base = { catalogs, prefixById, prefixFilter: "", qrMatch: null, rutOf, search: "", workerNames };

describe("resolveQrSearch", () => {
  it("sin búsqueda no resuelve nada", () => {
    expect(resolveQrSearch("  ", workers, weights)).toBeNull();
  });

  it("un QR asignado resuelve a su dueño, sin distinguir mayúsculas", () => {
    const m = resolveQrSearch(" a001 ", workers, weights);
    expect(m.code).toBe("A001");
    expect(m.owners.map((o) => o.id)).toEqual(["W1"]);
    expect([...m.keys].sort()).toEqual(["11111111-1", "W1"]);
    expect(m.freed).toBeUndefined();
  });

  it("un QR liberado se resuelve por los pesajes que lo anotaron", () => {
    const m = resolveQrSearch("B007", workers, weights);
    expect(m.freed).toBe(true);
    expect(m.owners.map((o) => o.id)).toEqual(["W2"]);
    expect(m.keys.has("22222222-2")).toBe(true);
  });

  it("un QR que nadie usó no resuelve", () => {
    expect(resolveQrSearch("Z999", workers, weights)).toBeNull();
  });
});

describe("weightsView", () => {
  it("salta los pesajes sin fecha y suma por combo del catálogo", () => {
    const v = weightsView(weights, base);
    expect(v.count).toBe(4);
    expect(v.daysCount).toBe(2);
    expect(v.workersCount).toBe(2);
    expect(v.comboList.map((c) => [c.label, c.qty, c.count])).toEqual([
      ["Primera / Kilos", 14, 2],
      ["Primera / Bandeja", 1, 1],
      ["Segunda / Kilos", 6, 1],
    ]);
  });

  it("filtra por prefijo", () => {
    const v = weightsView(weights, { ...base, prefixFilter: "P2" });
    expect(v.detail.map((d) => d.id)).toEqual(["p3"]);
  });

  it("la búsqueda mira el RUT, el RUT vigente y el nombre", () => {
    expect(weightsView(weights, { ...base, search: "beto" }).detail.map((d) => d.id)).toEqual(["p2", "p4"]);
    expect(weightsView(weights, { ...base, search: "rut:w1" }).detail.map((d) => d.id)).toEqual(["p1", "p3"]);
  });

  it("con un QR resuelto filtra por las llaves de su dueño", () => {
    const qrMatch = resolveQrSearch("A001", workers, weights);
    expect(weightsView(weights, { ...base, qrMatch, search: "A001" }).detail.map((d) => d.id)).toEqual(["p1", "p3"]);
  });

  it("agrupa por trabajador y por día, los días del más nuevo al más viejo", () => {
    const v = weightsView(weights, base);
    expect(v.byWorker.map((g) => [g.name, g.count, g.days.size])).toEqual([["Ana", 2, 2], ["Beto", 2, 2]]);
    expect(v.byDay.map((g) => [g.date, g.count, g.entries.map((e) => e.name)])).toEqual([
      ["2026-10-06", 2, ["Ana", "Beto"]],
      ["2026-10-05", 2, ["Ana", "Beto"]],
    ]);
    const ana = v.byWorker[0];
    expect(Object.fromEntries(ana.qtyByCombo)).toEqual({ "1_2": 10, "5_2": 6 });
  });
});

describe("groupDayByWorker", () => {
  it("subtotal solo cuando todos los pesajes son del mismo combo", () => {
    const groups = groupDayByWorker([
      { rut: "W2", name: "Beto", x: 1, y: 2, qty: 4 },
      { rut: "W1", name: "Ana", x: 1, y: 2, qty: 10 },
      { rut: "W1", name: "Ana", x: 1, y: 2, qty: 5 },
      { rut: "W2", name: "Beto", x: 1, y: 3, qty: 1 },
    ]);
    expect(groups.map((g) => [g.name, g.entries.length, g.total])).toEqual([["Ana", 2, 15], ["Beto", 2, null]]);
  });
});
