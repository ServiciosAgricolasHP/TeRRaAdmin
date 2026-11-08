import { describe, it, expect } from "vitest";
import { millisOf, markOf, applyChanges, syncMode, timestampIso, newestFirst, deltaSince, advanceMarks } from "./syncedList";

describe("millisOf y markOf", () => {
  it("lee un Timestamp y el objeto en que queda guardado", () => {
    expect(millisOf({ toMillis: () => 1234 })).toBe(1234);
    expect(millisOf({ seconds: 2, nanoseconds: 5_000_000 })).toBe(2005);
    expect(millisOf(null)).toBe(0);
    expect(millisOf("x")).toBe(0);
  });

  it("la marca es la hora más reciente, o la actual si no hay una posterior", () => {
    const docs = [{ updatedAt: { seconds: 10 } }, { updatedAt: { seconds: 30 } }, {}];
    expect(markOf(docs, "updatedAt")).toBe(30_000);
    expect(markOf(docs, "updatedAt", 50_000)).toBe(50_000);
    expect(markOf([], "updatedAt", 7)).toBe(7);
  });
});

describe("timestampIso y newestFirst", () => {
  it("da la fecha ISO de un Timestamp y de su forma guardada, o vacío", () => {
    expect(timestampIso({ toMillis: () => Date.UTC(2026, 9, 1) })).toBe("2026-10-01T00:00:00.000Z");
    expect(timestampIso({ seconds: Date.UTC(2026, 9, 1) / 1000, nanoseconds: 0 })).toBe("2026-10-01T00:00:00.000Z");
    expect(timestampIso(undefined)).toBe("");
  });

  it("ordena del más nuevo al más viejo, con los que no tienen la hora primero", () => {
    const list = [
      { id: "viejo", createdAt: { seconds: 10 } },
      { id: "recién creado" },
      { id: "nuevo", createdAt: { toMillis: () => 30_000 } },
    ];
    expect(newestFirst(list).map((d) => d.id)).toEqual(["recién creado", "nuevo", "viejo"]);
    expect(list.map((d) => d.id)).toEqual(["viejo", "recién creado", "nuevo"]);
  });
});

describe("deltaSince y advanceMarks", () => {
  const margin = 5 * 60_000;

  it("sin nada asentado, trae desde unos minutos antes de la marca y anota la marca nueva", () => {
    expect(deltaSince({ mark: 1_000_000 }, margin)).toBe(700_000);
    const next = advanceMarks({ mark: 1_000_000 }, { start: 50, end: 60, newMark: 1_200_000, marginMs: margin });
    expect(next).toEqual({ mark: 1_200_000, safe: 700_000, checkpoints: [{ mark: 1_200_000, at: 60 }] });
  });

  it("una puesta al día que empieza el margen o más después de una anotación asienta esa marca", () => {
    const state = { mark: 1_200_000, safe: 700_000, checkpoints: [{ mark: 1_200_000, at: 60 }] };
    const early = advanceMarks(state, { start: 60 + margin - 1, end: 0, newMark: 1_200_000, marginMs: margin });
    expect(early.safe).toBe(700_000);
    const late = advanceMarks(state, { start: 60 + margin, end: 0, newMark: 1_200_000, marginMs: margin });
    expect(late).toEqual({ mark: 1_200_000, safe: 1_200_000, checkpoints: [] });
    // Sin escrituras nuevas, la siguiente trae solo lo posterior a la marca.
    expect(deltaSince(late, margin)).toBe(1_200_000);
  });

  it("guarda una anotación por marca, con la hora más temprana, y suelta las asentadas", () => {
    const state = { mark: 2_000, safe: 500, checkpoints: [{ mark: 1_000, at: 10 }, { mark: 2_000, at: 20 }] };
    const same = advanceMarks(state, { start: 30, end: 40, newMark: 2_000, marginMs: 100 });
    expect(same.checkpoints).toEqual(state.checkpoints);
    const later = advanceMarks(state, { start: 115, end: 120, newMark: 3_000, marginMs: 100 });
    expect(later).toEqual({ mark: 3_000, safe: 1_000, checkpoints: [{ mark: 2_000, at: 20 }, { mark: 3_000, at: 120 }] });
  });
});

describe("applyChanges", () => {
  const list = [
    { id: "1", name: "Ana" },
    { id: "2", name: "Beto" },
    { id: "3", name: "Caro" },
  ];
  const byName = ["name", "asc"];

  it("reemplaza por id, agrega los nuevos y ordena por el campo", () => {
    const out = applyChanges(list, [{ id: "2", name: "Zoe" }, { id: "4", name: "Bruno" }], byName);
    expect(out.map((w) => w.id)).toEqual(["1", "4", "3", "2"]);
    expect(out.find((w) => w.id === "2").name).toBe("Zoe");
  });

  it("deja fuera a quien no tiene el campo del orden, como la consulta ordenada", () => {
    const out = applyChanges(list, [{ id: "5", rut: "5-5" }], byName);
    expect(out).toHaveLength(3);
  });

  it("en orden descendente, de mayor a menor", () => {
    const out = applyChanges(list, [{ id: "4", name: "Bruno" }], ["name", "desc"]);
    expect(out.map((w) => w.name)).toEqual(["Caro", "Bruno", "Beto", "Ana"]);
  });

  it("sin orden, conserva el de la copia, agrega los nuevos al final y no deja a nadie fuera", () => {
    const out = applyChanges(list, [{ id: "2", name: "Zoe" }, { id: "5", rut: "5-5" }]);
    expect(out.map((w) => w.id)).toEqual(["1", "2", "3", "5"]);
  });

  it("no cambia la copia que recibe", () => {
    applyChanges(list, [{ id: "9", name: "Al" }], byName);
    expect(list.map((w) => w.id)).toEqual(["1", "2", "3"]);
  });
});

describe("syncMode", () => {
  const base = { hasCopy: true, fullDate: "2026-11-02", today: "2026-11-02", lastSyncAt: 1_000, now: 31_000, minGapMs: 60_000 };

  it("sin copia o con la carga completa de otro día, lee entera", () => {
    expect(syncMode({ ...base, hasCopy: false })).toBe("full");
    expect(syncMode({ ...base, fullDate: "2026-11-01" })).toBe("full");
    expect(syncMode({ ...base, fullDate: "2026-11-03" })).toBe("full");
    expect(syncMode({ ...base, fullDate: undefined })).toBe("full");
  });

  it("con una carga completa cada 7 días, la copia de hace 6 se pone al día y la de hace 7 se lee entera", () => {
    const weekly = { ...base, fullEveryDays: 7, now: 61_001 };
    expect(syncMode({ ...weekly, fullDate: "2026-10-27" })).toBe("delta");
    expect(syncMode({ ...weekly, fullDate: "2026-10-26" })).toBe("full");
  });

  it("con una carga completa cada 30 días, la copia de hace 29 se pone al día y la de hace 30 se lee entera", () => {
    const monthly = { ...base, fullEveryDays: 30, now: 61_001 };
    expect(syncMode({ ...monthly, fullDate: "2026-10-04" })).toBe("delta");
    expect(syncMode({ ...monthly, fullDate: "2026-10-03" })).toBe("full");
  });

  it("puesta al día hace menos de un minuto: la copia", () => {
    expect(syncMode(base)).toBe("cached");
  });

  it("después del minuto, o pedida al tiro, trae lo que cambió", () => {
    expect(syncMode({ ...base, now: 61_001 })).toBe("delta");
    expect(syncMode({ ...base, fresh: true })).toBe("delta");
    expect(syncMode({ ...base, lastSyncAt: 0 })).toBe("delta");
  });
});
