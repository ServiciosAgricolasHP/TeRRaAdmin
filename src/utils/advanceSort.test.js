import { describe, it, expect } from "vitest";
import { sortAdvances, isAdvanceSort, DEFAULT_ADVANCE_SORT } from "./advanceSort";

// Un Timestamp como queda al pasar por localStorage.
const at = (seconds) => ({ seconds, nanoseconds: 0 });
const ids = (list) => list.map((a) => a.id);

describe("sortAdvances", () => {
  it("por fecha: la más nueva primero", () => {
    const list = [
      { id: "a", date: "2026-11-01", updatedAt: at(300) },
      { id: "b", date: "2026-11-14", updatedAt: at(100) },
      { id: "c", date: "2026-11-07", updatedAt: at(200) },
    ];
    expect(ids(sortAdvances(list, "date"))).toEqual(["b", "c", "a"]);
  });

  it("por fecha: los del mismo día van por última modificación, la más reciente primero", () => {
    const list = [
      { id: "a", date: "2026-11-14", updatedAt: at(100) },
      { id: "b", date: "2026-11-14", updatedAt: at(300) },
      { id: "c", date: "2026-11-13", updatedAt: at(900) },
      { id: "d", date: "2026-11-14", updatedAt: at(200) },
    ];
    expect(ids(sortAdvances(list, "date"))).toEqual(["b", "d", "a", "c"]);
  });

  it("por última modificación: no mira la fecha del anticipo", () => {
    const list = [
      { id: "a", date: "2026-11-14", updatedAt: at(100) },
      { id: "b", date: "2026-10-01", updatedAt: at(300) },
      { id: "c", date: "2026-11-10", updatedAt: at(200) },
    ];
    expect(ids(sortAdvances(list, "modified"))).toEqual(["b", "c", "a"]);
  });

  it("lee un Timestamp de Firestore y su forma guardada", () => {
    const list = [
      { id: "a", date: "2026-11-14", updatedAt: { toMillis: () => 100_000 } },
      { id: "b", date: "2026-11-14", updatedAt: at(200) },
    ];
    expect(ids(sortAdvances(list, "date"))).toEqual(["b", "a"]);
  });

  it("sin updatedAt usa createdAt, y sin ninguno va al final de su día", () => {
    const list = [
      { id: "a", date: "2026-11-14" },
      { id: "b", date: "2026-11-14", createdAt: at(250) },
      { id: "c", date: "2026-11-14", updatedAt: at(200) },
    ];
    expect(ids(sortAdvances(list, "date"))).toEqual(["b", "c", "a"]);
  });

  it("con todo igual, el orden es siempre el mismo", () => {
    const list = [
      { id: "z", date: "2026-11-14", updatedAt: at(100) },
      { id: "m", date: "2026-11-14", updatedAt: at(100) },
    ];
    expect(ids(sortAdvances(list, "date"))).toEqual(["m", "z"]);
    expect(ids(sortAdvances([...list].reverse(), "date"))).toEqual(["m", "z"]);
  });

  it("devuelve una copia y por defecto ordena por fecha", () => {
    const list = [
      { id: "a", date: "2026-11-01", updatedAt: at(900) },
      { id: "b", date: "2026-11-14", updatedAt: at(100) },
    ];
    const sorted = sortAdvances(list);
    expect(ids(sorted)).toEqual(["b", "a"]);
    expect(ids(list)).toEqual(["a", "b"]);
    expect(sortAdvances(null)).toEqual([]);
  });
});

describe("isAdvanceSort", () => {
  it("reconoce solo los órdenes de la lista", () => {
    expect(isAdvanceSort(DEFAULT_ADVANCE_SORT)).toBe(true);
    expect(isAdvanceSort("modified")).toBe(true);
    expect(isAdvanceSort("amount")).toBe(false);
    expect(isAdvanceSort(null)).toBe(false);
  });
});
