import { describe, it, expect } from "vitest";
import { buildFeeListItems, feeItem, feeListTotals, itemsByFaena, missingAddress, rutParts } from "./feeLists";

const workersById = new Map([
  ["w1", { id: "w1", rut: "11111111-1", name: "Ana Pérez", address: "Pasaje 1", commune: "Osorno" }],
  ["w2", { id: "w2", rut: "12345678-5", name: "Beto Soto" }],
]);
const faenaNameOf = (id) => ({ aguada: "La Aguada", lingues: "Los Lingues" })[id] || "";

describe("lista de honorarios", () => {
  const items = buildFeeListItems(
    [
      { workerId: "w2", faenaId: "lingues", days: 2 },
      { workerId: "w1", faenaId: "lingues", days: 1 },
      { workerId: "w1", faenaId: "aguada", days: 3 },
    ],
    { workersById, faenaNameOf, dailyNet: 18452, rate: 0.1525 },
  );

  it("arma una fila por persona y faena con los datos de la ficha y los montos", () => {
    expect(items.map((it) => [it.faenaName, it.name, it.days, it.gross, it.net])).toEqual([
      ["La Aguada", "Ana Pérez", 3, 65316, 55356],
      ["Los Lingues", "Ana Pérez", 1, 21772, 18452],
      ["Los Lingues", "Beto Soto", 2, 43544, 36904],
    ]);
    expect(items[0]).toMatchObject({ rut: "11111111-1", address: "Pasaje 1", commune: "Osorno", issued: false, folio: "" });
  });

  it("recalcula con otra tarifa y suma los totales", () => {
    expect(feeItem({ days: 2 }, 20000, 0.16)).toMatchObject({ net: 40000, gross: 47620, withholding: 7620 });
    expect(feeListTotals(items)).toEqual({ people: 2, days: 6, gross: 130632, withholding: 19920, net: 110712, issued: 0, count: 3 });
  });

  it("agrupa por faena y avisa quién no tiene dirección", () => {
    const groups = itemsByFaena(items);
    expect(groups.map((g) => [g.faenaName, g.items.length, g.totals.gross])).toEqual([
      ["La Aguada", 1, 65316],
      ["Los Lingues", 2, 65316],
    ]);
    expect(missingAddress(items)).toEqual(["Beto Soto"]);
  });

  it("separa el RUT y su dígito como la planilla", () => {
    expect(rutParts("12.345.678-k")).toEqual(["12345678", "K"]);
    expect(rutParts("12345678")).toEqual(["12345678", ""]);
  });
});
