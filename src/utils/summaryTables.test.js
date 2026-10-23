import { describe, it, expect } from "vitest";
import { laborsDataOf } from "./cycleSummary";
import { chargeCarriersOf, chargeLaborsOf } from "./cycleCharge";
import { carrierColumns, cellText, laborColumns, summarySections } from "./summaryTables";

const D1 = "2026-10-01";
const D2 = "2026-10-02";
const ANA = "11111111-1";
const BETO = "12345678-5";

const wdMapOf = (list) => Object.fromEntries(list.map(([ck, w]) => [`${w.workerRut}__${w.date}__${ck}`, w]));
const wd = (rut, date, data) => ({ workerRut: rut, workerId: rut, date, ...data });

const MAIN = { id: "LM", name: "Principal", type: "main" };
const EXTRA = { id: "LX", name: "Adicional", type: "extra" };
const HE = { id: "LH", name: "Jornadas HE", type: "tratoHE", overtimeRate: 5000 };
const workdays = {
  LM: wdMapOf([["0_0", wd(ANA, D1, { amount: 30000 })], ["0_0", wd(BETO, D1, { amount: 30000 })]]),
  LX: wdMapOf([["0_0", wd(ANA, D2, { amount: 20000 })]]),
  LH: wdMapOf([["0_0", wd(ANA, D1, { qty: 30000, overtimeHours: 2, hasManejo: true, amount: 44000 })]]),
};
const laborsData = laborsDataOf([MAIN, EXTRA, HE], workdays, {}, {});
const titles = { laborNames: { LX: "Extras" }, carrierNames: {} };
const carrierById = new Map([["K1", { alias: "Camión Azul" }]]);
const transport = [{ carrierId: "K1", rows: [{ date: D1, count: 2, amount: 50000 }], totalCount: 2, totalAmount: 50000 }];

// Las filas de una tabla como se ven: el texto de cada celda.
const texts = (cols, rows) => rows.map((r) => cols.map((c) => cellText(c, c.value(r))));
const totalTexts = (cols, totals) => cols.filter((c) => c.total).map((c) => cellText(c, c.total(totals)));

describe("summarySections", () => {
  it("en pagar trae una sección por labor con filas y una por transportista", () => {
    const sections = summarySections({ mode: "pay", labors: laborsData, carriers: transport, titles, carrierById });
    expect(sections.map((s) => [s.kind, s.displayName])).toEqual([
      ["labor", "Principal"],
      ["labor", "Extras"],
      ["labor", "Jornadas HE"],
      ["carrier", "Camión Azul"],
    ]);
    expect(sections[3].totals).toEqual({ count: 2, amount: 50000 });
  });

  it("en cobrar deja fuera lo no incluido y junta las labores fusionadas en una tabla", () => {
    const charge = chargeLaborsOf(laborsData, [], { LX: { mergeInto: "LM" }, LH: { include: false } }, {});
    const carriers = chargeCarriersOf(transport, { K1: { include: false } });
    const sections = summarySections({ mode: "charge", labors: charge, carriers, titles, carrierById });
    expect(sections.map((s) => s.displayName)).toEqual(["Principal + Extras"]);
    expect(sections[0].rows.map((r) => r._laborName)).toEqual(["Principal", "Extras"]);
    expect(sections[0].totals.amount).toBe(30000 * 2 + 20000);
  });
});

describe("laborColumns", () => {
  it("en pagar, una labor al día muestra cantidad, valor, totales y personas", () => {
    const [section] = summarySections({ mode: "pay", labors: laborsData, carriers: [], titles, carrierById });
    const cols = laborColumns(section, { mode: "pay", catalogs: {} });
    expect(cols.map((c) => c.label)).toEqual(["Detalle de jornada", "Fecha", "Jornadas", "Valor", "Valor total", "Transporte", "Total", "Personas"]);
    expect(texts(cols, section.rows)).toEqual([["Principal", "01-oct", "2", "$30.000", "$60.000", "$ -", "$60.000", "2"]]);
    expect(totalTexts(cols, section.totals)).toEqual(["2", "", "$60.000", "", "$60.000", "2"]);
  });

  it("en cobrar, horas extras muestra las trabajadas, las que se cobran, la tarifa y el Total HE", () => {
    const charge = chargeLaborsOf(laborsData, [], {
      LH: {
        rowOverrides: { [D1]: { overtimeHours: 1, rate: 6000 } },
        extraRows: [{ id: "x1", date: "", qty: 10000, overtimeHours: 2, rate: "", amount: "" }],
      },
    }, {});
    const section = summarySections({ mode: "charge", labors: charge, carriers: [], titles, carrierById })
      .find((s) => s.laborType === "tratoHE");
    const cols = laborColumns(section, { mode: "charge", catalogs: {} });
    expect(cols.map((c) => c.label)).toEqual([
      "Detalle de jornada", "Fecha", "Base $", "HE trabajadas", "HE a cobrar", "Tarifa HE", "Total HE",
      "Valor total", "Transporte", "Total", "Personas", "Bonos",
    ]);
    expect(texts(cols, section.rows).map((r) => r.slice(2, 8))).toEqual([
      ["$30.000", "2", "1", "$6.000", "$6.000", "$36.000"],
      ["$10.000", "—", "2", "$5.000", "$10.000", "$20.000"],
    ]);
    const total = Object.fromEntries(cols.filter((c) => c.total).map((c) => [c.key, cellText(c, c.total(section.totals))]));
    expect(total).toMatchObject({ qty: "$40.000", heWorked: "2", he: "3", heRate: "", rate: "$16.000", valorTotal: "$56.000" });
  });

  it("las horas trabajadas y la tarifa solo aparecen en cobrar", () => {
    const section = summarySections({ mode: "pay", labors: laborsData, carriers: [], titles, carrierById })
      .find((s) => s.laborType === "tratoHE");
    const cols = laborColumns(section, { mode: "pay", catalogs: {} });
    expect(cols.map((c) => c.key)).toEqual(["detail", "date", "qty", "he", "rate", "valorTotal", "transport", "total", "personas", "bonos"]);
    expect(cols.find((c) => c.key === "he").label).toBe("HE (hrs)");
    // En pagar el Total HE va a la tarifa HE de la labor.
    expect(cellText(cols[4], cols[4].value(section.rows[0]))).toBe("$10.000");
  });

  it("respeta las columnas ocultas y solo deja editar en cobrar", () => {
    const charge = chargeLaborsOf(laborsData, [], {}, {});
    const [section] = summarySections({ mode: "charge", labors: charge, carriers: [], titles, carrierById });
    const cols = laborColumns(section, { mode: "charge", hiddenColumns: new Set(["personas", "transport"]), catalogs: {} });
    expect(cols.map((c) => c.key)).toEqual(["detail", "date", "qty", "rate", "valorTotal", "total"]);
    expect(cols.find((c) => c.key === "rate").edit(section.rows[0])).toEqual({ field: "rate", raw: 30000 });
    const [paySection] = summarySections({ mode: "pay", labors: laborsData, carriers: [], titles, carrierById });
    expect(laborColumns(paySection, { mode: "pay", catalogs: {} }).find((c) => c.key === "rate").edit(paySection.rows[0])).toBe(null);
  });
});

describe("carrierColumns", () => {
  it("muestra vueltas, valor y total, y el subtotal sin valor", () => {
    const [section] = summarySections({ mode: "pay", labors: [], carriers: transport, titles, carrierById });
    const cols = carrierColumns(section, { mode: "pay" });
    expect(texts(cols, section.rows)).toEqual([["Camión Azul", "01-oct", "2", "$25.000", "$50.000"]]);
    expect(totalTexts(cols, section.totals)).toEqual(["2", "", "$50.000"]);
  });
});
