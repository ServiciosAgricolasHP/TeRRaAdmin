import { describe, it, expect } from "vitest";
import { importPhoneContacts, listPhoneContacts } from "../../src/services/phoneContactsService";
import { planPhoneBookImport } from "../../src/utils/phoneBook";
import { decodeCsvBytes, parseCsv, mapContactsCsv } from "../../src/utils/contactsCsv";
import { mapSheetRows, PHONE_BOOK_HEADERS } from "../../src/utils/phoneBookSheet";
import { all } from "./helpers/seed";

// Ciclo completo de la agenda telefónica: archivo → filas → plan → Firestore,
// como lo hace la pantalla de importación.

const GOOGLE_HEADER = "First Name,Middle Name,Last Name,Organization Name,Labels,E-mail 1 - Label,E-mail 1 - Value,Phone 1 - Label,Phone 1 - Value,Phone 2 - Label,Phone 2 - Value";
const googleCsv = (lines) => new TextEncoder().encode([GOOGLE_HEADER, ...lines].join("\n"));

const GOOGLE = googleCsv([
  "Ana,,Pérez,,* myContacts,,,Mobile,+56 9 1111 1111,,",
  "Anita,,,,* myContacts,,,Mobile,911111111,Home,22345 6789",
  "Beto,,Soto,,* myContacts,* Work,beto@sur.cl,Mobile,933333333,,",
]);

const SHEET = [
  PHONE_BOOK_HEADERS,
  ["Transportes del Sur", "77.111.222-3", "Transportista", "Operaciones", "Roberto Soto", "Jefe de flota", "+56 9 3333 3333", "", "", "Llamar antes de las 18"],
];

async function importar(rows) {
  const existing = await listPhoneContacts();
  const plan = planPhoneBookImport(existing, rows);
  const res = await importPhoneContacts(plan, { files: ["prueba"] });
  return { plan, res };
}

const googleRows = () => mapContactsCsv(parseCsv(decodeCsvBytes(GOOGLE)), { file: "contacts.csv" }).rows;

describe("importar la agenda", () => {
  it("crea un contacto por número, junta las copias y deja un solo log", async () => {
    const { plan, res } = await importar(googleRows());
    expect([res.created, res.updated, plan.mergedGroups.length]).toEqual([2, 0, 1]);

    const docs = await all("phoneContacts");
    expect(docs).toHaveLength(2);
    const ana = docs.find((d) => d.name === "Ana Pérez");
    expect(ana.otherNames).toEqual(["Anita"]);
    expect(ana.phones).toEqual([
      { number: "+56911111111", label: "Móvil" },
      { number: "+56223456789", label: "Casa" },
    ]);
    expect(ana.sources).toEqual(["google"]);

    const logs = await all("logs");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ action: "import", entity: "phoneContact", meta: { created: 2, updated: 0, sources: ["google"], files: ["prueba"] } });
  });

  it("reimportar el mismo archivo no escribe nada nuevo", async () => {
    await importar(googleRows());
    const { plan, res } = await importar(googleRows());
    expect([res.created, res.updated, plan.unchanged]).toEqual([0, 0, 2]);
    expect(await all("phoneContacts")).toHaveLength(2);
  });

  it("la planilla actualiza al contacto que tiene su número y pisa sus datos", async () => {
    await importar(googleRows());
    const { res } = await importar(mapSheetRows(SHEET, { file: "agenda.xlsx" }).rows);
    expect([res.created, res.updated]).toEqual([0, 1]);

    const docs = await all("phoneContacts");
    expect(docs).toHaveLength(2);
    const beto = docs.find((d) => d.phones.some((p) => p.number === "+56933333333"));
    expect(beto).toMatchObject({
      name: "Roberto Soto",
      otherNames: ["Beto Soto"],
      company: "Transportes del Sur",
      companyRut: "77111222-3",
      contactType: "carrier",
      department: "Operaciones",
      role: "Jefe de flota",
      emails: ["beto@sur.cl"],
      notes: "Llamar antes de las 18",
      sources: ["google", "sheet"],
    });
  });

  it("la lista en caché incluye lo importado sin volver a leer", async () => {
    await listPhoneContacts();
    await importar(googleRows());
    const cached = await listPhoneContacts();
    expect(cached.map((c) => c.name).sort()).toEqual(["Ana Pérez", "Beto Soto"]);
  });
});
