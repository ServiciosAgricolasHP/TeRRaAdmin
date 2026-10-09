import { describe, it, expect } from "vitest";
import { currentRutResolver } from "./workerRut";

const workers = [
  { id: "11111111-1", rut: "11111111-1" },
  // Cédula provisoria corregida: la ficha conserva el id original.
  { id: "22222222-B", rut: "15555555-5" },
  // Ficha vieja sin el campo `rut`.
  { id: "33333333-3" },
];

describe("currentRutResolver", () => {
  const rutOf = currentRutResolver(workers);

  it("devuelve el rut vigente de una ficha con el rut corregido", () => {
    expect(rutOf("22222222-B")).toBe("15555555-5");
  });

  it("prefiere el workerId al rut guardado", () => {
    expect(rutOf("22222222-B", "22222222-B")).toBe("15555555-5");
    expect(rutOf("cualquier-cosa", "22222222-B")).toBe("15555555-5");
  });

  it("deja igual a quien no cambió de rut", () => {
    expect(rutOf("11111111-1")).toBe("11111111-1");
  });

  it("usa el id cuando la ficha no tiene el campo rut", () => {
    expect(rutOf("33333333-3")).toBe("33333333-3");
  });

  it("sin ficha devuelve el rut guardado", () => {
    expect(rutOf("99999999-9")).toBe("99999999-9");
    expect(rutOf(undefined)).toBe("");
  });

  it("funciona sin lista de trabajadores", () => {
    expect(currentRutResolver(undefined)("22222222-B")).toBe("22222222-B");
  });
});
