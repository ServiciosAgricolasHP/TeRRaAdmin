import { describe, it, expect } from "vitest";
import { payrollsService, tagWorkdaysWithPayroll, recalcPayrollAggregates } from "../../src/services/payrollsService";
import { planPayrollRecalc, applyPayrollRecalc } from "../../src/services/payrollRecalc";
import { workdaysService } from "../../src/services";
import { withFreshCycles } from "../../src/services/jobLists";
import {
  saveSnapshot,
  extendSnapshot,
  refreshSnapshotLabors,
  completeSnapshotLabors,
  snapshotCycleOf,
  snapshotLaborsOf,
  snapshotWorkdayOf,
} from "../../src/services/payrollSnapshots";
import { ANA, CICLO, LABOR, set, get, all, seedCycle, seedWorker, seedWorkday } from "./helpers/seed";

// Las labores que guarda el JSON de una nómina. La pantalla arma la nómina con
// su copia de los ciclos, y a esa copia le puede faltar una labor creada en
// otro equipo: el JSON quedaría sin ella y el detalle mostraría su id. Los
// ciclos que no conocen la labor de una jornada se releen, Recalcular pone al
// día las labores del JSON aunque la nómina no tenga otros cambios, y el
// detalle completa la que falte al mostrarla.

const PODA = "labor-poda";
const COSECHA = { id: LABOR, name: "Cosecha", type: "cosecha" };
const DOS_LABORES = [COSECHA, { id: PODA, name: "Poda", type: "main" }];

// El ciclo como lo tiene una copia que todavía no ve la Poda.
const copiaVieja = async () => [{ ...(await get("cycles", CICLO)), labors: [{ workers: [], ...COSECHA }] }];

// Ana con un día de cosecha y uno de poda en el ciclo.
async function sembrar() {
  await seedCycle({ labors: DOS_LABORES });
  await seedWorker(ANA);
  await seedWorkday({ rut: ANA.id, date: "2026-03-02", amount: 100000 });
  await seedWorkday({ laborId: PODA, rut: ANA.id, date: "2026-03-03", amount: 60000 });
}

// La nómina pendiente con los dos días de Ana y su JSON armado con la copia
// vieja del ciclo, como lo dejaba la pantalla.
async function armarNomina() {
  const wds = await workdaysService.list({ wheres: [["cycleId", "==", CICLO]] });
  const items = [{
    rut: ANA.id,
    workerId: ANA.id,
    name: ANA.name,
    bankCode: "012",
    grossAmount: 160000,
    advance: 0,
    bonus: 0,
    amount: 160000,
    byCycle: { [CICLO]: 160000 },
    workdayIds: wds.map((wd) => wd.id),
    advanceIds: [],
  }];
  const agg = recalcPayrollAggregates(items);
  const nomina = await payrollsService.create({
    name: "Nómina",
    status: "pending",
    cycleIds: [CICLO],
    cycleLabels: [CICLO],
    cycleDetails: [{ id: CICLO, label: CICLO }],
    ...agg,
  });
  await tagWorkdaysWithPayroll(agg.workdayIds, nomina.id);
  const [vieja] = await copiaVieja();
  await saveSnapshot(nomina.id, {
    version: 1,
    payroll: { name: "Nómina", status: "pending" },
    cycles: [snapshotCycleOf({ id: CICLO, label: CICLO }, vieja)],
    workers: items,
    workdays: wds.map(snapshotWorkdayOf),
    advances: [],
  });
  return nomina.id;
}

const recalcular = async (id) =>
  planPayrollRecalc(await get("payrolls", id), {
    cycles: await copiaVieja(),
    faenas: await all("faenas"),
    subfaenas: await all("subfaenas"),
    workers: await all("worker"),
  });

const laboresDelJson = async (id) => (await get("payrollSnapshots", id)).cycles[0].labors.map((l) => l.name);

describe("las labores del JSON de una nómina", () => {
  it("relee solo el ciclo que no conoce la labor de una jornada", async () => {
    await sembrar();
    const copia = await copiaVieja();
    const wds = await all("workdays");

    const vivos = await withFreshCycles(copia, wds);
    expect(vivos.map((c) => c.labors.map((l) => l.id))).toEqual([[LABOR, PODA]]);
    // Sin faltantes no lee nada: devuelve la misma lista.
    expect(await withFreshCycles(vivos, wds)).toBe(vivos);
  });

  it("Recalcular deja en el JSON la labor que la copia de los ciclos no conocía", async () => {
    await sembrar();
    const id = await armarNomina();
    expect(await laboresDelJson(id)).toEqual(["Cosecha"]);

    const plan = await recalcular(id);
    expect(plan.amountChanges).toEqual([]);
    expect(plan.cycleLabors.map((c) => c.labors.map((l) => l.id))).toEqual([[LABOR, PODA]]);
    await applyPayrollRecalc(id, plan);

    expect(await laboresDelJson(id)).toEqual(["Cosecha", "Poda"]);
  });

  it("sin otros cambios, Recalcular igual completa las labores del JSON, y una sola vez", async () => {
    await sembrar();
    const id = await armarNomina();
    await applyPayrollRecalc(id, await recalcular(id));
    // El JSON vuelve a quedar sin la Poda, con la nómina ya al día.
    const { id: _omit, ...snap } = await get("payrollSnapshots", id);
    await set("payrollSnapshots", id, { ...snap, cycles: [{ ...snap.cycles[0], labors: [snap.cycles[0].labors[0]] }] });

    const plan = await recalcular(id);
    expect(plan.empty).toBe(true);
    expect(await refreshSnapshotLabors(id, plan.cycleLabors)).toBe(true);
    expect(await laboresDelJson(id)).toEqual(["Cosecha", "Poda"]);
    expect(await refreshSnapshotLabors(id, plan.cycleLabors)).toBe(false);
  });

  it("agregar días de una persona pone al día las labores de ese ciclo en el JSON", async () => {
    await sembrar();
    const id = await armarNomina();
    const nomina = await get("payrolls", id);

    await extendSnapshot(id, {
      items: nomina.items,
      aggregates: recalcPayrollAggregates(nomina.items),
      cycleLabors: [{ id: CICLO, ...snapshotLaborsOf(await get("cycles", CICLO)) }],
    });

    expect(await laboresDelJson(id)).toEqual(["Cosecha", "Poda"]);
  });

  it("el detalle completa la labor que le falta al JSON con la del ciclo, sin cambiar las que tenía", async () => {
    await sembrar();
    const id = await armarNomina();
    // Después de armar la nómina, la cosecha cambió de nombre en el ciclo.
    const ciclo = await get("cycles", CICLO);
    await set("cycles", CICLO, { ...ciclo, labors: ciclo.labors.map((l) => (l.id === LABOR ? { ...l, name: "Cosecha Nueva" } : l)) });

    const snap = await get("payrollSnapshots", id);
    const mostrado = await completeSnapshotLabors(snap);
    expect(mostrado.cycles[0].labors.map((l) => l.name)).toEqual(["Cosecha", "Poda"]);
    // No escribe: el JSON guardado sigue igual.
    expect(await laboresDelJson(id)).toEqual(["Cosecha"]);
  });
});
