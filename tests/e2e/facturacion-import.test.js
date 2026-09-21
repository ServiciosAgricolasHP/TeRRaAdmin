import { describe, it, expect } from "vitest";
import { importDteRecords } from "../../src/services/dteImportService";
import { dteDocumentsService } from "../../src/services";
import { parseSiiRcvCsv, buildDteDocId } from "../../src/utils/siiCsvParser";
import { get, all } from "./helpers/seed";

const EMPRESA = "empresa-1";
const RUT_EMPRESA = "76123456-7";

// Header real del RCV de ventas del SII, recortado a las columnas que el
// parser mira. El separador es `;`, como en el export real.
// Los tests arman el CSV entero para ejercitar la cadena completa:
// bytes -> parser -> ids -> Firestore.
const HEADER_VENTAS =
  "Nro;Tipo Doc;Tipo Venta;Rut cliente;Razon Social;Folio;Fecha Docto;Monto Exento;Monto Neto;Monto IVA;Monto total";

const fila = ({ nro = 1, tipo = 33, rut, razon, folio, fecha, neto, iva, total }) =>
  `${nro};${tipo};Del Giro;${rut};${razon};${folio};${fecha};0;${neto};${iva};${total}`;

const csvVentas = (filas) =>
  new TextEncoder().encode([HEADER_VENTAS, ...filas].join("\n")).buffer;

// Las tres facturas de marzo con las que arranca casi todo el archivo.
const MARZO = [
  fila({ nro: 1, rut: "77111111-1", razon: "Cliente Uno", folio: 101, fecha: "2026-03-05", neto: 100000, iva: 19000, total: 119000 }),
  fila({ nro: 2, rut: "77222222-2", razon: "Cliente Dos", folio: 102, fecha: "2026-03-12", neto: 200000, iva: 38000, total: 238000 }),
  fila({ nro: 3, rut: "77333333-3", razon: "Cliente Tres", folio: 103, fecha: "2026-03-20", neto: 50000, iva: 9500, total: 59500 }),
];

// Reproduce lo que hace la pantalla entre el parser y el servicio: asignarle
// a cada registro su id determinístico.
function conIds(buffer, { companyId = EMPRESA, alias = "Agrícola HP" } = {}) {
  const parsed = parseSiiRcvCsv(buffer, { companyRut: RUT_EMPRESA });
  return parsed.records.map((r) => ({
    ...r,
    id: buildDteDocId({
      companyId,
      kind: r.kind,
      tipo: r.tipo,
      folio: r.folio,
      rutEmisor: r.rutEmisor,
      rutReceptor: r.rutReceptor,
    }),
    companyId,
    companyAlias: alias,
    sourceFile: "rcv.csv",
  }));
}

const importar = (buffer, opts = {}) =>
  importDteRecords({ companyId: EMPRESA, records: conIds(buffer, opts), uid: "tester" });

const idDe = (folio) => `${EMPRESA}_V_33_${folio}`;

describe("import del RCV: primera pasada", () => {
  it("escribe un documento por fila con el total parseado", async () => {
    const res = await importar(csvVentas(MARZO));
    expect(res).toEqual({ totalNew: 3, totalOverwrite: 0, totalDeleted: 0 });

    const docs = await all("dteDocuments");
    expect(docs).toHaveLength(3);

    const f101 = await get("dteDocuments", idDe(101));
    expect(f101.total).toBe(119000);
    expect(f101.neto).toBe(100000);
    expect(f101.iva).toBe(19000);
    expect(f101.periodo).toBe("2026-03");
    expect(f101.kind).toBe("venta");
    expect(f101.rutReceptor).toBe("77111111-1");
    expect(f101.companyId).toBe(EMPRESA);
  });

  it("los documentos nuevos arrancan sin pagar", async () => {
    await importar(csvVentas(MARZO));
    for (const folio of [101, 102, 103]) {
      expect((await get("dteDocuments", idDe(folio))).paymentStatus).toBe("unpaid");
    }
  });
});

describe("reimportar el mismo período", () => {
  it("es idempotente: no duplica nada", async () => {
    await importar(csvVentas(MARZO));
    const res = await importar(csvVentas(MARZO));

    expect(res).toEqual({ totalNew: 0, totalOverwrite: 3, totalDeleted: 0 });
    expect(await all("dteDocuments")).toHaveLength(3);
  });

  it("conserva el estado de pago y las notas cargadas a mano", async () => {
    // Lo que se perdería acá es trabajo manual que no está en ningún CSV.
    await importar(csvVentas(MARZO));
    await dteDocumentsService.update(idDe(102), {
      paymentStatus: "net_only",
      notes: "El cliente retuvo el IVA",
    });

    await importar(csvVentas(MARZO));

    const f102 = await get("dteDocuments", idDe(102));
    expect(f102.paymentStatus).toBe("net_only");
    expect(f102.notes).toBe("El cliente retuvo el IVA");
  });

  it("conserva los abonos registrados", async () => {
    await importar(csvVentas(MARZO));
    await dteDocumentsService.update(idDe(101), {
      payments: [{ id: "p1", date: "2026-04-01", amount: 119000, kind: "total" }],
      amountPaid: 119000,
      paymentStatus: "paid",
    });

    await importar(csvVentas(MARZO));

    const f101 = await get("dteDocuments", idDe(101));
    expect(f101.amountPaid).toBe(119000);
    expect(f101.payments).toHaveLength(1);
    expect(f101.paymentStatus).toBe("paid");
  });

  it("un monto corregido en el SII sí pisa al viejo", async () => {
    // La contracara: el replace existe para que una corrección del SII entre.
    await importar(csvVentas(MARZO));
    const corregido = [
      MARZO[0],
      fila({ nro: 2, rut: "77222222-2", razon: "Cliente Dos", folio: 102, fecha: "2026-03-12", neto: 300000, iva: 57000, total: 357000 }),
      MARZO[2],
    ];
    await importar(csvVentas(corregido));

    expect((await get("dteDocuments", idDe(102))).total).toBe(357000);
  });
});

describe("replace por período: el borrado de huérfanos", () => {
  it("importar un CSV parcial borra las facturas que faltan", async () => {
    // Este es el camino de pérdida de datos más grande del repo y hoy no
    // pide confirmación. El test lo deja por escrito, no lo aprueba.
    await importar(csvVentas(MARZO));
    await dteDocumentsService.update(idDe(103), { paymentStatus: "paid", notes: "cobrada" });

    const res = await importar(csvVentas([MARZO[0]]));

    expect(res).toEqual({ totalNew: 0, totalOverwrite: 1, totalDeleted: 2 });
    expect(await get("dteDocuments", idDe(101))).toBeTruthy();
    // Se fue el documento y con él la nota y el estado de cobro.
    expect(await get("dteDocuments", idDe(102))).toBe(null);
    expect(await get("dteDocuments", idDe(103))).toBe(null);
  });

  it("el borrado no cruza de un período a otro", async () => {
    await importar(csvVentas(MARZO));
    const abril = [
      fila({ nro: 1, rut: "77111111-1", razon: "Cliente Uno", folio: 201, fecha: "2026-04-03", neto: 10000, iva: 1900, total: 11900 }),
    ];
    const res = await importar(csvVentas(abril));

    expect(res.totalDeleted).toBe(0);
    expect(await all("dteDocuments")).toHaveLength(4);
    expect(await get("dteDocuments", idDe(101))).toBeTruthy();
  });

  it("el borrado no cruza de una empresa a otra", async () => {
    // Dos empresas pueden emitir el mismo folio; el id lleva el companyId
    // justamente para que no se pisen.
    await importar(csvVentas(MARZO));
    await importDteRecords({
      companyId: "empresa-2",
      records: conIds(csvVentas([MARZO[0]]), { companyId: "empresa-2", alias: "Otra" }),
      uid: "tester",
    });

    expect(await all("dteDocuments")).toHaveLength(4);
    expect(await get("dteDocuments", idDe(101))).toBeTruthy();
    expect(await get("dteDocuments", "empresa-2_V_33_101")).toBeTruthy();
  });
});

describe("compras", () => {
  const HEADER_COMPRAS =
    "Nro;Tipo Doc;Tipo Compra;Rut Proveedor;Razon Social;Folio;Fecha Docto;Monto Exento;Monto Neto;Monto IVA Recuperable;Monto total";

  const csvCompras = (filas) =>
    new TextEncoder().encode([HEADER_COMPRAS, ...filas].join("\n")).buffer;

  it("dos proveedores con el mismo folio no se pisan", async () => {
    // Cada proveedor lleva su propia secuencia de folios, por eso el id de
    // compras incluye el RUT del emisor.
    const filas = [
      fila({ nro: 1, rut: "78111111-1", razon: "Proveedor A", folio: 500, fecha: "2026-03-05", neto: 10000, iva: 1900, total: 11900 }),
      fila({ nro: 2, rut: "78222222-2", razon: "Proveedor B", folio: 500, fecha: "2026-03-06", neto: 20000, iva: 3800, total: 23800 }),
    ];
    const res = await importDteRecords({
      companyId: EMPRESA,
      records: conIds(csvCompras(filas)),
      uid: "tester",
    });

    expect(res.totalNew).toBe(2);
    const docs = await all("dteDocuments");
    expect(docs).toHaveLength(2);
    expect(new Set(docs.map((d) => d.id)).size).toBe(2);
    for (const d of docs) expect(d.kind).toBe("compra");
  });

  it("ventas y compras del mismo período son ámbitos separados", async () => {
    await importar(csvVentas(MARZO));
    const compras = [
      fila({ nro: 1, rut: "78111111-1", razon: "Proveedor A", folio: 500, fecha: "2026-03-05", neto: 10000, iva: 1900, total: 11900 }),
    ];
    const res = await importDteRecords({
      companyId: EMPRESA,
      records: conIds(csvCompras(compras)),
      uid: "tester",
    });

    expect(res.totalDeleted).toBe(0);
    expect(await all("dteDocuments")).toHaveLength(4);
  });
});
