import { describe, it, expect } from "vitest";
import { updateDoc, doc } from "firebase/firestore";
import { db } from "../../src/firebase";
import { importHarvest } from "../../src/services/harvestImportService";
import { parseHarvestFile } from "../../src/utils/harvestFormats";
import {
  fileCombosOf,
  filePeopleOf,
  suggestComboMap,
  matchFilePeople,
  initialDecisions,
  buildHarvestImportPlan,
  newWorkerDefaults,
} from "../../src/utils/harvestImport";
import { workdayMapKey, workdayComboKeyOf } from "../../src/utils/cosechaCombos";
import { ANA, CICLO, LABOR, all, get, seedCycle, seedWorker } from "./helpers/seed";

// Importar la cosecha que entrega la empresa en la labor de cosecha de un
// ciclo, como lo hace el modal: leer el archivo, emparejar, armar el plan y
// escribirlo. Datos inventados.

const FOREIGN = { id: "100000001-K", name: "Claudia Rojas", bankCode: "012" };

const file = () => parseHarvestFile({
  formato: "harvestLaguada",
  version: 1,
  archivo: "Cerezas.xlsx",
  unidad_pago: "caja",
  cosechas: [{ hoja: "Hoja1", especies: ["CEREZOS"] }],
  produccion: [
    { rut: ANA.id, nombre: "ANA BANCO", contratista: "UNO", hoja: "Hoja1", fecha: "2026-03-02", especie: "CEREZOS", calidad: "EXP", envase: "CAPACHO", kilos: 50, cajas: 10 },
    { rut: ANA.id, nombre: "ANA BANCO", contratista: "UNO", hoja: "Hoja1", fecha: "2026-03-03", especie: "CEREZOS", calidad: "EXP", envase: "TOTEM", kilos: 90, cajas: 12 },
    // Claudia viene con otro RUT que el de su ficha.
    { rut: "91111111-1", nombre: "CLAUDIA ROJAS", contratista: "UNO", hoja: "Hoja1", fecha: "2026-03-02", especie: "CEREZOS", calidad: "EXP", envase: "CAPACHO", kilos: 30, cajas: 6 },
    // Alguien que no está en ninguna ficha.
    { rut: "15.555.555-6", nombre: "PEDRO SALAS", contratista: "UNO", hoja: "Hoja1", fecha: "2026-03-03", especie: "CEREZOS", calidad: "EXP", envase: "CAPACHO", kilos: 20, cajas: 4 },
  ],
  pisos: [
    { rut: ANA.id, nombre: "ANA BANCO", fecha: "2026-03-02", monto: 15000, por: "envase", grupo: "CAPACHO" },
    { rut: ANA.id, nombre: "ANA BANCO", fecha: "2026-03-03", monto: 20000, por: "envase", grupo: "TOTEM" },
  ],
}).file;

const catalogs = {
  qualities: [{ value: 0, label: "Exportación" }],
  containers: [{ value: 2, label: "capacho" }, { value: 4, label: "totem" }],
};

// Lo que hace el modal: carga lo que hay y arma el plan, con Claudia elegida
// a mano porque su RUT no calza.
async function planFor() {
  const f = file();
  const cycle = { id: CICLO, ...(await get("cycles", CICLO)) };
  const labor = cycle.labors.find((l) => l.id === LABOR);
  const workers = await all("worker");
  const wds = (await all("workdays")).filter((w) => w.cycleId === CICLO);
  const workdaysOfLabor = Object.fromEntries(wds.map((w) => [workdayMapKey(w.workerRut, w.date, workdayComboKeyOf(w, "cosecha")), w]));
  const combos = fileCombosOf(f.rows);
  const comboMap = suggestComboMap(combos, catalogs, f.defaultMeasure);
  const matches = matchFilePeople(filePeopleOf(f.rows), workers);
  const decisions = { ...initialDecisions(matches), "91111111-1": { action: "use", workerId: FOREIGN.id } };
  return {
    matches,
    plan: buildHarvestImportPlan({ rows: f.rows, floors: f.floors, combos, comboMap, decisions, workers, cycle, labor, workdaysOfLabor, dayPrices: cycle.dayPrices }),
  };
}

async function seed() {
  await seedWorker(ANA);
  await seedWorker(FOREIGN);
  await seedCycle({ dias: ["2026-03-02"], labors: [{ id: LABOR, name: "Cosecha", type: "cosecha", workers: [{ id: ANA.id, rut: ANA.id, name: ANA.name }] }] });
  await updateDoc(doc(db, "cycles", CICLO), { dayPrices: { [LABOR]: { "2026-03-02": { "0_2": { price: 1000, mode: "unit" } } } } });
}

describe("importar la cosecha de la empresa", () => {
  it("escribe las jornadas y los pisos, y pone al día el ciclo, las fichas y la auditoría", async () => {
    await seed();
    const { matches, plan } = await planFor();
    expect(matches.find((m) => m.rut === "91111111-1").status).toBe("review");
    expect(matches.find((m) => m.rut === "15555555-6").status).toBe("new");

    const progress = [];
    const res = await importHarvest({ cycleId: CICLO, laborId: LABOR, plan, fileName: "Cerezas.xlsx", onProgress: (p) => progress.push(p) });
    // El avance pasa por cada etapa, y los lotes llegan al total.
    expect([...new Set(progress.map((p) => p.stage))]).toEqual(["check", "write", "cycle", "workers"]);
    const lastWrite = progress.filter((p) => p.stage === "write").at(-1);
    expect(lastWrite.done).toBe(lastWrite.total);

    const wds = await all("workdays");
    const ana = wds.filter((w) => w.workerRut === ANA.id);
    expect(ana.find((w) => w.date === "2026-03-02" && !w.pisoOnly)).toMatchObject({ qty: 10, amount: 10000, qualityX: 0, containerY: 2, harvestImported: true });
    expect(ana.find((w) => w.date === "2026-03-03" && !w.pisoOnly)).toMatchObject({ qty: 12, amount: 0, containerY: 4 });
    expect(ana.filter((w) => w.pisoOnly).map((w) => [w.date, w.amount, w.containerY]).sort()).toEqual([
      ["2026-03-02", 15000, 2],
      ["2026-03-03", 20000, 4],
    ]);
    expect(ana.every((w) => w.updatedAt)).toBe(true);
    // Claudia entra con el RUT de su ficha, y el RUT y el nombre de la empresa
    // quedan guardados.
    expect(wds.find((w) => w.workerId === FOREIGN.id)).toMatchObject({ workerRut: FOREIGN.id, qty: 6, amount: 6000 });
    const claudia = await get("worker", FOREIGN.id);
    expect(claudia.fileAliases).toEqual([{ rut: "91111111-1", name: "CLAUDIA ROJAS" }]);
    expect(claudia.updatedAt).toBeTruthy();
    // Pedro era nuevo: se crea su ficha.
    // Su RUT es menor a 22 millones: queda con el líder de los chilenos.
    expect(await get("worker", "15555555-6")).toMatchObject({ rut: "15555555-6", name: "Pedro Salas", groupLeader: ["CHILENOS"] });
    expect((await get("worker", "15555555-6")).bankDetails).toBeUndefined();
    expect((await get("worker", "15555555-6")).createdAt).toBeTruthy();

    const cycle = await get("cycles", CICLO);
    expect(cycle.days).toEqual(["2026-03-02", "2026-03-03"]);
    expect(cycle.labors[0].workers.map((w) => w.id).sort()).toEqual([ANA.id, FOREIGN.id, "15555555-6"].sort());
    expect(cycle.dayPrices[LABOR]["2026-03-02"].floorByContainer).toEqual({ 2: 15000 });
    expect(cycle.dayPrices[LABOR]["2026-03-03"].floorByContainer).toEqual({ 4: 20000 });
    expect(res.days).toEqual(cycle.days);

    const logs = (await all("logs")).filter((l) => l.action === "harvestImport");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      entity: "cycle",
      entityId: CICLO,
      meta: { laborId: LABOR, file: "Cerezas.xlsx", created: ["15555555-6"], aliases: [{ workerId: FOREIGN.id, added: [{ rut: "91111111-1", name: "CLAUDIA ROJAS" }] }] },
    });
  });

  it("una ficha nueva con RUT sobre 30 millones queda como extranjera en efectivo", async () => {
    await seed();
    const { plan } = await planFor();
    const foreign = { ...plan, creates: [{ rut: "31111111-6", name: "LUIS PAZ", ...newWorkerDefaults("31111111-6") }], writes: [], deletes: [], aliases: [] };
    await importHarvest({ cycleId: CICLO, laborId: LABOR, plan: foreign });
    expect(await get("worker", "31111111-6")).toMatchObject({
      name: "Luis Paz",
      groupLeader: ["EXTRANJEROS"],
      bankDetails: ["31111111-6", "31111111", 3, "EFE"],
    });
    expect((await get("worker", "31111111-6")).nationality).toBeUndefined();
  });

  it("una ficha que otro equipo creó recién no se pisa", async () => {
    await seed();
    const { plan } = await planFor();
    expect(plan.creates.map((c) => c.rut)).toEqual(["15555555-6"]);
    await seedWorker({ id: "15555555-6", name: "Pedro Salas Vera", bankCode: "012" });
    await importHarvest({ cycleId: CICLO, laborId: LABOR, plan });
    expect((await get("worker", "15555555-6")).name).toBe("Pedro Salas Vera");
    expect((await all("workdays")).some((w) => w.workerId === "15555555-6")).toBe(true);
  });

  it("volver a importar lo mismo no reescribe nada, y lo que está en una nómina no se toca", async () => {
    await seed();
    await importHarvest({ cycleId: CICLO, laborId: LABOR, plan: (await planFor()).plan });
    const ana = (await all("workdays")).find((w) => w.workerRut === ANA.id && w.date === "2026-03-02" && !w.pisoOnly);
    await updateDoc(doc(db, "workdays", ana.id), { payrollId: "N1", qty: 9 });

    const { plan } = await planFor();
    expect(plan.writes).toHaveLength(0);
    expect(plan.blocked.map((w) => w.mapKey)).toEqual([workdayMapKey(ANA.id, "2026-03-02", "0_2")]);
    expect(plan.creates).toHaveLength(0);
    // Claudia ya calza sola por el par guardado.
    expect(plan.aliases).toHaveLength(0);
    await importHarvest({ cycleId: CICLO, laborId: LABOR, plan });
    expect((await get("workdays", ana.id)).qty).toBe(9);
  });

  it("no importa en un ciclo cerrado", async () => {
    await seed();
    const { plan } = await planFor();
    await updateDoc(doc(db, "cycles", CICLO), { status: "closed" });
    await expect(importHarvest({ cycleId: CICLO, laborId: LABOR, plan })).rejects.toThrow(/cerrado/);
    expect(await all("workdays")).toHaveLength(0);
  });
});
