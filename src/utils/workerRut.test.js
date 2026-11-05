import { describe, it, expect } from "vitest";
import { currentRutResolver, workerByRutResolver, workerIdResolver } from "./workerRut";

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

describe("workerIdResolver", () => {
  const workers = [{ id: "11111111-1", rut: "22222222-2", rutHistory: ["11111111-1", "33333333-3"] }, { id: "44444444-4" }];
  const idOf = workerIdResolver(workers);

  it("usa el workerId de la jornada si lo tiene", () => {
    expect(idOf({ workerId: "44444444-4", workerRut: "x" })).toBe("44444444-4");
  });

  it("en una jornada antigua resuelve el rut guardado, también uno anterior", () => {
    expect(idOf({ workerRut: "22222222-2" })).toBe("11111111-1");
    expect(idOf({ workerRut: "33333333-3" })).toBe("11111111-1");
    expect(idOf({ workerRut: "99999999-9" })).toBe("99999999-9");
  });
});

describe("workerByRutResolver", () => {
  const workers = [
    { id: "11111111-1", rut: "22222222-2", rutHistory: ["11111111-1", "33333333-3"], name: "Ana" },
    { id: "44444444-4", name: "Beto" },
    // Una ficha duplicada, unida a la de Ana.
    { id: "55555555-5", rut: "55555555-5", mergedInto: "11111111-1", name: "Ana duplicada" },
    // Otra persona cuyo RUT vigente es uno que Ana tuvo antes.
    { id: "66666666-6", rut: "33333333-3", name: "Caro" },
  ];
  const byRut = workerByRutResolver(workers);

  it("busca por id, por RUT vigente y por uno anterior, sin puntos", () => {
    expect(byRut("11.111.111-1").name).toBe("Ana");
    expect(byRut("22222222-2").name).toBe("Ana");
    expect(byRut("44444444-4").name).toBe("Beto");
  });

  it("el RUT vigente de otra ficha manda sobre uno anterior", () => {
    expect(byRut("33333333-3").name).toBe("Caro");
  });

  it("una ficha unida a otra devuelve la otra, y sin ficha devuelve null", () => {
    expect(byRut("55555555-5").name).toBe("Ana");
    expect(byRut("99999999-9")).toBeNull();
    expect(byRut("")).toBeNull();
  });
});
