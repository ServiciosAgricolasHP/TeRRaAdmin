import { describe, it, expect } from "vitest";
import { clipboardColumn, copiedValue, pastedAmount, pasteWrites } from "./gridClipboard";
import { parseAmount } from "./formula";

describe("clipboardColumn", () => {
  it("separa las líneas y quita las vacías del final", () => {
    expect(clipboardColumn("25000\r\n30000\r\n\r\n")).toEqual(["25000", "30000"]);
  });

  it("de varias columnas usa la primera", () => {
    expect(clipboardColumn("1\tA\n2\tB")).toEqual(["1", "2"]);
  });

  it("conserva una línea vacía en medio, que deja esa celda en cero", () => {
    expect(clipboardColumn("1\n\n3")).toEqual(["1", "", "3"]);
  });

  it("sin texto no hay líneas", () => {
    expect(clipboardColumn("")).toEqual([]);
    expect(clipboardColumn(null)).toEqual([]);
  });
});

describe("pastedAmount", () => {
  it("saca el signo $ y los espacios de un monto copiado de Excel", () => {
    expect(parseAmount(pastedAmount("$ 25.000"))).toBe(25000);
    expect(parseAmount(pastedAmount("$25.000"))).toBe(25000);
    expect(parseAmount(pastedAmount("25 000"))).toBe(25000);
  });

  it("deja pasar una fórmula y un decimal con coma", () => {
    expect(parseAmount(pastedAmount("=100 + 50"))).toBe(150);
    expect(parseAmount(pastedAmount("12,5"))).toBe(12.5);
  });
});

describe("copiedValue", () => {
  it("copia un número sin miles y con coma decimal, y parseAmount lo vuelve a leer igual", () => {
    expect(copiedValue(25000)).toBe("25000");
    expect(copiedValue(12.5)).toBe("12,5");
    expect(parseAmount(copiedValue(12.5))).toBe(12.5);
    expect(parseAmount(copiedValue(1500000))).toBe(1500000);
  });

  it("copia vacío un cero o una celda sin valor", () => {
    expect(copiedValue(0)).toBe("");
    expect(copiedValue(null)).toBe("");
    expect(copiedValue(undefined)).toBe("");
  });

  it("copia un texto en una sola línea", () => {
    expect(copiedValue("Juan Pérez")).toBe("Juan Pérez");
    expect(copiedValue("a\tb\nc")).toBe("a b c");
  });
});

describe("pasteWrites", () => {
  const rows = [
    { id: "a" },
    { id: "h", header: true },
    { id: "b" },
    { id: "m", skip: true },
    { id: "c" },
  ];

  it("con varias celdas elegidas y un valor, lo pone en todas menos encabezados y sueldo mensual", () => {
    expect(pasteWrites(["25000"], rows, { fill: true })).toEqual([
      { id: "a", value: "25000" },
      { id: "b", value: "25000" },
      { id: "c", value: "25000" },
    ]);
  });

  it("sin selección, un valor va solo en la primera fila", () => {
    expect(pasteWrites(["25000"], rows)).toEqual([{ id: "a", value: "25000" }]);
  });

  it("varias líneas bajan saltando encabezados; el sueldo mensual consume la suya", () => {
    expect(pasteWrites(["1", "2", "3", "4"], rows)).toEqual([
      { id: "a", value: "1" },
      { id: "b", value: "2" },
      { id: "c", value: "4" },
    ]);
  });

  it("varias líneas con celdas elegidas bajan desde la primera, igual que sin selección", () => {
    expect(pasteWrites(["1", "2"], rows, { fill: true })).toEqual([
      { id: "a", value: "1" },
      { id: "b", value: "2" },
    ]);
  });

  it("se corta al terminar las filas", () => {
    expect(pasteWrites(["1", "2", "3"], [{ id: "a" }])).toEqual([{ id: "a", value: "1" }]);
  });

  it("sin líneas no escribe nada", () => {
    expect(pasteWrites([], rows, { fill: true })).toEqual([]);
  });
});
