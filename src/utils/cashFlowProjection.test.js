import { describe, it, expect } from "vitest";
import {
  shiftPeriod,
  periodWindow,
  windowLabel,
  cashInOf,
  cashInByPeriod,
  groupByCounterparty,
  projectCashFlow,
} from "./cashFlowProjection.js";

// Una venta con la forma que deja el import del RCV. Por default una factura
// afecta normal: total = neto + IVA.
const venta = (over = {}) => {
  const neto = over.neto ?? 1_000_000;
  const iva = over.iva ?? Math.round(neto * 0.19);
  const exento = over.exento ?? 0;
  return {
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
    exento,
    neto,
    iva,
    total: neto + exento + iva,
    ...over,
  };
};

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

describe("cashInOf", () => {
  it("una factura afecta normal entra completa, con IVA", () => {
    expect(cashInOf({ tipo: 33, neto: 1_000_000, iva: 190_000, exento: 0, total: 1_190_000 }))
      .toEqual({ monto: 1_190_000, conRetencion: false });
  });

  it("una factura de compra entra solo por el neto", () => {
    // Caso real, folio 273: le retienen el 14% y el Monto Total del SII ya
    // viene con esa retención descontada (2.024.338 = neto + el 5% que sí se
    // cobra). Igual solo cuenta el neto.
    expect(cashInOf({ tipo: 46, neto: 1_927_940, iva: 366_309, exento: 0, total: 2_024_338 }))
      .toEqual({ monto: 1_927_940, conRetencion: true });
  });

  it("una nota de crédito sobre una factura de compra revierte con la misma regla", () => {
    // Datos reales: la NC folio 305 reversa exactamente la factura 46 folio
    // 387. El par TIENE que cerrar en cero — restando el total dejaría un
    // ingreso negativo de 822.415 que nunca existió.
    const factura = { tipo: 46, neto: 16_448_300, iva: 3_125_177, exento: 0, total: 17_270_715 };
    const nc = { ...factura, tipo: 61 };
    expect(cashInOf(nc)).toEqual({ monto: -16_448_300, conRetencion: true });
    expect(cashInOf(factura).monto + cashInOf(nc).monto).toBe(0);
  });

  it("una nota de crédito normal revierte el total", () => {
    expect(cashInOf({ tipo: 61, neto: 1_000_000, iva: 190_000, exento: 0, total: 1_190_000 }).monto)
      .toBe(-1_190_000);
  });

  it("un documento exento entra por el exento y no se confunde con una retención", () => {
    // Sin IVA, neto + exento + iva da justo el total: no hay nada retenido.
    expect(cashInOf({ tipo: 34, neto: 0, iva: 0, exento: 500_000, total: 500_000 }))
      .toEqual({ monto: 500_000, conRetencion: false });
  });

  it("una factura normal a la que el cliente retuvo el IVA también entra solo por el neto", () => {
    // La retención se deduce de que neto + iva no dé el total, así que la regla
    // vale para cualquier documento, no solo para los tipos 45/46.
    expect(cashInOf({ tipo: 33, neto: 1_000_000, iva: 190_000, exento: 0, total: 1_000_000 }))
      .toEqual({ monto: 1_000_000, conRetencion: true });
  });

  it("un peso de descuadre por redondeo del SII no se lee como retención", () => {
    expect(cashInOf({ tipo: 33, neto: 1_000_000, iva: 190_000, exento: 0, total: 1_189_999 }).conRetencion)
      .toBe(false);
  });
});

describe("cashInByPeriod", () => {
  const periods = periodWindow("2025-09");

  it("suma solo ventas de la empresa y del rango", () => {
    const docs = [
      venta({ neto: 1000 }),
      venta({ neto: 500, kind: "compra" }),          // salida
      venta({ neto: 700, companyId: "OTRA" }),       // otra empresa
      venta({ neto: 900, periodo: "2025-08" }),      // fuera de la ventana
      venta({ neto: 300, periodo: "2026-08" }),      // último mes de la ventana
    ];
    const r = cashInByPeriod(docs, { companyId: "HP", periods });
    expect(r.total).toBe(1190 + 357);
    expect(r.count).toBe(2);
    expect(r.rows).toHaveLength(12);
    expect(r.rows[0]).toMatchObject({ periodo: "2025-09", monto: 1190, count: 1 });
    expect(r.rows[11]).toMatchObject({ periodo: "2026-08", monto: 357, count: 1 });
  });

  it("las notas de crédito restan y quedan en el detalle con signo", () => {
    // Si se filtraran, el Excel mostraría un total que sus filas no dan.
    const docs = [
      venta({ id: "f", neto: 1_000_000 }),
      venta({ id: "nc", tipo: 61, neto: 400_000, fechaEmision: "2025-09-20" }),
    ];
    const r = cashInByPeriod(docs, { companyId: "HP", periods });
    expect(r.total).toBe(1_190_000 - 476_000);
    expect(r.count).toBe(2);
    expect(r.detail.find((d) => d.id === "nc")).toMatchObject({ monto: -476_000, isNc: true });
    expect(r.detail.reduce((s, d) => s + d.monto, 0)).toBe(r.total);
  });

  it("el detalle guarda neto, IVA y total además del ingreso, para poder auditarlo", () => {
    // Sin el desglose, una factura de compra que aporta menos que neto + IVA
    // parece un error de la app.
    const docs = [venta({ id: "fc", tipo: 46, neto: 1_927_940, iva: 366_309, total: 2_024_338 })];
    const r = cashInByPeriod(docs, { companyId: "HP", periods });
    expect(r.detail[0]).toMatchObject({
      neto: 1_927_940, iva: 366_309, total: 2_024_338, monto: 1_927_940, conRetencion: true,
    });
  });

  it("un mes sin ventas queda en la fila, no desaparece", () => {
    const r = cashInByPeriod([venta({ neto: 1000 })], { companyId: "HP", periods });
    expect(r.rows.map((x) => x.periodo)).toEqual(periods);
    expect(r.rows[3]).toMatchObject({ monto: 0, count: 0 });
  });
});

describe("groupByCounterparty", () => {
  it("agrupa por RUT y ordena por ingreso de mayor a menor", () => {
    const { detail } = cashInByPeriod(
      [
        venta({ rutReceptor: "76-A", razonSocialReceptor: "A", neto: 100 }),
        venta({ rutReceptor: "76-B", razonSocialReceptor: "B", neto: 900 }),
        venta({ rutReceptor: "76-A", razonSocialReceptor: "A", neto: 50 }),
      ],
      { companyId: "HP", periods: periodWindow("2025-09") },
    );
    const g = groupByCounterparty(detail);
    expect(g.map((x) => [x.rut, x.monto, x.neto, x.count])).toEqual([
      ["76-B", 1071, 900, 1],
      ["76-A", 179, 150, 2],
    ]);
  });
});

describe("projectCashFlow", () => {
  it("proyecta septiembre 2026-2027 desde los 12 meses anteriores", () => {
    const docs = [
      venta({ periodo: "2025-09", neto: 1_000_000 }), // ingreso 1.190.000
      venta({ periodo: "2026-01", neto: 2_000_000 }), // ingreso 2.380.000
      venta({ periodo: "2026-08", neto: 400_000 }),   // ingreso 476.000
    ];
    const p = projectCashFlow(docs, { companyId: "HP", startPeriod: "2026-09", percent: 75 });

    expect(p.targetLabel).toBe("Septiembre 2026-2027");
    expect(p.baseLabel).toBe("Septiembre 2025-2026");
    expect(p.baseTotal).toBe(4_046_000);
    expect(p.total).toBe(3_034_500);
    expect(p.mesesReales).toBe(0);

    // Cada mes proyectado se alinea con su mismo mes del año anterior.
    expect(p.rows[0]).toMatchObject({ periodo: "2026-09", basePeriodo: "2025-09", baseMonto: 1_190_000, proyectado: 892_500 });
    expect(p.rows[4]).toMatchObject({ periodo: "2027-01", basePeriodo: "2026-01", proyectado: 1_785_000 });
    expect(p.rows[11]).toMatchObject({ periodo: "2027-08", basePeriodo: "2026-08", proyectado: 357_000 });
  });

  it("un mes de la ventana que ya tiene ventas vale su dato real, no la estimación", () => {
    // Es el caso de arrancar la temporada a mitad de camino: septiembre 2026 ya
    // está facturado, así que estimarlo sería cambiar un número cierto por uno
    // inventado.
    const docs = [
      venta({ periodo: "2025-09", neto: 1_000_000 }),   // base de septiembre
      venta({ periodo: "2025-10", neto: 2_000_000 }),   // base de octubre
      venta({ periodo: "2026-09", neto: 9_000_000 }),   // septiembre YA ocurrió
    ];
    const p = projectCashFlow(docs, { companyId: "HP", startPeriod: "2026-09", percent: 75 });

    expect(p.rows[0]).toMatchObject({
      periodo: "2026-09",
      esReal: true,
      realMonto: 10_710_000,
      realCount: 1,
      proyectado: 892_500,   // se sigue informando, pero no se usa
      monto: 10_710_000,
    });
    expect(p.rows[1]).toMatchObject({ periodo: "2026-10", esReal: false, monto: 1_785_000 });

    expect(p.mesesReales).toBe(1);
    expect(p.mesesEstimados).toBe(11);
    expect(p.totalReal).toBe(10_710_000);
    expect(p.totalProyectado).toBe(1_785_000);
    expect(p.total).toBe(12_495_000);
    expect(p.total).toBe(p.totalReal + p.totalProyectado);
  });

  it("un mes real que cerró en $0 sigue siendo real y no se reemplaza por la estimación", () => {
    // Facturado y anulado con NC: el ingreso da 0, pero ese cero ES el dato. Si
    // el corte fuera "monto distinto de cero", el mes volvería a estimarse en
    // positivo y la temporada saldría inflada por algo que se anuló.
    const docs = [
      venta({ periodo: "2025-09", neto: 4_000_000 }),
      venta({ id: "f", periodo: "2026-09", neto: 1_000_000 }),
      venta({ id: "nc", periodo: "2026-09", tipo: 61, neto: 1_000_000 }),
    ];
    const p = projectCashFlow(docs, { companyId: "HP", startPeriod: "2026-09", percent: 75 });
    expect(p.rows[0]).toMatchObject({ esReal: true, realCount: 2, realMonto: 0, monto: 0 });
    expect(p.rows[0].proyectado).toBe(3_570_000);
    expect(p.total).toBe(0);
  });

  it("las facturas de compra pesan menos que una afecta del mismo neto", () => {
    const normal = projectCashFlow([venta({ periodo: "2025-09", neto: 1_000_000 })],
      { companyId: "HP", startPeriod: "2026-09", percent: 100 });
    const compra = projectCashFlow(
      [venta({ periodo: "2025-09", tipo: 46, neto: 1_000_000, iva: 190_000, total: 1_050_000 })],
      { companyId: "HP", startPeriod: "2026-09", percent: 100 });
    expect(normal.baseTotal).toBe(1_190_000);
    expect(compra.baseTotal).toBe(1_000_000);
  });

  it("las compras del período proyectado no convierten un mes en real", () => {
    const docs = [
      venta({ periodo: "2025-09", neto: 1_000_000 }),
      venta({ periodo: "2026-09", neto: 8_000_000, kind: "compra" }),
    ];
    const p = projectCashFlow(docs, { companyId: "HP", startPeriod: "2026-09", percent: 75 });
    expect(p.rows[0]).toMatchObject({ esReal: false, monto: 892_500 });
  });

  it("las ventas de otra empresa dentro de la ventana no se toman como reales", () => {
    const docs = [
      venta({ periodo: "2025-09", neto: 1_000_000 }),
      venta({ periodo: "2026-09", neto: 8_000_000, companyId: "OTRA" }),
    ];
    const p = projectCashFlow(docs, { companyId: "HP", startPeriod: "2026-09", percent: 75 });
    expect(p.rows[0]).toMatchObject({ esReal: false, monto: 892_500 });
  });

  it("el total es la suma de los meses redondeados, no el redondeo de la suma", () => {
    // Tres meses de 3.333 al 33,33%: cada uno redondea a 1.111 (3.333), mientras
    // que redondear la suma daría 3.332. El Excel imprime la columna, así que el
    // total tiene que ser el de la columna o no cuadra a ojo.
    const docs = ["2025-09", "2025-10", "2025-11"].map((periodo) =>
      venta({ periodo, tipo: 46, neto: 3333, iva: 633, total: 3333 }));
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
    expect(projectCashFlow(docs, { companyId: "HP", startPeriod: "2026-09", percent: 120 }).total).toBe(1428);
  });
});
