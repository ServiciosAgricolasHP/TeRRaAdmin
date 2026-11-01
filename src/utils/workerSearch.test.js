import { describe, expect, it } from "vitest";
import { searchWorkerList, workerMatchesQuery, workerQueryReady, workerSearchInput } from "./workerSearch";

const ana = { id: "11111111-1", rut: "11111111-1", name: "Ana María Pérez Soto" };
const beto = { id: "12345678-5", rut: "12345678-5", name: "Beto Soto" };
// RUT corregido: el id sigue siendo el de creación.
const caro = { id: "22222222-2", rut: "12345670-K", name: "Caro Díaz" };

describe("workerSearchInput", () => {
  it("quita los puntos de un RUT escrito o pegado y deja el resto como viene", () => {
    expect(workerSearchInput("12.345.678-9")).toBe("12345678-9");
    expect(workerSearchInput("Ana Pérez")).toBe("Ana Pérez");
    expect(workerSearchInput(".")).toBe("");
    expect(workerSearchInput(undefined)).toBe("");
  });
});

describe("workerMatchesQuery", () => {
  it("por cualquier palabra del nombre, en cualquier orden y sin acentos", () => {
    expect(workerMatchesQuery(ana, "Pérez")).toBe(true);
    expect(workerMatchesQuery(ana, "perez ana")).toBe(true);
    expect(workerMatchesQuery(ana, "maria soto")).toBe(true);
    expect(workerMatchesQuery(ana, "ana díaz")).toBe(false);
  });

  it("por una parte del RUT, con o sin puntos y guion", () => {
    expect(workerMatchesQuery(beto, "12.345")).toBe(true);
    expect(workerMatchesQuery(beto, "5678-5")).toBe(true);
    expect(workerMatchesQuery(beto, "456785")).toBe(true);
  });

  it("por el RUT vigente o por el de creación, con la K en cualquier caja", () => {
    expect(workerMatchesQuery(caro, "12345670-k")).toBe(true);
    expect(workerMatchesQuery(caro, "22.222")).toBe(true);
  });

  it("sin nada escrito no calza", () => {
    expect(workerMatchesQuery(ana, "")).toBe(false);
    expect(workerMatchesQuery(ana, " .- ")).toBe(false);
  });
});

describe("searchWorkerList", () => {
  const all = [ana, beto, caro];

  it("desde dos caracteres, sin contar puntos ni espacios", () => {
    expect(workerQueryReady("a")).toBe(false);
    expect(workerQueryReady("1.2")).toBe(true);
    expect(searchWorkerList(all, "s")).toEqual([]);
  });

  it("en el orden de la lista y hasta `take`", () => {
    expect(searchWorkerList(all, "soto").map((w) => w.name)).toEqual(["Ana María Pérez Soto", "Beto Soto"]);
    expect(searchWorkerList(all, "soto", 1)).toEqual([ana]);
  });
});
