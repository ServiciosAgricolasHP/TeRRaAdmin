import { describe, it, expect } from "vitest";
import { parseHarvestFile } from "./harvestFormats";
import {
  contractorsOf,
  fileCombosOf,
  filePeopleOf,
  suggestComboMap,
  comboMapComplete,
  matchFilePeople,
  initialDecisions,
  pendingDecisions,
  buildHarvestImportPlan,
  fileTotalsOf,
  newWorkerDefaults,
  sameQtyByUnit,
} from "./harvestImport";

// Un archivo de Laguada con datos inventados: cerezas con capacho y totem, un
// piso por envase el 30-12 y uno sin fecha.
const json = (over = {}) => ({
  formato: "harvestLaguada",
  version: 1,
  archivo: "Cerezas semana 1.xlsx",
  semana: "2026-S01",
  estado: "OK",
  periodo: { desde: "2025-12-29", hasta: "2025-12-30" },
  unidad_pago: "caja",
  cosechas: [{ hoja: "Hoja1", especies: ["CEREZOS"] }],
  produccion: [
    { rut: "11.111.111-1", nombre: "ANA PEREZ SOTO", contratista: "CONTRATISTA UNO", hoja: "Hoja1", fecha: "2025-12-29", campo: "C1", especie: "CEREZOS", calidad: "EXP", envase: "CAPACHO CZ", kilos: 45, cajas: 10, precio_empresa: 1100 },
    { rut: "11.111.111-1", nombre: "ANA PEREZ SOTO", contratista: "CONTRATISTA UNO", hoja: "Hoja1", fecha: "2025-12-30", campo: "C1", especie: "CEREZOS", calidad: "EXP", envase: "CAPACHO CZ", kilos: 90, cajas: 20, precio_empresa: 1100 },
    { rut: "11.111.111-1", nombre: "ANA PEREZ SOTO", contratista: "CONTRATISTA UNO", hoja: "Hoja1", fecha: "2025-12-30", campo: "C2", especie: "CEREZOS", calidad: "EXP", envase: "TOTEM CZ", kilos: 120, cajas: 12, precio_empresa: 2200 },
    { rut: "22.222.222-2", nombre: "BETO RUIZ", contratista: "CONTRATISTA UNO", hoja: "Hoja1", fecha: "2025-12-30", campo: "C1", especie: "CEREZOS", calidad: "EXP", envase: "CAPACHO CZ", kilos: 30, cajas: 6, precio_empresa: 1100 },
    { rut: "33.333.333-3", nombre: "CARLA DIAZ", contratista: "OTRA EMPRESA", hoja: "Hoja1", fecha: "2025-12-30", campo: "C1", especie: "CEREZOS", calidad: "EXP", envase: "CAPACHO CZ", kilos: 50, cajas: 11, precio_empresa: 1100 },
  ],
  pisos: [
    { rut: "11.111.111-1", nombre: "ANA PEREZ SOTO", fecha: "2025-12-29", monto: 15000, por: "envase", grupo: "CAPACHO CZ", regla: "CAPACHO CZ 29-12: 10 cajas (más de 9)" },
    { rut: "11.111.111-1", nombre: "ANA PEREZ SOTO", fecha: "2025-12-30", monto: 15000, por: "envase", grupo: "CAPACHO CZ", regla: "" },
    { rut: "11.111.111-1", nombre: "ANA PEREZ SOTO", fecha: "2025-12-30", monto: 20000, por: "envase", grupo: "TOTEM CZ", regla: "" },
    { rut: "33.333.333-3", nombre: "CARLA DIAZ", fecha: "2025-12-30", monto: 15000, por: "envase", grupo: "CAPACHO CZ", regla: "" },
    { rut: "22.222.222-2", nombre: "BETO RUIZ", fecha: null, monto: 30000, por: null, grupo: null, regla: "BONO (escrito a mano, sin regla en el archivo)" },
  ],
  advertencias: [],
  ...over,
});

const catalogs = {
  qualities: [{ value: 0, label: "Exportación" }, { value: 1, label: "IQF" }],
  containers: [{ value: 0, label: "kilo" }, { value: 2, label: "capacho" }, { value: 4, label: "Totem" }],
};

describe("contratistas, combos y personas", () => {
  const { file } = parseHarvestFile(json());

  it("cuenta las personas de cada contratista, el que trae más primero", () => {
    expect(contractorsOf(file.rows).map((c) => [c.name, c.people, c.rows])).toEqual([
      ["CONTRATISTA UNO", 2, 4],
      ["OTRA EMPRESA", 1, 1],
    ]);
  });

  it("junta los combos con sus unidades y los precios de la empresa", () => {
    const combos = fileCombosOf(file.rows);
    expect(combos.map((c) => [c.container, c.units, c.prices])).toEqual([
      ["CAPACHO CZ", 47, [1100]],
      ["TOTEM CZ", 12, [2200]],
    ]);
  });

  it("una persona por RUT, con sus días y las unidades de cada envase", () => {
    const ana = filePeopleOf(file.rows).find((p) => p.rut === "11111111-1");
    expect(ana).toMatchObject({ name: "ANA PEREZ SOTO", days: 2, kilos: 255 });
    expect(ana.units).toEqual([{ container: "CAPACHO CZ", units: 30 }, { container: "TOTEM CZ", units: 12 }]);
  });
});

describe("emparejar los combos con el catálogo", () => {
  const combos = fileCombosOf(parseHarvestFile(json()).file.rows);

  it("calza por nombre y toma la cantidad que dice el archivo", () => {
    expect(suggestComboMap(combos, catalogs, "units")).toEqual({
      "CEREZOS|EXP|CAPACHO CZ": { x: 0, y: 2, measure: "units" },
      "CEREZOS|EXP|TOTEM CZ": { x: 0, y: 4, measure: "units" },
    });
    expect(suggestComboMap(combos, catalogs, "kilos")["CEREZOS|EXP|CAPACHO CZ"].measure).toBe("kilos");
  });

  it("lo que no calza queda por elegir, y lo elegido antes manda", () => {
    const sinTotem = { ...catalogs, containers: catalogs.containers.filter((c) => c.value !== 4) };
    const map = suggestComboMap(combos, sinTotem, "units");
    expect(map["CEREZOS|EXP|TOTEM CZ"].y).toBe(null);
    expect(comboMapComplete(combos, map)).toBe(false);
    const remembered = { "CEREZOS|EXP|TOTEM CZ": { x: 0, y: 0, measure: "kilos" } };
    expect(suggestComboMap(combos, sinTotem, "units", remembered)["CEREZOS|EXP|TOTEM CZ"]).toEqual({ x: 0, y: 0, measure: "kilos" });
    // Una cantidad guardada que ya no existe vuelve a la del archivo.
    expect(suggestComboMap(combos, catalogs, "units", { "CEREZOS|EXP|TOTEM CZ": { measure: "cajas" } })["CEREZOS|EXP|TOTEM CZ"].measure).toBe("units");
  });
});

describe("emparejar a las personas", () => {
  const person = (rut, name) => ({ rut, name, contractors: [], days: 1, kilos: 0, units: [] });

  it("calza sola si el RUT y el nombre calzan, también en otro orden", () => {
    const [m] = matchFilePeople([person("11111111-1", "PEREZ SOTO ANA")], [{ id: "11111111-1", rut: "11111111-1", name: "Ana Pérez Soto" }]);
    expect(m).toMatchObject({ status: "matched", via: "rut" });
  });

  it("calza por el RUT y el nombre con que la trajo un archivo, guardados en la ficha", () => {
    const workers = [{ id: "100000001-B", rut: "100000001-B", name: "Claudia Rojas", fileAliases: [{ rut: "91111111-1", name: "CLAUDIA ROJAS" }] }];
    const [m] = matchFilePeople([person("91111111-1", "CLAUDIA ROJAS")], workers);
    expect(m).toMatchObject({ status: "matched", via: "alias" });
    expect(m.worker.id).toBe("100000001-B");
  });

  it("calza por un nombre que trajo un archivo aunque no se parezca al de la ficha", () => {
    // Le dicen Patricio, pero la empresa lo trae como José, con su mismo RUT.
    const workers = [{ id: "12345678-5", rut: "12345678-5", name: "Patricio Paredes Lagos", fileAliases: [{ rut: "12345678-5", name: "JOSE PAREDES" }] }];
    const [m] = matchFilePeople([person("12345678-5", "JOSE PAREDES")], workers);
    expect(m).toMatchObject({ status: "matched", via: "rut" });
    // Sin el par guardado, el mismo RUT con otro nombre va a revisión.
    const [n] = matchFilePeople([person("12345678-5", "JOSE PAREDES")], [{ ...workers[0], fileAliases: [] }]);
    expect(n).toMatchObject({ status: "review", reason: "nameMismatch" });
  });

  it("un RUT conocido con otro nombre va a revisión: el RUT se pudo reasignar", () => {
    // La semana pasada el 91.111.111-1 era de Claudia; esta semana es de Miguel.
    const workers = [{ id: "100000001-B", rut: "100000001-B", name: "Claudia Rojas", fileAliases: [{ rut: "91111111-1", name: "CLAUDIA ROJAS" }] }];
    const [m] = matchFilePeople([person("91111111-1", "MIGUEL TAPIA")], workers);
    expect(m).toMatchObject({ status: "review", reason: "nameMismatch", rutTaken: false });
    expect(m.candidates.map((w) => w.id)).toEqual(["100000001-B"]);
    // Si el RUT es el de la ficha (no uno de la empresa), no se puede crear otra con él.
    const [own] = matchFilePeople([person("100000001-B", "MIGUEL TAPIA")], workers);
    expect(own).toMatchObject({ status: "review", rutTaken: true });
  });

  it("con otro RUT pero el mismo nombre, sugiere la ficha para revisar", () => {
    const workers = [{ id: "100000002-B", rut: "100000002-B", name: "José Luis Mendoza Quispe" }, { id: "5-1", rut: "5-1", name: "Otro Nombre" }];
    const [m] = matchFilePeople([person("92222222-2", "JOSE LUIS MENDOZA QUISPE")], workers);
    expect(m).toMatchObject({ status: "review", reason: "otherRut" });
    expect(m.candidates.map((w) => w.id)).toEqual(["100000002-B"]);
  });

  it("sin RUT ni nombre parecido es nueva, y una sola palabra en común no alcanza", () => {
    const [m] = matchFilePeople([person("93333333-3", "PEDRO SALAS")], [{ id: "4-1", rut: "4-1", name: "Pedro Fuentes" }]);
    expect(m.status).toBe("new");
  });

  it("busca por nombre con errores de tipeo y en otro orden, los más parecidos primero", () => {
    const workers = [
      { id: "1-9", rut: "1-9", name: "Claudia Andrea Rojas Soto" },
      { id: "2-7", rut: "2-7", name: "Claudia Rojas" },
      { id: "3-5", rut: "3-5", name: "Andrea Soto" },
    ];
    const [m] = matchFilePeople([person("94444444-4", "ROJAS SOTO CLAUIDA")], workers);
    expect(m.status).toBe("review");
    expect(m.candidates.map((w) => w.id)).toEqual(["1-9", "2-7"]);
  });

  it("una ficha nueva va como chilena bajo 22 millones y como extranjera en efectivo sobre 30", () => {
    expect(newWorkerDefaults("15.555.555-6")).toEqual({ groupLeader: "CHILENOS" });
    expect(newWorkerDefaults("21999999-2")).toEqual({ groupLeader: "CHILENOS" });
    expect(newWorkerDefaults("31111111-6")).toEqual({ groupLeader: "EXTRANJEROS", cash: true });
    expect(newWorkerDefaults("100000001-B")).toEqual({ groupLeader: "EXTRANJEROS", cash: true });
    // Entre 22 y 30 millones, y en los bordes, queda para completar a mano.
    expect(newWorkerDefaults("22000000-1")).toEqual({});
    expect(newWorkerDefaults("25555555-3")).toEqual({});
    expect(newWorkerDefaults("30000000-2")).toEqual({});
    expect(newWorkerDefaults("")).toEqual({});
  });

  it("decide sola lo que calza y lo nuevo; lo dudoso queda pendiente", () => {
    const matches = [
      { rut: "a", status: "matched", worker: { id: "W1" } },
      { rut: "b", status: "new" },
      { rut: "c", status: "review" },
    ];
    const decisions = initialDecisions(matches);
    expect(decisions).toEqual({ a: { action: "use", workerId: "W1" }, b: { action: "create" }, c: null });
    expect(pendingDecisions(matches, decisions)).toBe(1);
  });
});

describe("el plan de la importación", () => {
  const { file } = parseHarvestFile(json());
  const rows = file.rows.filter((r) => r.contractor === "CONTRATISTA UNO");
  const combos = fileCombosOf(rows);
  const comboMap = suggestComboMap(combos, catalogs, "units");
  const workers = [
    { id: "11111111-1", rut: "11111111-1", name: "Ana Pérez Soto" },
    { id: "100000009-B", rut: "100000009-B", name: "Beto Ruiz" },
  ];
  const cycle = { id: "C1", days: ["2025-12-29"] };
  const labor = { id: "L1", type: "cosecha", workers: [{ id: "11111111-1", rut: "11111111-1", name: "Ana Pérez Soto" }] };
  const dayPrices = { L1: { "2025-12-29": { "0_2": { price: 900, mode: "unit" } }, "2025-12-30": { "0_2": { price: 900, mode: "unit" }, "0_4": { price: 1800, mode: "flat" } } } };
  const decisions = {
    "11111111-1": { action: "use", workerId: "11111111-1" },
    "22222222-2": { action: "use", workerId: "100000009-B" },
  };
  const plan = (over = {}) => buildHarvestImportPlan({
    rows, floors: file.floors, combos, comboMap, decisions, workers, cycle, labor, workdaysOfLabor: {}, dayPrices, ...over,
  });
  const byKey = (p) => Object.fromEntries(p.writes.map((w) => [w.mapKey, w.data]));

  it("escribe una jornada por persona, día y combo, con los precios del ciclo", () => {
    const w = byKey(plan());
    expect(w["11111111-1__2025-12-29__0_2"]).toMatchObject({ qty: 10, amount: 9000, qualityX: 0, containerY: 2, workerId: "11111111-1", harvestImported: true });
    expect(w["11111111-1__2025-12-30__0_4"]).toMatchObject({ qty: 12, amount: 1800 });
    // Beto entra con el RUT de su ficha, y su RUT de la empresa queda para guardar.
    expect(w["100000009-B__2025-12-30__0_2"]).toMatchObject({ qty: 6, amount: 5400, workerId: "100000009-B" });
  });

  it("los pisos van con el monto de la planilla, uno por envase; el sin fecha queda de aviso", () => {
    const p = plan();
    const w = byKey(p);
    expect(w["11111111-1__2025-12-29___piso_2"]).toMatchObject({ amount: 15000, pisoOnly: true, containerY: 2 });
    expect(w["11111111-1__2025-12-30___piso_2"].amount).toBe(15000);
    expect(w["11111111-1__2025-12-30___piso_4"].amount).toBe(20000);
    expect(p.undatedFloors.map((f) => f.amount)).toEqual([30000]);
    expect(p.floorConfig).toEqual(expect.arrayContaining([
      { date: "2025-12-29", container: 2, amount: 15000 },
      { date: "2025-12-30", container: 4, amount: 20000 },
    ]));
  });

  it("no configura el monto de un piso que el día ya tiene", () => {
    const withFloor = { L1: { ...dayPrices.L1, "2025-12-30": { ...dayPrices.L1["2025-12-30"], floorByContainer: { 2: 12000 } } } };
    const p = plan({ dayPrices: withFloor });
    expect(p.floorConfig.some((f) => f.date === "2025-12-30" && f.container === 2)).toBe(false);
  });

  it("deja fuera a quien se saltó, y no lee pisos de otros contratistas", () => {
    const p = plan({ decisions: { "11111111-1": decisions["11111111-1"], "22222222-2": { action: "skip" } } });
    expect(p.writes.every((w) => w.data.workerId === "11111111-1")).toBe(true);
    expect(p.writes.some((w) => w.mapKey.startsWith("33333333-3"))).toBe(false);
  });

  it("lo que cambia en el ciclo: días, personas en la labor, pares guardados y fichas nuevas", () => {
    const p = plan({ decisions: { ...decisions, "22222222-2": { action: "create" } } });
    expect(p.daysToAdd).toEqual(["2025-12-30"]);
    // 22.222.222 queda entre 22 y 30 millones: sin líder ni forma de pago.
    expect(p.creates).toEqual([{ rut: "22222222-2", name: "BETO RUIZ" }]);
    expect(p.laborWorkersToAdd).toEqual([{ id: "22222222-2", rut: "22222222-2", name: "BETO RUIZ" }]);
    expect(p.aliases).toEqual([]);
    const q = plan();
    expect(q.aliases).toEqual([{ workerId: "100000009-B", added: [{ rut: "22222222-2", name: "BETO RUIZ" }], fileAliases: [{ rut: "22222222-2", name: "BETO RUIZ" }] }]);
    expect(q.laborWorkersToAdd.map((w) => w.id)).toEqual(["100000009-B"]);
  });

  it("guarda el par también cuando el RUT es el de la ficha pero el nombre no calzaba", () => {
    const ws = [workers[0], { id: "22222222-2", rut: "22222222-2", name: "Roberto Ignacio Ruiz", fileAliases: [{ rut: "9-9", name: "BETO R" }] }];
    const q = plan({ workers: ws, decisions: { ...decisions, "22222222-2": { action: "use", workerId: "22222222-2" } } });
    expect(q.aliases).toEqual([{
      workerId: "22222222-2",
      added: [{ rut: "22222222-2", name: "BETO RUIZ" }],
      fileAliases: [{ rut: "9-9", name: "BETO R" }, { rut: "22222222-2", name: "BETO RUIZ" }],
    }]);
  });

  it("avisa los días y combos sin precio", () => {
    const p = plan({ dayPrices: {} });
    expect(p.unpriced).toEqual(expect.arrayContaining([{ date: "2025-12-29", ck: "0_2" }, { date: "2025-12-30", ck: "0_4" }]));
    expect(p.totals.amount).toBe(0);
  });

  it("no toca lo que está en una nómina, no reescribe lo igual y avisa lo escrito a mano", () => {
    const existing = {
      "11111111-1__2025-12-29__0_2": { id: "C1__L1__11111111-1__2025-12-29__0_2", workerRut: "11111111-1", date: "2025-12-29", qty: 10, amount: 9000, payrollId: "N1", harvestImported: true },
      "11111111-1__2025-12-30__0_2": { id: "C1__L1__11111111-1__2025-12-30__0_2", workerRut: "11111111-1", date: "2025-12-30", qty: 20, amount: 18000, harvestImported: true },
      "11111111-1__2025-12-30__0_4": { id: "C1__L1__11111111-1__2025-12-30__0_4", workerRut: "11111111-1", date: "2025-12-30", qty: 3, amount: 1800 },
    };
    const p = plan({ workdaysOfLabor: existing });
    expect(p.blocked.map((w) => w.mapKey)).toEqual(["11111111-1__2025-12-29__0_2"]);
    expect(p.unchanged).toBe(1);
    expect(p.replaced.map((w) => w.mapKey)).toEqual(["11111111-1__2025-12-30__0_4"]);
    expect(p.writes.some((w) => w.mapKey === "11111111-1__2025-12-29__0_2")).toBe(false);
  });

  it("volver a importar borra lo importado antes que ya no viene, solo de esas personas y fechas", () => {
    const existing = {
      // Importado antes en otro combo: ya no viene.
      "11111111-1__2025-12-29__1_2": { id: "C1__L1__11111111-1__2025-12-29__1_2", workerRut: "11111111-1", date: "2025-12-29", qty: 4, amount: 100, harvestImported: true },
      // Importado antes, pero de otra semana: no se toca.
      "11111111-1__2025-12-20__0_2": { id: "x1", workerRut: "11111111-1", date: "2025-12-20", qty: 4, amount: 100, harvestImported: true },
      // De alguien que no viene en esta importación: no se toca.
      "44444444-4__2025-12-29__0_2": { id: "x2", workerRut: "44444444-4", date: "2025-12-29", qty: 4, amount: 100, harvestImported: true },
      // Escrito a mano: no se borra.
      "11111111-1__2025-12-29__0_0": { id: "x3", workerRut: "11111111-1", date: "2025-12-29", qty: 4, amount: 100 },
      // Importado y en una nómina: queda, y se avisa.
      "11111111-1__2025-12-30__1_4": { id: "x4", workerRut: "11111111-1", date: "2025-12-30", qty: 4, amount: 100, harvestImported: true, payrollId: "N1" },
    };
    const p = plan({ workdaysOfLabor: existing });
    expect(p.deletes).toEqual([{ mapKey: "11111111-1__2025-12-29__1_2", docId: "C1__L1__11111111-1__2025-12-29__1_2" }]);
    expect(p.blockedDeletes.map((w) => w.id)).toEqual(["x4"]);
  });

  it("los totales del plan calzan con los del archivo para lo elegido, por envase", () => {
    const p = plan();
    const f = fileTotalsOf(rows, file.floors, comboMap, decisions);
    expect(p.totals.qtyByUnit).toEqual({ "c:2": 36, "c:4": 12 });
    expect(sameQtyByUnit(p.totals.qtyByUnit, f.qtyByUnit)).toBe(true);
    expect(p.totals.floorAmount).toBe(f.floorAmount);
    expect(p.totals).toMatchObject({ people: 2, floorAmount: 50000, floorCount: 3 });
    expect(p.days.find((d) => d.date === "2025-12-30").qtyByUnit).toEqual({ "c:2": 26, "c:4": 12 });
  });

  it("lo pagado por kilo se cuenta aparte de las unidades", () => {
    const byKilo = { ...comboMap, "CEREZOS|EXP|TOTEM CZ": { ...comboMap["CEREZOS|EXP|TOTEM CZ"], measure: "kilos" } };
    const p = plan({ comboMap: byKilo });
    expect(p.totals.qtyByUnit).toEqual({ "c:2": 36, kg: 120 });
    expect(sameQtyByUnit(p.totals.qtyByUnit, fileTotalsOf(rows, file.floors, byKilo, decisions).qtyByUnit)).toBe(true);
    expect(sameQtyByUnit(p.totals.qtyByUnit, { "c:2": 36 })).toBe(false);
  });
});
