import { describe, it, expect } from "vitest";
import { decimalShown, decimalText, wholeAmountText } from "./numberInput";
import { parseAmount } from "./formula";

describe("wholeAmountText", () => {
  it("quita los puntos, las comas, el $ y los espacios", () => {
    expect(wholeAmountText("150.000")).toBe("150000");
    expect(wholeAmountText("150,000")).toBe("150000");
    expect(wholeAmountText("$150.000")).toBe("150000");
    expect(wholeAmountText("$ 1.234.567")).toBe("1234567");
    expect(wholeAmountText(" 150 000 ")).toBe("150000");
    expect(wholeAmountText("1,234,567")).toBe("1234567");
  });

  it("los centavos al final se redondean y no se pegan a los pesos", () => {
    expect(wholeAmountText("150.000,00")).toBe("150000");
    expect(wholeAmountText("$150.000,00")).toBe("150000");
    expect(wholeAmountText("150,000.00")).toBe("150000");
    expect(wholeAmountText("1.234,56")).toBe("1235");
    expect(wholeAmountText("1.234,4")).toBe("1234");
    expect(wholeAmountText("150.000,00 CLP")).toBe("150000");
  });

  it("deja los dígitos que se escriben, y vacío lo vacío", () => {
    expect(wholeAmountText("1500")).toBe("1500");
    expect(wholeAmountText("")).toBe("");
    expect(wholeAmountText(null)).toBe("");
    expect(wholeAmountText(undefined)).toBe("");
    expect(wholeAmountText("abc")).toBe("");
  });

  it("al escribir, el punto o la coma recién tecleados se van sin tocar el número", () => {
    expect(wholeAmountText("150.")).toBe("150");
    expect(wholeAmountText("150,")).toBe("150");
  });

  it("un monto guardado como número queda igual", () => {
    expect(wholeAmountText(150000)).toBe("150000");
  });
});

describe("decimalText", () => {
  it("deja los dígitos, el punto y la coma", () => {
    expect(decimalText("12,5")).toBe("12,5");
    expect(decimalText("1.500,25 kg")).toBe("1.500,25");
    expect(decimalText("12,")).toBe("12,");
    expect(decimalText(" 40 %")).toBe("40");
    expect(decimalText(null)).toBe("");
  });

  it("se lee como en Chile con parseAmount", () => {
    expect(parseAmount(decimalText("1.500"))).toBe(1500);
    expect(parseAmount(decimalText("12,5"))).toBe(12.5);
    expect(parseAmount(decimalText("1,25"))).toBe(1.25);
    expect(parseAmount(decimalText("1.500,25 kg"))).toBe(1500.25);
  });
});

describe("decimalShown", () => {
  it("muestra un número con coma decimal", () => {
    expect(decimalShown(12.5)).toBe("12,5");
    expect(decimalShown(1.255)).toBe("1,255");
    expect(decimalShown(1500)).toBe("1500");
    expect(decimalShown(0)).toBe("0");
  });

  it("lo que se muestra se vuelve a leer igual", () => {
    for (const n of [12.5, 1.255, 1500, 0.25]) expect(parseAmount(decimalShown(n))).toBe(n);
  });

  it("un texto se muestra tal cual, y nada como vacío", () => {
    expect(decimalShown("12,")).toBe("12,");
    expect(decimalShown(null)).toBe("");
    expect(decimalShown(undefined)).toBe("");
    expect(decimalShown(NaN)).toBe("");
  });
});
