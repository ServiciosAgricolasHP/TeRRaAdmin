import { describe, it, expect } from "vitest";
import { decodeCsvBytes, parseCsv, detectContactsCsv, mapContactsCsv } from "./contactsCsv";

describe("parseCsv", () => {
  it("respeta comillas, comillas escapadas, comas y saltos de línea dentro de una celda", () => {
    const rows = parseCsv('a,b,c\r\n"Pérez, Ana","dijo ""hola""","línea 1\nlínea 2"\r\n,,\r\n');
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["Pérez, Ana", 'dijo "hola"', "línea 1\nlínea 2"],
    ]);
  });

  it("usa punto y coma como separador cuando la primera línea trae más de esos", () => {
    expect(parseCsv("Nombre;Teléfono móvil\nAna;912345678")).toEqual([["Nombre", "Teléfono móvil"], ["Ana", "912345678"]]);
  });

  it("lee UTF-8 y, si no calza, Windows-1252", () => {
    const utf8 = new TextEncoder().encode(String.fromCharCode(0xfeff) + "Nombre\nMuñoz");
    expect(decodeCsvBytes(utf8)).toBe("Nombre\nMuñoz");
    const latin = new Uint8Array([0x4d, 0x75, 0xf1, 0x6f, 0x7a]); // "Muñoz" en Windows-1252
    expect(decodeCsvBytes(latin)).toBe("Muñoz");
  });
});

const GOOGLE_HEADER = [
  "First Name", "Middle Name", "Last Name", "Phonetic First Name", "Nickname", "File As",
  "Organization Name", "Organization Title", "Organization Department", "Notes", "Labels",
  "E-mail 1 - Label", "E-mail 1 - Value", "Phone 1 - Label", "Phone 1 - Value", "Phone 2 - Label", "Phone 2 - Value",
];

describe("mapContactsCsv: Google", () => {
  it("arma el nombre, separa los números de una celda con ::: y toma sus etiquetas", () => {
    const rows = [
      GOOGLE_HEADER,
      ["Ana", "María", "Pérez", "", "", "", "Comercial Los Robles", "Jefa", "Bodega", "Nota", "* myContacts",
        "* Work", "ana@robles.cl", "Mobile ::: Home", "+56 9 1111 1111 ::: 22345 6789", "", ""],
      ["Beto", "", "", "", "", "", "", "", "", "", "* myContacts", "", "", "Móvil", "933333333", "Casa", "+56944444444"],
    ];
    expect(detectContactsCsv(rows[0])).toBe("google");
    const { format, rows: out } = mapContactsCsv(rows, { file: "contacts.csv" });
    expect(format).toBe("google");
    expect(out[0]).toEqual({
      name: "Ana María Pérez",
      company: "Comercial Los Robles",
      role: "Jefa",
      department: "Bodega",
      notes: "Nota",
      phones: [{ number: "+56 9 1111 1111", label: "Mobile" }, { number: "22345 6789", label: "Home" }],
      emails: ["ana@robles.cl"],
      source: "google",
      file: "contacts.csv",
      line: 2,
    });
    expect(out[1].phones).toEqual([{ number: "933333333", label: "Móvil" }, { number: "+56944444444", label: "Casa" }]);
  });

  it("también lee el formato antiguo (Given Name, Phone 1 - Type)", () => {
    const rows = [
      ["Name", "Given Name", "Family Name", "Organization 1 - Name", "Phone 1 - Type", "Phone 1 - Value", "E-mail 1 - Type", "E-mail 1 - Value"],
      ["Ana Pérez", "Ana", "Pérez", "Robles", "Mobile", "911111111", "* Other", "ana@x.cl"],
    ];
    const { format, rows: out } = mapContactsCsv(rows);
    expect(format).toBe("google");
    expect(out[0]).toMatchObject({ name: "Ana Pérez", company: "Robles", phones: [{ number: "911111111", label: "Mobile" }], emails: ["ana@x.cl"] });
  });
});

describe("mapContactsCsv: Outlook", () => {
  it("toma cada columna de teléfono con su encabezado como etiqueta, en inglés o en español", () => {
    const en = mapContactsCsv([
      ["First Name", "Last Name", "Company", "Job Title", "Business Phone", "Mobile Phone", "Business Fax", "E-mail Address", "E-mail Display Name"],
      ["Ana", "Pérez", "Robles", "Jefa", "22345 6789", "911111111", "22222222", "ana@x.cl", "Ana Pérez (ana@x.cl)"],
    ]);
    expect(en.format).toBe("outlook");
    expect(en.rows[0]).toMatchObject({
      name: "Ana Pérez",
      company: "Robles",
      role: "Jefa",
      phones: [{ number: "22345 6789", label: "Business Phone" }, { number: "911111111", label: "Mobile Phone" }],
      emails: ["ana@x.cl"],
      source: "outlook",
    });
    const es = mapContactsCsv([
      ["Nombre", "Apellidos", "Organización", "Teléfono móvil", "Dirección de correo electrónico"],
      ["Beto", "Soto", "Sur", "933333333", "beto@sur.cl"],
    ]);
    expect(es.rows[0]).toMatchObject({ name: "Beto Soto", company: "Sur", phones: [{ number: "933333333", label: "Teléfono móvil" }], emails: ["beto@sur.cl"] });
  });

  it("un CSV sin columnas de teléfono ni correo no es un archivo de contactos", () => {
    expect(mapContactsCsv([["Fecha", "Monto"], ["2026-01-01", "100"]])).toEqual({ format: null, rows: [] });
  });
});
