import { describe, it, expect } from "vitest";
import { personalDataOf, personalDataPatch, personalDataCount } from "./workerPersonalData";

describe("datos personales del trabajador", () => {
  it("el formulario arranca vacío en lo que la ficha no tiene", () => {
    expect(personalDataOf({ address: "Pasaje 1", pensionFund: "Modelo" })).toEqual({
      address: "Pasaje 1",
      commune: "",
      nationality: "",
      maritalStatus: "",
      birthDate: "",
      pensionFund: "Modelo",
      healthInsurance: "",
    });
  });

  it("guarda sin espacios en los bordes y descarta una fecha o un estado civil inválidos", () => {
    const patch = personalDataPatch({ address: "  Pasaje 1 ", commune: "Osorno ", birthDate: "1990-02-30x", maritalStatus: "otro", healthInsurance: "Fonasa" });
    expect(patch).toMatchObject({ address: "Pasaje 1", commune: "Osorno", birthDate: "", maritalStatus: "", healthInsurance: "Fonasa" });
    expect(personalDataPatch({ birthDate: "1990-02-28", maritalStatus: "married" })).toMatchObject({ birthDate: "1990-02-28", maritalStatus: "married" });
  });

  it("cuenta los datos llenos", () => {
    expect(personalDataCount({ address: "x", commune: " ", nationality: "Chilena" })).toBe(2);
    expect(personalDataCount(null)).toBe(0);
  });
});
