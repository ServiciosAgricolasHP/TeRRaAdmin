import { describe, it, expect } from "vitest";
import {
  buildBchileRows,
  BCHILE_HEADERS,
  BCHILE_DEFAULT_EMAIL,
  rutWithDvNoDash,
  bchileAccountTypeCode,
  cleanText,
} from "./payroll";

// Las columnas del archivo que ingiere el portal del banco. Los índices se
// nombran porque una fila mal ordenada manda la plata a otro lado y el
// archivo igual se sube sin error.
const RUT = 0;
const NOMBRE = 1;
const CUENTA = 2;
const BANCO = 3;
const MONTO = 4;
const TIPO = 5;
const ID = 6;
const MAIL = 8;

const persona = (over = {}) => ({
  rut: "11111111-1",
  name: "Ana Silva",
  accountNumber: "12345678",
  accountType: 3,
  bankCode: "012",
  amount: 100000,
  ...over,
});

describe("buildBchileRows — forma del archivo", () => {
  it("cada fila tiene tantas columnas como el encabezado", () => {
    const filas = buildBchileRows([persona(), persona({ rut: "2-7", name: "Beto" })]);
    expect(filas).toHaveLength(2);
    for (const f of filas) expect(f).toHaveLength(BCHILE_HEADERS.length);
  });

  it("una nómina vacía no produce filas", () => {
    expect(buildBchileRows([])).toEqual([]);
    expect(buildBchileRows()).toEqual([]);
  });

  it("el monto va como entero redondeado, no como string", () => {
    const [f] = buildBchileRows([persona({ amount: 100000.6 })]);
    expect(f[MONTO]).toBe(100001);
    expect(typeof f[MONTO]).toBe("number");
  });

  it("la cuenta y el código de banco van como texto", () => {
    // Si la cuenta viajara como número, un cero a la izquierda desaparece.
    const [f] = buildBchileRows([persona({ accountNumber: 987654, bankCode: 12 })]);
    expect(f[CUENTA]).toBe("987654");
    expect(f[BANCO]).toBe("12");
  });
});

describe("a qué cuenta va la plata", () => {
  it("usa el paymentRut, no el RUT de la persona", () => {
    // El pago puede ir a la cuenta de un familiar; el portal del banco lo
    // valida contra la titularidad de la cuenta, así que manda paymentRut.
    const [f] = buildBchileRows([persona({ rut: "11111111-1", paymentRut: "22222222-2" })]);
    expect(f[RUT]).toBe(rutWithDvNoDash("22222222-2"));
  });

  it("cae al RUT de la persona cuando no hay paymentRut", () => {
    const [f] = buildBchileRows([persona({ paymentRut: "" })]);
    expect(f[RUT]).toBe(rutWithDvNoDash("11111111-1"));
  });

  it("el RUT va sin guión y con el dígito verificador pegado", () => {
    const [f] = buildBchileRows([persona({ rut: "12345678-K" })]);
    expect(f[RUT]).toBe("12345678K");
    expect(f[RUT]).not.toContain("-");
  });

  it("el tipo de cuenta se traduce al código del banco", () => {
    const [f] = buildBchileRows([persona({ accountType: 3 })]);
    expect(f[TIPO]).toBe(bchileAccountTypeCode(3));
  });
});

describe("el filtro de cero-neto", () => {
  // Existen en la nómina para liquidar anticipos (bruto = anticipo), pero el
  // banco rechaza una transferencia de $0 y voltea el archivo entero.
  it("deja afuera a quien cobra cero", () => {
    const filas = buildBchileRows([
      persona({ name: "Ana", amount: 100000 }),
      persona({ name: "Beto", amount: 0 }),
    ]);
    expect(filas).toHaveLength(1);
    expect(filas[0][NOMBRE]).toBe("Ana");
  });

  it("también a los montos que redondean a cero o son negativos", () => {
    const filas = buildBchileRows([
      persona({ name: "Ana", amount: 0.4 }),
      persona({ name: "Beto", amount: -500 }),
      persona({ name: "Caro", amount: null }),
    ]);
    expect(filas).toEqual([]);
  });

  it("los excluidos no consumen correlativo", () => {
    // Si el filtro corriera después de numerar, el archivo tendría huecos.
    const filas = buildBchileRows([
      persona({ name: "Ana", amount: 0 }),
      persona({ name: "Beto", amount: 50000 }),
      persona({ name: "Caro", amount: 30000 }),
    ]);
    expect(filas.map((f) => f[ID])).toEqual(["A001", "A002"]);
  });
});

describe("el orden y el correlativo", () => {
  it("ordena alfabéticamente por nombre", () => {
    const filas = buildBchileRows([
      persona({ name: "Carlos Ruiz" }),
      persona({ name: "Ana Silva" }),
      persona({ name: "Beto Pérez" }),
    ]);
    expect(filas.map((f) => f[NOMBRE])).toEqual(["Ana Silva", "Beto Perez", "Carlos Ruiz"]);
  });

  it("el orden ignora tildes y mayúsculas", () => {
    // Sin `sensitivity: base`, "Ángel" se iría al final y el correlativo
    // cambiaría entre dos corridas con los mismos datos.
    const filas = buildBchileRows([
      persona({ name: "ZULEMA" }),
      persona({ name: "Ángel" }),
      persona({ name: "ana" }),
    ]);
    expect(filas.map((f) => f[NOMBRE])).toEqual(["ana", "Angel", "ZULEMA"]);
  });

  it("el correlativo arranca en A001 y va con tres dígitos", () => {
    const filas = buildBchileRows([
      persona({ name: "Ana" }),
      persona({ name: "Beto" }),
      persona({ name: "Caro" }),
    ]);
    expect(filas.map((f) => f[ID])).toEqual(["A001", "A002", "A003"]);
  });

  it("el correlativo sigue el orden alfabético, no el de entrada", () => {
    const filas = buildBchileRows([persona({ name: "Zoe" }), persona({ name: "Ana" })]);
    expect(filas[0][NOMBRE]).toBe("Ana");
    expect(filas[0][ID]).toBe("A001");
  });

  it("el correlativo es estable: dos corridas con el mismo set dan lo mismo", () => {
    // Es lo que hace comparable un archivo con el de la corrida anterior.
    const gente = [persona({ name: "Caro" }), persona({ name: "Ana" }), persona({ name: "Beto" })];
    const a = buildBchileRows(gente);
    const b = buildBchileRows([...gente].reverse());
    expect(a).toEqual(b);
  });

  it("pasado el 999 el correlativo se desborda en vez de truncarse", () => {
    // No pasa hoy (la nómina más grande no llega), pero deja fijado que el
    // padding no corta: A1000 sigue siendo único.
    const mil = Array.from({ length: 1000 }, (_, i) =>
      persona({ name: `P${String(i).padStart(4, "0")}` }),
    );
    const filas = buildBchileRows(mil);
    expect(filas[999][ID]).toBe("A1000");
    expect(new Set(filas.map((f) => f[ID])).size).toBe(1000);
  });
});

describe("el nombre y el mail", () => {
  it("el nombre va sin tildes, que es lo que acepta el banco", () => {
    const [f] = buildBchileRows([persona({ name: "José Muñoz" })]);
    expect(f[NOMBRE]).toBe(cleanText("José Muñoz"));
    expect(f[NOMBRE]).not.toMatch(/[éó]/);
  });

  it("sin mail se completa con la casilla de remuneraciones", () => {
    // El banco rechaza las filas sin mail.
    const [f] = buildBchileRows([persona({ email: "" })]);
    expect(f[MAIL]).toBe(BCHILE_DEFAULT_EMAIL);
  });

  it("con mail propio respeta el del trabajador", () => {
    const [f] = buildBchileRows([persona({ email: "ana@example.com" })]);
    expect(f[MAIL]).toBe("ana@example.com");
  });
});
