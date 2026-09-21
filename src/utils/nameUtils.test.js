import { describe, it, expect } from "vitest";
import { initials, toProperName } from "./nameUtils";

describe("initials", () => {
  it("toma la primera de cada uno de los dos primeros nombres", () => {
    expect(initials("Juan Pérez")).toBe("JP");
    expect(initials("ana maria silva")).toBe("AM");
  });

  it("con un solo nombre toma sus dos primeras letras", () => {
    expect(initials("Juan")).toBe("JU");
  });

  it("sin nombre devuelve el interrogante", () => {
    expect(initials("")).toBe("?");
    expect(initials("   ")).toBe("?");
    expect(initials(null)).toBe("?");
    expect(initials(undefined)).toBe("?");
  });

  it("los espacios de más no producen una inicial vacía", () => {
    expect(initials("  Juan   Pérez  ")).toBe("JP");
  });
});

describe("toProperName", () => {
  it("arregla el casing sin tocar tildes ni ñ", () => {
    // A diferencia de `normalizeName` de importWorkers, este helper es para
    // mostrar y guardar: conserva lo que el usuario tipeó.
    expect(toProperName("JUAN PÉREZ")).toBe("Juan Pérez");
    expect(toProperName("josé muñoz")).toBe("José Muñoz");
  });

  it("deja los conectores en minúscula en el medio", () => {
    expect(toProperName("juan de la cruz")).toBe("Juan de la Cruz");
    expect(toProperName("maría josé de los ríos")).toBe("María José de los Ríos");
  });

  it("pero los capitaliza si abren el nombre", () => {
    expect(toProperName("de la torre")).toBe("De la Torre");
  });

  it("capitaliza después de guión y de apóstrofe", () => {
    expect(toProperName("ana-maría")).toBe("Ana-María");
    expect(toProperName("d'angelo")).toBe("D'Angelo");
  });

  it("colapsa los espacios de más", () => {
    expect(toProperName("  juan   perez  ")).toBe("Juan Perez");
  });

  it("sin entrada devuelve vacío", () => {
    expect(toProperName("")).toBe("");
    expect(toProperName(null)).toBe("");
    expect(toProperName(undefined)).toBe("");
    expect(toProperName("   ")).toBe("");
  });

  it("es idempotente", () => {
    const ya = "Juan de la Cruz";
    expect(toProperName(ya)).toBe(ya);
  });
});
