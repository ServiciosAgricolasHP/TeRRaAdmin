import { describe, it, expect } from "vitest";
import { PHONE_BOOK_HEADERS, mapSheetRows, phoneBookSheetRows, fixAbsoluteRelTargets } from "./phoneBookSheet";
import { planPhoneBookImport } from "./phoneBook";

describe("mapSheetRows", () => {
  it("lee la planilla de las secretarias, con varios valores en una celda y salta las filas vacías", () => {
    const rows = [
      PHONE_BOOK_HEADERS,
      ["Comercial Los Robles", "76.543.210-1", "Proveedor", "Ventas", "Ana Pérez", "Ejecutiva", "9 1111 1111", "22345 6789 / 933333333", "ana@robles.cl; ventas@robles.cl", "Atiende en la mañana"],
      ["", "", "", "", "", "", "", "", "", ""],
      ["Banco Estado", "", "Banco", "", "Mesa central", "", "600 200 7000", "", "", ""],
    ];
    const { headerFound, rows: out } = mapSheetRows(rows, { file: "agenda.xlsx" });
    expect(headerFound).toBe(true);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      name: "Ana Pérez",
      company: "Comercial Los Robles",
      companyRut: "76.543.210-1",
      contactType: "supplier",
      department: "Ventas",
      role: "Ejecutiva",
      phones: [
        { number: "9 1111 1111", label: "Directo" },
        { number: "22345 6789", label: "Alternativo" },
        { number: "933333333", label: "Alternativo" },
      ],
      emails: ["ana@robles.cl", "ventas@robles.cl"],
      notes: "Atiende en la mañana",
      source: "sheet",
      file: "agenda.xlsx",
      line: 2,
    });
    expect(out[1]).toMatchObject({ company: "Banco Estado", contactType: "bank", line: 4 });
  });

  it("ubica las columnas por su encabezado, en cualquier orden y con el encabezado más abajo", () => {
    const rows = [
      ["Agenda de la oficina"],
      [],
      ["Correo", "Teléfono", "Nombre", "Empresa", "RUT"],
      ["beto@sur.cl", "933333333", "Beto Soto", "Transportes del Sur", "77.111.222-3"],
    ];
    const { rows: out } = mapSheetRows(rows);
    expect(out[0]).toMatchObject({ name: "Beto Soto", company: "Transportes del Sur", companyRut: "77.111.222-3", emails: ["beto@sur.cl"], phones: [{ number: "933333333", label: "Directo" }], line: 4 });
  });

  it("sin encabezados de nombre y teléfono o correo, no es la planilla", () => {
    expect(mapSheetRows([["Fecha", "Monto"], ["1", "2"]])).toEqual({ headerFound: false, rows: [] });
  });
});

describe("phoneBookSheetRows", () => {
  const contacts = [
    { name: "Beto", company: "Sur", phones: [{ number: "+56933333333" }], emails: [] },
    { name: "Ana Pérez", company: "Comercial Los Robles", companyRut: "76543210-1", contactType: "supplier", department: "Ventas", role: "Ejecutiva",
      phones: [{ number: "+56911111111" }, { number: "+56223456789" }, { number: "+56933333334" }], emails: ["ana@robles.cl", "ventas@robles.cl"], notes: "Mañana" },
  ];

  it("ordena por empresa y nombre, y junta los números y correos extra con /", () => {
    expect(phoneBookSheetRows(contacts)).toEqual([
      ["Comercial Los Robles", "76.543.210-1", "Proveedor", "Ventas", "Ana Pérez", "Ejecutiva", "+56 9 1111 1111", "+56 2 2345 6789 / +56 9 3333 3334", "ana@robles.cl / ventas@robles.cl", "Mañana"],
      ["Sur", "", "", "", "Beto", "", "+56 9 3333 3333", "", "", ""],
    ]);
  });

  it("descargar y volver a importar deja la agenda sin cambios", () => {
    const first = planPhoneBookImport([], mapSheetRows([PHONE_BOOK_HEADERS, ...phoneBookSheetRows(contacts)]).rows);
    const stored = first.create.map((c, i) => ({ id: `p${i}`, ...c.contact }));
    const again = planPhoneBookImport(stored, mapSheetRows([PHONE_BOOK_HEADERS, ...phoneBookSheetRows(stored)]).rows);
    expect([again.create.length, again.update.length, again.unchanged]).toEqual([0, 0, 2]);
  });

  it("un contacto de Google que vuelve por la planilla descargada no cuenta como cambio", () => {
    const stored = [{ id: "g1", name: "Beto", phones: [{ number: "+56933333333", label: "Móvil" }], emails: [], sources: ["google"] }];
    const plan = planPhoneBookImport(stored, mapSheetRows([PHONE_BOOK_HEADERS, ...phoneBookSheetRows(stored)]).rows);
    expect([plan.update.length, plan.unchanged]).toEqual([0, 1]);
  });
});

describe("fixAbsoluteRelTargets", () => {
  it("deja relativas las rutas, según la carpeta de la parte dueña", () => {
    expect(fixAbsoluteRelTargets("xl/worksheets/_rels/sheet1.xml.rels", '<R Target="/xl/tables/table1.xml" Id="rId1"/>'))
      .toBe('<R Target="../tables/table1.xml" Id="rId1"/>');
    expect(fixAbsoluteRelTargets("xl/_rels/workbook.xml.rels", '<R Target="/xl/worksheets/sheet1.xml"/><R Target="styles.xml"/>'))
      .toBe('<R Target="worksheets/sheet1.xml"/><R Target="styles.xml"/>');
    expect(fixAbsoluteRelTargets("_rels/.rels", '<R Target="/xl/workbook.xml"/>')).toBe('<R Target="xl/workbook.xml"/>');
  });
});
