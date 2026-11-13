import { describe, it, expect } from "vitest";
import { Timestamp } from "firebase/firestore";
import { fetchRecordLogs } from "../../src/services/auditService";
import { rangeBounds } from "../../src/utils/auditRecord";
import { CICLO, FAENA, SUBFAENA, set } from "./helpers/seed";

// El historial de un ciclo en la Auditoría: sus cambios, los de sus jornadas y
// las sincronizaciones de Pesajes QR, del rango elegido.
const at = (date) => Timestamp.fromDate(date);
const now = new Date();
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9);
const tenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 10, 9);

async function seedLogs() {
  await set("logs", "l-cycle-today", { action: "update", entity: "cycle", entityId: CICLO, timestamp: at(today) });
  await set("logs", "l-cycle-old", { action: "update", entity: "cycle", entityId: CICLO, timestamp: at(tenDaysAgo) });
  await set("logs", "l-workday-today", {
    action: "update", entity: "workday", entityId: `${CICLO}__labor-1__11111111-1__2026-11-12`,
    meta: { cycleId: CICLO, workerRut: "11111111-1" }, timestamp: at(today),
  });
  await set("logs", "l-qr-old", { action: "harvestSync", entity: "qrPrefix", entityId: "AB", meta: { cycleId: CICLO }, timestamp: at(tenDaysAgo) });
  await set("logs", "l-other-cycle", { action: "update", entity: "workday", entityId: "ciclo-2__l__x__2026-11-12", meta: { cycleId: "ciclo-2" }, timestamp: at(today) });
}

describe("el historial de un ciclo por rango", () => {
  it("hoy trae lo de hoy del ciclo y de sus jornadas", async () => {
    await seedLogs();
    const { logs, missingIndexes } = await fetchRecordLogs("cycle", CICLO, rangeBounds("today"));
    expect(missingIndexes).toEqual([]);
    expect(logs.map((l) => l.id).sort()).toEqual(["l-cycle-today", "l-workday-today"]);
  });

  it("un rango más largo suma lo anterior, también las sincronizaciones de Pesajes QR, del más nuevo al más viejo", async () => {
    await seedLogs();
    const { logs } = await fetchRecordLogs("cycle", CICLO, rangeBounds("30d"));
    expect(logs).toHaveLength(4);
    expect(logs.map((l) => l.id).slice(2).sort()).toEqual(["l-cycle-old", "l-qr-old"]);
  });
});

describe("el historial de una faena", () => {
  it("suma sus subfaenas y lo de todos sus ciclos, también con más de 30 ciclos", async () => {
    await seedLogs();
    await set("logs", "l-faena", { action: "update", entity: "faena", entityId: FAENA, timestamp: at(today) });
    await set("logs", "l-subfaena", { action: "update", entity: "subfaena", entityId: SUBFAENA, timestamp: at(today) });
    await set("logs", "l-cycle-35", { action: "laborClear", entity: "cycle", entityId: "ciclo-35", timestamp: at(today) });
    await set("logs", "l-other-faena", { action: "update", entity: "faena", entityId: "faena-2", timestamp: at(today) });
    const cycleIds = [CICLO, ...Array.from({ length: 34 }, (_, i) => `ciclo-${i + 2}`)];

    const { logs, missingIndexes } = await fetchRecordLogs("faena", FAENA, {
      ...rangeBounds("today"),
      scope: { cycleIds, subjobIds: [SUBFAENA] },
    });
    expect(missingIndexes).toEqual([]);
    expect(logs.map((l) => l.id).sort()).toEqual(
      ["l-cycle-35", "l-cycle-today", "l-faena", "l-other-cycle", "l-subfaena", "l-workday-today"].sort(),
    );
  });
});
