import { describe, it, expect } from "vitest";
import { millisOf, markOf, applyWorkerChanges, syncMode } from "./workersSync";

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

describe("applyWorkerChanges", () => {
  const list = [
    { id: "1", name: "Ana" },
    { id: "2", name: "Beto" },
    { id: "3", name: "Caro" },
  ];

  it("reemplaza por id, agrega los nuevos y ordena por nombre", () => {
    const out = applyWorkerChanges(list, [{ id: "2", name: "Zoe" }, { id: "4", name: "Bruno" }]);
    expect(out.map((w) => w.id)).toEqual(["1", "4", "3", "2"]);
    expect(out.find((w) => w.id === "2").name).toBe("Zoe");
  });

  it("deja fuera a quien no tiene nombre, como la consulta ordenada", () => {
    const out = applyWorkerChanges(list, [{ id: "5", rut: "5-5" }]);
    expect(out).toHaveLength(3);
  });

  it("no cambia la copia que recibe", () => {
    applyWorkerChanges(list, [{ id: "9", name: "Al" }]);
    expect(list.map((w) => w.id)).toEqual(["1", "2", "3"]);
  });
});

describe("syncMode", () => {
  const base = { hasCopy: true, fullDate: "2026-11-02", today: "2026-11-02", lastSyncAt: 1_000, now: 31_000, minGapMs: 60_000 };

  it("sin copia o con la carga completa de otro día, lee entera", () => {
    expect(syncMode({ ...base, hasCopy: false })).toBe("full");
    expect(syncMode({ ...base, fullDate: "2026-11-01" })).toBe("full");
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
