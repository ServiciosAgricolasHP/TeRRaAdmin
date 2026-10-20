import { describe, it, expect } from "vitest";
import {
  normalizePhone,
  formatPhone,
  contactTypeFromLabel,
  contactTypeLabel,
  fixNameCase,
  phoneLabelEs,
  cleanIncoming,
  mergePhoneContact,
  planPhoneBookImport,
  phoneContactMatches,
  displayName,
  filterPhoneContacts,
  groupByCompany,
  departmentOptions,
  phoneContactText,
} from "./phoneBook";

describe("normalizePhone", () => {
  it("lleva los números chilenos a +56, venga como venga", () => {
    for (const raw of ["+56912345678", "+56 9 1234 5678", "912345678", "9 1234 5678", "912-345-678", "56912345678", "0056912345678", "(+56) 9-1234-5678", 912345678]) {
      expect(normalizePhone(raw)).toBe("+56912345678");
    }
    expect(normalizePhone("2 2345 6789")).toBe("+56223456789");
  });

  it("deja los extranjeros como vienen y no adivina los números raros", () => {
    expect(normalizePhone("+54 9 11 2345 6789")).toBe("+5491123456789");
    expect(normalizePhone("12345678")).toBe("12345678");
    expect(normalizePhone("600 600 1234")).toBe("6006001234");
    expect(normalizePhone("")).toBe("");
    expect(normalizePhone("sin número")).toBe("");
  });

  it("separa el anexo, así dos anexos de la misma central son números distintos", () => {
    expect(normalizePhone("+56 2 2345 6789 anexo 12")).toBe("+56223456789;ext=12");
    expect(normalizePhone("22345 6789, ext. 7")).toBe("+56223456789;ext=7");
    expect(normalizePhone("+56 2 2345 6789 anexo 12")).not.toBe(normalizePhone("+56 2 2345 6789 anexo 13"));
  });

  it("normalizar un número ya normalizado lo deja igual, también con anexo", () => {
    for (const raw of ["22 345 6789 anexo 12", "912345678", "+54 9 11 2345 6789", "12345678"]) {
      const once = normalizePhone(raw);
      expect(normalizePhone(once)).toBe(once);
    }
  });
});

describe("formatPhone", () => {
  it("separa el código de país, agrupa los 600 y 800, y deja el resto como está", () => {
    expect(formatPhone("+56912345678")).toBe("+56 912345678");
    expect(formatPhone("+56223456789;ext=12")).toBe("+56 223456789 anexo 12");
    expect(formatPhone("6002007000")).toBe("600 200 7000");
    expect(formatPhone("12345678")).toBe("12345678");
  });

  it("separa el código de país según su largo: 1, 2 o 3 dígitos", () => {
    expect(formatPhone("+15551234567")).toBe("+1 5551234567");
    expect(formatPhone("+79161234567")).toBe("+7 9161234567");
    expect(formatPhone("+5491123456789")).toBe("+54 91123456789");
    expect(formatPhone("+447911123456")).toBe("+44 7911123456");
    expect(formatPhone("+59169710262")).toBe("+591 69710262");
    expect(formatPhone("+593991234567")).toBe("+593 991234567");
    expect(formatPhone("+420601234567")).toBe("+420 601234567");
  });
});

describe("tipos, etiquetas y nombres", () => {
  it("el tipo sale de la etiqueta de la planilla, sin importar tildes; uno desconocido es Otro", () => {
    expect(contactTypeFromLabel("Organismo publico")).toBe("publicAgency");
    expect(contactTypeFromLabel("PROVEEDOR")).toBe("supplier");
    expect(contactTypeFromLabel("Vecino")).toBe("other");
    expect(contactTypeFromLabel("  ")).toBe(null);
    expect(contactTypeLabel("bank")).toBe("Banco");
  });

  it("las etiquetas de teléfono en inglés pasan a español", () => {
    expect(phoneLabelEs("* Mobile")).toBe("Móvil");
    expect(phoneLabelEs("Work")).toBe("Trabajo");
    expect(phoneLabelEs("Personalizado")).toBe("Personalizado");
  });

  it("corrige el nombre solo si viene entero en mayúsculas o en minúsculas", () => {
    expect(fixNameCase("JUAN  DE LA CRUZ")).toBe("Juan de la Cruz");
    expect(fixNameCase("maría pérez")).toBe("María Pérez");
    expect(fixNameCase("Ejecutivo Banco BCI")).toBe("Ejecutivo Banco BCI");
  });

  it("limpia una fila: números normalizados y sin repetir, correos válidos en minúsculas", () => {
    const c = cleanIncoming({
      name: "ana pérez",
      company: "  Comercial   Los Robles ",
      companyRut: "76.543.210-1",
      phones: [{ number: "9 1234 5678", label: "* Mobile" }, { number: "+56912345678", label: "Casa" }, { number: "" }],
      emails: ["Ana@Robles.CL", "no-es-correo"],
      notes: "LLAMAR EN LA MAÑANA",
      source: "google",
    });
    expect(c).toEqual({
      name: "Ana Pérez",
      company: "Comercial Los Robles",
      companyRut: "76543210-1",
      contactType: null,
      department: "",
      role: "",
      phones: [{ number: "+56912345678", label: "Móvil" }],
      emails: ["ana@robles.cl"],
      notes: "Llamar en la mañana",
      source: "google",
    });
  });
});

const row = (data) => ({ source: "google", phones: [], emails: [], ...data });
const tel = (number, label = "") => ({ number, label });

describe("mergePhoneContact", () => {
  it("la planilla pisa los datos y el nombre; el nombre anterior queda en otherNames", () => {
    const existing = { id: "x", name: "Juanito Gasfiter", company: "Viejo", phones: [tel("+56911111111")], emails: [], sources: ["google"] };
    const merged = mergePhoneContact(existing, [cleanIncoming(row({ source: "sheet", name: "Juan Soto", company: "Gasfitería Soto", role: "Dueño", phones: [tel("911111111")] }))]);
    expect(merged.name).toBe("Juan Soto");
    expect(merged.otherNames).toEqual(["Juanito Gasfiter"]);
    expect(merged.company).toBe("Gasfitería Soto");
    expect(merged.role).toBe("Dueño");
    expect(merged.sources).toEqual(["google", "sheet"]);
  });

  it("Google y vCard solo llenan lo vacío", () => {
    const existing = { id: "x", name: "Juan Soto", company: "Gasfitería Soto", role: "", phones: [tel("+56911111111")], sources: ["sheet"] };
    const merged = mergePhoneContact(existing, [cleanIncoming(row({ name: "Juanito", company: "Otra", role: "Maestro", phones: [tel("911111111"), tel("922222222", "Casa")], emails: ["j@soto.cl"] }))]);
    expect(merged.name).toBe("Juan Soto");
    expect(merged.otherNames).toEqual(["Juanito"]);
    expect(merged.company).toBe("Gasfitería Soto");
    expect(merged.role).toBe("Maestro");
    expect(merged.phones).toEqual([tel("+56911111111"), tel("+56922222222", "Casa")]);
    expect(merged.emails).toEqual(["j@soto.cl"]);
  });

  it("un contacto nuevo toma el nombre de la planilla o, si no hay, el más largo", () => {
    const g1 = cleanIncoming(row({ name: "Pedro", phones: [tel("933333333")] }));
    const g2 = cleanIncoming(row({ name: "Pedro Rojas Tapia", phones: [tel("933333333")] }));
    expect(mergePhoneContact(null, [g1, g2]).name).toBe("Pedro Rojas Tapia");
    const s = cleanIncoming(row({ source: "sheet", name: "Pedro Rojas", phones: [tel("933333333")] }));
    const m = mergePhoneContact(null, [g2, s]);
    expect([m.name, m.otherNames]).toEqual(["Pedro Rojas", ["Pedro Rojas Tapia"]]);
  });
});

describe("planPhoneBookImport", () => {
  it("junta las filas que comparten un número, aunque los nombres difieran", () => {
    const plan = planPhoneBookImport([], [
      row({ name: "Ana", phones: [tel("+56 9 1111 1111")] }),
      row({ name: "Ana Pérez", phones: [tel("911111111"), tel("922222222")] }),
      row({ name: "Casa Ana", phones: [tel("+56922222222")] }),
      row({ name: "Beto", phones: [tel("933333333")] }),
    ]);
    expect(plan.create.map((c) => c.contact.name)).toEqual(["Ana Pérez", "Beto"]);
    const ana = plan.create[0].contact;
    expect(ana.otherNames).toEqual(["Ana", "Casa Ana"]);
    expect(ana.phones.map((p) => p.number)).toEqual(["+56911111111", "+56922222222"]);
    expect(plan.mergedGroups).toHaveLength(1);
    expect(plan.mergedGroups[0].rows).toHaveLength(3);
  });

  it("cruza contra lo existente: actualiza en vez de duplicar, y reimportar no cambia nada", () => {
    const existing = [{ id: "e1", name: "Ana Pérez", phones: [tel("+56911111111")], emails: [], sources: ["google"] }];
    const rows = [row({ name: "Ana", phones: [tel("911111111")], emails: ["ana@x.cl"] })];
    const plan = planPhoneBookImport(existing, rows);
    expect(plan.create).toHaveLength(0);
    expect(plan.update).toHaveLength(1);
    expect(plan.update[0].id).toBe("e1");
    expect(plan.update[0].changes).toEqual({ addedPhones: [], addedEmails: ["ana@x.cl"], addedNames: ["Ana"], fields: [] });

    const after = [{ id: "e1", ...plan.update[0].contact }];
    const again = planPhoneBookImport(after, rows);
    expect([again.create.length, again.update.length, again.unchanged]).toEqual([0, 0, 1]);
  });

  it("una fila sin teléfono se junta por correo; un correo no junta a dos contactos con teléfono", () => {
    const plan = planPhoneBookImport([], [
      row({ name: "Ventas Robles", phones: [tel("911111111")], emails: ["contacto@robles.cl"] }),
      row({ name: "Bodega Robles", phones: [tel("922222222")], emails: ["contacto@robles.cl"] }),
      row({ name: "Contacto Robles", emails: ["CONTACTO@robles.cl"] }),
    ]);
    expect(plan.create).toHaveLength(2);
    const ventas = plan.create.find((c) => c.contact.name === "Ventas Robles").contact;
    expect(ventas.otherNames).toEqual(["Contacto Robles"]);
  });

  it("sin teléfono ni correo, la fila no se importa", () => {
    const plan = planPhoneBookImport([], [row({ name: "Solo nombre", company: "X" })]);
    expect(plan.create).toHaveLength(0);
    expect(plan.skipped).toEqual([{ row: expect.objectContaining({ name: "Solo nombre" }), reason: "Sin teléfono ni correo" }]);
  });

  it("si una fila une a dos contactos existentes, se agrega al primero sin los números del otro y avisa", () => {
    const existing = [
      { id: "e1", name: "Ana", phones: [tel("+56911111111")], sources: ["google"] },
      { id: "e2", name: "Beto", phones: [tel("+56922222222")], sources: ["google"] },
    ];
    const plan = planPhoneBookImport(existing, [row({ source: "sheet", name: "Ana Pérez", phones: [tel("911111111"), tel("922222222"), tel("933333333")] })]);
    expect(plan.update).toHaveLength(1);
    expect(plan.update[0].id).toBe("e1");
    expect(plan.update[0].contact.phones.map((p) => p.number)).toEqual(["+56911111111", "+56933333333"]);
    expect(plan.warnings).toEqual([{ kind: "linksExisting", names: ["Ana", "Beto"], kept: "Ana" }]);
  });
});

describe("phoneContactMatches y displayName", () => {
  const c = { name: "Ana Pérez", otherNames: ["Anita"], company: "Comercial Los Robles", role: "Jefa de bodega", contactType: "supplier", phones: [tel("+56912345678")], emails: ["ana@robles.cl"] };

  it("busca por palabras sin tildes en nombres, empresa, cargo, tipo y correo", () => {
    expect(phoneContactMatches(c, "perez robles")).toBe(true);
    expect(phoneContactMatches(c, "anita")).toBe(true);
    expect(phoneContactMatches(c, "proveedor bodega")).toBe(true);
    expect(phoneContactMatches(c, "ana@robles")).toBe(true);
    expect(phoneContactMatches(c, "beto")).toBe(false);
  });

  it("busca dígitos dentro del número, en cualquier formato, desde 3", () => {
    expect(phoneContactMatches(c, "912345678")).toBe(true);
    expect(phoneContactMatches(c, "1234 5678")).toBe(true);
    expect(phoneContactMatches(c, "+56 9 1234")).toBe(true);
    expect(phoneContactMatches(c, "99")).toBe(false);
  });

  it("sin nombre se muestra la empresa o el número", () => {
    expect(displayName({ company: "Banco Estado" })).toBe("Banco Estado");
    expect(displayName({ phones: [tel("+56912345678")] })).toBe("+56 912345678");
  });
});

describe("filterPhoneContacts, groupByCompany y departmentOptions", () => {
  const list = [
    { id: "1", name: "Beto", company: "transportes del sur", contactType: "carrier", department: "Operaciones", sources: ["sheet"], phones: [] },
    { id: "2", name: "Ana", company: "Comercial Los Robles", contactType: "supplier", department: "Ventas", sources: ["sheet", "google"], phones: [] },
    { id: "3", name: "Caro", company: "", contactType: null, department: "", sources: ["google"], phones: [] },
    { id: "4", name: "Dani", company: "Transportes del Sur", contactType: "carrier", department: "operaciones", sources: ["vcard"], phones: [] },
  ];

  it("filtra por tipo (o sin tipo), departamento sin importar mayúsculas y origen, y ordena por nombre", () => {
    expect(filterPhoneContacts(list).map((c) => c.id)).toEqual(["2", "1", "3", "4"]);
    expect(filterPhoneContacts(list, { type: "carrier" }).map((c) => c.id)).toEqual(["1", "4"]);
    expect(filterPhoneContacts(list, { type: "none" }).map((c) => c.id)).toEqual(["3"]);
    expect(filterPhoneContacts(list, { department: "OPERACIONES" }).map((c) => c.id)).toEqual(["1", "4"]);
    expect(filterPhoneContacts(list, { source: "google" }).map((c) => c.id)).toEqual(["2", "3"]);
    expect(filterPhoneContacts(list, { search: "robles" }).map((c) => c.id)).toEqual(["2"]);
  });

  it("agrupa por empresa sin distinguir mayúsculas, con los que no tienen empresa al final", () => {
    const groups = groupByCompany(filterPhoneContacts(list));
    expect(groups.map((g) => [g.company, g.contacts.map((c) => c.id)])).toEqual([
      ["Comercial Los Robles", ["2"]],
      ["transportes del sur", ["1", "4"]],
      ["", ["3"]],
    ]);
  });

  it("los departamentos de la planilla más los que usa la agenda, sin repetir", () => {
    const opts = departmentOptions([...list, { department: "Bodega" }]);
    expect(opts).toContain("Bodega");
    expect(opts.filter((d) => d.toLowerCase() === "operaciones")).toEqual(["Operaciones"]);
    expect(departmentOptions(list, { inUse: true })).toEqual(["Operaciones", "Ventas"]);
  });
});

describe("phoneContactText", () => {
  it("arma el texto para compartir, sin las observaciones", () => {
    const c = {
      name: "Ana Pérez", company: "Comercial Los Robles", department: "Ventas", role: "Ejecutiva",
      phones: [{ number: "+56911111111", label: "Directo" }, { number: "+56223456789;ext=12", label: "" }],
      emails: ["ana@robles.cl"], notes: "No dar este número",
    };
    expect(phoneContactText(c)).toBe([
      "Ana Pérez",
      "Comercial Los Robles · Ventas · Ejecutiva",
      "Directo: +56 911111111",
      "Teléfono: +56 223456789 anexo 12",
      "Correo: ana@robles.cl",
    ].join("\n"));
  });

  it("sin nombre, la empresa es el título y no se repite", () => {
    expect(phoneContactText({ company: "Banco Estado", role: "Mesa central", phones: [{ number: "6002007000", label: "Directo" }] }))
      .toBe("Banco Estado\nMesa central\nDirecto: 600 200 7000");
  });
});
