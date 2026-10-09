import { describe, it, expect } from "vitest";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../src/firebase";
import {
  payrollsService,
  tagWorkdaysWithPayroll,
  recalcPayrollAggregates,
  workdaysForNewPayroll,
} from "../../src/services/payrollsService";
import { workdaysService, listWorkdaysByCycles } from "../../src/services";
import { workerKeys } from "../../src/services/workersService";
import { aggregateWorkerAmounts } from "../../src/utils/payroll";
import {
  allocateAdvances,
  newPayrollCycleDetails,
  payrollLaborScope,
  inRecalcScope,
} from "../../src/utils/payrollItem";
import { ANA, BETO, CARO, FAENA, SUBFAENA, set, get, seedWorker, seedWorkday } from "./helpers/seed";

// Generar una nómina con personas sueltas: los días puntuales de alguien,
// solos o además de ciclos y labores. Lo que importa es que entre exactamente
// lo elegido, que un día que otra nómina tomó mientras tanto quede afuera, y
// que Recalcular no traiga después el resto de los días de esa persona.

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

// Arma la nómina como "Generar", por la capa de servicios: jornadas de lo
// elegido → agregar por trabajador → guardar con sus ciclos → etiquetar. Los
// anticipos no se miran acá.
async function generar({ chosen = new Map(), people = [] }) {
  const { workdays, taken } = await workdaysForNewPayroll({
    chosen,
    people: people.map(({ worker, workdayIds }) => ({ keys: workerKeys(worker), workdayIds })),
  });
  const items = aggregateWorkerAmounts(workdays, tipos)
    .filter((a) => a.total > 0)
    .map((a) => ({
      rut: a.rut,
      workerId: a.workerId,
      grossAmount: Math.round(a.total),
      advance: 0,
      bonus: 0,
      amount: allocateAdvances({ gross: Math.round(a.total) }).amount,
      byCycle: a.byCycle,
      workdayIds: a.workdayIds,
      advanceIds: [],
    }));
  const incluidas = new Set(items.flatMap((it) => it.workdayIds));
  const cycles = [await get("cycles", CICLO_A), await get("cycles", CICLO_B)].filter(Boolean);
  const cycleDetails = newPayrollCycleDetails({
    cycles,
    chosen,
    workdays: workdays.filter((wd) => incluidas.has(wd.id)),
  });
  const agg = recalcPayrollAggregates(items);
  const nomina = await payrollsService.create({
    name: "Nómina",
    status: "pending",
    cycleIds: cycleDetails.map((c) => c.id),
    cycleLabels: cycleDetails.map((c) => c.label),
    cycleDetails,
    items,
    ...agg,
  });
  await tagWorkdaysWithPayroll(agg.workdayIds, nomina.id);
  return { id: nomina.id, taken };
}

const payrollIdDe = async (workdayId) => (await get("workdays", workdayId)).payrollId ?? null;

describe("generar una nómina con personas sueltas", () => {
  it("ciclos con algunas labores más personas: entra lo elegido, y Recalcular no trae lo demás", async () => {
    await ciclo(CICLO_A, [COSECHA, SUPERVISION]);
    await ciclo(CICLO_B, [LABOR_B]);
    for (const w of [ANA, BETO, CARO]) await seedWorker(w);
    const cosechaAna = await seedWorkday({ cycleId: CICLO_A, laborId: COSECHA, rut: ANA.id, date: "2026-03-02", amount: 100000 });
    const supAna = await seedWorkday({ cycleId: CICLO_A, laborId: SUPERVISION, rut: ANA.id, date: "2026-03-02", amount: 30000 });
    const supBeto = await seedWorkday({ cycleId: CICLO_A, laborId: SUPERVISION, rut: BETO.id, date: "2026-03-03", amount: 20000 });
    const caro1 = await seedWorkday({ cycleId: CICLO_B, laborId: LABOR_B, rut: CARO.id, date: "2026-03-02", amount: 40000 });
    const caro2 = await seedWorkday({ cycleId: CICLO_B, laborId: LABOR_B, rut: CARO.id, date: "2026-03-03", amount: 60000 });

    // De A solo cosecha; de supervisión, el día de Ana. De B, un día de Caro.
    const { id, taken } = await generar({
      chosen: new Map([[CICLO_A, [COSECHA]]]),
      people: [
        { worker: ANA, workdayIds: [supAna] },
        { worker: CARO, workdayIds: [caro1] },
      ],
    });

    expect(taken).toBe(0);
    const nomina = await get("payrolls", id);
    expect(nomina.cycleDetails.map((c) => [c.id, c.laborIds])).toEqual([
      [CICLO_A, [COSECHA]],
      [CICLO_B, []],
    ]);
    const bruto = Object.fromEntries(nomina.items.map((it) => [it.rut, it.grossAmount]));
    expect(bruto).toEqual({ [ANA.id]: 130000, [CARO.id]: 40000 });
    expect(nomina.total).toBe(170000);
    for (const w of [cosechaAna, supAna, caro1]) expect(await payrollIdDe(w)).toBe(id);
    for (const w of [supBeto, caro2]) expect(await payrollIdDe(w)).toBe(null);

    // Lo que vería Recalcular: lo etiquetado y lo nuevo de cosecha en A. Ni la
    // supervisión de Beto ni el otro día de Caro.
    const nueva = await seedWorkday({ cycleId: CICLO_A, laborId: COSECHA, rut: BETO.id, date: "2026-03-04", amount: 10000 });
    const vigentes = [
      ...(await workdaysService.list({ wheres: [["cycleId", "==", CICLO_A]] })),
      ...(await workdaysService.list({ wheres: [["cycleId", "==", CICLO_B]] })),
    ];
    const scope = payrollLaborScope(nomina.cycleDetails);
    expect(vigentes.filter((wd) => inRecalcScope(wd, id, scope)).map((wd) => wd.id).sort()).toEqual(
      [cosechaAna, supAna, caro1, nueva].sort(),
    );
  });

  it("solo con personas: se arma sin elegir ningún ciclo", async () => {
    await ciclo(CICLO_A, [COSECHA]);
    await seedWorker(ANA);
    await seedWorker(BETO);
    const diaAna = await seedWorkday({ cycleId: CICLO_A, laborId: COSECHA, rut: ANA.id, date: "2026-03-02", amount: 100000 });
    const otroAna = await seedWorkday({ cycleId: CICLO_A, laborId: COSECHA, rut: ANA.id, date: "2026-03-03", amount: 50000 });
    const deBeto = await seedWorkday({ cycleId: CICLO_A, laborId: COSECHA, rut: BETO.id, date: "2026-03-02", amount: 70000 });

    const { id } = await generar({ people: [{ worker: ANA, workdayIds: [diaAna] }] });

    const nomina = await get("payrolls", id);
    expect(nomina.cycleDetails.map((c) => [c.id, c.laborIds])).toEqual([[CICLO_A, []]]);
    expect(nomina.items).toHaveLength(1);
    expect(nomina.items[0]).toMatchObject({ rut: ANA.id, grossAmount: 100000, workdayIds: [diaAna] });
    expect(nomina.total).toBe(100000);
    expect(await payrollIdDe(diaAna)).toBe(id);
    expect(await payrollIdDe(otroAna)).toBe(null);
    expect(await payrollIdDe(deBeto)).toBe(null);
  });

  it("un día que otra nómina tomó después de elegirlo queda afuera y se cuenta", async () => {
    await ciclo(CICLO_B, [LABOR_B]);
    await seedWorker(CARO);
    const caro1 = await seedWorkday({ cycleId: CICLO_B, laborId: LABOR_B, rut: CARO.id, date: "2026-03-02", amount: 40000 });
    const caro2 = await seedWorkday({ cycleId: CICLO_B, laborId: LABOR_B, rut: CARO.id, date: "2026-03-03", amount: 60000 });
    await updateDoc(doc(db, "workdays", caro2), { payrollId: "otra-nomina" });

    const { workdays, taken } = await workdaysForNewPayroll({
      people: [{ keys: workerKeys(CARO), workdayIds: [caro1, caro2] }],
    });

    expect(workdays.map((wd) => wd.id)).toEqual([caro1]);
    expect(taken).toBe(1);
  });

  it("si la caché de los ciclos da libre un día que la relectura muestra tomado, no entra", async () => {
    await ciclo(CICLO_A, [COSECHA]);
    await seedWorker(ANA);
    const diaAna = await seedWorkday({ cycleId: CICLO_A, laborId: COSECHA, rut: ANA.id, date: "2026-03-02", amount: 100000 });
    // La pantalla ya leyó el ciclo (caché de un minuto), y después otra sesión
    // se llevó el día: esa escritura no pasa por la caché de esta.
    await listWorkdaysByCycles([CICLO_A]);
    await updateDoc(doc(db, "workdays", diaAna), { payrollId: "otra-nomina" });

    const { workdays, taken } = await workdaysForNewPayroll({
      chosen: new Map([[CICLO_A, undefined]]),
      people: [{ keys: workerKeys(ANA), workdayIds: [diaAna] }],
    });

    expect(workdays).toEqual([]);
    expect(taken).toBe(1);
  });
});
