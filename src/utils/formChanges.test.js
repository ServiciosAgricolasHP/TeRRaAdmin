import { describe, it, expect } from "vitest";
import { hasChanges, sameValue } from "./formChanges";

describe("hasChanges", () => {
  it("sin cambios cuando el formulario quedó igual", () => {
    const before = { name: "Juan Pérez", amount: 150000, tags: ["a"], bank: { code: "012" } };
    expect(hasChanges(before, { ...before, tags: ["a"], bank: { code: "012" } })).toBe(false);
  });

  it("detecta un campo editado", () => {
    expect(hasChanges({ name: "Juan" }, { name: "Juana" })).toBe(true);
  });

  it("un número y su texto valen lo mismo (los inputs devuelven texto)", () => {
    expect(hasChanges({ amount: 150000 }, { amount: "150000" })).toBe(false);
    expect(hasChanges({ amount: 150000 }, { amount: "1500000" })).toBe(true);
  });

  it("vacío, null, undefined, false y lista vacía valen lo mismo", () => {
    expect(hasChanges({ notes: "" }, { notes: null })).toBe(false);
    expect(hasChanges({}, { issueDate: "", flag: false, list: [], extra: {} })).toBe(false);
    expect(hasChanges({ flag: true }, { flag: false })).toBe(true);
  });

  it("escribir y borrar un campo nuevo no cuenta como cambio", () => {
    expect(hasChanges({ name: "Juan" }, { name: "Juan", email: "" })).toBe(false);
  });

  it("los espacios en los bordes no cuentan", () => {
    expect(hasChanges({ name: "Juan" }, { name: "Juan " })).toBe(false);
  });

  it("el cero no es vacío", () => {
    expect(hasChanges({ price: 0 }, { price: "" })).toBe(true);
  });

  it("compara listas y objetos anidados", () => {
    expect(hasChanges({ accounts: [{ number: "1" }] }, { accounts: [{ number: "2" }] })).toBe(true);
    expect(hasChanges({ accounts: [{ number: "1" }] }, { accounts: [{ number: "1" }, { number: "3" }] })).toBe(true);
    expect(hasChanges({ accounts: [{ number: "1" }, { number: "3" }] }, { accounts: [{ number: "1" }] })).toBe(true);
  });

  it("una fila agregada y dejada en blanco no cuenta", () => {
    expect(hasChanges({ accounts: [{ number: "1" }] }, { accounts: [{ number: "1" }, { number: "" }] })).toBe(false);
    expect(hasChanges({ accounts: [] }, { accounts: [{ number: "" }] })).toBe(false);
  });

  it("ignora las claves pedidas", () => {
    expect(hasChanges({ name: "Juan" }, { name: "Juan", bd_prevBankCode: "012" }, { ignore: ["bd_prevBankCode"] })).toBe(false);
  });

  it("sin formulario no hay cambios", () => {
    expect(hasChanges(null, { name: "Juan" })).toBe(false);
  });
});

describe("sameValue", () => {
  it("una lista no es igual a un texto", () => {
    expect(sameValue(["a"], "a")).toBe(false);
  });
});
