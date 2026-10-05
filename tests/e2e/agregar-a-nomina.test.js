import { describe, it, expect } from "vitest";
import {
  payrollsService,
  tagWorkdaysWithPayroll,
  recalcPayrollAggregates,
  addWorkdaysToPayroll,
  markBankPaid,
} from "../../src/services/payrollsService";
import { listPendingForWorkers } from "../../src/services/advancesService";
import { workdaysService } from "../../src/services";
import {
  saveSnapshot,
  extendSnapshot,
  snapshotCycleOf,
  snapshotWorkdayOf,
  snapshotAdvanceOf,
} from "../../src/services/payrollSnapshots";
import {
  planAddWorkdays,
  asPayrollWorker,
  payrollLaborScope,
  inRecalcScope,
} from "../../src/utils/payrollItem";
import { ANA, BETO, CARO, FAENA, SUBFAENA, set, get, seedWorker, seedWorkday, seedAdvance } from "./helpers/seed";

// Agrandar una nómina pendiente: sumarle las labores que le faltaban a un
// ciclo, o los días puntuales de una persona. Lo que importa es que entre
// exactamente lo elegido, que los anticipos se descuenten igual que al
// generarla, y que Recalcular no traiga después lo que se dejó afuera — antes
// traía todo lo pendiente de los ciclos de la nómina.

const CICLO_A = "ciclo-A";
const CICLO_B = "ciclo-B";
const COSECHA = "labor-cosecha";
const SUPERVISION = "labor-supervision";
const LABOR_B = "labor-b";
const tipos = new Map([
  [COSECHA, "cosecha"],
  [SUPERVISION, "supervision"],
  [LABOR_B, "cosecha"],
]);

async function ciclo(id, labores) {
  await set("faenas", FAENA, { name: "Faena Uno" });
  await set("subfaenas", SUBFAENA, { name: "Sub Uno", faenaId: FAENA });
  await set("cycles", id, {
    label: `Faena Uno/Sub Uno/${id}`,
    faenaId: FAENA,
    subfaenaId: SUBFAENA,
    status: "open",
    days: ["2026-03-02", "2026-03-03"],
    dayPrices: {},
    labors: labores.map((laborId) => ({ id: laborId, name: laborId, type: tipos.get(laborId), workers: [] })),
  });
}

// Una nómina pendiente como la deja "Generar", con sus jornadas etiquetadas.
async function nominaCon({ items, cycleDetails }) {
  const agg = recalcPayrollAggregates(items);
  const nomina = await payrollsService.create({
    name: "Nómina",
    status: "pending",
    cycleIds: cycleDetails.map((c) => c.id),
    cycleLabels: cycleDetails.map((c) => c.label || c.id),
    cycleDetails,
    items,
    ...agg,
  });
  await tagWorkdaysWithPayroll(agg.workdayIds, nomina.id);
  return nomina.id;
}

const itemAna = (workdayId, gross) => ({
  rut: ANA.id,
  workerId: ANA.id,
  name: ANA.name,
  bankCode: ANA.bankCode,
  grossAmount: gross,
  advance: 0,
  bonus: 0,
  amount: gross,
  byCycle: { [CICLO_A]: gross },
  workdayIds: [workdayId],
  anticipoApplications: [],
  bonoApplications: [],
  advanceApplications: [],
  advanceIds: [],
});

const perfil = (w) => ({ name: w.name, bankCode: w.bankCode, accountNumber: "12345678", accountType: 3, paymentRut: w.id });

describe("agregar a una nómina pendiente", () => {
  it("las labores que le faltaban a un ciclo: quien ya está suma y paga lo pendiente; quien no, entra", async () => {
    await ciclo(CICLO_A, [COSECHA, SUPERVISION]);
    await seedWorker(ANA);
    await seedWorker(BETO);
    const cosechaAna = await seedWorkday({ cycleId: CICLO_A, laborId: COSECHA, rut: ANA.id, date: "2026-03-02", amount: 100000 });
    const supAna = await seedWorkday({ cycleId: CICLO_A, laborId: SUPERVISION, rut: ANA.id, date: "2026-03-02", amount: 30000 });
    const supBeto = await seedWorkday({ cycleId: CICLO_A, laborId: SUPERVISION, rut: BETO.id, date: "2026-03-03", amount: 50000 });
    // La nómina se generó solo con cosecha.
    const id = await nominaCon({
      items: [itemAna(cosechaAna, 100000)],
      cycleDetails: [{ id: CICLO_A, label: "A", laborIds: [COSECHA] }],
    });
    // Anticipos cargados después de generarla.
    await seedAdvance("adv-ana", { rut: ANA.id, amount: 10000 });
    await seedAdvance("adv-beto", { rut: BETO.id, amount: 20000 });

    const nuevas = (await workdaysService.list({ wheres: [["cycleId", "==", CICLO_A]] })).filter(
      (wd) => !wd.payrollId && wd.laborId === SUPERVISION,
    );
    const antes = await get("payrolls", id);
    const plan = planAddWorkdays({
      items: antes.items,
      workdays: nuevas,
      laborTypeById: tipos,
      pendingAdvances: await listPendingForWorkers([ANA.id, BETO.id]),
      profileFor: (a) => perfil(a.rut === BETO.id ? BETO : ANA),
    });
    await addWorkdaysToPayroll(id, {
      items: plan.items,
      cycleDetailsToAdd: [{ id: CICLO_A, label: "A", laborIds: [SUPERVISION] }],
      workdayIds: plan.workdayIds,
      advanceApplications: plan.newAdvanceApplications,
    });

    const nomina = await get("payrolls", id);
    // El ciclo no se repite: se le suman las labores.
    expect(nomina.cycleIds).toEqual([CICLO_A]);
    expect(nomina.cycleDetails).toEqual([{ id: CICLO_A, label: "A", laborIds: [COSECHA, SUPERVISION] }]);
    expect(nomina.items.find((it) => it.rut === ANA.id)).toMatchObject({
      grossAmount: 130000,
      byCycle: { [CICLO_A]: 130000 },
      advance: 10000,
      amount: 120000,
    });
    expect(nomina.items.find((it) => it.rut === BETO.id)).toMatchObject({
      name: BETO.name,
      bankCode: BETO.bankCode,
      grossAmount: 50000,
      advance: 20000,
      amount: 30000,
    });
    expect(nomina.total).toBe(150000);
    for (const wid of [cosechaAna, supAna, supBeto]) expect((await get("workdays", wid)).payrollId).toBe(id);

    const advAna = await get("advances", "adv-ana");
    expect(advAna).toMatchObject({ amountPaid: 10000, status: "applied" });
    expect(advAna.payments.map((x) => [x.payrollId, x.amount])).toEqual([[id, 10000]]);
    expect(await get("advances", "adv-beto")).toMatchObject({ amountPaid: 20000, status: "applied" });
  });

  it("los días puntuales de una persona: entra solo lo elegido, y Recalcular no trae el resto de ese ciclo", async () => {
    await ciclo(CICLO_A, [COSECHA]);
    await ciclo(CICLO_B, [LABOR_B]);
    await seedWorker(ANA);
    await seedWorker(CARO);
    const diaAna = await seedWorkday({ cycleId: CICLO_A, laborId: COSECHA, rut: ANA.id, date: "2026-03-02", amount: 100000 });
    const caro1 = await seedWorkday({ cycleId: CICLO_B, laborId: LABOR_B, rut: CARO.id, date: "2026-03-02", amount: 40000 });
    const caro2 = await seedWorkday({ cycleId: CICLO_B, laborId: LABOR_B, rut: CARO.id, date: "2026-03-03", amount: 60000 });
    const id = await nominaCon({ items: [itemAna(diaAna, 100000)], cycleDetails: [{ id: CICLO_A, label: "A" }] });

    const antes = await get("payrolls", id);
    const deCaro = await workdaysService.list({ wheres: [["workerRut", "in", [CARO.id]]] });
    const persona = asPayrollWorker({
      items: antes.items,
      keys: [CARO.id],
      fallbackKey: CARO.id,
      rut: CARO.id,
      workdays: deCaro.filter((wd) => wd.id === caro1),
    });
    const plan = planAddWorkdays({
      items: antes.items,
      workdays: persona.workdays,
      laborTypeById: tipos,
      profileFor: () => perfil(CARO),
    });
    await addWorkdaysToPayroll(id, {
      items: plan.items,
      cycleDetailsToAdd: [{ id: CICLO_B, label: "B", laborIds: [] }],
      workdayIds: plan.workdayIds,
      advanceApplications: plan.newAdvanceApplications,
    });

    const nomina = await get("payrolls", id);
    expect(nomina.cycleIds).toEqual([CICLO_A, CICLO_B]);
    expect(nomina.cycleDetails).toEqual([
      { id: CICLO_A, label: "A" },
      { id: CICLO_B, label: "B", laborIds: [] },
    ]);
    expect(nomina.items.find((it) => it.rut === CARO.id)).toMatchObject({
      grossAmount: 40000,
      byCycle: { [CICLO_B]: 40000 },
      workdayIds: [caro1],
    });
    expect((await get("workdays", caro1)).payrollId).toBe(id);
    expect((await get("workdays", caro2)).payrollId ?? null).toBe(null);

    // Lo que vería Recalcular en los ciclos de la nómina: el ciclo entero
    // sigue trayendo lo nuevo; el de días puntuales, solo lo que se agregó.
    const otroDiaAna = await seedWorkday({ cycleId: CICLO_A, laborId: COSECHA, rut: ANA.id, date: "2026-03-03", amount: 5000 });
    const alcance = payrollLaborScope(nomina.cycleDetails);
    const vistas = [];
    for (const cid of nomina.cycleIds) {
      for (const wd of await workdaysService.list({ wheres: [["cycleId", "==", cid]] })) {
        if (inRecalcScope(wd, id, alcance)) vistas.push(wd.id);
      }
    }
    expect(vistas.sort()).toEqual([diaAna, otroDiaAna, caro1].sort());
  });

  it("el JSON suma lo agregado sin repetir, con la cabecera al día y sin el alcance interno", async () => {
    await ciclo(CICLO_A, [COSECHA]);
    await ciclo(CICLO_B, [LABOR_B]);
    await seedWorker(ANA);
    await seedWorker(CARO);
    const diaAna = await seedWorkday({ cycleId: CICLO_A, laborId: COSECHA, rut: ANA.id, date: "2026-03-02", amount: 100000 });
    const caro1 = await seedWorkday({ cycleId: CICLO_B, laborId: LABOR_B, rut: CARO.id, date: "2026-03-02", amount: 40000 });
    await seedAdvance("adv-caro", { rut: CARO.id, amount: 15000 });
    const id = await nominaCon({ items: [itemAna(diaAna, 100000)], cycleDetails: [{ id: CICLO_A, label: "A" }] });
    const antes = await get("payrolls", id);
    await saveSnapshot(id, {
      payroll: { name: "Nómina", total: 100000, workerCount: 1, advanceTotal: 0 },
      cycles: [{ id: CICLO_A }],
      workers: antes.items,
      workdays: [{ id: diaAna }],
      advances: [],
    });

    const jornada = await get("workdays", caro1);
    const pendientes = await listPendingForWorkers([CARO.id]);
    const plan = planAddWorkdays({
      items: antes.items,
      workdays: [jornada],
      laborTypeById: tipos,
      pendingAdvances: pendientes,
      profileFor: () => perfil(CARO),
    });
    const detalle = { id: CICLO_B, label: "B", laborIds: [] };
    const aggregates = await addWorkdaysToPayroll(id, {
      items: plan.items,
      cycleDetailsToAdd: [detalle],
      workdayIds: plan.workdayIds,
      advanceApplications: plan.newAdvanceApplications,
    });
    await extendSnapshot(id, {
      items: plan.items,
      aggregates,
      // Lo que ya estaba (el ciclo A, la jornada de Ana) no se duplica.
      cycles: [snapshotCycleOf({ id: CICLO_A }, await get("cycles", CICLO_A)), snapshotCycleOf(detalle, await get("cycles", CICLO_B))],
      workdays: [{ id: diaAna }, jornada].map(snapshotWorkdayOf),
      advances: pendientes.map(snapshotAdvanceOf),
    });

    const snap = await get("payrollSnapshots", id);
    expect(snap.cycles.map((c) => c.id)).toEqual([CICLO_A, CICLO_B]);
    expect(snap.cycles[0]).toEqual({ id: CICLO_A });
    expect(snap.cycles[1]).not.toHaveProperty("laborIds");
    expect(snap.cycles[1].labors.map((l) => l.id)).toEqual([LABOR_B]);
    expect(snap.workdays.map((w) => w.id)).toEqual([diaAna, caro1]);
    expect(snap.workdays[0]).toEqual({ id: diaAna });
    expect(snap.advances.map((a) => [a.id, a.amount])).toEqual([["adv-caro", 15000]]);
    expect(snap.workers.map((w) => w.rut)).toEqual([ANA.id, CARO.id]);
    expect(snap.payroll).toMatchObject({ name: "Nómina", total: 125000, workerCount: 2, advanceTotal: 15000 });
  });

  it("con las transferencias ya pagadas no deja agregar, y no etiqueta ni descuenta nada", async () => {
    await ciclo(CICLO_A, [COSECHA]);
    await seedWorker(ANA);
    await seedWorker(BETO);
    const diaAna = await seedWorkday({ cycleId: CICLO_A, laborId: COSECHA, rut: ANA.id, date: "2026-03-02", amount: 100000 });
    const diaBeto = await seedWorkday({ cycleId: CICLO_A, laborId: COSECHA, rut: BETO.id, date: "2026-03-03", amount: 50000 });
    await seedAdvance("adv-beto", { rut: BETO.id, amount: 20000 });
    const id = await nominaCon({ items: [itemAna(diaAna, 100000)], cycleDetails: [{ id: CICLO_A, label: "A" }] });
    await markBankPaid(id);
    const antes = await get("payrolls", id);

    const plan = planAddWorkdays({
      items: antes.items,
      workdays: [await get("workdays", diaBeto)],
      laborTypeById: tipos,
      pendingAdvances: await listPendingForWorkers([BETO.id]),
      profileFor: () => perfil(BETO),
    });
    await expect(
      addWorkdaysToPayroll(id, {
        items: plan.items,
        workdayIds: plan.workdayIds,
        advanceApplications: plan.newAdvanceApplications,
      }),
    ).rejects.toThrow(/transferencias/i);

    expect((await get("workdays", diaBeto)).payrollId ?? null).toBe(null);
    expect((await get("advances", "adv-beto")).amountPaid).toBe(0);
    expect((await get("payrolls", id)).items).toEqual(antes.items);
  });
});
