import { describe, it, expect, vi } from "vitest";

vi.mock("../firebase", () => ({ db: {}, auth: { currentUser: null } }));

const { workerKeys, detectQueryKind } = await import("./workersService");

describe("workerKeys", () => {
  // Con estas claves se arma la consulta `workerRut in [...]` que busca los
  // workdays de una persona. Si faltara una, se pierde producción histórica;
  // si sobrara una ajena, se mezclaría con la de otro.
  it("un trabajador sin divergencia da una sola clave", () => {
    expect(workerKeys({ id: "11111111-1", rut: "11111111-1", name: "Ana" })).toEqual([
      "11111111-1",
    ]);
  });

  it("uno que cambió de cédula da las dos, con el doc id primero", () => {
    expect(workerKeys({ id: "22222222-2", rut: "33333333-3" })).toEqual([
      "22222222-2",
      "33333333-3",
    ]);
  });

  it("incluye el historial de ruts", () => {
    expect(workerKeys({ id: "1-9", rut: "3-5", rutHistory: ["2-7"] })).toEqual([
      "1-9",
      "3-5",
      "2-7",
    ]);
  });

  it("deduplica sin cambiar el orden", () => {
    expect(workerKeys({ id: "1-9", rut: "3-5", rutHistory: ["3-5", "1-9", "2-7"] })).toEqual([
      "1-9",
      "3-5",
      "2-7",
    ]);
  });

  it("un worker viejo sin campo rut igual funciona", () => {
    expect(workerKeys({ id: "44444444-4" })).toEqual(["44444444-4"]);
  });

  it("acepta un string suelto, por compatibilidad", () => {
    expect(workerKeys("55555555-5")).toEqual(["55555555-5"]);
  });

  it("corta en 10, que es el tope del `in` de Firestore", () => {
    // Truncar es preferible a que la consulta reviente, pero si alguna vez se
    // pasa de 10 se perdería un rut histórico: este test es el aviso.
    const claves = workerKeys({
      id: "a",
      rut: "b",
      rutHistory: ["c", "d", "e", "f", "g", "h", "i", "j", "k", "l"],
    });
    expect(claves).toHaveLength(10);
    expect(claves[0]).toBe("a");
  });

  it("devuelve lista vacía sin trabajador", () => {
    expect(workerKeys(null)).toEqual([]);
    expect(workerKeys(undefined)).toEqual([]);
    expect(workerKeys({})).toEqual([]);
    expect(workerKeys("")).toEqual([]);
  });

  it("descarta vacíos y pasa todo a texto", () => {
    expect(workerKeys({ id: 123, rut: null, rutHistory: ["", undefined, "x"] })).toEqual([
      "123",
      "x",
    ]);
  });

  it("encuentra los dos tramos de un trabajador que cambió de rut", () => {
    // Un workday guarda en `workerRut` el rut que tenía el roster de la labor
    // cuando se escribió: antes del cambio es el doc id, después el nuevo.
    const boris = { id: "22222222-2", rut: "33333333-3" };
    const workdays = [
      { id: "w1", workerRut: "22222222-2" }, // antes del cambio
      { id: "w2", workerRut: "33333333-3" }, // después
      { id: "w3", workerRut: "99999999-9" }, // de otra persona
    ];
    const claves = new Set(workerKeys(boris));
    expect(workdays.filter((w) => claves.has(w.workerRut)).map((w) => w.id)).toEqual([
      "w1",
      "w2",
    ]);
  });
});

describe("detectQueryKind", () => {
  it("si empieza con dígito es búsqueda por RUT", () => {
    expect(detectQueryKind("12345")).toBe("rut");
    expect(detectQueryKind(" 9")).toBe("rut");
  });

  it("si no, es por nombre", () => {
    expect(detectQueryKind("Ana")).toBe("name");
    expect(detectQueryKind("  josé")).toBe("name");
  });

  it("null cuando no hay nada que buscar", () => {
    expect(detectQueryKind("")).toBe(null);
    expect(detectQueryKind("   ")).toBe(null);
    expect(detectQueryKind(null)).toBe(null);
  });
});
