import { normalizeSearchText } from "./textSearch";

// Contactos exportados del correo en CSV: Google Contacts (el formato actual y
// el antiguo) y Outlook, en inglés o en español. Devuelve filas en la forma
// que entiende `planPhoneBookImport` (`utils/phoneBook.js`).

// Texto de un archivo: UTF-8, o Windows-1252 si UTF-8 deja caracteres
// inválidos (Outlook en Windows exporta así).
const BOM = String.fromCharCode(0xfeff);
const REPLACEMENT_CHAR = String.fromCharCode(0xfffd);

export function decodeCsvBytes(bytes) {
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  const text = utf8.includes(REPLACEMENT_CHAR) ? new TextDecoder("windows-1252").decode(bytes) : utf8;
  return text.startsWith(BOM) ? text.slice(1) : text;
}

// CSV según RFC 4180: comillas dobles, comillas escapadas ("") y saltos de
// línea dentro de una celda. El separador es la coma, o el punto y coma si la
// primera línea trae más de esos (Excel en español).
export function parseCsv(text) {
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ";" : ",";
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const norm = (h) => normalizeSearchText(h).replace(/\s+/g, " ").trim();

// Google separa varios valores de una misma celda con " ::: ".
const splitMulti = (v) => String(v || "").split(":::").map((s) => s.trim()).filter(Boolean);

const NAME_PARTS = [
  ["first name", "given name", "nombre"],
  ["middle name", "additional name", "segundo nombre"],
  ["last name", "family name", "apellidos", "apellido"],
];
const FULL_NAME = ["name", "nombre completo", "display name"];
const COMPANY = ["organization name", "organization 1 - name", "company", "organizacion", "compania", "empresa"];
const TITLE = ["organization title", "organization 1 - title", "job title", "puesto", "cargo"];
const DEPARTMENT = ["organization department", "organization 1 - department", "department", "departamento"];
const NOTES = ["notes", "notas"];

const isPhoneHeader = (h) => /(phone|telefono|movil|celular)/.test(h) && !/(fax|type|label|tipo|etiqueta)/.test(h);
const isEmailHeader = (h) => /(e-?mail|correo)/.test(h) && !/(type|label|tipo|etiqueta|display|mostrar)/.test(h);

// Formato del archivo según sus encabezados: "google" si trae las columnas
// "Phone N - Value", "outlook" si trae otras columnas de teléfono o correo, o
// null si no parece un archivo de contactos.
export function detectContactsCsv(header) {
  const h = header.map(norm);
  if (h.some((x) => /^phone \d+ - value$/.test(x))) return "google";
  if (h.some(isPhoneHeader) || h.some(isEmailHeader)) return "outlook";
  return null;
}

export function mapContactsCsv(rows, { file } = {}) {
  if (!rows.length) return { format: null, rows: [] };
  const [header, ...data] = rows;
  const format = detectContactsCsv(header);
  if (!format) return { format: null, rows: [] };
  const h = header.map(norm);
  const col = (names) => h.findIndex((x) => names.includes(x));
  const nameCols = NAME_PARTS.map(col);
  const fullCol = col(FULL_NAME);
  const companyCol = col(COMPANY);
  const titleCol = col(TITLE);
  const deptCol = col(DEPARTMENT);
  const notesCol = col(NOTES);

  // Teléfonos y correos: en Google, cada "Value" con su "Label" (o "Type");
  // en Outlook, cada columna es un número y su encabezado es la etiqueta.
  const phoneCols = [];
  const emailCols = [];
  if (format === "google") {
    h.forEach((x, i) => {
      const m = x.match(/^(phone|e-mail) (\d+) - value$/);
      if (!m) return;
      const labelIdx = h.findIndex((y) => y === `${m[1]} ${m[2]} - label` || y === `${m[1]} ${m[2]} - type`);
      (m[1] === "phone" ? phoneCols : emailCols).push({ i, labelIdx });
    });
  } else {
    h.forEach((x, i) => {
      if (isPhoneHeader(x)) phoneCols.push({ i, label: header[i].trim() });
      else if (isEmailHeader(x)) emailCols.push({ i });
    });
  }

  const at = (r, i) => (i >= 0 ? String(r[i] ?? "").trim() : "");
  const out = data.map((r, idx) => {
    const parts = nameCols.map((i) => at(r, i)).filter(Boolean);
    const name = parts.length ? parts.join(" ") : at(r, fullCol);
    const phones = phoneCols.flatMap(({ i, labelIdx, label }) => {
      const values = splitMulti(at(r, i));
      const labels = labelIdx >= 0 ? splitMulti(at(r, labelIdx)) : [];
      return values.map((number, k) => ({ number, label: label ?? labels[k] ?? labels[0] ?? "" }));
    });
    const emails = emailCols.flatMap(({ i }) => splitMulti(at(r, i)));
    return {
      name,
      company: at(r, companyCol),
      role: at(r, titleCol),
      department: at(r, deptCol),
      notes: at(r, notesCol),
      phones,
      emails,
      source: format,
      file,
      line: idx + 2,
    };
  });
  return { format, rows: out };
}
