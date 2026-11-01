import { describe, it, expect } from "vitest";
import { emptyBuffer, addRead, addVisit, addTime, addWrite, toIncrements } from "./readMeterKeys";
import {
  decodeKey,
  collectionOfQuery,
  filterLogs,
  ratesOf,
  reportTotals,
  readsByDay,
  readsByScreen,
  readsByQuery,
  readsByCollection,
  readsByHour,
  weekdayOf,
  personName,
  readsByPerson,
  exportPayload,
  reportText,
} from "./readLogReport";

// Arma un documento de `readLogs` como lo deja el registro: las mismas sumas
// y las mismas claves codificadas.
function logOf({ date, userId, env = "prod", appVersion = "1.3.4", opens = 1 }, fill) {
  const buffer = emptyBuffer({ date, userId });
  fill(buffer);
  return { id: `${date}_${userId}_${env}`, date, userId, env, appVersion, opens, ...toIncrements(buffer, (n) => n) };
}

const PAYROLL_DETAIL = "/payroll › Detalle de nómina";

const ana = logOf({ date: "2026-11-02", userId: "u-ana" }, (b) => {
  addVisit(b, { hour: 9, screen: "/payroll" });
  addRead(b, { hour: 9, screen: "/payroll", query: "payrolls · orden createdAt · límite", docs: 50 });
  addRead(b, { hour: 9, screen: "/payroll", query: "worker", docs: 3000, cacheHit: true });
  addVisit(b, { hour: 9, screen: PAYROLL_DETAIL });
  addRead(b, { hour: 9, screen: PAYROLL_DETAIL, query: "workdays · cycleId ==", docs: 400 });
  addRead(b, { hour: 10, screen: PAYROLL_DETAIL, query: "workdays · cycleId ==", docs: 100 });
  addTime(b, { hour: 9, screen: "/payroll", seconds: 120 });
  addTime(b, { hour: 9, screen: PAYROLL_DETAIL, seconds: 60 });
  addWrite(b, { hour: 10, screen: PAYROLL_DETAIL, collection: "payrolls" });
});

const beto = logOf({ date: "2026-11-03", userId: "u-beto", appVersion: "1.3.3" }, (b) => {
  addVisit(b, { hour: 15, screen: "/cycles/:id" });
  addRead(b, { hour: 15, screen: "/cycles/:id", query: "workdays · cycleId ==", docs: 200 });
  addTime(b, { hour: 15, screen: "/cycles/:id", seconds: 600 });
});

const betoLocal = logOf({ date: "2026-11-03", userId: "u-beto", env: "local" }, (b) => {
  addRead(b, { hour: 16, screen: "/faenas", query: "cycles", docs: 140 });
});

const profiles = [
  { id: "u-ana", email: "ana@ejemplo.cl", role: "admin" },
  { id: "u-beto", alias: "Beto", role: "user" },
];

describe("decodeKey y collectionOfQuery", () => {
  it("devuelve la clave como se registró", () => {
    expect(decodeKey("%2Fpayroll › Detalle")).toBe("/payroll › Detalle");
    expect(decodeKey("cycles%2F:id%2Fnotes")).toBe("cycles/:id/notes");
    expect(decodeKey("100%")).toBe("100%");
  });

  it("toma la colección del principio de la consulta", () => {
    expect(collectionOfQuery("workdays · cycleId == · orden date")).toBe("workdays");
    expect(collectionOfQuery("readLogConfig · doc")).toBe("readLogConfig");
  });
});

describe("filterLogs", () => {
  const logs = [ana, beto, betoLocal];

  it("deja producción por defecto", () => {
    expect(filterLogs(logs).map((l) => l.id)).toEqual([ana.id, beto.id]);
    expect(filterLogs(logs, { env: "local" }).map((l) => l.id)).toEqual([betoLocal.id]);
    expect(filterLogs(logs, { env: "all" })).toHaveLength(3);
  });

  it("quita a los admin o deja a una persona", () => {
    expect(filterLogs(logs, { person: "noAdmins", profiles }).map((l) => l.userId)).toEqual(["u-beto"]);
    expect(filterLogs(logs, { person: "u-ana", profiles }).map((l) => l.userId)).toEqual(["u-ana"]);
  });

  it("un documento sin entorno cuenta como producción", () => {
    expect(filterLogs([{ id: "x", userId: "u" }])).toHaveLength(1);
  });
});

describe("ratesOf", () => {
  it("lecturas por visita y por minuto", () => {
    expect(ratesOf({ docs: 600, visits: 3, seconds: 120 })).toEqual({ perVisit: 200, perMinute: 300 });
  });

  it("null sin visitas o sin tiempo", () => {
    expect(ratesOf({ docs: 10, visits: 0, seconds: 0 })).toEqual({ perVisit: null, perMinute: null });
  });
});

describe("reportTotals y readsByDay", () => {
  it("suma lo cobrado, lo ahorrado, las visitas, el tiempo y las escrituras", () => {
    const totals = reportTotals([ana, beto]);
    expect(totals).toMatchObject({
      docs: 750,
      requests: 4,
      cacheHits: 1,
      cacheDocs: 3000,
      visits: 3,
      seconds: 780,
      writes: 1,
      opens: 2,
      people: 2,
      days: 2,
    });
  });

  it("un día por fila, en orden", () => {
    expect(readsByDay([beto, ana])).toEqual([
      { date: "2026-11-02", requests: 3, docs: 550, cacheHits: 1, cacheDocs: 3000, writes: 1, people: 1 },
      { date: "2026-11-03", requests: 1, docs: 200, cacheHits: 0, cacheDocs: 0, writes: 0, people: 1 },
    ]);
  });
});

describe("readsByScreen", () => {
  const rows = readsByScreen([ana, beto]);

  it("ordena por lecturas y suma los modales en su pantalla", () => {
    expect(rows.map((r) => r.screen)).toEqual(["/payroll", "/cycles/:id"]);
    const payroll = rows[0];
    expect(payroll).toMatchObject({ docs: 550, cacheDocs: 3000, seconds: 180, writes: 1, visits: 1 });
  });

  it("las consultas de la pantalla no traen las de sus modales", () => {
    expect(rows[0].queries.map((q) => q.query)).toEqual(["payrolls · orden createdAt · límite", "worker"]);
  });

  it("cada modal es una sección con sus visitas y consultas", () => {
    const [detail] = rows[0].sections;
    expect(detail).toMatchObject({ key: PAYROLL_DETAIL, label: "Detalle de nómina", visits: 1, docs: 500, seconds: 60, writes: 1 });
    expect(detail.queries).toEqual([{ query: "workdays · cycleId ==", requests: 2, docs: 500, cacheHits: 0, cacheDocs: 0 }]);
  });
});

describe("readsByQuery y readsByCollection", () => {
  it("junta una consulta de varias pantallas", () => {
    const [workdays] = readsByQuery([ana, beto]);
    expect(workdays).toMatchObject({ query: "workdays · cycleId ==", collection: "workdays", requests: 3, docs: 700 });
    expect(workdays.screens.map((s) => [s.screen, s.docs])).toEqual([[PAYROLL_DETAIL, 500], ["/cycles/:id", 200]]);
  });

  it("por colección, con las escrituras", () => {
    expect(readsByCollection([ana, beto]).map((c) => [c.collection, c.docs, c.cacheDocs, c.writes])).toEqual([
      ["workdays", 700, 0, 0],
      ["payrolls", 50, 0, 1],
      ["worker", 0, 3000, 0],
    ]);
  });
});

describe("readsByHour", () => {
  it("el lunes es 0 y el domingo 6", () => {
    expect(weekdayOf("2026-11-02")).toBe(0);
    expect(weekdayOf("2026-11-08")).toBe(6);
  });

  it("suma lo cobrado por hora y día de la semana", () => {
    const { grid, max } = readsByHour([ana, beto]);
    expect(grid[9][0]).toBe(450);
    expect(grid[10][0]).toBe(100);
    expect(grid[15][1]).toBe(200);
    expect(max).toBe(450);
  });
});

describe("readsByPerson", () => {
  it("muestra el alias, el correo o el principio del uid", () => {
    expect(personName({ alias: "Beto", email: "b@ejemplo.cl" }, "u")).toBe("Beto");
    expect(personName({ email: "b@ejemplo.cl" }, "u")).toBe("b@ejemplo.cl");
    expect(personName(undefined, "abcdefghij")).toBe("abcdef…");
  });

  it("una fila por persona, con días y versiones", () => {
    const rows = readsByPerson([ana, beto, betoLocal], profiles);
    expect(rows.map((r) => [r.name, r.admin, r.docs, r.days, r.versions])).toEqual([
      ["ana@ejemplo.cl", true, 550, 1, ["1.3.4"]],
      ["Beto", false, 340, 1, ["1.3.3", "1.3.4"]],
    ]);
  });
});

describe("exportPayload", () => {
  it("lleva los registros, el rango, los filtros y de cada persona solo el uid y si es admin", () => {
    const out = exportPayload({ logs: [ana, beto], profiles, from: "2026-11-02", to: "2026-11-08", person: "all", env: "prod", exportedAt: "x" });
    expect(out).toMatchObject({ format: "terra-read-logs", range: { from: "2026-11-02", to: "2026-11-08" }, filters: { person: "all", env: "prod" } });
    expect(out.people).toEqual([{ userId: "u-ana", admin: true }, { userId: "u-beto", admin: false }]);
    expect(out.logs).toHaveLength(2);
    expect(JSON.stringify(out)).not.toContain("ejemplo.cl");
  });
});

describe("reportText", () => {
  const text = reportText({ logs: [ana, beto], from: "2026-11-02", to: "2026-11-08", filters: "Producción" });

  it("trae el encabezado y los totales", () => {
    expect(text).toContain("# Informe de lecturas, del 2026-11-02 al 2026-11-08 (Producción)");
    expect(text).toContain("Lecturas cobradas: 750 · ahorradas por caché: 3.000");
  });

  it("los días, las pantallas con sus modales y sus consultas", () => {
    expect(text).toContain("| Lun 2026-11-02 | 550 | 3.000 | 1 | 1 |");
    expect(text).toContain("| /payroll | 1 | 3m | 550 | 73,3% | 550 | 183 | 3.000 |");
    expect(text).toContain("| › Detalle de nómina | 1 | 1m | 500 | 66,7% | 500 | 500 | — |");
    expect(text).toContain("**/payroll › Detalle de nómina**");
    expect(text).toContain("- `workdays · cycleId ==`: 500 en 2 peticiones");
  });

  it("las consultas y las colecciones", () => {
    expect(text).toContain("| `workdays · cycleId ==` | 3 | 700 | 93,3% | 233 | — | 2 |");
    expect(text).toContain("| `worker` | 0 | 0,0% | 0 | 3.000 | — |");
  });
});
