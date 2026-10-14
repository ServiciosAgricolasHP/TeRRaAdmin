import { describe, it, expect } from "vitest";
import { buildCobrarSections, mergeTargetOf, mergedRows, mergedTotals } from "./cobrarMerge";

const labor = (id, type = "main", over = {}) => ({
  labor: { id, name: id.toUpperCase(), type },
  include: true,
  mergeInto: null,
  unit: "Jornadas",
  chargedRows: [],
  chargedTotals: { amount: 0, qty: 0 },
  ...over,
});

const byIdOf = (list) => new Map(list.map((ld) => [ld.labor.id, ld]));

describe("mergeTargetOf", () => {
  it("acepta otra labor incluida de la misma familia", () => {
    const a = labor("a");
    const b = labor("b", "supervision", { mergeInto: "a" });
    expect(mergeTargetOf(b, byIdOf([a, b]))).toBe(a);
  });

  it("ignora destinos inválidos", () => {
    const a = labor("a", "main", { include: false });
    const b = labor("b", "main", { mergeInto: "a" });
    const c = labor("c", "main", { mergeInto: "c" });
    const d = labor("d", "main", { mergeInto: "zz" });
    const list = [a, b, c, d];
    expect(mergeTargetOf(b, byIdOf(list))).toBe(null); // destino excluido
    expect(mergeTargetOf(c, byIdOf(list))).toBe(null); // a sí misma
    expect(mergeTargetOf(d, byIdOf(list))).toBe(null); // no existe
  });

  it("no junta tratoHE con labores de cantidad × tarifa", () => {
    const a = labor("a", "main");
    const h = labor("h", "tratoHE", { mergeInto: "a" });
    expect(mergeTargetOf(h, byIdOf([a, h]))).toBe(null);
  });

  it("ignora cadenas: el destino no puede estar fusionado en otra", () => {
    const a = labor("a");
    const b = labor("b", "main", { mergeInto: "a" });
    const c = labor("c", "main", { mergeInto: "b" });
    expect(mergeTargetOf(c, byIdOf([a, b, c]))).toBe(null);
  });

  it("una labor excluida no se fusiona", () => {
    const a = labor("a");
    const b = labor("b", "main", { include: false, mergeInto: "a" });
    expect(mergeTargetOf(b, byIdOf([a, b]))).toBe(null);
  });
});

describe("buildCobrarSections", () => {
  it("agrupa las fusionadas bajo su destino y conserva el orden", () => {
    const a = labor("a");
    const b = labor("b");
    const c = labor("c", "extra", { mergeInto: "a" });
    const sections = buildCobrarSections([a, b, c]);
    expect(sections.map((s) => s.lead.labor.id)).toEqual(["a", "b"]);
    expect(sections[0].members.map((m) => m.labor.id)).toEqual(["a", "c"]);
    expect(sections[1].members.map((m) => m.labor.id)).toEqual(["b"]);
  });

  it("sin fusiones, una sección por labor", () => {
    const sections = buildCobrarSections([labor("a"), labor("b")]);
    expect(sections.map((s) => s.members.length)).toEqual([1, 1]);
  });
});

describe("mergedRows", () => {
  it("marca el origen de cada fila y ordena por fecha", () => {
    const a = labor("a", "main", { chargedRows: [{ date: "2026-10-02", rowKey: "2026-10-02" }] });
    const b = labor("b", "extra", {
      chargedRows: [
        { date: "2026-10-01", rowKey: "2026-10-01" },
        { date: "", isExtra: true, extraId: "x1" },
      ],
    });
    const rows = mergedRows([a, b]);
    expect(rows.map((r) => [r._laborId, r.date])).toEqual([
      ["b", "2026-10-01"],
      ["a", "2026-10-02"],
      ["b", ""],
    ]);
    expect(rows[0]._laborName).toBe("B");
    expect(rows[0]._laborType).toBe("extra");
    // rowKey y extraId quedan intactos: con ellos se guarda la edición en su labor.
    expect(rows[0].rowKey).toBe("2026-10-01");
    expect(rows[2].extraId).toBe("x1");
  });
});

describe("mergedTotals", () => {
  it("suma montos y deja la cantidad si todas miden lo mismo", () => {
    const a = labor("a", "main", { chargedTotals: { amount: 100, qty: 2, transport: 10 } });
    const b = labor("b", "main", { chargedTotals: { amount: 50, qty: 1 } });
    const t = mergedTotals([a, b]);
    expect(t.amount).toBe(150);
    expect(t.transport).toBe(10);
    expect(t.qty).toBe(3);
  });

  it("no suma cantidades de medidas distintas", () => {
    const a = labor("a", "main", { chargedTotals: { amount: 100, qty: 2 } });
    const b = labor("b", "cosecha", { unit: "Kilos", chargedTotals: { amount: 50, qty: 300 } });
    const t = mergedTotals([a, b]);
    expect(t.amount).toBe(150);
    expect(t.qty).toBe(null);
  });
});
