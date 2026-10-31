import { describe, it, expect } from "vitest";
import {
  screenOf,
  collectionPathOf,
  describeQuery,
  billedReads,
  emptyBuffer,
  isEmptyBuffer,
  addRead,
  addVisit,
  addWrite,
  addTime,
  mergeBuffers,
  sectionKey,
  meterEnabled,
  encodeKey,
  toIncrements,
} from "./readMeterKeys";

describe("screenOf", () => {
  it("quita la base y cambia los ids por :id", () => {
    expect(screenOf("/TeRRaAdmin/cycles/abc123")).toBe("/cycles/:id");
    expect(screenOf("/TeRRaAdmin/payroll")).toBe("/payroll");
    expect(screenOf("/TeRRaAdmin")).toBe("/");
    expect(screenOf("/TeRRaAdmin/")).toBe("/");
    expect(screenOf("/TeRRaAdmin/x/AbCdEfGhIj0123456789")).toBe("/x/:id");
  });

  it("deja las rutas con palabras", () => {
    expect(screenOf("/TeRRaAdmin/admin/cleanup-paid-workdays")).toBe("/admin/cleanup-paid-workdays");
    expect(screenOf("/otra/ruta", "/TeRRaAdmin")).toBe("/otra/ruta");
  });
});

describe("collectionPathOf y describeQuery", () => {
  it("la ruta de una subcolección no lleva el id del documento", () => {
    expect(collectionPathOf("cycles/abc/notes")).toBe("cycles/:id/notes");
    expect(collectionPathOf("worker")).toBe("worker");
  });

  it("describe filtros, orden y límite sin valores", () => {
    expect(
      describeQuery({ collection: "workdays", filters: [["cycleId", "=="], ["date", ">="]], order: ["date"], limit: 5 }),
    ).toBe("workdays · cycleId == · date >= · orden date · límite");
    expect(describeQuery({ collection: "users", doc: true })).toBe("users · doc");
    expect(describeQuery({ collection: "worker" })).toBe("worker");
  });
});

describe("billedReads", () => {
  it("cobra un documento por cada uno, y uno si viene vacía", () => {
    expect(billedReads("query", 500)).toBe(500);
    expect(billedReads("query", 0)).toBe(1);
    expect(billedReads("doc", 0)).toBe(1);
  });

  it("un conteo cobra uno por cada mil", () => {
    expect(billedReads("count", 0)).toBe(1);
    expect(billedReads("count", 1000)).toBe(1);
    expect(billedReads("count", 11506)).toBe(12);
  });
});

describe("la cuenta acumulada", () => {
  const fresh = () => emptyBuffer({ date: "2026-11-02", userId: "u1" });

  it("suma lecturas, aciertos de caché, visitas y escrituras por hora y pantalla", () => {
    const b = fresh();
    expect(isEmptyBuffer(b)).toBe(true);
    addRead(b, { hour: 9, screen: "/payroll", query: "worker · orden name", docs: 3137 });
    addRead(b, { hour: 9, screen: "/payroll", query: "worker · orden name", docs: 3137, cacheHit: true });
    addRead(b, { hour: 9, screen: "/payroll", query: "worker · orden name", docs: 1 });
    addVisit(b, { hour: 9, screen: "/payroll" });
    addWrite(b, { hour: 14, screen: "/cycles/:id", collection: "workdays" });
    expect(b.reads["09"]["/payroll"]["worker · orden name"]).toEqual({ requests: 2, docs: 3138, cacheHits: 1, cacheDocs: 3137 });
    expect(b.visits).toEqual({ "09": { "/payroll": 1 } });
    expect(b.writes).toEqual({ 14: { "/cycles/:id": { workdays: 1 } } });
    expect(isEmptyBuffer(b)).toBe(false);
  });

  it("junta dos cuentas sumando hoja por hoja", () => {
    const a = fresh();
    const b = fresh();
    addRead(a, { hour: 9, screen: "/", query: "q", docs: 2 });
    addRead(b, { hour: 9, screen: "/", query: "q", docs: 3 });
    addRead(b, { hour: 10, screen: "/", query: "q", docs: 1 });
    b.opens = 1;
    mergeBuffers(a, b);
    expect(a.reads["09"]["/"].q).toEqual({ requests: 2, docs: 5 });
    expect(a.reads["10"]["/"].q).toEqual({ requests: 1, docs: 1 });
    expect(a.opens).toBe(1);
  });

  it("arma las sumas sin puntos ni barras en las claves y sin secciones vacías", () => {
    const b = fresh();
    addRead(b, { hour: 9, screen: "/cycles/:id", query: "a.b", docs: 4 });
    b.opens = 2;
    const inc = (n) => ({ inc: n });
    expect(toIncrements(b, inc)).toEqual({
      reads: { "09": { "%2Fcycles%2F:id": { "a%2Eb": { requests: { inc: 1 }, docs: { inc: 4 } } } } },
      opens: { inc: 2 },
    });
    expect(decodeURIComponent(encodeKey("/x/1.5%"))).toBe("/x/1.5%");
  });
});

describe("sectionKey y meterEnabled", () => {
  it("junta la pantalla con los modales abiertos", () => {
    expect(sectionKey("/payroll", [])).toBe("/payroll");
    expect(sectionKey("/transports", ["Detalle de quincena", "Editar vuelta"])).toBe(
      "/transports › Detalle de quincena › Editar vuelta",
    );
  });

  it("registra solo encendido y hasta la fecha, inclusive", () => {
    expect(meterEnabled(null, "2026-11-02")).toBe(false);
    expect(meterEnabled({ enabled: false }, "2026-11-02")).toBe(false);
    expect(meterEnabled({ enabled: true }, "2026-11-02")).toBe(true);
    expect(meterEnabled({ enabled: true, until: "2026-11-02" }, "2026-11-02")).toBe(true);
    expect(meterEnabled({ enabled: true, until: "2026-11-01" }, "2026-11-02")).toBe(false);
  });
});

describe("el tiempo en pantalla", () => {
  it("suma segundos por hora y pantalla, y viaja con las demás sumas", () => {
    const b = emptyBuffer({ date: "2026-11-02", userId: "u1" });
    addTime(b, { hour: 9, screen: "/cycles/:id", seconds: 15 });
    addTime(b, { hour: 9, screen: "/cycles/:id", seconds: 15 });
    expect(b.time).toEqual({ "09": { "/cycles/:id": 30 } });
    expect(isEmptyBuffer(b)).toBe(false);
    const other = emptyBuffer({ date: "2026-11-02", userId: "u1" });
    addTime(other, { hour: 9, screen: "/cycles/:id", seconds: 15 });
    mergeBuffers(b, other);
    expect(b.time["09"]["/cycles/:id"]).toBe(45);
    expect(toIncrements(b, (n) => n)).toEqual({ time: { "09": { "%2Fcycles%2F:id": 45 } } });
  });
});
