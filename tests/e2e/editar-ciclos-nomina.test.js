import { describe, it, expect } from "vitest";
import { payrollsService, tagWorkdaysWithPayroll, recalcPayrollAggregates } from "../../src/services/payrollsService";
import { planPayrollRecalc, applyPayrollRecalc } from "../../src/services/payrollRecalc";
import { advancesService, listPendingForWorkers, applyAdvancesToPayroll } from "../../src/services/advancesService";
import { workdaysService } from "../../src/services";
import { aggregateWorkerAmounts } from "../../src/utils/payroll";
import { saveSnapshot } from "../../src/services/payrollSnapshots";
import { allocateAdvances } from "../../src/utils/payrollItem";
import { ANA, BETO, CARO, LABOR, seedCycle, seedWorker, seedWorkday, seedAdvance, get, all } from "./helpers/seed";

// Editar los ciclos de una nómina pendiente en un solo paso, como lo hace
// "✎ Editar ciclos": lo desmarcado sale (`removed`), lo marcado entra
// (`added`) y la nómina se recalcula (`planPayrollRecalc` y
// `applyPayrollRecalc`). Queda como si se hubiera armado con esos ciclos: quien
// se queda sin producción sale y suelta sus anticipos, y a quien entra o suma
// se le descuentan sus anticipos pendientes.

const CICLO_A = "ciclo-A";
const CICLO_B = "ciclo-B";
const CICLO_C = "ciclo-C";
const SUPERVISION = "labor-sup";
const laborTypes = () => new Map([[LABOR, "cosecha"], [SUPERVISION, "main"]]);
const DOS_LABORES = [
  { id: LABOR, name: "Cosecha", type: "cosecha" },
  { id: SUPERVISION, name: "Supervisión", type: "main" },
];

// Lo que hace la pantalla al apretar "Revisar cambios" y después "Aplicar
// cambios".
async function editar(payrollId, { removed = new Map(), added = new Map() }) {
  const nomina = await get("payrolls", payrollId);
  const plan = await planPayrollRecalc(nomina, {
    cycles: await all("cycles"),
    faenas: await all("faenas"),
    subfaenas: await all("subfaenas"),
    workers: await all("worker"),
    removed,
    added,
  });
  await applyPayrollRecalc(payrollId, plan);
  return plan;
}

// Arma la nómina como la pantalla, con `byCycle` por cada ciclo. Con `labores`,
// de cada ciclo entran solo esas y quedan en `cycleDetails[].laborIds`.
async function armarNomina(cycleIds, { labores = null } = {}) {
  const workdays = [];
  for (const cid of cycleIds) {
    const wds = await workdaysService.list({ wheres: [["cycleId", "==", cid]] });
    workdays.push(...wds.filter((wd) => !wd.payrollId && (!labores || labores.includes(wd.laborId))));
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
  const nomina = await payrollsService.create({
    name: "Nómina",
    status: "pending",
    cycleIds,
    cycleLabels: [...cycleIds],
    cycleDetails: cycleIds.map((id) => (labores ? { id, label: id, laborIds: [...labores] } : { id, label: id })),
    ...agg,
  });
  await tagWorkdaysWithPayroll(agg.workdayIds, nomina.id);
  await applyAdvancesToPayroll(items.flatMap((it) => it.advanceApplications), nomina.id);
  return nomina.id;
}

const itemDe = (nomina, rut) => (nomina.items || []).find((it) => it.rut === rut);
const etiquetaDe = async (cycleId, rut, date, laborId = LABOR) =>
  (await all("workdays")).find((wd) => wd.cycleId === cycleId && wd.workerRut === rut && wd.date === date && wd.laborId === laborId)?.payrollId ?? null;

describe("editar los ciclos de una nómina en un solo paso", () => {
  it("saca un ciclo y agrega otro: quien sale suelta su anticipo y a quien entra se le descuenta el suyo", async () => {
    await seedCycle({ id: CICLO_A });
    await seedCycle({ id: CICLO_B });
    await seedCycle({ id: CICLO_C });
    await seedWorker(ANA);
    await seedWorker(BETO);
    await seedWorker(CARO);
    // Ana trabajó en A, Beto en B y Caro en C, que no está en la nómina.
    await seedWorkday({ cycleId: CICLO_A, rut: ANA.id, date: "2026-03-02", amount: 300000 });
    await seedWorkday({ cycleId: CICLO_B, rut: BETO.id, date: "2026-03-02", amount: 150000 });
    await seedWorkday({ cycleId: CICLO_C, rut: CARO.id, date: "2026-03-03", amount: 120000 });
    await seedAdvance("adv-ana", { rut: ANA.id, amount: 100000 });
    await seedAdvance("adv-caro", { rut: CARO.id, amount: 30000 });

    const id = await armarNomina([CICLO_A, CICLO_B]);
    await saveSnapshot(id, {
      payroll: { name: "Nómina", total: 350000 },
      cycles: [
        { id: CICLO_A, label: CICLO_A, firstDay: "2026-03-02", lastDay: "2026-03-02" },
        { id: CICLO_B, label: CICLO_B, firstDay: "2026-03-02", lastDay: "2026-03-02" },
      ],
      workers: (await get("payrolls", id)).items,
      workdays: [],
      advances: [],
    });
    expect(await get("advances", "adv-ana")).toMatchObject({ status: "applied", amountPaid: 100000 });

    const plan = await editar(id, {
      removed: new Map([[CICLO_A, true]]),
      added: new Map([[CICLO_C, new Set([LABOR])]]),
    });
    expect(plan.leavingWorkers.map((w) => [w.rut, w.liberado])).toEqual([[ANA.id, 100000]]);
    expect(plan.newWorkers.map((w) => [w.rut, w.gross, w.advance, w.net])).toEqual([[CARO.id, 120000, 30000, 90000]]);

    const nomina = await get("payrolls", id);
    expect(nomina.cycleIds).toEqual([CICLO_B, CICLO_C]);
    expect(nomina.cycleLabels).toEqual([`Faena Uno/Sub Uno/${CICLO_B}`, `Faena Uno/Sub Uno/${CICLO_C}`]);
    expect(nomina.cycleDetails.map((c) => [c.id, c.laborIds])).toEqual([[CICLO_B, undefined], [CICLO_C, undefined]]);
    expect(itemDe(nomina, ANA.id)).toBeUndefined();
    expect(itemDe(nomina, BETO.id)).toMatchObject({ grossAmount: 150000, amount: 150000 });
    expect(itemDe(nomina, CARO.id)).toMatchObject({ grossAmount: 120000, advance: 30000, amount: 90000 });
    expect(nomina.total).toBe(240000);

    // Las jornadas de A vuelven a quedar pendientes y las de C entran.
    expect(await etiquetaDe(CICLO_A, ANA.id, "2026-03-02")).toBeNull();
    expect(await etiquetaDe(CICLO_C, CARO.id, "2026-03-03")).toBe(id);

    // El anticipo de Ana vuelve a estar pendiente; el de Caro lo descuenta esta nómina.
    expect(await get("advances", "adv-ana")).toMatchObject({ status: "pending", amountPaid: 0, payments: [] });
    const advCaro = await get("advances", "adv-caro");
    expect(advCaro).toMatchObject({ status: "applied", amountPaid: 30000 });
    expect(advCaro.payments.map((p) => [p.payrollId, p.amount])).toEqual([[id, 30000]]);

    // El JSON sigue a la nómina: sin A, con C y su anticipo.
    const snap = await get("payrollSnapshots", id);
    expect(snap.cycles.map((c) => c.id)).toEqual([CICLO_B, CICLO_C]);
    expect(snap.cycles[1]).toMatchObject({ label: `Faena Uno/Sub Uno/${CICLO_C}`, firstDay: "2026-03-03", lastDay: "2026-03-03" });
    expect(snap.cycles[1].laborIds).toBeUndefined();
    expect(snap.advances.map((a) => a.id)).toEqual(["adv-caro"]);
  });

  it("cambia una labor por otra del mismo ciclo: quien está en las dos sigue, con su anticipo re-encajado", async () => {
    await seedCycle({ id: CICLO_A, labors: DOS_LABORES });
    await seedWorker(ANA);
    await seedWorkday({ cycleId: CICLO_A, rut: ANA.id, date: "2026-03-02", amount: 200000 });
    await seedWorkday({ cycleId: CICLO_A, laborId: SUPERVISION, rut: ANA.id, date: "2026-03-03", amount: 60000, combo: "0_0" });
    await seedAdvance("adv-ana", { rut: ANA.id, amount: 100000 });

    const id = await armarNomina([CICLO_A], { labores: [LABOR] });
    expect(itemDe(await get("payrolls", id), ANA.id)).toMatchObject({ grossAmount: 200000, advance: 100000 });

    const plan = await editar(id, {
      removed: new Map([[CICLO_A, new Set([LABOR])]]),
      added: new Map([[CICLO_A, new Set([SUPERVISION])]]),
    });
    expect(plan.amountChanges.map((c) => [c.rut, c.oldGross, c.newGross, c.devuelto])).toEqual([[ANA.id, 200000, 60000, 40000]]);

    const nomina = await get("payrolls", id);
    expect(nomina.cycleIds).toEqual([CICLO_A]);
    expect(nomina.cycleDetails[0].laborIds).toEqual([SUPERVISION]);
    expect(itemDe(nomina, ANA.id)).toMatchObject({ grossAmount: 60000, advance: 60000, amount: 0 });
    expect(await etiquetaDe(CICLO_A, ANA.id, "2026-03-02")).toBeNull();
    expect(await etiquetaDe(CICLO_A, ANA.id, "2026-03-03", SUPERVISION)).toBe(id);

    // Lo que ya no cabe del anticipo vuelve a quedar pendiente.
    expect(await get("advances", "adv-ana")).toMatchObject({ status: "partial", amountPaid: 60000 });
  });

  it("agregar un ciclo a quien ya está suma su bruto y le descuenta un anticipo pendiente nuevo", async () => {
    await seedCycle({ id: CICLO_A });
    await seedCycle({ id: CICLO_C });
    await seedWorker(ANA);
    await seedWorkday({ cycleId: CICLO_A, rut: ANA.id, date: "2026-03-02", amount: 100000 });
    await seedWorkday({ cycleId: CICLO_C, rut: ANA.id, date: "2026-03-03", amount: 80000 });

    const id = await armarNomina([CICLO_A]);
    // Un anticipo anotado después de generar la nómina. En la app, anotarlo
    // pasa por el servicio y borra la caché de los pendientes.
    await seedAdvance("adv-nuevo", { rut: ANA.id, amount: 50000 });
    advancesService.invalidate();

    const plan = await editar(id, { added: new Map([[CICLO_C, new Set([LABOR])]]) });
    expect(plan.newWorkers).toEqual([]);
    expect(plan.advanceChanges.map((c) => [c.rut, c.addedAnticipoTotal])).toEqual([[ANA.id, 50000]]);

    const nomina = await get("payrolls", id);
    expect(nomina.cycleIds).toEqual([CICLO_A, CICLO_C]);
    expect(itemDe(nomina, ANA.id)).toMatchObject({ grossAmount: 180000, advance: 50000, amount: 130000 });
    expect(itemDe(nomina, ANA.id).byCycle).toEqual({ [CICLO_A]: 100000, [CICLO_C]: 80000 });
    expect(await get("advances", "adv-nuevo")).toMatchObject({ status: "applied", amountPaid: 50000 });
  });

  it("no deja la nómina sin ciclos: para sacar todo, se elimina", async () => {
    await seedCycle({ id: CICLO_A });
    await seedWorker(ANA);
    await seedWorkday({ cycleId: CICLO_A, rut: ANA.id, date: "2026-03-02", amount: 100000 });
    const id = await armarNomina([CICLO_A]);
    await expect(editar(id, { removed: new Map([[CICLO_A, true]]) })).rejects.toThrow(/sin ciclos/);
  });
});
