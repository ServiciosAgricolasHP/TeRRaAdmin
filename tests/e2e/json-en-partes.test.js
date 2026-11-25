import { describe, it, expect } from "vitest";
import {
  deleteSnapshot,
  extendSnapshot,
  pruneSnapshot,
  readSnapshot,
  saveSnapshot,
  snapshotWorkdayOf,
  syncSnapshotAmounts,
} from "../../src/services/payrollSnapshots";
import { recalcPayrollAggregates } from "../../src/services/payrollsService";
import { all, get, set } from "./helpers/seed";

// El JSON de una nómina de temporada alta: más jornadas de las que caben en un
// documento, que se guardan en partes (`payrollSnapshotWorkdays`).
const ID = "nom-grande";
const PARTS = "payrollSnapshotWorkdays";

const day = (i, rut = "11111111-1") =>
  snapshotWorkdayOf({
    id: `ciclo-1__labor-1__${rut}__2026-11-${String((i % 28) + 1).padStart(2, "0")}__${i}`,
    cycleId: "ciclo-1",
    laborId: "labor-1",
    workerRut: rut,
    date: `2026-11-${String((i % 28) + 1).padStart(2, "0")}`,
    qty: 12.5,
    amount: 1000 + i,
    qualityX: 1,
    containerY: 2,
  });

const items = (workdays) => [
  { rut: "11111111-1", workerId: "11111111-1", bankCode: "012", amount: 5000, grossAmount: 5000, workdayIds: workdays.map((w) => w.id) },
];

const big = (n) => {
  const workdays = Array.from({ length: n }, (_, i) => day(i));
  return {
    version: 1,
    payrollId: ID,
    payroll: { name: "Semana 50", total: 5000 },
    cycles: [{ id: "ciclo-1", label: "Fundo/Norte/Ciclo 1" }],
    workers: items(workdays),
    workdays,
    advances: [],
  };
};

const partsOf = async (id) => (await all(PARTS)).filter((p) => p.payrollId === id).sort((a, b) => a.index - b.index);

describe("el JSON de la nómina en partes", () => {
  it("guarda las jornadas en partes y al leerlo vuelve entero, en su orden", async () => {
    const snapshot = big(4000);
    expect(await saveSnapshot(ID, snapshot)).toBe(true);

    const header = await get("payrollSnapshots", ID);
    expect(header.workdays).toBeUndefined();
    expect(header.workdayParts).toBeGreaterThanOrEqual(2);
    const parts = await partsOf(ID);
    expect(parts.map((p) => p.id)).toEqual(Array.from({ length: header.workdayParts }, (_, i) => `${ID}__${i}`));

    const read = await readSnapshot({ id: ID });
    expect(read.workdays).toEqual(snapshot.workdays);
    expect(read.workers).toEqual(snapshot.workers);
    expect(read).not.toHaveProperty("workdayParts");

    const logs = (await all("logs")).filter((l) => l.entity === "payrollSnapshot");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ action: "create", entityId: ID, meta: { workdays: 4000, workdayParts: header.workdayParts } });
    expect(logs[0].after.workdays).toBeUndefined();
  });

  it("sacar jornadas borra las partes que sobran", async () => {
    const snapshot = big(4000);
    await saveSnapshot(ID, snapshot);
    const kept = snapshot.workdays.slice(0, 100);
    const released = snapshot.workdays.slice(100).map((w) => w.id);
    const left = items(kept);

    await pruneSnapshot(ID, { items: left, aggregates: recalcPayrollAggregates(left), releasedWorkdayIds: released });

    expect((await get("payrollSnapshots", ID)).workdayParts).toBe(1);
    expect((await partsOf(ID)).map((p) => p.id)).toEqual([`${ID}__0`]);
    expect((await readSnapshot({ id: ID })).workdays).toEqual(kept);
  });

  it("un cambio que no toca las jornadas escribe solo la cabecera", async () => {
    const snapshot = big(2500);
    await saveSnapshot(ID, snapshot);
    const { id: _id, ...part } = await get(PARTS, `${ID}__0`);
    await set(PARTS, `${ID}__0`, { ...part, marker: true });
    const changed = [{ ...snapshot.workers[0], bonus: 2000, amount: 7000 }];

    await syncSnapshotAmounts(ID, { items: changed, aggregates: recalcPayrollAggregates(changed) });

    expect((await get(PARTS, `${ID}__0`)).marker).toBe(true);
    const read = await readSnapshot({ id: ID });
    expect(read.workers[0].amount).toBe(7000);
    expect(read.payroll.total).toBe(7000);
    expect(read.workdays).toHaveLength(2500);
  });

  it("un JSON guardado entero se lee igual y pasa a partes al agregarle jornadas", async () => {
    const old = { payrollId: ID, payroll: { name: "Semana 40" }, workers: items([day(1)]), workdays: [day(1)], advances: [] };
    await set("payrollSnapshots", ID, old);
    expect((await readSnapshot({ id: ID })).workdays).toEqual([day(1)]);

    const added = [day(2, "12345678-5")];
    const grown = [...old.workers, ...items(added).map((it) => ({ ...it, rut: "12345678-5", workerId: "12345678-5" }))];
    await extendSnapshot(ID, { items: grown, aggregates: recalcPayrollAggregates(grown), workdays: added });

    const header = await get("payrollSnapshots", ID);
    expect(header.workdays).toBeUndefined();
    expect(header.workdayParts).toBe(1);
    expect((await readSnapshot({ id: ID })).workdays).toEqual([day(1), ...added]);
  });

  it("eliminar el JSON borra también sus partes", async () => {
    await saveSnapshot(ID, big(4000));
    await saveSnapshot("otra", big(10));

    expect(await deleteSnapshot(ID)).toBe(true);

    expect(await get("payrollSnapshots", ID)).toBe(null);
    expect(await partsOf(ID)).toEqual([]);
    expect(await partsOf("otra")).toHaveLength(1);
    expect(await deleteSnapshot(ID)).toBe(false);
  });

  it("una parte que falta no se arma a medias", async () => {
    await saveSnapshot(ID, big(4000));
    await set("payrollSnapshots", ID, { ...(await get("payrollSnapshots", ID)), workdayParts: 9 });

    expect(await readSnapshot({ id: ID, snapshot: { name: "embebido" } })).toEqual({ name: "embebido", payrollId: ID });
  });
});
