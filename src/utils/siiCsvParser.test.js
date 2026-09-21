import { describe, it, expect } from "vitest";
import {
  parseSiiRcvCsv,
  buildDteDocId,
  normalizeRut,
  rutNumeric,
  extractRutFromFilename,
  dteTypeLabel,
  otroImpuestoCategory,
  otroImpuestoLabel,
} from "./siiCsvParser";

// El RCV del SII usa `;` como separador.
const utf8 = (texto) => new TextEncoder().encode(texto).buffer;
const utf8ConBom = (texto) => {
  const cuerpo = new TextEncoder().encode(texto);
  const out = new Uint8Array(cuerpo.length + 3);
  out.set([0xef, 0xbb, 0xbf], 0);
  out.set(cuerpo, 3);
  return out.buffer;
};
// Latin-1: cada carácter < 256 es un byte.
const latin1 = (texto) => Uint8Array.from([...texto], (c) => c.charCodeAt(0)).buffer;

const HEAD_VENTAS =
  "Nro;Tipo Doc;Tipo Venta;Rut cliente;Razon Social;Folio;Fecha Docto;Monto Exento;Monto Neto;Monto IVA;Monto Total";
const fila = (...c) => c.join(";");

describe("parseSiiRcvCsv — detección y estructura", () => {
  it("detecta ventas por la columna Rut cliente", () => {
    const csv = [HEAD_VENTAS, fila(1, 33, 1, "76123456-7", "ACME SpA", 100, "2026-03-15", 0, 100000, 19000, 119000)].join("\n");
    const r = parseSiiRcvCsv(utf8(csv));
    expect(r.kind).toBe("venta");
    expect(r.records).toHaveLength(1);
    expect(r.errors).toEqual([]);
  });

  it("detecta compras por la columna RUT Proveedor", () => {
    const head =
      "Nro;Tipo Doc;Tipo Compra;RUT Proveedor;Razon Social;Folio;Fecha Docto;Monto Exento;Monto Neto;Monto IVA Recuperable;Monto Total";
    const csv = [head, fila(1, 33, 1, "76123456-7", "Proveedor Ltda", 55, "2026-03-15", 0, 100000, 19000, 119000)].join("\n");
    expect(parseSiiRcvCsv(utf8(csv)).kind).toBe("compra");
  });

  it("lanza si no reconoce los encabezados", () => {
    expect(() => parseSiiRcvCsv(utf8("a;b;c\n1;2;3"))).toThrow(/no se reconocen/i);
  });

  it("lanza si el archivo está vacío", () => {
    expect(() => parseSiiRcvCsv(utf8(""))).toThrow(/vacío/i);
  });

  it("lanza si falta una columna requerida", () => {
    // Sin Monto Total.
    const head = "Nro;Tipo Doc;Rut cliente;Folio;Fecha Docto";
    expect(() => parseSiiRcvCsv(utf8(`${head}\n1;33;76123456-7;100;2026-03-15`))).toThrow(
      /faltan columnas/i,
    );
  });

  it("ubica a la empresa como emisor en ventas y como receptor en compras", () => {
    const csvV = [HEAD_VENTAS, fila(1, 33, 1, "76123456-7", "Cliente", 100, "2026-03-15", 0, 100000, 19000, 119000)].join("\n");
    const v = parseSiiRcvCsv(utf8(csvV), { companyRut: "77000000-0" }).records[0];
    expect(v.rutEmisor).toBe("77000000-0");
    expect(v.rutReceptor).toBe("76123456-7");

    const headC =
      "Nro;Tipo Doc;RUT Proveedor;Razon Social;Folio;Fecha Docto;Monto Neto;Monto IVA Recuperable;Monto Total";
    const csvC = [headC, fila(1, 33, "76123456-7", "Proveedor", 55, "2026-03-15", 100000, 19000, 119000)].join("\n");
    const c = parseSiiRcvCsv(utf8(csvC), { companyRut: "77000000-0" }).records[0];
    expect(c.rutEmisor).toBe("76123456-7");
    expect(c.rutReceptor).toBe("77000000-0");
  });

  it("deriva el período de la fecha", () => {
    const csv = [HEAD_VENTAS, fila(1, 33, 1, "76123456-7", "X", 100, "2026-03-15", 0, 100000, 19000, 119000)].join("\n");
    expect(parseSiiRcvCsv(utf8(csv)).records[0].periodo).toBe("2026-03");
  });

  it("saltea filas de footer o sin tipo/folio válidos", () => {
    const csv = [
      HEAD_VENTAS,
      fila(1, 33, 1, "76123456-7", "X", 100, "2026-03-15", 0, 100000, 19000, 119000),
      "TOTALES;;;;;;;;;;",
      fila(2, 0, 1, "76123456-7", "X", 101, "2026-03-15", 0, 1, 1, 2),
    ].join("\n");
    const r = parseSiiRcvCsv(utf8(csv));
    expect(r.records).toHaveLength(1);
    expect(r.stats.count).toBe(1);
  });

  it("acumula estadísticas por tipo", () => {
    const csv = [
      HEAD_VENTAS,
      fila(1, 33, 1, "76123456-7", "X", 100, "2026-03-15", 0, 100000, 19000, 119000),
      fila(2, 33, 1, "76123456-7", "X", 101, "2026-03-16", 0, 100000, 19000, 119000),
      fila(3, 61, 1, "76123456-7", "X", 9, "2026-03-17", 0, 10000, 1900, 11900),
    ].join("\n");
    const r = parseSiiRcvCsv(utf8(csv));
    expect(r.stats.byTipo).toEqual({ 33: 2, 61: 1 });
    expect(r.stats.totalAmount).toBe(249900);
  });
});

describe("parseSiiRcvCsv — codificación", () => {
  const conAcento = (b) => parseSiiRcvCsv(b).records[0].razonSocialReceptor;

  it("lee UTF-8 plano", () => {
    const csv = [HEAD_VENTAS, fila(1, 33, 1, "76123456-7", "Muñoz y Compañía", 100, "2026-03-15", 0, 1, 0, 1)].join("\n");
    expect(conAcento(utf8(csv))).toBe("Muñoz y Compañía");
  });

  it("descarta el BOM de UTF-8", () => {
    const csv = [HEAD_VENTAS, fila(1, 33, 1, "76123456-7", "Muñoz", 100, "2026-03-15", 0, 1, 0, 1)].join("\n");
    const r = parseSiiRcvCsv(utf8ConBom(csv));
    // Si el BOM no se sacara, el primer header quedaría con el carácter
    // invisible adelante y el Tipo Doc no se encontraría.
    expect(r.records).toHaveLength(1);
    expect(r.records[0].razonSocialReceptor).toBe("Muñoz");
  });

  it("cae a ISO-8859-1 cuando el UTF-8 sale con caracteres de reemplazo", () => {
    const csv = [HEAD_VENTAS, fila(1, 33, 1, "76123456-7", "Muñoz", 100, "2026-03-15", 0, 1, 0, 1)].join("\n");
    expect(conAcento(latin1(csv))).toBe("Muñoz");
  });
});

describe("parseSiiRcvCsv — montos y fechas", () => {
  const conMonto = (monto) => {
    const csv = [HEAD_VENTAS, fila(1, 33, 1, "76123456-7", "X", 100, "2026-03-15", 0, 0, 0, monto)].join("\n");
    return parseSiiRcvCsv(utf8(csv)).records[0].total;
  };

  it("entero sin separadores", () => {
    expect(conMonto("119000")).toBe(119000);
  });

  it("puntos como separador de miles", () => {
    expect(conMonto("1.234.567")).toBe(1234567);
  });

  it("coma decimal con puntos de miles", () => {
    expect(conMonto("1.234,50")).toBe(1234.5);
  });

  it("un solo punto con 1-2 decimales se lee como decimal", () => {
    expect(conMonto("1234.50")).toBe(1234.5);
  });

  it("negativos (notas de crédito)", () => {
    expect(conMonto("-119000")).toBe(-119000);
  });

  it("vacío y guion suelto dan 0", () => {
    expect(conMonto("")).toBe(0);
    expect(conMonto("-")).toBe(0);
  });

  const conFecha = (f) => {
    const csv = [HEAD_VENTAS, fila(1, 33, 1, "76123456-7", "X", 100, f, 0, 0, 0, 1)].join("\n");
    return parseSiiRcvCsv(utf8(csv)).records[0];
  };

  it("normaliza los tres formatos de fecha a ISO", () => {
    expect(conFecha("2026-03-15").fechaEmision).toBe("2026-03-15");
    expect(conFecha("15/03/2026").fechaEmision).toBe("2026-03-15");
    expect(conFecha("15-03-2026").fechaEmision).toBe("2026-03-15");
    expect(conFecha("5/3/2026").fechaEmision).toBe("2026-03-05");
  });

  it("una fecha que no se puede parsear pasa tal cual y ensucia el período", () => {
    // Vale la pena tenerlo fijado: un período basura arma un scope propio en
    // el import y nunca coincide con nada.
    const r = conFecha("marzo 2026");
    expect(r.fechaEmision).toBe("marzo 2026");
    expect(r.periodo).toBe("marzo 2");
  });
});

describe("parseSiiRcvCsv — IVA", () => {
  it("suma IVA recuperable y no recuperable cuando son columnas distintas", () => {
    const head =
      "Nro;Tipo Doc;RUT Proveedor;Razon Social;Folio;Fecha Docto;Monto Neto;Monto IVA Recuperable;Monto IVA No Recuperable;Monto Total";
    const csv = [head, fila(1, 33, "76123456-7", "P", 55, "2026-03-15", 100000, 15000, 4000, 119000)].join("\n");
    expect(parseSiiRcvCsv(utf8(csv)).records[0].iva).toBe(19000);
  });

  // `colIdx` matchea por `includes`, así que el fallback "monto iva" —que está
  // para los exports con una sola columna de IVA— aterrizaba en la columna de
  // No Recuperable cuando era la única, y el IVA se sumaba dos veces. Ese IVA
  // va derecho al balance que alimenta el F29.
  it("no duplica el IVA cuando solo existe la columna No Recuperable", () => {
    const head =
      "Nro;Tipo Doc;RUT Proveedor;Razon Social;Folio;Fecha Docto;Monto Neto;Monto IVA No Recuperable;Monto Total";
    const csv = [head, fila(1, 33, "76123456-7", "P", 55, "2026-03-15", 100000, 19000, 119000)].join("\n");
    const r = parseSiiRcvCsv(utf8(csv)).records[0];
    expect(r.iva).toBe(19000);
  });

  it("sigue leyendo el IVA de un export con una sola columna \"Monto IVA\"", () => {
    // El fallback tiene que seguir funcionando: es el caso para el que existe.
    const head =
      "Nro;Tipo Doc;Rut cliente;Razon Social;Folio;Fecha Docto;Monto Neto;Monto IVA;Monto Total";
    const csv = [head, fila(1, 33, "77111111-1", "C", 55, "2026-03-15", 100000, 19000, 119000)].join("\n");
    expect(parseSiiRcvCsv(utf8(csv)).records[0].iva).toBe(19000);
  });

  it("suma las dos columnas cuando el export trae recuperable y no recuperable", () => {
    const head =
      "Nro;Tipo Doc;RUT Proveedor;Razon Social;Folio;Fecha Docto;Monto Neto;Monto IVA Recuperable;Monto IVA No Recuperable;Monto Total";
    const csv = [head, fila(1, 33, "76123456-7", "P", 55, "2026-03-15", 100000, 15000, 4000, 119000)].join("\n");
    expect(parseSiiRcvCsv(utf8(csv)).records[0].iva).toBe(19000);
  });

  it("el orden de las columnas no lo confunde cuando están las dos", () => {
    const head =
      "Nro;Tipo Doc;RUT Proveedor;Razon Social;Folio;Fecha Docto;Monto Neto;Monto IVA No Recuperable;Monto IVA Recuperable;Monto Total";
    const csv = [head, fila(1, 33, "76123456-7", "P", 55, "2026-03-15", 100000, 4000, 15000, 119000)].join("\n");
    expect(parseSiiRcvCsv(utf8(csv)).records[0].iva).toBe(19000);
  });
});

describe("buildDteDocId", () => {
  // Clave de idempotencia: reimportar el mismo período tiene que sobreescribir,
  // no duplicar.
  it("ventas: empresa + V + tipo + folio", () => {
    expect(buildDteDocId({ companyId: "emp1", kind: "venta", tipo: 33, folio: 100 })).toBe(
      "emp1_V_33_100",
    );
  });

  it("compras: incluye al proveedor porque los folios chocan entre proveedores", () => {
    const a = buildDteDocId({ companyId: "emp1", kind: "compra", tipo: 33, folio: 100, rutEmisor: "76123456-7" });
    const b = buildDteDocId({ companyId: "emp1", kind: "compra", tipo: 33, folio: 100, rutEmisor: "77000000-0" });
    expect(a).toBe("emp1_C_76123456_33_100");
    expect(a).not.toBe(b);
  });

  it("es estable ante distintos formatos del mismo RUT", () => {
    const conPuntos = buildDteDocId({ companyId: "e", kind: "compra", tipo: 33, folio: 1, rutEmisor: "76.123.456-7" });
    const sinPuntos = buildDteDocId({ companyId: "e", kind: "compra", tipo: 33, folio: 1, rutEmisor: "76123456-7" });
    expect(conPuntos).toBe(sinPuntos);
  });

  it("dos empresas no se pisan el mismo folio", () => {
    const a = buildDteDocId({ companyId: "emp1", kind: "venta", tipo: 33, folio: 100 });
    const b = buildDteDocId({ companyId: "emp2", kind: "venta", tipo: 33, folio: 100 });
    expect(a).not.toBe(b);
  });

  it("exige companyId", () => {
    expect(() => buildDteDocId({ kind: "venta", tipo: 33, folio: 1 })).toThrow(/companyId/);
  });
});

describe("normalizeRut / rutNumeric", () => {
  it("normaliza a formato con guion", () => {
    expect(normalizeRut("76.123.456-7")).toBe("76123456-7");
    expect(normalizeRut("761234567")).toBe("76123456-7");
    expect(normalizeRut("76123456-k")).toBe("76123456-K");
    expect(normalizeRut("")).toBe("");
  });

  it("⚠️ es otra función que la de rutUtils: esta AGREGA el guion", () => {
    // rutUtils.normalizeRut("761234567") devuelve "761234567" sin tocar.
    // Mismo nombre, contrato distinto. Documentado para que nadie las cruce.
    expect(normalizeRut("761234567")).toBe("76123456-7");
  });

  it("rutNumeric saca puntos, guion y DV", () => {
    expect(rutNumeric("76.123.456-7")).toBe("76123456");
    expect(rutNumeric("")).toBe("");
  });
});

describe("extractRutFromFilename", () => {
  it("saca el RUT cuando el separador no es un guion bajo", () => {
    expect(extractRutFromFilename("76123456-7.csv")).toBe("76123456-7");
    expect(extractRutFromFilename("RCV 76123456-7 202405.csv")).toBe("76123456-7");
    expect(extractRutFromFilename("Detalle-76123456-7.csv")).toBe("76123456-7");
  });

  it("devuelve vacío si el archivo fue renombrado", () => {
    expect(extractRutFromFilename("mi archivo.csv")).toBe("");
    expect(extractRutFromFilename("")).toBe("");
  });

  // ⚠️ COMPORTAMIENTO ACTUAL, PARECE UN BUG (siiCsvParser.js:166)
  //
  // Los dos regex anclan con `\b`, y en JavaScript el guion bajo ES un
  // carácter de palabra: entre `_` y un dígito NO hay borde. Como el SII
  // separa con guiones bajos —el propio comentario de la función pone de
  // ejemplo `Detalle_VENTA_76123456-7_202405.csv`— el caso documentado no
  // matchea nunca.
  //
  // Esto alimenta el aviso de "RUT del archivo distinto al de la empresa" en
  // el preview del import. No corrompe datos, pero el aviso no aparece cuando
  // tendría que aparecer.
  it("[bug conocido] no encuentra nada con guiones bajos, que es el formato del SII", () => {
    expect(extractRutFromFilename("Detalle_VENTA_76123456-7_202405.csv")).toBe("");
    expect(extractRutFromFilename("compras_76123456-k.csv")).toBe("");
  });

  // ⚠️ Y este es peor: devuelve un RUT TRUNCADO en vez de nada.
  //
  // Con puntos de miles, el primer regex puede empezar a matchear en medio del
  // número (después de un `.` sí hay borde) y se queda con los últimos grupos.
  // De "76.123.456-7" saca "123456-7", que es un RUT que existe y es de otra
  // persona: el preview podría avisar de un desajuste falso, o callarse ante
  // uno real.
  it("[bug conocido] trunca el RUT cuando viene con puntos y guion bajo delante", () => {
    expect(extractRutFromFilename("RCV_76.123.456-7.csv")).toBe("123456-7");
  });
});

describe("tablas de códigos", () => {
  it("etiqueta los tipos de DTE conocidos y deja pasar los raros", () => {
    expect(dteTypeLabel(33)).toMatch(/factura/i);
    expect(dteTypeLabel(61)).toMatch(/cr[eé]dito/i);
    expect(typeof dteTypeLabel(999)).toBe("string");
  });

  it("categoriza combustible por los códigos de otros impuestos", () => {
    // Alimenta el agrupado por centro de costo, o sea la atribución de gastos.
    for (const codigo of [28, 35, 271, 272]) {
      expect(otroImpuestoCategory(codigo)).toBe("combustible");
    }
    expect(otroImpuestoCategory(null)).toBe(null);
    expect(otroImpuestoCategory(9999)).toBe(null);
  });

  it("otroImpuestoLabel devuelve algo legible", () => {
    expect(typeof otroImpuestoLabel(28)).toBe("string");
  });
});
