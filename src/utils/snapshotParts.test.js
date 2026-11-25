import { describe, expect, it } from "vitest";
import { valueSize } from "./docSizes";
import { isPartedSnapshot, joinSnapshot, partIdOf, splitSnapshot, splitWorkdays } from "./snapshotParts";

const wd = (i) => ({ id: `c1__poda__1-9__2026-11-${String((i % 28) + 1).padStart(2, "0")}__${i}`, cycleId: "c1", amount: 1000 + i });

describe("splitWorkdays", () => {
  it("corta en partes que no pasan el tope, en su orden", () => {
    const list = Array.from({ length: 50 }, (_, i) => wd(i));
    const max = valueSize(list.slice(0, 10));
    const parts = splitWorkdays(list, max);
    expect(parts.length).toBeGreaterThan(4);
    expect(parts.every((p) => valueSize(p) <= max)).toBe(true);
    expect(parts.flat()).toEqual(list);
  });

  it("una jornada más grande que el tope va sola, y sin jornadas no hay partes", () => {
    expect(splitWorkdays([wd(1), wd(2)], 1)).toEqual([[wd(1)], [wd(2)]]);
    expect(splitWorkdays([])).toEqual([]);
    expect(splitWorkdays(undefined)).toEqual([]);
  });
});

describe("splitSnapshot y joinSnapshot", () => {
  const snapshot = { payrollId: "p1", payroll: { name: "Semana 46" }, workers: [{ rut: "1-9" }], workdays: Array.from({ length: 30 }, (_, i) => wd(i)) };

  it("la cabecera lleva todo menos las jornadas, y al armarla vuelve a ser el mismo JSON", () => {
    const { header, parts } = splitSnapshot(snapshot, valueSize(snapshot.workdays.slice(0, 8)));
    expect(header).toEqual({ payrollId: "p1", payroll: { name: "Semana 46" }, workers: [{ rut: "1-9" }], workdayParts: parts.length });
    expect(parts.length).toBeGreaterThan(2);
    expect(joinSnapshot(header, parts)).toEqual(snapshot);
  });

  it("vuelve a contar las partes aunque el JSON traiga las de antes", () => {
    const { header, parts } = splitSnapshot({ ...snapshot, workdayParts: 9 });
    expect(parts).toHaveLength(1);
    expect(header.workdayParts).toBe(1);
  });

  it("sin jornadas, cero partes y una lista vacía al armarla", () => {
    const { header, parts } = splitSnapshot({ payrollId: "p1" });
    expect(header).toEqual({ payrollId: "p1", workdayParts: 0 });
    expect(joinSnapshot(header, parts)).toEqual({ payrollId: "p1", workdays: [] });
  });

  it("un JSON guardado entero queda tal cual", () => {
    expect(isPartedSnapshot(snapshot)).toBe(false);
    expect(joinSnapshot(snapshot)).toEqual(snapshot);
    expect(joinSnapshot({ payrollId: "p1" })).toEqual({ payrollId: "p1" });
  });
});

describe("partIdOf", () => {
  it("el id de la nómina y el número de la parte", () => {
    expect(partIdOf("abc", 0)).toBe("abc__0");
  });
});
