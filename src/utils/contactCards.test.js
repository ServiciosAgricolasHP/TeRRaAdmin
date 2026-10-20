import { describe, it, expect } from "vitest";
import { accountToText, cardMatchesSearch, cardToText, emptyCard, rutIncluded } from "./contactCards";

const account = {
  id: "a1",
  label: "Sueldos",
  titular: "Comercial Los Robles SpA",
  rutTitular: "76543210-1",
  bankCode: "012",
  accountType: 1,
  accountNumber: "00123456",
  email: "pagos@losrobles.cl",
};

describe("rutIncluded", () => {
  it("una empresa siempre muestra el RUT; una persona según includeRut, o si tiene RUT cuando no trae el campo", () => {
    expect(rutIncluded({ type: "empresa", includeRut: false })).toBe(true);
    expect(rutIncluded({ type: "persona", includeRut: false, rut: "1-9" })).toBe(false);
    expect(rutIncluded({ type: "persona", includeRut: true })).toBe(true);
    expect(rutIncluded({ type: "persona", rut: "1-9" })).toBe(true);
    expect(rutIncluded({ type: "persona" })).toBe(false);
  });

  it("una ficha nueva de persona arranca con el RUT oculto y una de empresa con el RUT visible", () => {
    expect(emptyCard("persona").includeRut).toBe(false);
    expect(emptyCard("empresa").includeRut).toBe(true);
  });
});

describe("accountToText", () => {
  it("arma el bloque de transferencia con los datos que tiene", () => {
    const text = accountToText(account);
    expect(text.split("\n")).toEqual([
      "Titular: Comercial Los Robles SpA",
      expect.stringMatching(/^RUT: 76\.543\.210-1$/),
      expect.stringMatching(/^Banco: /),
      expect.stringMatching(/^Tipo: /),
      "N° Cuenta: 00123456",
      "Email: pagos@losrobles.cl",
    ]);
  });

  it("sin titular, RUT, número ni correo deja solo el banco y el tipo", () => {
    expect(accountToText({ bankCode: "012", accountType: 1 }).split("\n")).toHaveLength(2);
  });
});

describe("cardToText", () => {
  it("una empresa lleva razón social, RUT, giro y cada cuenta numerada con su etiqueta", () => {
    const text = cardToText({
      type: "empresa",
      name: "Comercial Los Robles SpA",
      rut: "76543210-1",
      giro: "Venta de insumos",
      phone: "+56 9 1234 5678",
      accounts: [account, { ...account, id: "a2", label: "" }],
    });
    expect(text).toContain("Razón social: Comercial Los Robles SpA");
    expect(text).toContain("RUT: 76.543.210-1");
    expect(text).toContain("Giro: Venta de insumos");
    expect(text).toContain("Teléfono: +56 9 1234 5678");
    expect(text).toContain("— Cuenta 1 (Sueldos) —");
    expect(text).toContain("— Cuenta 2 —");
  });

  it("una persona con el RUT oculto no lo incluye", () => {
    const text = cardToText({ type: "persona", name: "Ana Pérez", rut: "12345678-5", includeRut: false });
    expect(text).toBe("Nombre: Ana Pérez");
  });
});

describe("cardMatchesSearch", () => {
  const card = { name: "Comercial Los Robles SpA", rut: "76543210-1", email: "pagos@losrobles.cl", favorite: true };

  it("sin texto calza todo; con texto busca sin distinguir mayúsculas en los datos de la ficha", () => {
    expect(cardMatchesSearch(card, "  ")).toBe(true);
    expect(cardMatchesSearch(card, "ROBLES")).toBe(true);
    expect(cardMatchesSearch(card, "pagos@")).toBe(true);
    expect(cardMatchesSearch(card, "76543210")).toBe(true);
    expect(cardMatchesSearch(card, "molino")).toBe(false);
  });
});
