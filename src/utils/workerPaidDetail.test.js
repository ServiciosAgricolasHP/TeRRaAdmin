import { describe, it, expect } from "vitest";
import { paidByCycleEntriesOf, paidCycleSectionsOf, paidChronoRowsOf } from "./workerPaidDetail";

const cycleDetails = [
  { id: "C1", label: "F/S1/Ciclo 1", faenaName: "Fundo Norte", subfaenaName: "Sector Uno" },
  { id: "C2", label: "F/S2/Ciclo 1", faenaName: "Fundo Norte", subfaenaName: "Sector Dos" },
];

describe("paidByCycleEntriesOf", () => {
  it("lista los ciclos con monto, con el nombre que se muestra y su faena", () => {
    const item = { byCycle: { C1: 120000, C2: 0, C9: 5000 } };
    expect(paidByCycleEntriesOf(item, cycleDetails, (c) => `«${c.label}»`)).toEqual([
      { id: "C1", label: "«F/S1/Ciclo 1»", faena: "Fundo Norte", subfaena: "Sector Uno", amount: 120000 },
      // Un ciclo que la nómina ya no tiene se muestra con su id.
      { id: "C9", label: "C9", faena: undefined, subfaena: undefined, amount: 5000 },
    ]);
    expect(paidByCycleEntriesOf({}, cycleDetails, (c) => c.label)).toEqual([]);
  });
});

describe("paidCycleSectionsOf", () => {
  const labors = [
    { id: "LC", name: "Cosecha", type: "cosecha" },
    { id: "LT", name: "Poda", type: "trato", tratoUnit: 9 },
    { id: "LH", name: "Horas", type: "tratoHE" },
    { id: "LM", name: "Apoyo", type: "main" },
  ];
  const dayPrices = { LT: { "2026-10-01": { t0: { price: 300, mode: "unit", unit: 1 }, t1: { price: 900, mode: "unit", unit: 2 } } } };
  const snapshotCycles = [
    { id: "C1", label: "Ciclo 1", labors, dayPrices },
    { id: "C2", label: "Ciclo 2", labors: [labors[3]] },
  ];
  const wd = (cycleId, laborId, date, data) => ({ cycleId, laborId, date, ...data });

  it("agrupa por ciclo y por (labor, fecha), con la producción según el tipo de labor", () => {
    const sections = paidCycleSectionsOf([
      wd("C1", "LC", "2026-10-02", { qty: 30, amount: 9000, containerY: 1 }),
      wd("C1", "LC", "2026-10-02", { qty: 20, amount: 6000, containerY: 2 }),
      wd("C1", "LT", "2026-10-01", { amount: 4800, tiers: { t0: { qty: 10 }, t1: { qty: 2 } } }),
      wd("C1", "LM", "2026-10-01", { amount: 25000 }),
      wd("C2", "LM", "2026-10-03", { amount: 20000 }),
    ], snapshotCycles, cycleDetails);
    // Los ciclos van ordenados por su encabezado.
    expect(sections.map((s) => [s.cycleId, s.header, s.totalAmount])).toEqual([
      ["C2", "Fundo Norte · Sector Dos · Ciclo 2", 20000],
      ["C1", "Fundo Norte · Sector Uno · Ciclo 1", 44800],
    ]);
    // Por fecha y, en la misma fecha, por nombre de labor.
    const rows = sections[1].rows;
    expect(rows.map((r) => [r.date, r.labor.name, r.amount])).toEqual([
      ["2026-10-01", "Apoyo", 25000],
      ["2026-10-01", "Poda", 4800],
      ["2026-10-02", "Cosecha", 15000],
    ]);
    expect([rows[2].kilos, [...rows[2].containers]]).toEqual([50, [1, 2]]);
    // En trato, la unidad de cada tier sale de los precios del día.
    expect([rows[1].tratoQty, [...rows[1].tratoUnits]]).toEqual([12, [1, 2]]);
    expect(rows[0].jornadas).toBe(1);
  });

  it("en trato sin tiers usa la unidad del primer tier del día, y si no hay, la de la labor", () => {
    const [sec] = paidCycleSectionsOf([
      wd("C1", "LT", "2026-10-01", { qty: 7, amount: 2100 }),
      wd("C1", "LT", "2026-10-05", { qty: 3, amount: 900 }),
    ], snapshotCycles, cycleDetails);
    expect(sec.rows.map((r) => [r.date, r.tratoQty, [...r.tratoUnits]])).toEqual([
      ["2026-10-01", 7, [1]],
      ["2026-10-05", 3, [9]],
    ]);
  });

  // [bug conocido] En tratoHE `qty` guarda la base del día en pesos, pero acá
  // se suma como jornadas: un día de $30.000 se muestra como "30.000
  // jornadas". Es el mismo error del resumen del trabajador y del Calendario.
  it("en tratoHE suma las horas extras [bug conocido: cuenta la base en pesos como jornadas]", () => {
    const [sec] = paidCycleSectionsOf([
      wd("C1", "LH", "2026-10-01", { qty: 30000, overtimeHours: 2, amount: 37000 }),
    ], snapshotCycles, cycleDetails);
    expect([sec.rows[0].jornadas, sec.rows[0].overtimeHours]).toEqual([30000, 2]);
  });

  it("un ciclo sin datos en el snapshot ni en la nómina usa su id de encabezado", () => {
    const [sec] = paidCycleSectionsOf([wd("C7", "LX", "2026-10-01", { amount: 100 })], snapshotCycles, cycleDetails);
    expect([sec.header, sec.rows[0].labor, sec.rows[0].jornadas]).toEqual(["C7", undefined, 1]);
    expect(paidCycleSectionsOf([], snapshotCycles, cycleDetails)).toEqual([]);
  });
});

describe("paidChronoRowsOf", () => {
  it("intercala jornadas, anticipos y bonos por fecha, y deja al final los ajustes sin fecha", () => {
    const sections = [
      { header: "Ciclo 1", rows: [{ date: "2026-10-02", amount: 1 }, { date: "2026-10-05", amount: 2 }] },
      { header: "Ciclo 2", rows: [{ date: "2026-10-03", amount: 3 }] },
    ];
    const advances = [{ kind: "anticipo", date: "2026-10-02", amount: 10 }, { kind: "anticipo", date: "", amount: 11 }];
    const bonuses = [{ kind: "bono", date: "2026-10-02", amount: 20 }];
    expect(paidChronoRowsOf(sections, advances, bonuses).map((r) => [r.kind, r.date, r.cycleHeader || r.amount])).toEqual([
      ["work", "2026-10-02", "Ciclo 1"],
      ["anticipo", "2026-10-02", 10],
      ["bono", "2026-10-02", 20],
      ["work", "2026-10-03", "Ciclo 2"],
      ["work", "2026-10-05", "Ciclo 1"],
      ["anticipo", "", 11],
    ]);
  });
});
