import { describe, it, expect } from "vitest";
import {
  shiftPeriod,
  periodWindow,
  windowLabel,
  netSalesByPeriod,
  groupByCounterparty,
  projectCashFlow,
} from "./cashFlowProjection.js";

const venta = (over = {}) => ({
  id: over.id || Math.random().toString(36).slice(2),
  kind: "venta",
  companyId: "HP",
  tipo: 33,
  tipoLabel: "Factura",
  folio: 1,
  periodo: "2025-09",
  fechaEmision: "2025-09-10",
  razonSocialReceptor: "Cliente Uno",
  rutReceptor: "76111111-1",
  neto: 1_000_000,
  ...over,
});

describe("shiftPeriod", () => {
  it("cruza el fin de año en los dos sentidos", () => {
    expect(shiftPeriod("2026-12", 1)).toBe("2027-01");
    expect(shiftPeriod("2026-01", -1)).toBe("2025-12");
    expect(shiftPeriod("2026-09", -12)).toBe("2025-09");
  });

  it("rechaza lo que no es un período en vez de devolver basura", () => {
    expect(shiftPeriod("2026-13", 1)).toBeNull();
    expect(shiftPeriod("septiembre", 1)).toBeNull();
    expect(shiftPeriod("", 1)).toBeNull();
    expect(shiftPeriod(null, 0)).toBeNull();
  });
});

describe("periodWindow / windowLabel", () => {
  it("la temporada del ejemplo: septiembre 2026-2027 son 12 meses hasta agosto", () => {
    const w = periodWindow("2026-09");
    expect(w).toHaveLength(12);
    expect(w[0]).toBe("2026-09");
    expect(w[11]).toBe("2027-08");
    expect(windowLabel("2026-09")).toBe("Septiembre 2026-2027");
  });

  it("una ventana que no cruza de año no se rotula 2026-2026", () => {
    expect(windowLabel("2026-01")).toBe("Enero 2026");
  });
});

describe("netSalesByPeriod", () => {
  const periods = periodWindow("2025-09");

  it("suma solo ventas de la empresa y del rango", () => {
    const docs = [
      venta({ neto: 1000 }),
      venta({ neto: 500, kind: "compra" }),          // salida
      venta({ neto: 700, companyId: "OTRA" }),       // otra empresa
      venta({ neto: 900, periodo: "2025-08" }),      // fuera de la ventana
      venta({ neto: 300, periodo: "2026-08" }),      // último mes de la ventana
    ];
    const r = netSalesByPeriod(docs, { companyId: "HP", periods });
    expect(r.total).toBe(1300);
    expect(r.count).toBe(2);
    expect(r.rows).toHaveLength(12);
    expect(r.rows[0]).toMatchObject({ periodo: "2025-09", neto: 1000, count: 1 });
    expect(r.rows[11]).toMatchObject({ periodo: "2026-08", neto: 300, count: 1 });
  });

  it("las notas de crédito restan y quedan en el detalle con signo", () => {
    // Si se filtraran, el Excel mostraría un total que sus filas no dan.
    const docs = [
      venta({ id: "f", neto: 1000 }),
      venta({ id: "nc", tipo: 61, neto: 400, fechaEmision: "2025-09-20" }),
    ];
    const r = netSalesByPeriod(docs, { companyId: "HP", periods });
    expect(r.total).toBe(600);
    expect(r.count).toBe(2);
    expect(r.detail.find((d) => d.id === "nc")).toMatchObject({ neto: -400, isNc: true });
    expect(r.detail.reduce((s, d) => s + d.neto, 0)).toBe(r.total);
  });

  it("un mes sin ventas queda en la fila, no desaparece", () => {
    const r = netSalesByPeriod([venta({ neto: 1000 })], { companyId: "HP", periods });
    expect(r.rows.map((x) => x.periodo)).toEqual(periods);
    expect(r.rows[3]).toMatchObject({ neto: 0, count: 0 });
  });
});

describe("groupByCounterparty", () => {
  it("agrupa por RUT y ordena de mayor a menor", () => {
    const { detail } = netSalesByPeriod(
      [
        venta({ rutReceptor: "76-A", razonSocialReceptor: "A", neto: 100 }),
        venta({ rutReceptor: "76-B", razonSocialReceptor: "B", neto: 900 }),
        venta({ rutReceptor: "76-A", razonSocialReceptor: "A", neto: 50 }),
      ],
      { companyId: "HP", periods: periodWindow("2025-09") },
    );
    const g = groupByCounterparty(detail);
    expect(g.map((x) => [x.rut, x.neto, x.count])).toEqual([
      ["76-B", 900, 1],
      ["76-A", 150, 2],
    ]);
  });
});

describe("projectCashFlow", () => {
  it("proyecta septiembre 2026-2027 desde los 12 meses anteriores", () => {
    const docs = [
      venta({ periodo: "2025-09", neto: 1_000_000 }),
      venta({ periodo: "2026-01", neto: 2_000_000 }),
      venta({ periodo: "2026-08", neto: 400_000 }),
      venta({ periodo: "2026-09", neto: 9_999_999 }), // ya es del período proyectado
    ];
    const p = projectCashFlow(docs, { companyId: "HP", startPeriod: "2026-09", percent: 75 });

    expect(p.targetLabel).toBe("Septiembre 2026-2027");
    expect(p.baseLabel).toBe("Septiembre 2025-2026");
    // El mes que ya cayó dentro de la proyección NO entra a la base.
    expect(p.baseTotal).toBe(3_400_000);
    expect(p.total).toBe(2_550_000);

    // Cada mes proyectado se alinea con su mismo mes del año anterior.
    expect(p.rows[0]).toMatchObject({ periodo: "2026-09", basePeriodo: "2025-09", baseNeto: 1_000_000, proyectado: 750_000 });
    expect(p.rows[4]).toMatchObject({ periodo: "2027-01", basePeriodo: "2026-01", proyectado: 1_500_000 });
    expect(p.rows[11]).toMatchObject({ periodo: "2027-08", basePeriodo: "2026-08", proyectado: 300_000 });
  });

  it("el total es la suma de los meses redondeados, no el redondeo de la suma", () => {
    // Tres meses de 3.333 al 33,33%: cada uno redondea a 1.111 (3.333), mientras
    // que redondear la suma daría 3.332. El Excel imprime la columna, así que el
    // total tiene que ser el de la columna o no cuadra a ojo.
    const docs = ["2025-09", "2025-10", "2025-11"].map((periodo) => venta({ periodo, neto: 3333 }));
    const p = projectCashFlow(docs, { companyId: "HP", startPeriod: "2026-09", percent: 33.33 });
    expect(p.rows.slice(0, 3).map((r) => r.proyectado)).toEqual([1111, 1111, 1111]);
    expect(p.total).toBe(3333);
    expect(p.total).toBe(p.rows.reduce((s, r) => s + r.proyectado, 0));
  });

  it("sin datos en la base devuelve 12 filas en cero, no una lista vacía", () => {
    const p = projectCashFlow([], { companyId: "HP", startPeriod: "2026-09" });
    expect(p.rows).toHaveLength(12);
    expect(p.baseTotal).toBe(0);
    expect(p.total).toBe(0);
    expect(p.baseCount).toBe(0);
  });

  it("un porcentaje de 0 proyecta cero, y uno mayor a 100 crece", () => {
    const docs = [venta({ periodo: "2025-09", neto: 1000 })];
    expect(projectCashFlow(docs, { companyId: "HP", startPeriod: "2026-09", percent: 0 }).total).toBe(0);
    expect(projectCashFlow(docs, { companyId: "HP", startPeriod: "2026-09", percent: 120 }).total).toBe(1200);
  });
});
