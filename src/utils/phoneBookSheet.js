import { normalizeSearchText } from "./textSearch";
import { contactTypeFromLabel, contactTypeLabel, formatPhone, displayName } from "./phoneBook";
import { formatRutForDisplay } from "./rutUtils";

// La planilla "Agenda telefónica" de las secretarias: una fila por persona,
// con estas columnas. Es también el formato en que la app descarga la agenda,
// para que se corrija y se vuelva a importar.
export const PHONE_BOOK_HEADERS = [
  "Empresa",
  "RUT empresa",
  "Tipo de contacto",
  "Departamento / área",
  "Nombre y apellido del contacto",
  "Cargo",
  "Teléfono directo",
  "Teléfono alternativo",
  "Correo electrónico",
  "Observaciones",
];

const norm = (v) => normalizeSearchText(v).replace(/\s+/g, " ").trim();

// Qué columna es cada dato, según su encabezado. Se prueba en orden: primero
// los nombres exactos y después los que contienen la palabra, así "RUT
// empresa" no se confunde con "Empresa".
const COLUMN_RULES = [
  ["companyRut", ["rut empresa", "rut"], ["rut"]],
  ["company", ["empresa", "compania", "razon social"], ["empresa"]],
  ["contactType", ["tipo de contacto", "tipo"], ["tipo"]],
  ["department", ["departamento / area", "departamento", "area"], ["departamento", "area"]],
  ["name", ["nombre y apellido del contacto", "nombre", "contacto"], ["nombre"]],
  ["role", ["cargo"], ["cargo"]],
  ["phone", ["telefono directo", "telefono", "celular"], ["directo"]],
  ["altPhone", ["telefono alternativo"], ["alternativo"]],
  ["email", ["correo electronico", "correo", "email", "e-mail"], ["correo", "mail"]],
  ["notes", ["observaciones", "notas"], ["observ", "nota"]],
];

function columnsOf(header) {
  const h = header.map(norm);
  const cols = {};
  const used = new Set();
  for (const pass of [1, 2]) {
    for (const [key, exact, contains] of COLUMN_RULES) {
      if (cols[key] !== undefined) continue;
      const idx = h.findIndex((x, i) => !used.has(i) && x && (pass === 1 ? exact.includes(x) : contains.some((w) => x.includes(w))));
      if (idx >= 0) { cols[key] = idx; used.add(idx); }
    }
  }
  return cols;
}

// Una celda con varios teléfonos o correos: separados por "/", ";", "," o un
// salto de línea.
const splitValues = (v) => String(v || "").split(/[/;,\n]+/).map((s) => s.trim()).filter(Boolean);

// Las filas de la hoja (arreglos de textos, la primera con los encabezados,
// que se busca entre las primeras 5) en la forma que entiende
// `planPhoneBookImport`. Las filas vacías se saltan.
export function mapSheetRows(rows, { file } = {}) {
  const headerIdx = rows.slice(0, 5).findIndex((r) => {
    const c = columnsOf(r);
    return c.name !== undefined && (c.phone !== undefined || c.email !== undefined);
  });
  if (headerIdx < 0) return { headerFound: false, rows: [] };
  const cols = columnsOf(rows[headerIdx]);
  const at = (r, key) => (cols[key] !== undefined ? String(r[cols[key]] ?? "").trim() : "");
  const out = [];
  rows.slice(headerIdx + 1).forEach((r, k) => {
    if (!r.some((v) => String(v ?? "").trim())) return;
    out.push({
      name: at(r, "name"),
      company: at(r, "company"),
      companyRut: at(r, "companyRut"),
      contactType: contactTypeFromLabel(at(r, "contactType")),
      department: at(r, "department"),
      role: at(r, "role"),
      phones: [
        ...splitValues(at(r, "phone")).map((number) => ({ number, label: "Directo" })),
        ...splitValues(at(r, "altPhone")).map((number) => ({ number, label: "Alternativo" })),
      ],
      emails: splitValues(at(r, "email")),
      notes: at(r, "notes"),
      source: "sheet",
      file,
      line: headerIdx + k + 2,
    });
  });
  return { headerFound: true, rows: out };
}

// Las filas para descargar la agenda en el formato de la planilla, ordenadas
// por empresa y nombre. El primer número va en "Teléfono directo" y los demás,
// como los correos, juntos y separados por " / ".
export function phoneBookSheetRows(contacts) {
  const sorted = [...contacts].sort(
    (a, b) => (a.company || "").localeCompare(b.company || "", "es", { sensitivity: "base" })
      || displayName(a).localeCompare(displayName(b), "es", { sensitivity: "base" }),
  );
  return sorted.map((c) => {
    const phones = (c.phones || []).map((p) => formatPhone(p.number));
    return [
      c.company || "",
      c.companyRut ? formatRutForDisplay(c.companyRut) : "",
      contactTypeLabel(c.contactType),
      c.department || "",
      c.name || "",
      c.role || "",
      phones[0] || "",
      phones.slice(1).join(" / "),
      (c.emails || []).join(" / "),
      c.notes || "",
    ];
  });
}

// Reescribe como relativas las rutas absolutas ("/xl/tables/table1.xml") de
// un archivo de relaciones del xlsx (`.rels`), que ExcelJS no sabe abrir.
// `relsPath` es la ruta del `.rels` dentro del zip: las rutas quedan
// relativas a la carpeta de la parte dueña de esas relaciones.
export function fixAbsoluteRelTargets(relsPath, xml) {
  const ownerDir = relsPath.replace(/_rels\/[^/]+$/, "").replace(/\/$/, "");
  const ownerParts = ownerDir ? ownerDir.split("/") : [];
  return xml.replace(/Target="\/([^"]+)"/g, (_, target) => {
    const targetParts = target.split("/");
    let common = 0;
    while (common < ownerParts.length && common < targetParts.length - 1 && ownerParts[common] === targetParts[common]) common++;
    const up = "../".repeat(ownerParts.length - common);
    return `Target="${up}${targetParts.slice(common).join("/")}"`;
  });
}
