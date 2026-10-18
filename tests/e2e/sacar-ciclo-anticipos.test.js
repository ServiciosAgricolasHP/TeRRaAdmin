import { describe, it, expect } from "vitest";
import {
  payrollsService,
  tagWorkdaysWithPayroll,
  recalcPayrollAggregates,
  markBankPaid,
} from "../../src/services/payrollsService";
import { planPayrollRecalc, applyPayrollRecalc } from "../../src/services/payrollRecalc";
import {
  listPendingForWorkers,
  applyAdvancesToPayroll,
  setPayrollAdvanceAmounts,
} from "../../src/services/advancesService";
import { workdaysService } from "../../src/services";
import { aggregateWorkerAmounts } from "../../src/utils/payroll";
import { saveSnapshot } from "../../src/services/payrollSnapshots";
import { allocateAdvances } from "../../src/utils/payrollItem";
import { ANA, BETO, LABOR, FAENA, SUBFAENA, seedCycle, seedWorker, seedWorkday, seedAdvance, set, get, all } from "./helpers/seed";

// Sacar ciclos o labores de una nómina pendiente, como lo hace el detalle:
// se destilda y se recalcula sin eso (`planPayrollRecalc` con `removed` y
// `applyPayrollRecalc`). La nómina queda como si se hubiera armado sin lo
// sacado, y lo que no se retuvo de un anticipo vuelve a quedar pendiente.

const CICLO_A = "ciclo-A";
const CICLO_B = "ciclo-B";
const SUPERVISION = "labor-sup";
const laborTypes = () => new Map([[LABOR, "cosecha"], [SUPERVISION, "main"]]);
const DOS_LABORES = [
  { id: LABOR, name: "Cosecha", type: "cosecha" },
  { id: SUPERVISION, name: "Supervisión", type: "main" },
];

// Lo que hace la pantalla al apretar "Recalcular sin esto".
async function sacar(payrollId, removed) {
  const nomina = await get("payrolls", payrollId);
  const plan = await planPayrollRecalc(nomina, {
    cycles: await all("cycles"),
    faenas: await all("faenas"),
    subfaenas: await all("subfaenas"),
    workers: await all("worker"),
    removed,
  });
  await applyPayrollRecalc(payrollId, plan);
  return plan;
}

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
  const nomina = await payrollsService.create({
    name: nombre,
    status: "pending",
    cycleIds,
    cycleLabels: [...cycleIds],
    cycleDetails: cycleIds.map((id) => ({ id, label: id })),
    ...agg,
  });
  await tagWorkdaysWithPayroll(agg.workdayIds, nomina.id);
  await applyAdvancesToPayroll(
    items.flatMap((it) => it.advanceApplications),
    nomina.id,
  );
  return nomina.id;
}

const itemDe = (nomina, rut) => (nomina.items || []).find((it) => it.rut === rut);

describe("sacar un ciclo entero de una nómina con anticipos", () => {
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

    await sacar(id, new Map([[CICLO_A, true]]));

    // Ana ya no está en la nómina, y no queda rastro de su anticipo en ella.
    const nomina = await get("payrolls", id);
    expect(itemDe(nomina, ANA.id)).toBeUndefined();
    expect(nomina.advanceIds || []).not.toContain("adv-ana");
    expect(nomina.advanceTotal).toBe(0);
    expect(nomina.total).toBe(150000);
    expect(nomina.cycleIds).toEqual([CICLO_B]);
    expect(nomina.cycleDetails.map((c) => c.id)).toEqual([CICLO_B]);

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
    await sacar(id, new Map([[CICLO_A, true]]));

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
    await sacar(id, new Map([[CICLO_A, true]]));

    expect(itemDe(await get("payrolls", id), ANA.id)).toMatchObject({
      grossAmount: 200000,
      advance: 100000,
      amount: 100000,
    });
    expect(await get("advances", "adv-ana")).toEqual(antes);
  });

  it("no deja la nómina sin ciclos: para eso se elimina", async () => {
    await seedCycle({ id: CICLO_A });
    await seedWorker(ANA);
    await seedWorkday({ cycleId: CICLO_A, rut: ANA.id, date: "2026-03-02", amount: 100000 });
    const id = await armarNomina([CICLO_A]);
    await expect(sacar(id, new Map([[CICLO_A, true]]))).rejects.toThrow(/elimina la nómina/i);
    expect((await get("payrolls", id)).total).toBe(100000);
  });

  it("con las transferencias emitidas no deja sacar nada", async () => {
    await seedCycle({ id: CICLO_A });
    await seedCycle({ id: CICLO_B });
    await seedWorker(ANA);
    await seedWorkday({ cycleId: CICLO_A, rut: ANA.id, date: "2026-03-02", amount: 100000 });
    await seedWorkday({ cycleId: CICLO_B, rut: ANA.id, date: "2026-03-02", amount: 50000 });
    const id = await armarNomina([CICLO_A, CICLO_B]);
    await markBankPaid(id);
    await expect(sacar(id, new Map([[CICLO_A, true]]))).rejects.toThrow(/transferencias/i);
    expect((await get("payrolls", id)).cycleIds).toEqual([CICLO_A, CICLO_B]);
  });
});

describe("sacar labores sueltas, y varias cosas a la vez", () => {
  it("sacar una labor deja el resto del ciclo, y Recalcular no la vuelve a traer", async () => {
    await seedCycle({ id: CICLO_A, labors: DOS_LABORES });
    await seedWorker(ANA);
    await seedWorker(BETO);
    // Ana cosechó y supervisó; Beto solo supervisó.
    await seedWorkday({ cycleId: CICLO_A, rut: ANA.id, date: "2026-03-02", amount: 200000 });
    const supAna = await seedWorkday({ cycleId: CICLO_A, laborId: SUPERVISION, rut: ANA.id, date: "2026-03-02", amount: 30000 });
    const supBeto = await seedWorkday({ cycleId: CICLO_A, laborId: SUPERVISION, rut: BETO.id, date: "2026-03-02", amount: 40000 });
    await seedAdvance("adv-beto", { rut: BETO.id, amount: 25000 });

    const id = await armarNomina([CICLO_A]);
    const plan = await sacar(id, new Map([[CICLO_A, new Set([SUPERVISION])]]));
    expect(plan.leavingWorkers.map((w) => w.rut)).toEqual([BETO.id]);
    expect(plan.releasedCount).toBe(2);

    const nomina = await get("payrolls", id);
    expect(nomina.items.map((it) => it.rut)).toEqual([ANA.id]);
    expect(itemDe(nomina, ANA.id)).toMatchObject({ grossAmount: 200000, amount: 200000 });
    // El ciclo sigue, pero ya no abarca la supervisión.
    expect(nomina.cycleIds).toEqual([CICLO_A]);
    expect(nomina.cycleDetails[0].laborIds).toEqual([LABOR]);
    // Las jornadas de supervisión quedaron libres y el anticipo de Beto, pendiente.
    for (const wid of [supAna, supBeto]) expect((await get("workdays", wid)).payrollId ?? null).toBeNull();
    expect(await get("advances", "adv-beto")).toMatchObject({ status: "pending", amountPaid: 0 });

    // Un recálculo después no trae de vuelta la supervisión pendiente.
    const despues = await planPayrollRecalc(nomina, { cycles: await all("cycles"), workers: await all("worker") });
    expect(despues.newWorkers).toEqual([]);
    expect(despues.amountChanges).toEqual([]);
  });

  it("un ciclo entero y una labor de otro, en un solo recálculo", async () => {
    await seedCycle({ id: CICLO_A });
    await seedCycle({ id: CICLO_B, labors: DOS_LABORES });
    await seedWorker(ANA);
    await seedWorker(BETO);
    await seedWorkday({ cycleId: CICLO_A, rut: ANA.id, date: "2026-03-02", amount: 100000 });
    await seedWorkday({ cycleId: CICLO_B, rut: ANA.id, date: "2026-03-02", amount: 80000 });
    await seedWorkday({ cycleId: CICLO_B, laborId: SUPERVISION, rut: ANA.id, date: "2026-03-03", amount: 20000 });
    await seedWorkday({ cycleId: CICLO_B, rut: BETO.id, date: "2026-03-02", amount: 60000 });

    const id = await armarNomina([CICLO_A, CICLO_B]);
    await sacar(id, new Map([
      [CICLO_A, true],
      [CICLO_B, new Set([SUPERVISION])],
    ]));

    const nomina = await get("payrolls", id);
    expect(nomina.cycleIds).toEqual([CICLO_B]);
    expect(nomina.cycleDetails).toEqual([
      {
        id: CICLO_B,
        label: `Faena Uno/Sub Uno/${CICLO_B}`,
        faenaName: "Faena Uno",
        subfaenaName: "Sub Uno",
        laborIds: [LABOR],
        firstDay: "2026-03-02",
        lastDay: "2026-03-02",
      },
    ]);
    expect(itemDe(nomina, ANA.id)).toMatchObject({ grossAmount: 80000, byCycle: { [CICLO_B]: 80000 } });
    expect(itemDe(nomina, BETO.id)).toMatchObject({ grossAmount: 60000 });
    expect(nomina.total).toBe(140000);
  });
});

describe("los ciclos de la nómina siguen a lo que paga y a sus nombres vigentes", () => {
  const LIVE = {
    label: `Faena Uno/Sub Uno/${CICLO_A}`,
    faenaId: FAENA,
    faenaName: "Faena Uno",
    subfaenaId: SUBFAENA,
    subfaenaName: "Sub Uno",
  };
  const storeDetails = (id, period) =>
    payrollsService.update(id, { cycleDetails: [{ id: CICLO_A, ...LIVE, ...period }], cycleLabels: [LIVE.label] });

  it("un día nuevo en el ciclo entra al recalcular y estira el período, también en el JSON", async () => {
    await seedCycle({ id: CICLO_A });
    await seedWorker(ANA);
    await seedWorkday({ cycleId: CICLO_A, rut: ANA.id, date: "2026-03-02", amount: 100000 });
    await seedWorkday({ cycleId: CICLO_A, rut: ANA.id, date: "2026-03-03", amount: 100000 });
    const id = await armarNomina([CICLO_A]);
    await storeDetails(id, { firstDay: "2026-03-02", lastDay: "2026-03-03" });
    await saveSnapshot(id, {
      payroll: { name: "Nómina", total: 200000 },
      cycles: [{ id: CICLO_A, label: LIVE.label, firstDay: "2026-03-02", lastDay: "2026-03-03" }],
      workers: (await get("payrolls", id)).items,
      workdays: [],
      advances: [],
    });

    // Se agrega el 4 de marzo al ciclo, con producción.
    await seedWorkday({ cycleId: CICLO_A, rut: ANA.id, date: "2026-03-04", amount: 50000 });
    const plan = await sacar(id, new Map());

    expect(plan.cycleChanges).toEqual([
      {
        cycleId: CICLO_A,
        label: LIVE.label,
        fields: [{ field: "period", label: "Período", old: ["2026-03-02", "2026-03-03"], new: ["2026-03-02", "2026-03-04"] }],
      },
    ]);
    const payroll = await get("payrolls", id);
    expect(payroll.total).toBe(250000);
    expect(payroll.cycleDetails).toEqual([{ id: CICLO_A, ...LIVE, firstDay: "2026-03-02", lastDay: "2026-03-04" }]);
    expect((await get("payrollSnapshots", id)).cycles).toEqual([
      {
        id: CICLO_A,
        label: LIVE.label,
        faenaName: LIVE.faenaName,
        subfaenaName: LIVE.subfaenaName,
        firstDay: "2026-03-02",
        lastDay: "2026-03-04",
      },
    ]);
  });

  it("trae el nombre nuevo del ciclo y de la subfaena, en la nómina y en el JSON", async () => {
    await seedCycle({ id: CICLO_A });
    await seedWorker(ANA);
    await seedWorkday({ cycleId: CICLO_A, rut: ANA.id, date: "2026-03-02", amount: 100000 });
    const id = await armarNomina([CICLO_A]);
    await storeDetails(id, { firstDay: "2026-03-02", lastDay: "2026-03-02" });
    await saveSnapshot(id, {
      payroll: { name: "Nómina", total: 100000 },
      cycles: [{ id: CICLO_A, label: LIVE.label, subfaenaName: LIVE.subfaenaName, firstDay: "2026-03-02", lastDay: "2026-03-02" }],
      workers: [],
      workdays: [],
      advances: [],
    });

    // Se renombran la subfaena y el ciclo.
    const newLabel = "Faena Uno/Sector Norte/Ciclo 7";
    await set("subfaenas", SUBFAENA, { name: "Sector Norte", faenaId: FAENA });
    const { id: _cycleId, ...cycle } = await get("cycles", CICLO_A);
    await set("cycles", CICLO_A, { ...cycle, label: newLabel });
    const plan = await sacar(id, new Map());

    expect(plan.cycleChanges).toEqual([
      {
        cycleId: CICLO_A,
        label: newLabel,
        fields: [
          { field: "label", label: "Ciclo", old: LIVE.label, new: newLabel },
          { field: "subfaenaName", label: "Subfaena", old: "Sub Uno", new: "Sector Norte" },
        ],
      },
    ]);
    const payroll = await get("payrolls", id);
    expect(payroll.cycleDetails[0]).toMatchObject({ label: newLabel, faenaName: "Faena Uno", subfaenaName: "Sector Norte" });
    expect(payroll.cycleLabels).toEqual([newLabel]);
    expect((await get("payrollSnapshots", id)).cycles[0]).toMatchObject({ label: newLabel, subfaenaName: "Sector Norte" });
  });

  it("si los ciclos ya están al día, recalcular no los cuenta como cambio", async () => {
    await seedCycle({ id: CICLO_A });
    await seedWorker(ANA);
    await seedWorkday({ cycleId: CICLO_A, rut: ANA.id, date: "2026-03-02", amount: 100000 });
    const id = await armarNomina([CICLO_A]);
    await storeDetails(id, { firstDay: "2026-03-02", lastDay: "2026-03-02" });

    const plan = await planPayrollRecalc(await get("payrolls", id), {
      cycles: await all("cycles"),
      faenas: await all("faenas"),
      subfaenas: await all("subfaenas"),
      workers: await all("worker"),
    });
    expect(plan.cycleChanges).toEqual([]);
    expect(plan.cycleDetails).toEqual((await get("payrolls", id)).cycleDetails);
  });
});

describe("el snapshot de la nómina acompaña lo que se saca", () => {
  it("al sacar un ciclo, quien salió deja de figurar en el JSON, con su anticipo, sus jornadas y el ciclo", async () => {
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

    await sacar(id, new Map([[CICLO_A, true]]));

    const snap = await get("payrollSnapshots", id);
    expect(snap.workers.map((w) => w.rut)).toEqual([BETO.id]);
    expect(snap.workdays.map((w) => w.id)).toEqual([diaBeto]);
    expect(snap.advances).toEqual([]);
    expect(snap.cycles).toEqual([
      {
        id: CICLO_B,
        label: `Faena Uno/Sub Uno/${CICLO_B}`,
        faenaName: "Faena Uno",
        subfaenaName: "Sub Uno",
        firstDay: "2026-03-02",
        lastDay: "2026-03-02",
      },
    ]);
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
