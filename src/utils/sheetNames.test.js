import { describe, it, expect } from "vitest";
import { sheetName, sheetNamer } from "./sheetNames";

describe("sheetName", () => {
  it("cambia por _ los caracteres que Excel no acepta", () => {
    expect(sheetName("Resumen Nómina 1/10")).toBe("Resumen Nómina 1_10");
    expect(sheetName("Poda: [norte] *a? \\ b")).toBe("Poda_ _norte_ _a_ _ b");
  });

  it("recorta a 31 caracteres y saca los apóstrofes de los bordes", () => {
    expect(sheetName("Resumen de la nómina de la primera quincena de octubre")).toHaveLength(31);
    expect(sheetName("'Cosecha'")).toBe("Cosecha");
    // Al recortar no queda un apóstrofe al final.
    expect(sheetName(`${"a".repeat(30)}'b`)).toBe("a".repeat(30));
  });

  it("un nombre vacío o reservado tiene un reemplazo", () => {
    expect(sheetName("")).toBe("Hoja");
    expect(sheetName(null)).toBe("Hoja");
    expect(sheetName(" / ")).toBe("_");
    expect(sheetName("History")).toBe("History_");
  });
});

describe("sheetNamer", () => {
  it("numera los repetidos sin importar mayúsculas, y siguen entrando en 31", () => {
    const name = sheetNamer();
    expect(name("Cosecha")).toBe("Cosecha");
    expect(name("cosecha")).toBe("cosecha 2");
    expect(name("Cosecha/")).toBe("Cosecha_");
    const long = "Labor con un nombre bastante largo para Excel";
    expect(name(long)).toBe(long.slice(0, 31));
    expect(name(long)).toBe(`${long.slice(0, 29).trim()} 2`);
    expect(name(long)).toBe(`${long.slice(0, 29).trim()} 3`);
  });
});
