import { describe, it, expect } from "vitest";
import {
  comboKey,
  parseComboKey,
  cosechaUnit,
  getDayPiso,
  effectivePiso,
  pisoTargets,
  pisoAssigned,
  mapHarvestCodes,
  invertHarvestCodes,
  getDayCombos,
  getDaySingle,
  normalizeDayPricesEntry,
  workdayDocId,
  workdayMapKey,
  getTratoTierTotals,
  PISO_COMBO_KEY,
} from "./cosechaCombos";

describe("workdayDocId", () => {
  // Es la clave de idempotencia de toda escritura de producción, y
  // payrollsService la usa para saber qué workdays son de un ciclo que se saca
  // de una nómina.
  it("omite el sufijo cuando el combo es el default", () => {
    expect(workdayDocId("c1", "l1", "12345678-5", "2026-03-04")).toBe(
      "c1__l1__12345678-5__2026-03-04",
    );
    expect(workdayDocId("c1", "l1", "12345678-5", "2026-03-04", "0_0")).toBe(
      "c1__l1__12345678-5__2026-03-04",
    );
  });

  it("agrega el combo como quinto segmento cuando no es el default", () => {
    expect(workdayDocId("c1", "l1", "12345678-5", "2026-03-04", "1_2")).toBe(
      "c1__l1__12345678-5__2026-03-04__1_2",
    );
    expect(workdayDocId("c1", "l1", "12345678-5", "2026-03-04", PISO_COMBO_KEY)).toBe(
      "c1__l1__12345678-5__2026-03-04___piso",
    );
  });

  it("deja el rut en la tercera posición al partir por __", () => {
    // parts[2] del docId es el rut: lo lee la auditoría y lo reemplaza la
    // asignación de RUT a un trabajador temporal.
    const id = workdayDocId("c1", "l1", "12345678-5", "2026-03-04", "1_2");
    expect(id.split("__")[2]).toBe("12345678-5");
    expect(id.split("__")).toHaveLength(5);
  });

  it("es determinístico", () => {
    const a = workdayDocId("c1", "l1", "1-9", "2026-01-01", "2_3");
    const b = workdayDocId("c1", "l1", "1-9", "2026-01-01", "2_3");
    expect(a).toBe(b);
  });
});

describe("workdayMapKey", () => {
  it("son 3 segmentos, no los 5 del docId", () => {
    expect(workdayMapKey("1-9", "2026-01-01")).toBe("1-9__2026-01-01__0_0");
    expect(workdayMapKey("1-9", "2026-01-01", "1_2")).toBe("1-9__2026-01-01__1_2");
    expect(workdayMapKey("1-9", "2026-01-01").split("__")).toHaveLength(3);
  });
});

describe("comboKey / parseComboKey", () => {
  it("van y vuelven", () => {
    for (const [x, y] of [[0, 0], [1, 2], [7, 3]]) {
      expect(parseComboKey(comboKey(x, y))).toEqual({ x, y });
    }
  });

  it("cae a 0 con claves rotas", () => {
    expect(parseComboKey("")).toEqual({ x: 0, y: 0 });
    expect(parseComboKey("a_b")).toEqual({ x: 0, y: 0 });
  });
});

describe("getTratoTierTotals", () => {
  // Las tres ramas de getTratoTierTotals. El espejo `tiers` puede quedar
  // desincronizado del primer nivel, y el primer nivel gana.
  it("prioriza el top-level sobre el espejo desincronizado", () => {
    const wd = { qty: 10, amount: 5000, tiers: { 0: { qty: 3, amount: 1500 } } };
    expect(getTratoTierTotals(wd)).toEqual({ qty: 10, amount: 5000 });
  });

  it("suma los tiers cuando hay más de uno (caso legacy)", () => {
    const wd = {
      qty: 999,
      amount: 999,
      tiers: { t0: { qty: 2, amount: 1000 }, t1: { qty: 3, amount: 2100 } },
    };
    expect(getTratoTierTotals(wd)).toEqual({ qty: 5, amount: 3100 });
  });

  it("usa el único tier cuando no hay top-level", () => {
    expect(getTratoTierTotals({ tiers: { 0: { qty: 4, amount: 2000 } } })).toEqual({
      qty: 4,
      amount: 2000,
    });
  });

  it("trata el 0 explícito como dato, no como ausencia", () => {
    // `qty: 0` es un dato, distinto de que el campo no venga: no cae al espejo.
    const wd = { qty: 0, amount: 0, tiers: { 0: { qty: 9, amount: 9000 } } };
    expect(getTratoTierTotals(wd)).toEqual({ qty: 0, amount: 0 });
  });

  it("devuelve ceros con entradas vacías", () => {
    expect(getTratoTierTotals(null)).toEqual({ qty: 0, amount: 0 });
    expect(getTratoTierTotals({})).toEqual({ qty: 0, amount: 0 });
    expect(getTratoTierTotals({ tiers: {} })).toEqual({ qty: 0, amount: 0 });
  });

  it("no propaga NaN con valores no numéricos", () => {
    expect(getTratoTierTotals({ qty: "x", amount: undefined })).toEqual({
      qty: 0,
      amount: 0,
    });
  });
});

describe("getDayCombos", () => {
  it("cae a un combo 0_0 en cero cuando no hay entrada", () => {
    expect(getDayCombos({}, "l1", "2026-01-01")).toEqual([
      { key: "0_0", x: 0, y: 0, price: 0, mode: "unit" },
    ]);
  });

  it("interpreta el formato legacy {price, mode} como 0_0", () => {
    const dp = { l1: { "2026-01-01": { price: 300, mode: "flat" } } };
    expect(getDayCombos(dp, "l1", "2026-01-01")).toEqual([
      { key: "0_0", x: 0, y: 0, price: 300, mode: "flat" },
    ]);
  });

  it("ordena los combos por calidad y después por envase", () => {
    const dp = {
      l1: {
        "2026-01-01": {
          "2_1": { price: 500 },
          "1_3": { price: 100 },
          "1_2": { price: 200 },
        },
      },
    };
    expect(getDayCombos(dp, "l1", "2026-01-01").map((c) => c.key)).toEqual([
      "1_2",
      "1_3",
      "2_1",
    ]);
  });

  it("descarta claves que no tienen forma de combo", () => {
    const dp = { l1: { "2026-01-01": { piso: 5000, "1_1": { price: 100 } } } };
    expect(getDayCombos(dp, "l1", "2026-01-01").map((c) => c.key)).toEqual(["1_1"]);
  });

  it("hereda el modo por default cuando el combo no lo trae", () => {
    const dp = { l1: { "2026-01-01": { "1_1": { price: 100 } } } };
    expect(getDayCombos(dp, "l1", "2026-01-01", "flat")[0].mode).toBe("flat");
  });
});

describe("getDaySingle", () => {
  it("lee el formato nuevo y el legacy", () => {
    expect(getDaySingle({ l1: { d: { "0_0": { price: 800 } } } }, "l1", "d")).toMatchObject({
      price: 800,
      mode: "unit",
    });
    expect(getDaySingle({ l1: { d: { price: 900, mode: "flat" } } }, "l1", "d")).toMatchObject({
      price: 900,
      mode: "flat",
    });
  });

  it("cae a precio 0 sin entrada", () => {
    expect(getDaySingle({}, "l1", "d")).toEqual({ price: 0, mode: "unit" });
  });
});

describe("normalizeDayPricesEntry", () => {
  it("migra el legacy y deja pasar el nuevo", () => {
    expect(normalizeDayPricesEntry({ price: 100, mode: "flat" })).toEqual({
      "0_0": { price: 100, mode: "flat" },
    });
    const nuevo = { "1_2": { price: 50, mode: "unit" } };
    expect(normalizeDayPricesEntry(nuevo)).toBe(nuevo);
    expect(normalizeDayPricesEntry(null)).toEqual({});
  });
});

describe("piso", () => {
  it("distingue no configurado de configurado en cero", () => {
    const dp = { l1: { d1: { piso: 0 }, d2: {} } };
    expect(getDayPiso(dp, "l1", "d1")).toBe(0);
    expect(getDayPiso(dp, "l1", "d2")).toBe(null);
    expect(getDayPiso(dp, "l1", "nunca")).toBe(null);
  });

  it("effectivePiso solo mira el día, sin fallback a la labor", () => {
    const labor = { id: "l1", piso: 9999 };
    expect(effectivePiso(labor, { l1: { d: { piso: 3000 } } }, "d")).toBe(3000);
    expect(effectivePiso(labor, {}, "d")).toBe(0);
  });
});

describe("mapHarvestCodes / invertHarvestCodes", () => {
  it("sin maps es identidad", () => {
    expect(mapHarvestCodes({}, { weightProcess: 2, weightType: 3 })).toEqual({ x: 2, y: 3 });
  });

  it("aplica los maps del prefijo", () => {
    const prefijo = { qualityMap: { 1: 5 }, containerMap: { 2: 7 } };
    expect(mapHarvestCodes(prefijo, { weightProcess: 1, weightType: 2 })).toEqual({
      x: 5,
      y: 7,
    });
  });

  it("hace el viaje de ida y vuelta", () => {
    const prefijo = { qualityMap: { 1: 5, 2: 6 }, containerMap: { 3: 7 } };
    const crudo = invertHarvestCodes(prefijo, { x: 6, y: 7 });
    expect(crudo).toEqual({ weightProcess: 2, weightType: 3 });
    expect(mapHarvestCodes(prefijo, crudo)).toEqual({ x: 6, y: 7 });
  });

  it("devuelve el valor crudo cuando el combo no es representable", () => {
    const prefijo = { qualityMap: { 1: 5 } };
    expect(invertHarvestCodes(prefijo, { x: 99, y: 1 })).toEqual({
      weightProcess: 99,
      weightType: 1,
    });
  });
});

describe("cosechaUnit", () => {
  const catalogs = {
    containers: [
      { value: 1, label: "Saco" },
      { value: 2, label: "Caja" },
    ],
  };

  it("usa el envase cuando es uno solo", () => {
    expect(cosechaUnit(catalogs, new Set([1]))).toBe("Saco");
  });

  it("cae al genérico con mezcla, para no sumar unidades distintas", () => {
    expect(cosechaUnit(catalogs, new Set([1, 2]))).toBe("Unid.");
    expect(cosechaUnit(catalogs, new Set())).toBe("Unid.");
  });
});

describe("pisoTargets", () => {
  // El mapa es `workdaysByLabor[laborId]`: clave `rut__fecha__combo`, valor el
  // workday. Se arma con los mismos helpers que usa la grilla.
  const mapa = (...wds) => {
    const out = {};
    for (const wd of wds) out[workdayMapKey(wd.workerRut, wd.date, wd.ck || "0_0")] = wd;
    return out;
  };
  const prod = (workerRut, date, extra = {}) => ({ workerRut, date, qty: 5, amount: 5000, ...extra });
  const piso = (workerRut, date, extra = {}) => ({
    workerRut, date, ck: PISO_COMBO_KEY, qty: 0, amount: 3000, pisoOnly: true, ...extra,
  });

  it("devuelve a los que tienen producción ese día", () => {
    const wds = mapa(prod("A", "2026-03-02"), prod("B", "2026-03-02"));
    expect(pisoTargets(wds, "2026-03-02")).toEqual(["A", "B"]);
  });

  it("deja fuera a los que ya tienen el piso", () => {
    const wds = mapa(prod("A", "2026-03-02"), prod("B", "2026-03-02"), piso("A", "2026-03-02"));
    expect(pisoTargets(wds, "2026-03-02")).toEqual(["B"]);
  });

  it("no cruza de día", () => {
    // El piso se asigna por día: la producción de un día no habilita el bono del
    // siguiente, y un piso de un día no bloquea el del siguiente.
    const wds = mapa(prod("A", "2026-03-02"), prod("A", "2026-03-03"), piso("A", "2026-03-02"));
    expect(pisoTargets(wds, "2026-03-02")).toEqual([]);
    expect(pisoTargets(wds, "2026-03-03")).toEqual(["A"]);
  });

  it("un workday en cero también cuenta como producción", () => {
    // Mismo criterio que habilita el toggle de la grilla: alcanza con que exista
    // el workday, sin mirar `qty` ni `amount`.
    const wds = mapa(prod("A", "2026-03-02", { qty: 0, amount: 0 }));
    expect(pisoTargets(wds, "2026-03-02")).toEqual(["A"]);
  });

  it("varios combos de la misma persona cuentan una sola vez", () => {
    const wds = mapa(
      prod("A", "2026-03-02", { ck: "0_0" }),
      prod("A", "2026-03-02", { ck: "1_2" }),
    );
    expect(pisoTargets(wds, "2026-03-02")).toEqual(["A"]);
  });

  it("un piso viejo sin `pisoOnly` igual bloquea, por la clave", () => {
    // Un piso se reconoce por la clave del mapa aunque no traiga `pisoOnly`.
    const wds = mapa(prod("A", "2026-03-02"), piso("A", "2026-03-02", { pisoOnly: undefined }));
    expect(pisoTargets(wds, "2026-03-02")).toEqual([]);
  });

  it("alguien que solo tiene piso y ninguna producción no reaparece", () => {
    const wds = mapa(piso("A", "2026-03-02"));
    expect(pisoTargets(wds, "2026-03-02")).toEqual([]);
  });

  it("sin datos devuelve lista vacía y no revienta", () => {
    expect(pisoTargets({}, "2026-03-02")).toEqual([]);
    expect(pisoTargets(null, "2026-03-02")).toEqual([]);
    expect(pisoTargets(undefined, undefined)).toEqual([]);
  });
});

describe("pisoAssigned", () => {
  const mapa = (...wds) => {
    const out = {};
    for (const wd of wds) out[workdayMapKey(wd.workerRut, wd.date, wd.ck || "0_0")] = wd;
    return out;
  };
  const prod = (workerRut, date) => ({ workerRut, date, qty: 5, amount: 5000 });
  const piso = (workerRut, date, extra = {}) => ({
    workerRut, date, ck: PISO_COMBO_KEY, qty: 0, amount: 3000, pisoOnly: true, ...extra,
  });

  it("junta los pisos del día y deja la producción afuera", () => {
    const wds = mapa(prod("A", "2026-03-02"), piso("A", "2026-03-02"), piso("B", "2026-03-02"));
    const { libres, liquidados } = pisoAssigned(wds, "2026-03-02");
    expect(libres.map((w) => w.workerRut).sort()).toEqual(["A", "B"]);
    expect(liquidados).toEqual([]);
  });

  it("separa los que ya se llevó una nómina", () => {
    // Los pisos con `payrollId` van aparte, en `liquidados`.
    const wds = mapa(
      piso("A", "2026-03-02"),
      piso("B", "2026-03-02", { payrollId: "nom-1" }),
    );
    const { libres, liquidados } = pisoAssigned(wds, "2026-03-02");
    expect(libres.map((w) => w.workerRut)).toEqual(["A"]);
    expect(liquidados.map((w) => w.workerRut)).toEqual(["B"]);
  });

  it("no cruza de día", () => {
    const wds = mapa(piso("A", "2026-03-02"), piso("A", "2026-03-03"));
    expect(pisoAssigned(wds, "2026-03-03").libres.map((w) => w.date)).toEqual(["2026-03-03"]);
  });

  it("un piso viejo sin `pisoOnly` también entra, por la clave", () => {
    const wds = mapa(piso("A", "2026-03-02", { pisoOnly: undefined }));
    expect(pisoAssigned(wds, "2026-03-02").libres).toHaveLength(1);
  });

  it("sin pisos devuelve las dos listas vacías", () => {
    expect(pisoAssigned(mapa(prod("A", "2026-03-02")), "2026-03-02")).toEqual({ libres: [], liquidados: [] });
    expect(pisoAssigned(null, "2026-03-02")).toEqual({ libres: [], liquidados: [] });
  });
});
