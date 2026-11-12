import { describe, it, expect } from "vitest";
import { MAX_DOC_BYTES, auditLogSizes, docSize, heavyFields, payrollSizeRows, sizeStatus, valueSize } from "./docSizes";

describe("valueSize", () => {
  it("mide como Firestore: texto + 1, número 8, booleano y null 1, fecha 8", () => {
    expect(valueSize("abc")).toBe(4);
    expect(valueSize("ñ")).toBe(3);
    expect(valueSize(12.5)).toBe(8);
    expect([valueSize(true), valueSize(null), valueSize(undefined)]).toEqual([1, 1, 1]);
    expect(valueSize(new Date())).toBe(8);
    expect(valueSize({ seconds: 1, nanoseconds: 0 })).toBe(8);
  });

  it("un mapa suma sus claves y valores, y una lista sus valores", () => {
    expect(valueSize({ a: 1, bb: "x" })).toBe(2 + 8 + 3 + 2);
    expect(valueSize(["ab", "c"])).toBe(3 + 2);
  });
});

describe("docSize", () => {
  it("suma el nombre del documento y 32", () => {
    // "tasks" 6 + "id1" 4 + 16 = 26; 26 + 32 + campo "a"(2) + 8 = 68.
    expect(docSize("tasks/id1", { a: 1 })).toBe(68);
  });
});

describe("auditLogSizes", () => {
  const payroll = { name: "N1", total: 100, items: [{ rut: "1-9", workdayIds: ["w1", "w2"] }], workdayIds: ["w1", "w2"] };

  it("al editar guarda dos veces cada lista o mapa, y al crear o eliminar el documento una vez", () => {
    expect(heavyFields(payroll)).toEqual(["items", "workdayIds"]);
    const sizes = auditLogSizes("payroll", "P1", payroll);
    const heavy = valueSize(payroll.items) + valueSize(payroll.workdayIds);
    expect(sizes.edit - sizes.create).toBeGreaterThan(heavy - valueSize({ name: "N1", total: 100 }));
    expect(sizes.create).toBe(sizes.remove);
  });

  it("solo con los campos pedidos", () => {
    const small = auditLogSizes("payroll", "P1", payroll, ["name"]).edit;
    expect(small).toBeLessThan(auditLogSizes("payroll", "P1", payroll).edit);
  });
});

describe("sizeStatus y payrollSizeRows", () => {
  it("marca cerca desde el 75% y fuera sobre 1 MiB", () => {
    expect(sizeStatus(1000)).toBe("ok");
    expect(sizeStatus(MAX_DOC_BYTES * 0.8)).toBe("near");
    expect(sizeStatus(MAX_DOC_BYTES + 1)).toBe("over");
  });

  it("ordena de la más pesada a la más liviana, con sus personas y jornadas", () => {
    const ids = (n) => Array.from({ length: n }, (_, i) => `ciclo__labor__11111111-1__2026-10-${String(i + 1).padStart(2, "0")}`);
    const rows = payrollSizeRows([
      { id: "chica", name: "Chica", items: [{ workdayIds: ids(2) }], workdayIds: ids(2) },
      { id: "grande", name: "Grande", items: [{ workdayIds: ids(20) }, { workdayIds: ids(10) }], workdayIds: ids(30) },
    ]);
    expect(rows.map((r) => [r.id, r.people, r.workdays, r.itemWorkdays])).toEqual([["grande", 2, 30, 30], ["chica", 1, 2, 2]]);
    expect(rows[0].editLog).toBeGreaterThan(rows[0].bytes);
    expect(rows[0].editStatus).toBe("ok");
  });
});
