import { describe, expect, it } from "vitest";
import { BANK_FORMATS, DEFAULT_BANK_FORMAT_ID, bankFormatOf } from "./bankFormats";

const persona = (over = {}) => ({
  rut: "11111111-1",
  name: "Ana Silva",
  accountNumber: "12345678",
  accountType: 3,
  bankCode: "012",
  amount: 100000,
  ...over,
});

describe("bankFormatOf", () => {
  it("devuelve el formato pedido, o el de por defecto si no existe", () => {
    expect(bankFormatOf(DEFAULT_BANK_FORMAT_ID).id).toBe(DEFAULT_BANK_FORMAT_ID);
    expect(bankFormatOf("noExiste").id).toBe(DEFAULT_BANK_FORMAT_ID);
    expect(bankFormatOf(undefined).id).toBe(DEFAULT_BANK_FORMAT_ID);
  });
});

describe.each(BANK_FORMATS.map((f) => [f.id, f]))("formato %s", (_id, format) => {
  it("tiene nombre, hoja, sufijo, reglas y un ancho por columna", () => {
    expect(format.label).toBeTruthy();
    expect(format.sheetName).toBeTruthy();
    expect(format.fileSuffix).toBeTruthy();
    expect(format.notes.length).toBeGreaterThan(0);
    expect(format.columnWidths).toHaveLength(format.headers.length);
  });

  it("cada fila tiene tantas columnas como el encabezado", () => {
    const rows = format.buildRows([persona(), persona({ rut: "2-7", name: "Beto" })]);
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(r).toHaveLength(format.headers.length);
  });

  it("deja afuera las transferencias de $0", () => {
    expect(format.buildRows([persona({ amount: 0 }), persona({ amount: 0.4 })])).toEqual([]);
  });

  it("da lo mismo sin importar el orden de entrada", () => {
    const gente = [persona({ name: "Caro" }), persona({ name: "Ana" }), persona({ name: "Beto" })];
    expect(format.buildRows(gente)).toEqual(format.buildRows([...gente].reverse()));
  });
});

it("los ids no se repiten", () => {
  expect(new Set(BANK_FORMATS.map((f) => f.id)).size).toBe(BANK_FORMATS.length);
});
