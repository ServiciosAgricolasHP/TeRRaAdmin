import { describe, expect, it } from "vitest";
import { cleanCounterparties, counterpartiesError, subjobCounterparty } from "./jobCounterparties";

describe("cleanCounterparties", () => {
  it("deja el RUT sin puntos, la razón social tal cual y saca las filas vacías", () => {
    expect(cleanCounterparties([{ rut: "76.123.456-0", name: "  AGRÍCOLA LOS ROBLES SpA " }, { rut: "", name: "" }])).toEqual([
      { rut: "76123456-0", name: "AGRÍCOLA LOS ROBLES SpA" },
    ]);
  });
});

describe("counterpartiesError", () => {
  it("una sola contraparte puede ir sin razón social", () => {
    expect(counterpartiesError([{ rut: "76.123.456-0", name: "" }])).toBe("");
    expect(counterpartiesError([])).toBe("");
  });

  it("con más de una, cada una lleva su razón social", () => {
    const rows = [{ rut: "76123456-0", name: "Los Robles" }, { rut: "11111111-1", name: "" }];
    expect(counterpartiesError(rows)).toBe("Con más de un RUT, cada uno lleva su razón social: falta la de 11.111.111-1.");
  });

  it("rechaza un RUT que no es válido, uno repetido y una razón social sin RUT", () => {
    expect(counterpartiesError([{ rut: "76123456-8" }])).toBe("El RUT 76.123.456-8 no es válido.");
    expect(counterpartiesError([{ rut: "76123456-0", name: "A" }, { rut: "76.123.456-0", name: "B" }])).toBe("El RUT 76.123.456-0 está dos veces.");
    expect(counterpartiesError([{ rut: "", name: "Los Robles" }])).toBe("Falta el RUT de Los Robles.");
  });
});

describe("subjobCounterparty", () => {
  const job = { counterparties: [{ rut: "76123456-0", name: "Los Robles" }, { rut: "11111111-1", name: "El Olivo" }] };

  it("es la de su faena con ese RUT", () => {
    expect(subjobCounterparty({ counterpartyRut: "11.111.111-1" }, job)).toEqual({ rut: "11111111-1", name: "El Olivo" });
  });

  it("sin RUT no tiene, y un RUT que la faena ya no tiene queda sin razón social", () => {
    expect(subjobCounterparty({}, job)).toBeNull();
    expect(subjobCounterparty({ counterpartyRut: "22222222-2" }, job)).toEqual({ rut: "22222222-2", name: "" });
  });
});
