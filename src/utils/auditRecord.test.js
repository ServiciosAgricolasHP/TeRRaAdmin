import { describe, it, expect } from "vitest";
import {
  groupLogsByDayAndAuthor,
  indexLinkOf,
  isOpenRecord,
  customRangeError,
  filterRecordLogs,
  rangeBounds,
  recordScope,
  recordSummary,
  workdayLabel,
  workdayLabelContext,
} from "./auditRecord";

describe("rangeBounds", () => {
  const now = new Date(2026, 10, 12, 15, 30);

  it("parte en la medianoche local del primer día y llega hasta el final de hoy", () => {
    expect(rangeBounds("today", now)).toEqual({ since: new Date(2026, 10, 12), until: new Date(2026, 10, 13) });
    expect(rangeBounds("7d", now).since).toEqual(new Date(2026, 10, 6));
    expect(rangeBounds("30d", now).since).toEqual(new Date(2026, 9, 14));
  });

  it("el personalizado va del primer día al final del último", () => {
    expect(rangeBounds("custom", now, { from: "2026-10-01", to: "2026-10-30" })).toEqual({
      since: new Date(2026, 9, 1),
      until: new Date(2026, 9, 31),
    });
  });

  it("un personalizado que no sirve no tiene límites", () => {
    expect(rangeBounds("custom", now, { from: "2026-10-01", to: "" })).toBeNull();
  });
});

describe("customRangeError", () => {
  it("pide los dos días, en orden, y hasta 30 días", () => {
    expect(customRangeError("2026-10-01", "2026-10-30")).toBe("");
    expect(customRangeError("2026-11-12", "2026-11-12")).toBe("");
    expect(customRangeError("", "2026-10-30")).toBe("Elige el día de inicio y el de término.");
    expect(customRangeError("2026-10-30", "2026-10-01")).toBe("El inicio va antes del término.");
    expect(customRangeError("2026-10-01", "2026-10-31")).toBe("El rango puede abarcar hasta 30 días (este abarca 31).");
  });
});

describe("indexLinkOf", () => {
  it("saca el enlace para crear el índice que falta", () => {
    const err = { code: "failed-precondition", message: "The query requires an index. You can create it here: https://console.firebase.google.com/v1/r/project/demo/firestore/indexes?create_composite=abc" };
    expect(indexLinkOf(err)).toBe("https://console.firebase.google.com/v1/r/project/demo/firestore/indexes?create_composite=abc");
  });

  it("otro error no trae enlace", () => {
    expect(indexLinkOf({ code: "permission-denied", message: "x" })).toBeNull();
    expect(indexLinkOf({ code: "failed-precondition", message: "otra cosa" })).toBeNull();
  });
});

describe("isOpenRecord", () => {
  const cycles = [
    { id: "c1", faenaId: "f1", subfaenaId: "s1", status: "open" },
    { id: "c2", faenaId: "f2", subfaenaId: "s2", status: "closed" },
  ];

  it("separa lo abierto de lo cerrado según el tipo", () => {
    expect(isOpenRecord("cycle", cycles[0])).toBe(true);
    expect(isOpenRecord("cycle", cycles[1])).toBe(false);
    expect(isOpenRecord("faena", { id: "f1" }, cycles)).toBe(true);
    expect(isOpenRecord("faena", { id: "f2" }, cycles)).toBe(false);
    expect(isOpenRecord("subfaena", { id: "s2" }, cycles)).toBe(false);
    expect(isOpenRecord("carrier", { id: "t1", active: false })).toBe(false);
    expect(isOpenRecord("worker", { id: "w1", mergedInto: "w2" })).toBe(false);
    expect(isOpenRecord("worker", { id: "w2" })).toBe(true);
    expect(isOpenRecord("company", { id: "e1" })).toBe(true);
    expect(isOpenRecord("payroll", { id: "p1", status: "pending" })).toBe(true);
    expect(isOpenRecord("payroll", { id: "p2", status: "paid" })).toBe(false);
    expect(isOpenRecord("user", { id: "u1" })).toBe(true);
    expect(isOpenRecord("user", { id: "u2", disabled: true })).toBe(false);
  });
});

describe("workdayLabel", () => {
  const ctx = workdayLabelContext(
    [{ id: "c1", label: "Ciclo 6", labors: [{ id: "l1", name: "Poda" }] }],
    [{ id: "11111111-1", rut: "11111111-1", name: "Ana Rojas" }],
  );

  it("traduce el id a labor, ciclo, fecha y persona", () => {
    expect(workdayLabel("c1__l1__11111111-1__2026-11-12", ctx)).toBe("Poda · Ciclo 6 · 12-nov · Ana Rojas");
    expect(workdayLabel("c1__l1__11111111-1__2026-11-02__1_0", ctx)).toBe("Poda · Ciclo 6 · 2-nov · Ana Rojas");
  });

  it("no repite el ciclo ni la persona del registro elegido", () => {
    expect(workdayLabel("c1__l1__11111111-1__2026-11-12", ctx, { cycleId: "c1" })).toBe("Poda · 12-nov · Ana Rojas");
    expect(workdayLabel("c1__l1__11111111-1__2026-11-12", ctx, { workerKey: "11111111-1" })).toBe("Poda · Ciclo 6 · 12-nov");
  });

  it("sin el ciclo o la persona en las listas, muestra lo que dice el id", () => {
    expect(workdayLabel("c9__l1__22222222-2__2026-11-12", ctx)).toBe("12-nov · 22222222-2");
    expect(workdayLabel("otro-id", ctx)).toBeNull();
  });
});

describe("recordScope", () => {
  const cycles = [
    { id: "c1", faenaId: "f1", subfaenaId: "s1", status: "closed" },
    { id: "c2", faenaId: "f1", subfaenaId: "s2" },
    { id: "c3", faenaId: "f2", subfaenaId: "s3" },
  ];
  const subjobs = [{ id: "s1", faenaId: "f1" }, { id: "s2", faenaId: "f1" }, { id: "s3", faenaId: "f2" }];

  it("una faena abarca todos sus ciclos, también los cerrados, y sus subfaenas", () => {
    expect(recordScope("faena", "f1", { cycles, subjobs })).toEqual({ cycleIds: ["c1", "c2"], subjobIds: ["s1", "s2"] });
  });

  it("una subfaena, sus ciclos", () => {
    expect(recordScope("subfaena", "s2", { cycles, subjobs })).toEqual({ cycleIds: ["c2"], subjobIds: [] });
  });

  it("otro tipo, nada más", () => {
    expect(recordScope("worker", "w1", { cycles, subjobs })).toEqual({ cycleIds: [], subjobIds: [] });
  });
});

describe("recordSummary y groupLogsByDayAndAuthor", () => {
  const ts = (y, m, d, h) => ({ seconds: new Date(y, m - 1, d, h).getTime() / 1000 });
  const logs = [
    { id: "a", entity: "workday", action: "update", userName: "María", timestamp: ts(2026, 11, 12, 18) },
    { id: "b", entity: "workday", action: "create", userName: "María", timestamp: ts(2026, 11, 12, 17) },
    { id: "c", entity: "cycle", action: "harvestImport", email: "bruno@ejemplo.cl", timestamp: ts(2026, 11, 12, 10) },
    { id: "d", entity: "workday", action: "create", userName: "María", timestamp: ts(2026, 11, 11, 9) },
  ];

  it("cuenta por tipo y acción, por quién y por día", () => {
    expect(recordSummary(logs)).toEqual({
      total: 4,
      byEntity: [
        { entity: "workday", count: 3, actions: [{ action: "create", count: 2 }, { action: "update", count: 1 }] },
        { entity: "cycle", count: 1, actions: [{ action: "harvestImport", count: 1 }] },
      ],
      byAuthor: [{ who: "María", count: 3 }, { who: "bruno", count: 1 }],
      byDay: [{ day: "2026-11-12", count: 3 }, { day: "2026-11-11", count: 1 }],
    });
  });

  it("agrupa los seguidos del mismo día y la misma persona", () => {
    expect(groupLogsByDayAndAuthor(logs).map((g) => [g.day, g.who, g.items.map((i) => i.log.id)])).toEqual([
      ["2026-11-12", "María", ["a", "b"]],
      ["2026-11-12", "bruno", ["c"]],
      ["2026-11-11", "María", ["d"]],
    ]);
  });
});

describe("filterRecordLogs", () => {
  const logs = [
    { id: "a", entity: "workday", action: "update" },
    { id: "b", entity: "workday", action: "create" },
    { id: "c", entity: "cycle", action: "update" },
  ];

  it("deja los del tipo y, si se elige, la acción", () => {
    expect(filterRecordLogs(logs).map((l) => l.id)).toEqual(["a", "b", "c"]);
    expect(filterRecordLogs(logs, { entity: "workday" }).map((l) => l.id)).toEqual(["a", "b"]);
    expect(filterRecordLogs(logs, { entity: "workday", action: "create" }).map((l) => l.id)).toEqual(["b"]);
  });
});
