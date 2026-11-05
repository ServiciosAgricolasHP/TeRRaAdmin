import { describe, it, expect } from "vitest";
import { nameSimilarity, findSimilarWorkers, nameTokens, tokenNameSimilarity, tokenSimilarity, tokensSimilarity } from "./similarity";

describe("tokenNameSimilarity", () => {
  it("no le importa el orden de las palabras", () => {
    expect(tokenNameSimilarity("PEREZ SOTO JUAN", "Juan Pérez Soto")).toEqual({ score: 1, matched: 3, size: 3 });
  });

  it("un nombre más corto calza entero con uno más largo", () => {
    expect(tokenNameSimilarity("JUAN PEREZ", "JUAN CARLOS PEREZ SOTO")).toEqual({ score: 1, matched: 2, size: 2 });
  });

  it("tolera un error de tipeo en una palabra", () => {
    expect(tokenNameSimilarity("CLAUIDA ROJAS", "CLAUDIA ROJAS").score).toBe(1);
  });

  it("dos personas distintas no calzan", () => {
    expect(tokenNameSimilarity("MIGUEL TAPIA", "CLAUDIA ROJAS")).toEqual({ score: 0, matched: 0, size: 2 });
  });

  it("una palabra en común sola no alcanza para decir que es la misma persona", () => {
    const r = tokenNameSimilarity("JUAN TAPIA", "JUAN ROJAS");
    expect(r.score).toBe(0.5);
    expect(r.matched).toBe(1);
  });

  it("cada palabra calza una sola vez", () => {
    expect(tokenNameSimilarity("JUAN JUAN", "JUAN PEREZ").matched).toBe(1);
  });

  it("sin nombre da cero", () => {
    expect(tokenNameSimilarity("", "JUAN")).toEqual({ score: 0, matched: 0, size: 0 });
    expect(tokenNameSimilarity("J.", "JUAN")).toEqual({ score: 0, matched: 0, size: 0 });
  });
});

describe("tokenSimilarity", () => {
  it("un error de tipeo se parece; un largo muy distinto da 0 sin comparar", () => {
    expect(tokenSimilarity("CLAUDIA", "CLAUIDA")).toBeGreaterThanOrEqual(0.8);
    expect(tokenSimilarity("ANA", "ANA")).toBe(1);
    expect(tokenSimilarity("ANA", "ANABELLA")).toBe(0);
  });

  it("con los nombres ya separados da lo mismo que con el texto", () => {
    const a = "José Luis Mendoza";
    const b = "MENDOZA JOSE";
    expect(tokensSimilarity(nameTokens(a), nameTokens(b))).toEqual(tokenNameSimilarity(a, b));
  });
});

describe("nameSimilarity", () => {
  it("un nombre idéntico da 1", () => {
    expect(nameSimilarity("JUAN PEREZ", "JUAN PEREZ")).toBe(1);
  });

  it("ignora mayúsculas, tildes y puntuación", () => {
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
