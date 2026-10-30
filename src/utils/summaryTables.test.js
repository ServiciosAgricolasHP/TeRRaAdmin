import { describe, it, expect } from "vitest";
import { laborsDataOf } from "./cycleSummary";
import { chargeCarriersOf, chargeLaborsOf } from "./cycleCharge";
import { carrierColumns, cellText, hiddenColumnsOf, laborColumns, summarySections, toggledColumns } from "./summaryTables";

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

  describe("horas extras en cobrar", () => {
    const HE_DAY = wdMapOf([
      ["0_0", wd(ANA, D1, { qty: 30000, overtimeHours: 2, hasManejo: true, amount: 44000 })],
      ["0_0", wd(BETO, D1, { qty: 30000, amount: 30000 })],
      ["0_0", wd(ANA, D2, { qty: 30000, overtimeHours: 1, amount: 35000 })],
    ]);
    const heData = laborsDataOf([HE], { LH: HE_DAY }, {}, {});
    const heSection = (cfg) => summarySections({ mode: "charge", labors: chargeLaborsOf(heData, [], { LH: cfg }, {}), carriers: [], titles, carrierById })[0];

    it("se ve como las jornadas, con las horas extras en una columna y la tarifa en el encabezado", () => {
      const section = heSection({});
      const cols = laborColumns(section, { mode: "charge", hiddenColumns: new Set(["personas"]), catalogs: {} });
      expect(cols.map((c) => c.label)).toEqual([
        "Detalle de jornada", "Fecha", "Jornadas", "Valor", "Horas extras ($5.000 c/u)", "Valor total", "Transporte", "Total",
      ]);
      expect(texts(cols, section.rows)).toEqual([
        ["Jornadas HE", "01-oct", "2", "$30.000", "$10.000 (x 2 HE)", "$70.000", "$ -", "$70.000"],
        ["Jornadas HE", "02-oct", "1", "$30.000", "$5.000 (x 1 HE)", "$35.000", "$ -", "$35.000"],
      ]);
      expect(totalTexts(cols, section.totals)).toEqual(["3", "", "$15.000 (x 3 HE)", "$105.000", "", "$105.000"]);
      // Sin ajustes se cobra lo mismo: la base que se pagó más las horas a la tarifa.
      expect(section.totals.amount).toBe(60000 + 30000 + 3 * 5000);
    });

    it("ajustar las jornadas o su valor recalcula la base, y las horas se editan con su tarifa", () => {
      const section = heSection({ rowOverrides: { [D1]: { workdayCount: 3 }, [D2]: { workdayRate: 40000, rate: 6000 } } });
      expect(section.rows.map((r) => [r.chargedWorkdayCount, r.chargedWorkdayRate, r.chargedAmount])).toEqual([
        [3, 30000, 3 * 30000 + 2 * 5000],
        [1, 40000, 40000 + 6000],
      ]);
      const cols = laborColumns(section, { mode: "charge", catalogs: {} });
      const he = cols.find((c) => c.key === "he");
      // Con tarifas distintas, cada celda lleva la suya.
      expect(he.label).toBe("Horas extras");
      expect(texts([he], section.rows)).toEqual([["$10.000 (x 2 HE a $5.000)"], ["$6.000 (x 1 HE a $6.000)"]]);
      expect(he.edits(section.rows[0]).map((e) => [e.field, e.raw])).toEqual([["overtimeHours", 2], ["rate", 5000]]);
      expect(cols.find((c) => c.key === "qty").edit(section.rows[0])).toMatchObject({ field: "workdayCount", raw: 3 });
      expect(cols.find((c) => c.key === "rate").edit(section.rows[0])).toMatchObject({ field: "workdayRate", raw: 30000 });
    });

    it("una base ajustada en pesos se respeta y su valor por jornada sale de ella", () => {
      const section = heSection({
        rowOverrides: { [D1]: { qty: 70000 } },
        extraRows: [{ id: "x1", date: "", qty: 10000, overtimeHours: 2, rate: "", amount: "" }],
      });
      expect(section.rows.map((r) => [r.chargedWorkdayCount, r.chargedWorkdayRate, r.chargedAmount])).toEqual([
        [2, 35000, 70000 + 2 * 5000],
        [1, 30000, 30000 + 5000],
        [0, null, 10000 + 2 * 5000],
      ]);
    });

    it("una fila manual se cobra por jornadas al valor de la labor", () => {
      const section = heSection({ extraRows: [{ id: "x1", date: D2, workdayCount: 4, overtimeHours: "", rate: "", amount: "" }] });
      const extra = section.rows.find((r) => r.isExtra);
      expect([extra.chargedWorkdayCount, extra.chargedWorkdayRate, extra.chargedAmount]).toEqual([4, 30000, 120000]);
    });

    it("sin cobrar horas extras no hay columna ni monto de horas, y los ajustes quedan guardados", () => {
      const section = heSection({ chargeOvertime: false, rowOverrides: { [D1]: { overtimeHours: 4 } } });
      expect(section.overtimeToggles).toEqual([{ laborId: "LH", name: "Jornadas HE", on: false }]);
      expect(laborColumns(section, { mode: "charge", catalogs: {} }).map((c) => c.key)).not.toContain("he");
      expect(section.rows.map((r) => r.chargedAmount)).toEqual([60000, 30000]);
      expect(section.totals.heTotal).toBe(0);
      expect(heSection({ rowOverrides: { [D1]: { overtimeHours: 4 } } }).rows[0].chargedAmount).toBe(60000 + 4 * 5000);
    });
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

describe("columnas ocultas", () => {
  it("Personas empieza oculta y se muestra con shownColumns", () => {
    expect([...hiddenColumnsOf()]).toEqual(["personas"]);
    expect([...hiddenColumnsOf(["transport"], ["personas"])]).toEqual(["transport"]);
  });

  it("mostrar u ocultar guarda cada columna en su lista", () => {
    expect(toggledColumns([], [], "personas")).toEqual({ hiddenColumns: [], shownColumns: ["personas"] });
    expect(toggledColumns([], ["personas"], "personas")).toEqual({ hiddenColumns: [], shownColumns: [] });
    expect(toggledColumns(["total"], [], "transport")).toEqual({ hiddenColumns: ["total", "transport"], shownColumns: [] });
    expect(toggledColumns(["total"], [], "total")).toEqual({ hiddenColumns: [], shownColumns: [] });
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
