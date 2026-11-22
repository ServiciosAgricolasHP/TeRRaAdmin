import { describe, expect, it } from "vitest";
import { jobSearchMatch } from "./jobSearch";

const job = { name: "Fundo Los Robles", owner: "Juan Pérez", counterparties: [{ rut: "76123456-0", name: "Agrícola Robles SpA" }] };
const subjobs = [
  { id: "s1", name: "Cuartel Norte" },
  { id: "s2", name: "Cuartel Sur", counterpartyRut: "11111111-1" },
];

describe("jobSearchMatch", () => {
  it("sin nada escrito calzan todas", () => {
    expect(jobSearchMatch(job, subjobs, "  ")).toEqual({ via: null });
  });

  it("por el nombre, el dueño o la razón social, sin tildes ni mayúsculas", () => {
    expect(jobSearchMatch(job, subjobs, "robles")).toEqual({ via: null });
    expect(jobSearchMatch(job, subjobs, "perez juan")).toEqual({ via: null });
    expect(jobSearchMatch(job, subjobs, "agricola")).toEqual({ via: null });
  });

  it("por una parte del RUT, con o sin puntos", () => {
    expect(jobSearchMatch(job, subjobs, "76.123")).toEqual({ via: null });
    expect(jobSearchMatch(job, subjobs, "6123456")).toEqual({ via: null });
  });

  it("por una subfaena, que dice cuál", () => {
    expect(jobSearchMatch(job, subjobs, "norte")).toEqual({ via: subjobs[0] });
    expect(jobSearchMatch(job, subjobs, "11.111")).toEqual({ via: subjobs[1] });
  });

  it("lo que no aparece no calza, y pocos dígitos no buscan en el RUT", () => {
    expect(jobSearchMatch(job, subjobs, "olivo")).toBeNull();
    expect(jobSearchMatch(job, subjobs, "76")).toBeNull();
  });
});
