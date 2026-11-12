import { describe, it, expect } from "vitest";
import { parseAmount, readAmount, cellAmountParser } from "./formula";

// Interpreta los montos que se escriben en la grilla del ciclo.
describe("parseAmount", () => {
  it("números y strings simples", () => {
    expect(parseAmount(1500)).toBe(1500);
    expect(parseAmount("1500")).toBe(1500);
    expect(parseAmount("  1500  ")).toBe(1500);
    expect(parseAmount(-200)).toBe(-200);
  });

  it("formato chileno con punto de miles y coma decimal", () => {
    expect(parseAmount("1.500")).toBe(1500);
    expect(parseAmount("1.500.000")).toBe(1500000);
    expect(parseAmount("1.500,25")).toBe(1500.25);
    expect(parseAmount("-1.500")).toBe(-1500);
  });

  it("coma decimal sin miles", () => {
    expect(parseAmount("1,5")).toBe(1.5);
  });

  it("punto decimal a la inglesa", () => {
    expect(parseAmount("1500.25")).toBe(1500.25);
  });

  it("fórmulas con =", () => {
    expect(parseAmount("=1500*3")).toBe(4500);
    expect(parseAmount("=1000+500")).toBe(1500);
    expect(parseAmount("=(1000+500)/2")).toBe(750);
    expect(parseAmount("= 100 * 2 ")).toBe(200);
  });

  it("una fórmula con letras se rechaza y da 0", () => {
    // El guard `/^[\d+\-*/().\s]+$/` es lo único que impide evaluar cualquier
    // cosa con Function().
    expect(parseAmount("=alert(1)")).toBe(0);
    expect(parseAmount("=process.exit()")).toBe(0);
    expect(parseAmount("=1500*a")).toBe(0);
  });

  it("una fórmula rota da 0 en vez de reventar", () => {
    expect(parseAmount("=1500*")).toBe(0);
    expect(parseAmount("=((1)")).toBe(0);
  });

  it("división por cero da 0 y no Infinity", () => {
    expect(parseAmount("=1/0")).toBe(0);
  });

  it("vacíos y basura dan 0", () => {
    for (const v of [null, undefined, "", "   ", "abc", NaN, Infinity]) {
      expect(parseAmount(v)).toBe(0);
    }
  });

  it("saca los espacios internos", () => {
    expect(parseAmount("1 500")).toBe(1500);
  });

  it("acepta el signo $", () => {
    expect(parseAmount("$25.000")).toBe(25000);
    expect(parseAmount("$ 25.000")).toBe(25000);
    expect(parseAmount("$25000")).toBe(25000);
  });
});

describe("readAmount y cellAmountParser", () => {
  it("lo que no se puede interpretar da null, y vacío da 0", () => {
    for (const v of ["abc", "25 mil", "12a", "=1500*", "=alert(1)", "-", NaN]) {
      expect(readAmount(v)).toBeNull();
    }
    expect(readAmount("")).toBe(0);
    expect(readAmount(null)).toBe(0);
  });

  it("una celda con algo mal escrito conserva su valor; vaciarla da 0", () => {
    expect(cellAmountParser({ newValue: "25 mil", oldValue: 30000 })).toBe(30000);
    expect(cellAmountParser({ newValue: "$25.000", oldValue: 30000 })).toBe(25000);
    expect(cellAmountParser({ newValue: "", oldValue: 30000 })).toBe(0);
  });
});
