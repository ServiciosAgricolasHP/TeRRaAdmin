import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { laborsDataOf, payTotal } from "../../../utils/cycleSummary";
import { chargeCarriersOf, chargeLaborsOf, chargeSubtotal } from "../../../utils/cycleCharge";
import { carrierColumns, cellText, laborColumns, summarySections } from "../../../utils/summaryTables";
import { fmtCurrency } from "../../../utils/format";
import { buildCycleSummaryWorkbook } from "./writeCycleSummaryXlsx";

const D1 = "2026-10-01";
const D2 = "2026-10-02";
const ANA = "11111111-1";
const BETO = "12345678-5";
const wdMapOf = (list) => Object.fromEntries(list.map(([ck, w]) => [`${w.workerRut}__${w.date}__${ck}`, w]));
const wd = (rut, date, data) => ({ workerRut: rut, workerId: rut, date, ...data });

const MAIN = { id: "LM", name: "Principal", type: "main" };
const EXTRA = { id: "LX", name: "Adicional", type: "extra" };
const HE = { id: "LH", name: "Jornadas HE", type: "tratoHE", overtimeRate: 5000 };
const laborsData = laborsDataOf([MAIN, EXTRA, HE], {
  LM: wdMapOf([["0_0", wd(ANA, D1, { amount: 30000 })], ["0_0", wd(BETO, D1, { amount: 30000 })]]),
  LX: wdMapOf([["0_0", wd(ANA, D2, { amount: 20000 })]]),
  LH: wdMapOf([["0_0", wd(ANA, D1, { qty: 30000, overtimeHours: 2, hasManejo: true, amount: 44000 })]]),
}, {}, {});
const transportData = [{ carrierId: "K1", rows: [{ date: D1, count: 2, amount: 50000 }], totalCount: 2, totalAmount: 50000 }];
const titles = { main: "Resumen", subtitle: "Octubre", laborNames: {}, carrierNames: {} };
const carrierById = new Map([["K1", { alias: "Camión Azul" }]]);
const charge = {
  discount: 10000,
  discountNote: "Acuerdo",
  pendingBalance: 5000,
  withIva: true,
  labors: {
    LX: { mergeInto: "LM" },
    LH: { rowOverrides: { [D1]: { overtimeHours: 1, rate: 6000, transport: 3000 } } },
  },
  carriers: { K1: { chargeRate: 30000 } },
};
const chargeLabors = chargeLaborsOf(laborsData, [], charge.labors, {});
const chargeCarriers = chargeCarriersOf(transportData, charge.carriers);
const subtotalCharge = chargeSubtotal(chargeLabors, chargeCarriers);

const argsFor = (mode, hiddenColumns = new Set()) => ({
  carrierById, catalogs: {}, charge, chargeCarriers, chargeLabors, dayNotes: [], dayPrices: {},
  grandTotalCharge: subtotalCharge - charge.discount, grandTotalPay: payTotal(laborsData, transportData),
  hiddenColumns, laborsData, mode, subtotalCharge, titles, transportData,
});

// Lo que muestra la celda de Excel, con el formato de la pantalla.
const shown = (c) => {
  if (c.value == null) return "";
  if (typeof c.value === "number") return c.numFmt?.includes("$") ? fmtCurrency(c.value) : String(c.value).replace(".", ",");
  return String(c.value);
};
const sheetRows = (ws, from, to, width) => {
  const out = [];
  for (let r = from; r <= to; r++) {
    const row = [];
    for (let i = 0; i < width; i++) row.push(shown(ws.getCell(r, i + 2)));
    out.push(row);
  }
  return out;
};

describe("Excel del resumen: lo mismo que la pantalla", () => {
  for (const mode of ["pay", "charge"]) {
    it(`en ${mode === "pay" ? "pagar" : "cobrar"}, cada hoja trae las columnas, filas y subtotal de su tabla`, () => {
      const hidden = new Set(["personas"]);
      const wb = buildCycleSummaryWorkbook(ExcelJS, argsFor(mode, hidden));
      const sections = summarySections({
        mode, labors: mode === "charge" ? chargeLabors : laborsData, carriers: mode === "charge" ? chargeCarriers : transportData,
        titles, carrierById, dayPrices: {},
      });
      expect(wb.worksheets.map((ws) => ws.name)).toEqual([
        ...sections.map((s) => (s.kind === "labor" ? s.displayName : `🚐 ${s.displayName}`)),
        "Total",
      ]);
      sections.forEach((section, k) => {
        const ws = wb.worksheets[k];
        const cols = section.kind === "labor"
          ? laborColumns(section, { mode, hiddenColumns: hidden, catalogs: {} })
          : carrierColumns(section, { mode, hiddenColumns: hidden });
        expect(cols.some((c) => c.key === "personas")).toBe(false);
        expect(sheetRows(ws, 4, 4, cols.length)[0]).toEqual(cols.map((c) => c.label));
        const screenRows = section.rows.map((r) => cols.map((c) => {
          const text = cellText(c, c.value(r));
          const badge = c.key === "date" && c.badge ? c.badge(r) : null;
          return badge ? `${text} (${badge})` : text;
        }));
        expect(sheetRows(ws, 5, 4 + section.rows.length, cols.length)).toEqual(screenRows);
        const subtotal = sheetRows(ws, 5 + section.rows.length, 5 + section.rows.length, cols.length)[0];
        expect(subtotal[0]).toBe(`Subtotal ${section.displayName}`);
        expect(subtotal.slice(2)).toEqual(cols.slice(2).map((c) => (c.total ? cellText(c, c.total(section.totals)) : "")));
      });
    });
  }

  it("en cobrar, la hoja Total cierra con el descuento, el IVA y el saldo pendiente, como en pantalla", () => {
    const wb = buildCycleSummaryWorkbook(ExcelJS, argsFor("charge"));
    const ws = wb.getWorksheet("Total");
    const lines = [];
    ws.eachRow((row) => lines.push([shown(row.getCell(2)), shown(row.getCell(3))]));
    const grand = subtotalCharge - 10000;
    expect(lines.slice(-7)).toEqual([
      ["Subtotal", fmtCurrency(subtotalCharge)],
      ["Descuento · Acuerdo", fmtCurrency(-10000)],
      ["TOTAL A FACTURAR", fmtCurrency(grand)],
      ["Valor IVA (19%)", fmtCurrency(Math.round(grand * 0.19))],
      ["IVA incluido", fmtCurrency(Math.round(grand * 1.19))],
      ["Saldo pendiente", fmtCurrency(5000)],
      ["TOTAL FINAL", fmtCurrency(Math.round(grand * 1.19) + 5000)],
    ]);
    // Título, subtítulo y encabezado; después, el total de cada tabla, que
    // suman el subtotal del cobro.
    expect(lines.slice(0, 3)).toEqual([["Resumen", ""], ["Octubre", ""], ["Concepto", "Total"]]);
    const perTable = lines.slice(3, 6).map(([, v]) => Number(v.replace(/[$.]/g, "")));
    expect(perTable.reduce((s, v) => s + v, 0)).toBe(subtotalCharge);
  });

  it("en pagar, el total de cada tabla suma el total general", () => {
    const wb = buildCycleSummaryWorkbook(ExcelJS, argsFor("pay"));
    const ws = wb.getWorksheet("Total");
    const lines = [];
    ws.eachRow((row) => lines.push([shown(row.getCell(2)), shown(row.getCell(3))]));
    expect(lines.at(-1)).toEqual(["TOTAL GENERAL", fmtCurrency(payTotal(laborsData, transportData))]);
  });
});
