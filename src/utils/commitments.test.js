import { describe, it, expect } from "vitest";
import {
  daysUntil,
  displayStatus,
  monthlyDate,
  buildInstallments,
  recurringDates,
  summarize,
  parseLooseDate,
  bankCodeFromText,
  excelStatus,
  matchCompany,
  mapExcelRow,
  statusLabel,
} from "./commitments";

describe("vencimientos", () => {
  it("cuenta los días entre fechas sin depender de la zona horaria", () => {
    expect(daysUntil("2026-10-19", "2026-10-16")).toBe(3);
    expect(daysUntil("2026-10-16", "2026-10-16")).toBe(0);
    expect(daysUntil("2026-10-15", "2026-10-16")).toBe(-1);
    expect(daysUntil("2027-01-01", "2026-12-31")).toBe(1);
    expect(daysUntil("", "2026-10-16")).toBe(null);
  });

  it("un pendiente con la fecha pasada se muestra vencido", () => {
    const hoy = "2026-10-16";
    expect(displayStatus({ status: "pending", dueDate: "2026-10-15" }, hoy)).toBe("overdue");
    expect(displayStatus({ status: "pending", dueDate: "2026-10-16" }, hoy)).toBe("pending");
    expect(displayStatus({ status: "paid", dueDate: "2026-10-01" }, hoy)).toBe("paid");
    expect(displayStatus({ status: "cancelled", dueDate: "2026-10-01" }, hoy)).toBe("cancelled");
  });

  it("un cheque se cobra y un pago se paga", () => {
    expect(statusLabel({ kind: "chequeIssued", status: "paid" }, "2026-10-16")).toBe("Cobrado");
    expect(statusLabel({ kind: "installment", status: "paid" }, "2026-10-16")).toBe("Pagado");
  });
});

describe("cuotas y series mensuales", () => {
  it("el día 31 cae el último día de los meses cortos", () => {
    expect(monthlyDate("2026-01-31", 1, 31)).toBe("2026-02-28");
    expect(monthlyDate("2028-01-31", 1, 31)).toBe("2028-02-29");
    expect(monthlyDate("2026-01-31", 2, 31)).toBe("2026-03-31");
    expect(monthlyDate("2026-11-15", 2, 15)).toBe("2027-01-15");
  });

  it("un crédito genera una cuota por mes, numerada", () => {
    const cuotas = buildInstallments({ firstDate: "2026-11-30", count: 4 });
    expect(cuotas.map((c) => c.dueDate)).toEqual(["2026-11-30", "2026-12-30", "2027-01-30", "2027-02-28"]);
    expect(cuotas[3]).toMatchObject({ n: 4, of: 4 });
    expect(buildInstallments({ firstDate: "", count: 3 })).toEqual([]);
  });

  it("un pago recurrente solo genera lo que falta hasta el horizonte", () => {
    const todas = recurringDates({ firstDate: "2026-10-05", until: "2026-12-31" });
    expect(todas).toEqual(["2026-10-05", "2026-11-05", "2026-12-05"]);
    const nuevas = recurringDates({ firstDate: "2026-10-05", after: "2026-11-05", until: "2027-01-10" });
    expect(nuevas).toEqual(["2026-12-05", "2027-01-05"]);
  });
});

describe("resumen", () => {
  it("separa lo que se paga de lo que se cobra y no suma anulados", () => {
    const hoy = "2026-10-16";
    const r = summarize(
      [
        { kind: "chequeIssued", status: "pending", dueDate: "2026-10-18", amount: 100 },
        { kind: "installment", status: "pending", dueDate: "2026-10-10", amount: 50 },
        { kind: "chequeReceived", status: "pending", dueDate: "2026-10-20", amount: 70 },
        { kind: "chequeIssued", status: "paid", dueDate: "2026-10-01", paidAt: "2026-10-02", amount: 30 },
        { kind: "chequeIssued", status: "paid", dueDate: "2026-09-01", paidAt: "2026-09-02", amount: 999 },
        { kind: "payment", status: "cancelled", dueDate: "2026-10-01", amount: 40 },
      ],
      hoy,
    );
    expect(r.out.pending).toEqual({ amount: 100, count: 1 });
    expect(r.out.overdue).toEqual({ amount: 50, count: 1 });
    expect(r.out.next7).toEqual({ amount: 100, count: 1 });
    expect(r.in.pending).toEqual({ amount: 70, count: 1 });
    expect(r.paidThisMonth).toEqual({ amount: 30, count: 1 });
    expect(r.cancelled).toEqual({ amount: 40, count: 1 });
  });
});

describe("import de la planilla de cheques", () => {
  it("reconoce las formas de fecha que trae la planilla", () => {
    expect(parseLooseDate(new Date(Date.UTC(2026, 5, 5)))).toBe("2026-06-05");
    expect(parseLooseDate("20-06-26")).toBe("2026-06-20");
    expect(parseLooseDate("27-08-2026")).toBe("2026-08-27");
    expect(parseLooseDate("27/08/2026")).toBe("2026-08-27");
    expect(parseLooseDate("2026-03-08")).toBe("2026-03-08");
    expect(parseLooseDate(46000)).toBe("2025-12-09");
    expect(parseLooseDate("31-02-26")).toBe("");
    expect(parseLooseDate("mañana")).toBe("");
    expect(parseLooseDate(null)).toBe("");
  });

  it("reconoce el banco escrito a mano", () => {
    expect(bankCodeFromText("bco chile ")).toBe("001");
    expect(bankCodeFromText("BICE ")).toBe("028");
    expect(bankCodeFromText("Banco Estado")).toBe("012");
    expect(bankCodeFromText("Banco de Crédito e Inversiones/Mach")).toBe("016");
    expect(bankCodeFromText("Cooperativa X")).toBe("");
  });

  it("vencido y pendiente quedan pendientes: vencido se deriva", () => {
    expect(excelStatus("Cobrado")).toBe("paid");
    expect(excelStatus("Anulado")).toBe("cancelled");
    expect(excelStatus("Vencido")).toBe("pending");
    expect(excelStatus("Pendiente")).toBe("pending");
    expect(excelStatus("")).toBe("pending");
  });

  it("encuentra la empresa por alias sin distinguir mayúsculas", () => {
    const companies = [{ id: "c1", alias: "Transporte HP", razonSocial: "Transportes HP SpA" }];
    expect(matchCompany("TRANSPORTE HP", companies)?.id).toBe("c1");
    expect(matchCompany("SANTA SARA ", companies)).toBe(null);
  });

  it("mapea una fila de la planilla", () => {
    const companies = [{ id: "c1", alias: "Transporte HP" }];
    const fila = [21, "21-10-26", "BICE ", 361431, "BIOSUR", "CUOTA N 10 CARRETE ", 3575568, null, "Pendiente", "TRANSPORTE HP", "CUOTA N.º 10 PENDIENTE DE COBRO"];
    const r = mapExcelRow(fila, { companies });
    expect(r.id).toBe("chq_028_361431");
    expect(r.data).toMatchObject({
      kind: "chequeIssued",
      dueDate: "2026-10-21",
      amount: 3575568,
      bank: "028",
      chequeNumber: "361431",
      counterparty: "Biosur",
      concept: "Cuota n 10 carrete",
      notes: "Cuota n.º 10 pendiente de cobro",
      companyId: "c1",
      companyLabel: "",
      status: "pending",
    });
  });

  it("una empresa sin match queda como texto y una fila vacía se salta", () => {
    const fila = [30, new Date(Date.UTC(2026, 4, 6)), "bco chile ", 2485214, "EDWIN DIAZ ", "PAGO SERVICIO", 690000, null, "Cobrado", "SANTA SARA ", "PAGO TRANSPORTE "];
    const r = mapExcelRow(fila, { companies: [] });
    expect(r.data).toMatchObject({ companyId: null, companyLabel: "SANTA SARA", status: "paid", bank: "001", dueDate: "2026-05-06" });
    expect(mapExcelRow([49, null, null, null, null, null, null, null, null, null, null])).toBe(null);
    expect(mapExcelRow([50, "pronto", "BICE", 1, "X", "", 100]).error).toMatch(/Fecha/);
  });
});
