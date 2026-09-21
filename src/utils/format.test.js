import { describe, it, expect } from "vitest";
import {
  fmtCurrency,
  fmtNumber,
  fmtCompactCLP,
  fmtPercent,
  fmtShortDate,
  fmtMonthKey,
} from "./format";

// Los formatos salen de `Intl` con locale es-CL: punto para los miles, coma
// para los decimales, sin decimales en pesos. Si estas aserciones se caen sin
// que nadie haya tocado el módulo, la sospecha es un cambio de ICU en Node,
// no un bug de la app.
describe("fmtCurrency", () => {
  it("usa punto de miles y no muestra decimales", () => {
    expect(fmtCurrency(1234)).toBe("$1.234");
    expect(fmtCurrency(1234567)).toBe("$1.234.567");
  });

  it("redondea los decimales", () => {
    expect(fmtCurrency(1234.6)).toBe("$1.235");
  });

  it("cero es cero, no vacío", () => {
    expect(fmtCurrency(0)).toBe("$0");
  });

  it("lo que no es número cae a cero en vez de mostrar NaN", () => {
    expect(fmtCurrency(null)).toBe("$0");
    expect(fmtCurrency(undefined)).toBe("$0");
    expect(fmtCurrency("")).toBe("$0");
    expect(fmtCurrency("no es un monto")).toBe("$0");
  });

  it("acepta el monto como string numérico", () => {
    expect(fmtCurrency("1234")).toBe("$1.234");
  });

  it("los negativos conservan el signo", () => {
    expect(fmtCurrency(-500)).toBe("$-500");
  });
});

describe("fmtNumber", () => {
  it("agrupa los miles sin símbolo de moneda", () => {
    expect(fmtNumber(1234567)).toBe("1.234.567");
  });

  it("los decimales van con coma", () => {
    expect(fmtNumber(1234.6)).toBe("1.234,6");
  });

  it("lo que no es número cae a cero", () => {
    expect(fmtNumber(null)).toBe("0");
    expect(fmtNumber("abc")).toBe("0");
  });
});

describe("fmtCompactCLP", () => {
  it("bajo mil muestra el número tal cual", () => {
    expect(fmtCompactCLP(999)).toBe("$999");
    expect(fmtCompactCLP(0)).toBe("$0");
  });

  it("los miles van en k redondeados", () => {
    expect(fmtCompactCLP(1000)).toBe("$1k");
    expect(fmtCompactCLP(450000)).toBe("$450k");
    expect(fmtCompactCLP(1500)).toBe("$2k");
  });

  it("hasta diez millones muestra un decimal", () => {
    expect(fmtCompactCLP(1_200_000)).toBe("$1.2M");
    expect(fmtCompactCLP(9_900_000)).toBe("$9.9M");
  });

  it("de diez millones para arriba no muestra decimales", () => {
    expect(fmtCompactCLP(12_000_000)).toBe("$12M");
  });

  it("los negativos usan la misma escala", () => {
    expect(fmtCompactCLP(-1_200_000)).toBe("$-1.2M");
    expect(fmtCompactCLP(-450000)).toBe("$-450k");
  });

  it("lo que no es número cae a cero", () => {
    expect(fmtCompactCLP(null)).toBe("$0");
  });
});

describe("fmtPercent", () => {
  it("por default no muestra decimales", () => {
    expect(fmtPercent(42)).toBe("42%");
    expect(fmtPercent(42.6)).toBe("43%");
  });

  it("con decimales usa coma", () => {
    expect(fmtPercent(42.567, 2)).toBe("42,57%");
    expect(fmtPercent(50, 1)).toBe("50,0%");
  });

  it("lo que no es número cae a cero", () => {
    expect(fmtPercent(null)).toBe("0%");
    expect(fmtPercent(undefined, 1)).toBe("0,0%");
  });
});

describe("fmtShortDate", () => {
  it("abrevia el mes en español", () => {
    expect(fmtShortDate("2026-09-14")).toBe("14-sep");
    expect(fmtShortDate("2026-01-01")).toBe("01-ene");
    expect(fmtShortDate("2026-12-31")).toBe("31-dic");
  });

  it("acepta un ISO con hora", () => {
    expect(fmtShortDate("2026-09-14T10:30:00.000Z")).toBe("14-sep");
  });

  it("lo que no parsea devuelve vacío, no una fecha inventada", () => {
    expect(fmtShortDate("")).toBe("");
    expect(fmtShortDate(null)).toBe("");
    expect(fmtShortDate("14/09/2026")).toBe("");
  });
});

describe("fmtMonthKey", () => {
  it("abrevia el mes y muestra el año en dos dígitos", () => {
    expect(fmtMonthKey("2026-09")).toBe("sep 26");
    expect(fmtMonthKey("2025-01")).toBe("ene 25");
    expect(fmtMonthKey("2026-12")).toBe("dic 26");
  });

  it("no pasa por Date, así que la zona horaria no corre el mes", () => {
    // Un `new Date("2026-01")` se interpreta en UTC y al oeste de Greenwich
    // devolvería diciembre del año anterior.
    expect(fmtMonthKey("2026-01")).toBe("ene 26");
  });

  it("un mes fuera de rango vuelve tal cual", () => {
    expect(fmtMonthKey("2026-13")).toBe("2026-13");
    expect(fmtMonthKey("2026-00")).toBe("2026-00");
  });

  it("sin clave devuelve vacío", () => {
    expect(fmtMonthKey("")).toBe("");
    expect(fmtMonthKey(null)).toBe("");
    expect(fmtMonthKey(undefined)).toBe("");
  });

  it("[bug conocido] una clave sin guión devuelve \"undefined\"", () => {
    // El guard quiso cubrir esto (`idx < 0 || idx > 11`) pero `Number(undefined)`
    // es NaN y toda comparación con NaN es false, así que se cuela hasta el
    // template y sale "undefined sura". Hoy no se alcanza: los únicos
    // llamadores son los gráficos del Dashboard, que arman las claves con
    // `lastMonthKeys`, nunca con texto del usuario.
    expect(fmtMonthKey("basura")).toBe("undefined sura");
  });
});
