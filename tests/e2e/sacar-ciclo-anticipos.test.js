import { describe, it, expect } from "vitest";
import {
  payrollsService,
  tagWorkdaysWithPayroll,
  recalcPayrollAggregates,
  removeCycleFromPayroll,
} from "../../src/services/payrollsService";
import {
  listPendingForWorkers,
  applyAdvancesToPayroll,
  setPayrollAdvanceAmounts,
} from "../../src/services/advancesService";
import { workdaysService } from "../../src/services";
import { aggregateWorkerAmounts } from "../../src/utils/payroll";
import { saveSnapshot } from "../../src/services/payrollSnapshots";
import { allocateAdvances } from "../../src/utils/payrollItem";
import { ANA, BETO, LABOR, seedCycle, seedWorker, seedWorkday, seedAdvance, get } from "./helpers/seed";

// Sacar un ciclo de una nómina pendiente cuando hay anticipos de por medio: la
// nómina queda como si se hubiera armado sin ese ciclo, y lo que no se retuvo
// de un anticipo vuelve a quedar pendiente.

const CICLO_A = "ciclo-A";
const CICLO_B = "ciclo-B";
const laborTypes = () => new Map([[LABOR, "cosecha"]]);

// Arma la nómina como la pantalla: `byCycle` con una entrada por CADA ciclo de
// la nómina, en $0 incluido (el helper de `nomina-ciclo-completo` no arma
// `byCycle`).
async function armarNomina(cycleIds, { nombre = "Nómina" } = {}) {
  const workdays = [];
  for (const cid of cycleIds) {
    const wds = await workdaysService.list({ wheres: [["cycleId", "==", cid]] });
    workdays.push(...wds.filter((wd) => !wd.payrollId));
  }
  const aggregates = aggregateWorkerAmounts(workdays, laborTypes()).filter((a) => a.total > 0);
  const pendientes = await listPendingForWorkers(aggregates.map((a) => a.rut));
  const porRut = new Map();
  for (const adv of pendientes) {
    const e = porRut.get(adv.workerRut) || { anticipos: [], bonos: [] };
    (adv.type === "bono" ? e.bonos : e.anticipos).push(adv);
    porRut.set(adv.workerRut, e);
  }

  const items = aggregates.map((a) => {
    const byCycle = {};
    for (const cid of cycleIds) byCycle[cid] = Math.round(a.byCycle[cid] || 0);
    const reparto = allocateAdvances({ gross: a.total, ...(porRut.get(a.rut) || {}) });
    const apps = [...reparto.anticipoApplications, ...reparto.bonoApplications];
    return {
      rut: a.rut,
      workerId: a.workerId,
      name: a.rut,
      bankCode: "012",
      grossAmount: Math.round(a.total),
      advance: reparto.anticiposTotal,
      bonus: reparto.bonosTotal,
      amount: reparto.amount,
      byCycle,
      workdayIds: a.workdayIds,
      anticipoApplications: reparto.anticipoApplications,
      bonoApplications: reparto.bonoApplications,
      advanceApplications: apps,
      advanceIds: apps.map((x) => x.advanceId),
    };
  });

  const agg = recalcPayrollAggregates(items);
  const nomina = await payrollsService.create({ name: nombre, status: "pending", cycleIds, ...agg });
  await tagWorkdaysWithPayroll(agg.workdayIds, nomina.id);
  await applyAdvancesToPayroll(
    items.flatMap((it) => it.advanceApplications),
    nomina.id,
  );
  return nomina.id;
}

const itemDe = (nomina, rut) => (nomina.items || []).find((it) => it.rut === rut);

describe("sacar un ciclo de una nómina con anticipos", () => {
  it("[el caso reportado] quien solo trabajó en ese ciclo sale y su anticipo vuelve a quedar pendiente", async () => {
    await seedCycle({ id: CICLO_A });
    await seedCycle({ id: CICLO_B });
    await seedWorker(ANA);
    await seedWorker(BETO);
    // Ana solo trabajó en A; Beto solo en B. Ana tiene un anticipo.
    const diasAna = [
      await seedWorkday({ cycleId: CICLO_A, rut: ANA.id, date: "2026-03-02", amount: 200000 }),
      await seedWorkday({ cycleId: CICLO_A, rut: ANA.id, date: "2026-03-03", amount: 100000 }),
    ];
    await seedWorkday({ cycleId: CICLO_B, rut: BETO.id, date: "2026-03-02", amount: 150000 });
    await seedAdvance("adv-ana", { rut: ANA.id, amount: 100000 });

    const id = await armarNomina([CICLO_A, CICLO_B]);
    expect(itemDe(await get("payrolls", id), ANA.id)).toMatchObject({ advance: 100000, amount: 200000 });
    expect(await get("advances", "adv-ana")).toMatchObject({ status: "applied", amountPaid: 100000 });

    await removeCycleFromPayroll(id, CICLO_A);

    // Ana ya no está en la nómina, y no queda rastro de su anticipo en ella.
    const nomina = await get("payrolls", id);
    expect(itemDe(nomina, ANA.id)).toBeUndefined();
    expect(nomina.advanceIds || []).not.toContain("adv-ana");
    expect(nomina.advanceTotal).toBe(0);
    expect(nomina.total).toBe(150000);

    // El anticipo volvió a estar pendiente, sin ninguna entrada de esta nómina.
    const adv = await get("advances", "adv-ana");
    expect(adv).toMatchObject({ status: "pending", amountPaid: 0, payments: [] });

    // Sus jornadas quedaron libres.
    for (const wid of diasAna) expect((await get("workdays", wid)).payrollId ?? null).toBeNull();

    // Y la nómina que se arma después con ese ciclo SÍ descuenta el anticipo.
    const id2 = await armarNomina([CICLO_A], { nombre: "Nómina 2" });
    expect(itemDe(await get("payrolls", id2), ANA.id)).toMatchObject({
      grossAmount: 300000,
      advance: 100000,
      amount: 200000,
    });
    expect(await get("advances", "adv-ana")).toMatchObject({ status: "applied", amountPaid: 100000 });
  });

  it("[cobertura parcial] si le queda producción que no alcanza, el sobrante del anticipo vuelve a pendiente", async () => {
    await seedCycle({ id: CICLO_A });
    await seedCycle({ id: CICLO_B });
    await seedWorker(ANA);
    // Ana: 300.000 en A y 50.000 en B, anticipo de 100.000.
    await seedWorkday({ cycleId: CICLO_A, rut: ANA.id, date: "2026-03-02", amount: 300000 });
    const diaB = await seedWorkday({ cycleId: CICLO_B, rut: ANA.id, date: "2026-03-02", amount: 50000 });
    await seedAdvance("adv-ana", { rut: ANA.id, amount: 100000 });

    const id = await armarNomina([CICLO_A, CICLO_B]);
    await removeCycleFromPayroll(id, CICLO_A);

    // Quedan 50.000 de bruto: el anticipo se achica a 50.000, neto 0.
    const it = itemDe(await get("payrolls", id), ANA.id);
    expect(it).toMatchObject({
      grossAmount: 50000,
      advance: 50000,
      amount: 0,
      workdayIds: [diaB],
      anticipoApplications: [{ advanceId: "adv-ana", amount: 50000 }],
    });

    // Los otros 50.000 vuelven al anticipo, que queda parcial y sin registros
    // nuevos: una sola entrada de esta nómina, achicada.
    const adv = await get("advances", "adv-ana");
    expect(adv).toMatchObject({ status: "partial", amountPaid: 50000 });
    expect(adv.payments).toHaveLength(1);
    expect(adv.payments[0]).toMatchObject({ payrollId: id, amount: 50000 });

    // Ningún anticipo sintético.
    const pendientes = await listPendingForWorkers([ANA.id]);
    expect(pendientes.map((a) => a.id)).toEqual(["adv-ana"]);
  });

  it("si la producción que queda alcanza, el anticipo no se toca", async () => {
    await seedCycle({ id: CICLO_A });
    await seedCycle({ id: CICLO_B });
    await seedWorker(ANA);
    await seedWorkday({ cycleId: CICLO_A, rut: ANA.id, date: "2026-03-02", amount: 300000 });
    await seedWorkday({ cycleId: CICLO_B, rut: ANA.id, date: "2026-03-02", amount: 200000 });
    await seedAdvance("adv-ana", { rut: ANA.id, amount: 100000 });

    const id = await armarNomina([CICLO_A, CICLO_B]);
    const antes = await get("advances", "adv-ana");
    await removeCycleFromPayroll(id, CICLO_A);

    expect(itemDe(await get("payrolls", id), ANA.id)).toMatchObject({
      grossAmount: 200000,
      advance: 100000,
      amount: 100000,
    });
    expect(await get("advances", "adv-ana")).toEqual(antes);
  });
});

describe("el snapshot de la nómina acompaña lo que se saca", () => {
  it("al sacar un ciclo, quien salió deja de figurar en el JSON, con su anticipo y sus jornadas", async () => {
    await seedCycle({ id: CICLO_A });
    await seedCycle({ id: CICLO_B });
    await seedWorker(ANA);
    await seedWorker(BETO);
    const diaAna = await seedWorkday({ cycleId: CICLO_A, rut: ANA.id, date: "2026-03-02", amount: 300000 });
    const diaBeto = await seedWorkday({ cycleId: CICLO_B, rut: BETO.id, date: "2026-03-02", amount: 150000 });
    await seedAdvance("adv-ana", { rut: ANA.id, amount: 100000 });

    const id = await armarNomina([CICLO_A, CICLO_B]);
    const nomina = await get("payrolls", id);
    // La forma real del snapshot: cabecera, ciclos, trabajadores, jornadas y
    // anticipos — es lo que baja el botón 📥 y lo que va a leer el portal.
    await saveSnapshot(id, {
      payroll: { name: "Nómina", total: nomina.total, workerCount: nomina.workerCount, advanceTotal: 100000 },
      cycles: [{ id: CICLO_A }, { id: CICLO_B }],
      workers: nomina.items,
      workdays: [{ id: diaAna }, { id: diaBeto }],
      advances: [{ id: "adv-ana", amount: 100000 }],
    });

    await removeCycleFromPayroll(id, CICLO_A);

    const snap = await get("payrollSnapshots", id);
    expect(snap.workers.map((w) => w.rut)).toEqual([BETO.id]);
    expect(snap.workdays).toEqual([{ id: diaBeto }]);
    expect(snap.advances).toEqual([]);
    expect(snap.cycles).toEqual([{ id: CICLO_B }]);
    expect(snap.payroll).toMatchObject({ name: "Nómina", total: 150000, workerCount: 1, advanceTotal: 0 });
  });
});

describe("setPayrollAdvanceAmounts — fijar lo que descuenta UNA nómina", () => {
  it("achicar en una nómina no toca lo que descontó otra", async () => {
    await seedAdvance("adv", {
      rut: ANA.id,
      amount: 100000,
      status: "applied",
      amountPaid: 100000,
      payments: [
        { payrollId: "nomina-1", amount: 40000, paidAt: "2026-02-01T00:00:00.000Z" },
        { payrollId: "nomina-2", amount: 60000, paidAt: "2026-03-01T00:00:00.000Z" },
      ],
    });

    await setPayrollAdvanceAmounts("nomina-2", [{ advanceId: "adv", amount: 25000 }]);

    const adv = await get("advances", "adv");
    expect(adv).toMatchObject({ status: "partial", amountPaid: 65000 });
    expect(adv.payments).toEqual([
      { payrollId: "nomina-1", amount: 40000, paidAt: "2026-02-01T00:00:00.000Z" },
      // Misma entrada, en su lugar y con su fecha original.
      { payrollId: "nomina-2", amount: 25000, paidAt: "2026-03-01T00:00:00.000Z" },
    ]);
  });

  it("con 0 suelta la nómina entera, igual que restaurar", async () => {
    await seedAdvance("adv", {
      rut: ANA.id,
      amount: 100000,
      status: "partial",
      amountPaid: 30000,
      appliedPayrollId: "nomina-1",
      payments: [{ payrollId: "nomina-1", amount: 30000, paidAt: "2026-02-01T00:00:00.000Z" }],
    });

    await setPayrollAdvanceAmounts("nomina-1", [{ advanceId: "adv", amount: 0 }]);

    expect(await get("advances", "adv")).toMatchObject({
      status: "pending",
      amountPaid: 0,
      payments: [],
      appliedPayrollId: null,
    });
  });

  it("no deja cobrar un anticipo por encima de su monto", async () => {
    await seedAdvance("adv", {
      rut: ANA.id,
      amount: 100000,
      status: "partial",
      amountPaid: 70000,
      payments: [{ payrollId: "otra", amount: 70000, paidAt: "2026-02-01T00:00:00.000Z" }],
    });

    await setPayrollAdvanceAmounts("esta", [{ advanceId: "adv", amount: 50000 }]);

    const adv = await get("advances", "adv");
    expect(adv).toMatchObject({ status: "applied", amountPaid: 100000 });
    expect(adv.payments.find((p) => p.payrollId === "esta").amount).toBe(30000);
  });
});
