import { describe, it, expect } from "vitest";
import {
  normalizeStages,
  stageById,
  countingStageIds,
  getStageDayPrice,
  computeStageDayAmount,
  getDayStages,
  getEtapasTotals,
  describeStage,
  stageTag,
} from "./tratoEtapas";

describe("computeStageDayAmount", () => {
  it("por unidad multiplica", () => {
    expect(computeStageDayAmount("unit", 300, 10)).toBe(3000);
  });

  it("en modo flat paga el precio entero si hubo producción, y nada si no", () => {
    expect(computeStageDayAmount("flat", 25000, 1)).toBe(25000);
    expect(computeStageDayAmount("flat", 25000, 99)).toBe(25000);
    expect(computeStageDayAmount("flat", 25000, 0)).toBe(0);
  });

  it("no propaga NaN", () => {
    expect(computeStageDayAmount("unit", "x", null)).toBe(0);
    expect(computeStageDayAmount("flat", undefined, 5)).toBe(0);
  });

  it("cualquier modo que no sea flat se trata como unidad", () => {
    expect(computeStageDayAmount(undefined, 100, 3)).toBe(300);
  });
});

describe("getEtapasTotals", () => {
  // La regla de oro que documenta el módulo: el PAGO suma todas las etapas,
  // las UNIDADES solo las etapas marcadas como que cuentan.
  const labor = {
    id: "l1",
    stages: [
      { id: "s1", name: "Poda", counts: true },
      { id: "s2", name: "Amarre", counts: false },
      { id: "s3", name: "Limpieza", counts: false },
    ],
  };

  it("paga todas las etapas pero solo cuenta unidades de las que cuentan", () => {
    const { pago, unidades } = getEtapasTotals(labor, [
      { stageId: "s1", qty: 10, amount: 3000 },
      { stageId: "s2", qty: 50, amount: 2000 },
      { stageId: "s3", qty: 99, amount: 1000 },
    ]);
    expect(pago).toBe(6000);
    expect(unidades).toBe(10);
  });

  it("suma unidades de varias etapas que cuentan", () => {
    const dos = { ...labor, stages: [
      { id: "s1", name: "A", counts: true },
      { id: "s2", name: "B", counts: true },
    ] };
    expect(getEtapasTotals(dos, [
      { stageId: "s1", qty: 4, amount: 100 },
      { stageId: "s2", qty: 6, amount: 200 },
    ])).toEqual({ pago: 300, unidades: 10 });
  });

  it("compara los ids como texto", () => {
    const numerico = { stages: [{ id: 1, name: "A", counts: true }] };
    expect(getEtapasTotals(numerico, [{ stageId: "1", qty: 5, amount: 100 }]).unidades).toBe(5);
  });

  it("un workday sin etapa paga pero no cuenta unidades", () => {
    expect(getEtapasTotals(labor, [{ qty: 7, amount: 500 }])).toEqual({
      pago: 500,
      unidades: 0,
    });
  });

  it("no rompe con listas vacías", () => {
    expect(getEtapasTotals(labor, [])).toEqual({ pago: 0, unidades: 0 });
    expect(getEtapasTotals(labor, null)).toEqual({ pago: 0, unidades: 0 });
    expect(getEtapasTotals(null, [{ amount: 100 }])).toEqual({ pago: 100, unidades: 0 });
  });
});

describe("normalizeStages", () => {
  it("descarta etapas sin nombre", () => {
    expect(normalizeStages([{ id: "a", name: "  " }, { id: "b", name: "Poda" }])).toEqual([
      { id: "b", name: "Poda", counts: true },
    ]);
  });

  it("si ninguna cuenta, marca la última", () => {
    // Un labor por etapas donde nada cuenta no tendría producción.
    const res = normalizeStages([
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ]);
    expect(res.map((s) => s.counts)).toEqual([false, true]);
  });

  it("respeta las marcas cuando ya hay al menos una", () => {
    const res = normalizeStages([
      { id: "a", name: "A", counts: true },
      { id: "b", name: "B" },
    ]);
    expect(res.map((s) => s.counts)).toEqual([true, false]);
  });

  it("genera un id cuando falta", () => {
    const [s] = normalizeStages([{ name: "Sin id" }]);
    expect(s.id).toBeTruthy();
  });

  it("no rompe con entradas raras", () => {
    expect(normalizeStages(null)).toEqual([]);
    expect(normalizeStages([])).toEqual([]);
  });
});

describe("countingStageIds / stageById", () => {
  const labor = {
    stages: [
      { id: "s1", name: "A", counts: true },
      { id: 2, name: "B", counts: false },
    ],
  };

  it("devuelve los ids que cuentan, como texto", () => {
    expect(countingStageIds(labor)).toEqual(new Set(["s1"]));
    expect(countingStageIds(null)).toEqual(new Set());
  });

  it("busca por id comparando como texto", () => {
    expect(stageById(labor, "2")?.name).toBe("B");
    expect(stageById(labor, "nope")).toBe(null);
    expect(stageById(null, "s1")).toBe(null);
  });
});

describe("getStageDayPrice / getDayStages", () => {
  const labor = {
    id: "l1",
    stages: [
      { id: "s1", name: "Poda", counts: true },
      { id: "s2", name: "Amarre", counts: false },
    ],
  };
  const dayPrices = { l1: { "2026-01-01": { s1: { price: 300, mode: "flat" } } } };

  it("lee el precio de una etapa en un día", () => {
    expect(getStageDayPrice(dayPrices, "l1", "2026-01-01", "s1")).toEqual({
      price: 300,
      mode: "flat",
    });
  });

  it("cae a precio 0 modo unidad cuando no hay configuración", () => {
    expect(getStageDayPrice(dayPrices, "l1", "2026-01-01", "s2")).toEqual({
      price: 0,
      mode: "unit",
    });
    expect(getStageDayPrice({}, "l1", "x", "s1")).toEqual({ price: 0, mode: "unit" });
  });

  it("getDayStages resuelve precio y modo respetando el orden del labor", () => {
    expect(getDayStages(labor, dayPrices, "2026-01-01")).toEqual([
      { id: "s1", name: "Poda", counts: true, price: 300, mode: "flat" },
      { id: "s2", name: "Amarre", counts: false, price: 0, mode: "unit" },
    ]);
  });
});

describe("describeStage", () => {
  const labor = {
    id: "l1",
    type: "tratoEtapas",
    stages: [
      { id: "prep", name: "Preparación", counts: false },
      { id: "inst", name: "Instalación", counts: true },
      { id: "comp", name: "Completo", counts: true },
    ],
  };

  it("trae nombre, counts y la posición de la definición", () => {
    expect(describeStage(labor, "inst")).toEqual({
      stageId: "inst",
      name: "Instalación",
      counts: true,
      order: 1,
    });
  });

  it("el orden sale del labor, no del orden en que llegan los workdays", () => {
    const orden = [describeStage(labor, "comp"), describeStage(labor, "prep")]
      .sort((a, b) => a.order - b.order)
      .map((e) => e.name);
    expect(orden).toEqual(["Preparación", "Completo"]);
  });

  it("acepta el id como número sin romper el match", () => {
    const numerico = { stages: [{ id: 7, name: "Siete", counts: false }] };
    expect(describeStage(numerico, 7).name).toBe("Siete");
    expect(describeStage(numerico, "7").counts).toBe(false);
  });

  it("una etapa que ya no está en la definición se trata como que cuenta", () => {
    // Es producción real que quedó huérfana porque alguien editó las etapas;
    // esconderla del trabajador sería peor que mostrarla de más.
    const e = describeStage(labor, "borrada");
    expect(e.name).toBe("Etapa");
    expect(e.counts).toBe(true);
  });

  it("sin etapas configuradas no revienta", () => {
    expect(describeStage(null, "x").name).toBe("Etapa");
    expect(describeStage({}, undefined).stageId).toBe("");
  });
});

describe("stageTag", () => {
  it("es solo el nombre de la etapa", () => {
    expect(stageTag({ name: "Instalación", counts: true })).toBe("Instalación");
  });

  it("una etapa que no cuenta se rotula igual que las demás", () => {
    // Estas vistas las lee el trabajador. `counts` es una distinción de
    // facturación de la empresa, y al lado de la producción de alguien un
    // "(no cuenta)" se lee como que su trabajo no vale.
    expect(stageTag({ name: "Preparación", counts: false })).toBe("Preparación");
  });

  it("sin nombre cae a un rótulo genérico, no a vacío", () => {
    expect(stageTag({ counts: true })).toBe("Etapa");
  });

  it("sin etapa devuelve vacío", () => {
    expect(stageTag(null)).toBe("");
    expect(stageTag(undefined)).toBe("");
  });
});

describe("la frontera entre lo que ve el trabajador y lo que cuenta la empresa", () => {
  const labor = {
    id: "l1",
    type: "tratoEtapas",
    stages: [
      { id: "prep", name: "Preparación", counts: false },
      { id: "inst", name: "Instalación", counts: true },
    ],
  };
  const dia = [
    { stageId: "prep", qty: 10, amount: 20000 },
    { stageId: "inst", qty: 4, amount: 40000 },
  ];

  it("el conteo de la empresa sigue excluyendo las etapas que no cuentan", () => {
    // Esta es la regla que NO cambia: una unidad física se factura una sola
    // vez, por etapas o como completo.
    const { pago, unidades } = getEtapasTotals(labor, dia);
    expect(pago).toBe(60000);
    expect(unidades).toBe(4);
  });

  it("pero la producción del trabajador son las 14, no las 4", () => {
    // Es lo que estaba roto: la vista del trabajador mostraba el pago de
    // Preparación sin ninguna cantidad detrás.
    const total = dia.reduce((sum, wd) => sum + wd.qty, 0);
    expect(total).toBe(14);
  });

  it("el desglose nombra las dos etapas sin distinguirlas", () => {
    // La frontera está en los números, no en los rótulos: la empresa cuenta 4
    // y el trabajador ve 14, pero a él las dos etapas se le nombran igual.
    const etiquetas = dia
      .map((wd) => stageTag(describeStage(labor, wd.stageId)))
      .sort();
    expect(etiquetas).toEqual(["Instalación", "Preparación"]);
  });
});
