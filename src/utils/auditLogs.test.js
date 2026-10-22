import { describe, it, expect } from "vitest";
import { fmtDuration, formatValue, humanizeField, sessionize, toDate } from "./auditLogs";
import { fmtCurrency, fmtNumber } from "./format";

const at = (h, m) => new Date(2026, 9, 21, h, m);
const log = (email, h, m, extra = {}) => ({ email, timestamp: { toDate: () => at(h, m) }, ...extra });

describe("toDate", () => {
  it("acepta un Timestamp, `seconds`, texto y número", () => {
    const d = at(10, 30);
    expect(toDate({ toDate: () => d })).toBe(d);
    expect(toDate({ seconds: d.getTime() / 1000 }).getTime()).toBe(d.getTime());
    expect(toDate(d.toISOString()).getTime()).toBe(d.getTime());
    expect(toDate(d.getTime()).getTime()).toBe(d.getTime());
  });

  it("sin timestamp todavía (recién escrito) usa la hora actual", () => {
    const before = Date.now();
    expect(toDate(null).getTime()).toBeGreaterThanOrEqual(before);
  });
});

describe("sessionize", () => {
  it("corta una sesión cuando la pausa supera el gap, por usuario", () => {
    const logs = [
      log("ana@x.cl", 10, 0, { entity: "workday", action: "create" }),
      log("ana@x.cl", 10, 10, { entity: "workday", action: "update" }),
      log("beto@x.cl", 10, 5, { entity: "cycle", action: "update" }),
      log("ana@x.cl", 11, 0, { entity: "payroll", action: "delete" }),
    ];
    const sessions = sessionize(logs, 30);
    expect(sessions.map((s) => [s.userKey, s.count, s.startDate.getHours(), s.startDate.getMinutes()])).toEqual([
      ["ana@x.cl", 1, 11, 0],
      ["beto@x.cl", 1, 10, 5],
      ["ana@x.cl", 2, 10, 0],
    ]);
  });

  it("una pausa igual al gap sigue en la misma sesión", () => {
    const sessions = sessionize([log("ana@x.cl", 10, 0), log("ana@x.cl", 10, 30)], 30);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].durationMs).toBe(30 * 60 * 1000);
  });

  it("ordena cada usuario por hora aunque los logs vengan desordenados", () => {
    const sessions = sessionize([log("ana@x.cl", 10, 20), log("ana@x.cl", 10, 0)], 30);
    expect(sessions[0].startDate.getMinutes()).toBe(0);
    expect(sessions[0].endDate.getMinutes()).toBe(20);
  });

  it("agrupa por correo, si no por uid, y si no como desconocido", () => {
    const sessions = sessionize(
      [{ uid: "u1", timestamp: { toDate: () => at(9, 0) } }, { timestamp: { toDate: () => at(8, 0) } }],
      30,
    );
    expect(sessions.map((s) => [s.userKey, s.email, s.uid])).toEqual([
      ["u1", null, "u1"],
      ["unknown", null, null],
    ]);
  });

  it("resume cada sesión por acción y por entidad, la más frecuente primero", () => {
    const logs = [
      log("ana@x.cl", 10, 0, { entity: "workday", action: "create" }),
      log("ana@x.cl", 10, 1, { entity: "workday", action: "update" }),
      log("ana@x.cl", 10, 2, { entity: "cycle", action: "update" }),
      log("ana@x.cl", 10, 3, { action: "import" }),
    ];
    const [s] = sessionize(logs, 30);
    expect(s.count).toBe(4);
    expect(s.byAction).toEqual({ create: 1, update: 2, delete: 0 });
    expect(s.byEntity).toEqual([["workday", 2], ["cycle", 1], ["?", 1]]);
  });

  it("cada sesión tiene un id propio", () => {
    const sessions = sessionize([log("ana@x.cl", 10, 0), log("ana@x.cl", 12, 0), log("beto@x.cl", 10, 0)], 30);
    expect(new Set(sessions.map((s) => s.id)).size).toBe(3);
  });
});

describe("fmtDuration", () => {
  it("muestra segundos, minutos u horas y minutos", () => {
    expect(fmtDuration(45_000)).toBe("45s");
    expect(fmtDuration(5 * 60_000 + 59_000)).toBe("5m");
    expect(fmtDuration(65 * 60_000)).toBe("1h 5m");
  });
});

describe("campos de un cambio", () => {
  it("humanizeField usa el nombre en español o separa el camelCase", () => {
    expect(humanizeField("rut")).toBe("RUT");
    expect(humanizeField("payrollId")).toBe("Quincena");
    expect(humanizeField("settlementStatus")).toBe("Settlement Status");
  });

  it("formatValue muestra plata, números, sí/no, listas y objetos", () => {
    expect(formatValue("amount", 15000)).toBe(fmtCurrency(15000));
    expect(formatValue("tarifaHE", 3500)).toBe(fmtCurrency(3500));
    expect(formatValue("qty", 1500)).toBe(fmtNumber(1500));
    expect(formatValue("active", true)).toBe("Sí");
    expect(formatValue("days", ["a"])).toBe("[1 elemento]");
    expect(formatValue("days", ["a", "b"])).toBe("[2 elementos]");
    expect(formatValue("dayPrices", { a: 1 })).toBe("{…}");
    expect(formatValue("notes", "")).toBe("—");
    expect(formatValue("notes", null)).toBe("—");
    expect(formatValue("notes", "hola")).toBe("hola");
  });
});
