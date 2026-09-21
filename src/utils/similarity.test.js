import { describe, it, expect } from "vitest";
import { nameSimilarity, findSimilarWorkers } from "./similarity";

describe("nameSimilarity", () => {
  it("un nombre idéntico da 1", () => {
    expect(nameSimilarity("JUAN PEREZ", "JUAN PEREZ")).toBe(1);
  });

  it("ignora mayúsculas, tildes y puntuación", () => {
    // Detectar el duplicado es lo que evita pagarle dos veces a la misma
    // persona bajo dos RUT distintos.
    expect(nameSimilarity("josé muñoz", "JOSE MUNOZ")).toBe(1);
    expect(nameSimilarity("O'Brien, Ana", "O BRIEN ANA")).toBe(1);
  });

  it("colapsa espacios de más", () => {
    expect(nameSimilarity("  Ana   Silva ", "Ana Silva")).toBe(1);
  });

  it("una letra de diferencia queda alto pero no en 1", () => {
    const s = nameSimilarity("JUAN PEREZ", "JUAN PERES");
    expect(s).toBeLessThan(1);
    expect(s).toBeGreaterThan(0.85);
  });

  it("dos nombres sin relación dan bajo", () => {
    expect(nameSimilarity("JUAN PEREZ", "MARIA GONZALEZ")).toBeLessThan(0.5);
  });

  it("un nombre vacío da 0, no un falso positivo", () => {
    expect(nameSimilarity("", "JUAN PEREZ")).toBe(0);
    expect(nameSimilarity("JUAN PEREZ", null)).toBe(0);
    expect(nameSimilarity("", "")).toBe(0);
  });

  it("un string que queda vacío al normalizar también da 0", () => {
    expect(nameSimilarity("...", "JUAN")).toBe(0);
  });

  it("es simétrica", () => {
    expect(nameSimilarity("JUAN PEREZ", "JUAN PERES")).toBe(
      nameSimilarity("JUAN PERES", "JUAN PEREZ"),
    );
  });
});

describe("findSimilarWorkers", () => {
  const padron = [
    { id: "1-9", name: "Juan Pérez Soto" },
    { id: "2-7", name: "Juan Peres Soto" },
    { id: "3-5", name: "María González" },
    { id: "4-3", name: "Pedro Ramírez" },
  ];

  it("encuentra al duplicado escrito distinto", () => {
    const hits = findSimilarWorkers("Juan Perez Soto", padron);
    expect(hits.map((h) => h.worker.id)).toContain("2-7");
    expect(hits.map((h) => h.worker.id)).toContain("1-9");
  });

  it("no trae a los que no se parecen", () => {
    const hits = findSimilarWorkers("Juan Perez Soto", padron);
    expect(hits.map((h) => h.worker.id)).not.toContain("3-5");
  });

  it("devuelve el más parecido primero", () => {
    const hits = findSimilarWorkers("Juan Pérez Soto", padron);
    expect(hits[0].worker.id).toBe("1-9");
    expect(hits[0].score).toBe(1);
  });

  it("respeta el umbral que se le pasa", () => {
    expect(findSimilarWorkers("Juan Perez Soto", padron, { threshold: 0.99 })).toHaveLength(1);
    expect(
      findSimilarWorkers("Juan Perez Soto", padron, { threshold: 0 }).length,
    ).toBe(padron.length);
  });

  it("respeta el límite", () => {
    const hits = findSimilarWorkers("Juan Perez Soto", padron, { threshold: 0, limit: 2 });
    expect(hits).toHaveLength(2);
  });

  it("un nombre vacío no devuelve a todo el padrón", () => {
    // Si devolviera todo, el alta de un trabajador sin nombre tipeado
    // mostraría una alerta de duplicado con cualquiera.
    expect(findSimilarWorkers("", padron)).toEqual([]);
    expect(findSimilarWorkers(null, padron)).toEqual([]);
  });

  it("un padrón vacío no revienta", () => {
    expect(findSimilarWorkers("Juan", [])).toEqual([]);
  });

  it("un trabajador sin nombre no matchea", () => {
    const hits = findSimilarWorkers("Juan Perez", [{ id: "9-9", name: "" }]);
    expect(hits).toEqual([]);
  });
});
