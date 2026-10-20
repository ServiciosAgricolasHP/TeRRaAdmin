import { describe, it, expect } from "vitest";
import { parseVcards, buildVcards } from "./vcard";

describe("parseVcards", () => {
  it("lee vCard 3.0 con línea plegada, ORG con departamento, tipos y escapes", () => {
    const text = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "FN:Ana Pérez",
      "N:Pérez;Ana;;;",
      "ORG:Comercial Los Robles;Bodega",
      "TITLE:Jefa",
      "TEL;TYPE=CELL,PREF:+56 9 1111 1111",
      "TEL;TYPE=WORK:22345",
      " 6789",
      "EMAIL;TYPE=INTERNET:ana@robles.cl",
      "NOTE:Llamar\\, en la mañana\\nsolo lunes",
      "END:VCARD",
    ].join("\r\n");
    expect(parseVcards(text, { file: "a.vcf" })).toEqual([{
      name: "Ana Pérez",
      company: "Comercial Los Robles",
      department: "Bodega",
      role: "Jefa",
      notes: "Llamar, en la mañana\nsolo lunes",
      phones: [{ number: "+56 9 1111 1111", label: "Móvil" }, { number: "223456789", label: "Trabajo" }],
      emails: ["ana@robles.cl"],
      source: "vcard",
      file: "a.vcf",
      line: 1,
    }]);
  });

  it("lee vCard 2.1 de Android: quoted-printable en UTF-8 cortado con = y tipos sin TYPE=", () => {
    const text = [
      "BEGIN:VCARD",
      "VERSION:2.1",
      "N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Mu=C3=B1oz;Jos=C3=A9;;;",
      "FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Jos=C3=A9 Mu=C3=B1oz =",
      "Tapia",
      "TEL;CELL;PREF:+56922222222",
      "TEL;HOME:+56 2 2345 6789",
      "END:VCARD",
      "BEGIN:VCARD",
      "VERSION:2.1",
      "N:;Beto;;;",
      "TEL;CELL:933333333",
      "END:VCARD",
    ].join("\n");
    const rows = parseVcards(text);
    expect(rows.map((r) => r.name)).toEqual(["José Muñoz Tapia", "Beto"]);
    expect(rows[0].phones).toEqual([{ number: "+56922222222", label: "Móvil" }, { number: "+56 2 2345 6789", label: "Casa" }]);
    expect(rows.map((r) => r.line)).toEqual([1, 2]);
  });

  it("toma la etiqueta de Apple (item1.X-ABLabel) y el tel: de vCard 4.0", () => {
    const text = [
      "BEGIN:VCARD",
      "VERSION:4.0",
      "FN:Gasfiter",
      "item1.TEL;VALUE=uri:tel:+56944444444",
      "item1.X-ABLabel:_$!<Mobile>!$_",
      "item2.TEL:+56955555555",
      "item2.X-ABLabel:Bodega",
      "END:VCARD",
    ].join("\n");
    expect(parseVcards(text)[0].phones).toEqual([{ number: "+56944444444", label: "Mobile" }, { number: "+56955555555", label: "Bodega" }]);
  });
});

describe("buildVcards", () => {
  it("escribe vCard 3.0 que se vuelve a leer igual", () => {
    const contacts = [{
      name: "Ana Pérez",
      company: "Comercial Los Robles; Sur",
      department: "Bodega",
      role: "Jefa",
      phones: [{ number: "+56911111111", label: "Móvil" }, { number: "+56223456789;ext=12", label: "Trabajo" }],
      emails: ["ana@robles.cl"],
      notes: "Línea 1\nLínea 2, con coma",
    }];
    const vcf = buildVcards(contacts);
    expect(vcf.startsWith("BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Ana Pérez\r\n")).toBe(true);
    expect(vcf).toContain("TEL;TYPE=CELL:+56911111111");
    expect(vcf).toContain("TEL;TYPE=WORK:+56 223456789 anexo 12");
    const [back] = parseVcards(vcf);
    expect(back).toMatchObject({
      name: "Ana Pérez",
      company: "Comercial Los Robles; Sur",
      department: "Bodega",
      role: "Jefa",
      notes: "Línea 1\nLínea 2, con coma",
      emails: ["ana@robles.cl"],
    });
    expect(back.phones.map((p) => p.label)).toEqual(["Móvil", "Trabajo"]);
  });

  it("pliega las líneas largas sin partir caracteres, y un contacto sin nombre usa la empresa", () => {
    const vcf = buildVcards([{ company: "Banco Estado", phones: [], emails: [], notes: "ñ".repeat(100) }]);
    expect(vcf).toContain("FN:Banco Estado");
    const lines = vcf.split("\r\n");
    expect(lines.every((l) => Array.from(l).length <= 74)).toBe(true);
    expect(parseVcards(vcf)[0].notes).toBe("ñ".repeat(100));
  });
});
