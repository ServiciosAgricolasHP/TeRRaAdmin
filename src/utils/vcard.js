import { formatPhone, displayName } from "./phoneBook";

// Archivos de contactos vCard (.vcf), los que exportan los teléfonos y el
// correo. `parseVcards` lee las versiones 2.1, 3.0 y 4.0 y devuelve filas en
// la forma que entiende `planPhoneBookImport` (`utils/phoneBook.js`).
// `buildVcards` escribe la versión 3.0, la que leen todos.

// Une las líneas plegadas (las que empiezan con espacio o tabulación) y las
// que cortó el quoted-printable con un "=" al final.
function unfold(text) {
  const raw = text.replace(/\r\n|\r/g, "\n").split("\n");
  const lines = [];
  for (const line of raw) {
    const prev = lines[lines.length - 1];
    if (/^[ \t]/.test(line) && prev !== undefined) {
      lines[lines.length - 1] = prev + line.slice(1);
    } else if (prev !== undefined && /QUOTED-PRINTABLE/i.test(prev.split(":")[0]) && prev.endsWith("=")) {
      lines[lines.length - 1] = prev.slice(0, -1) + line;
    } else {
      lines.push(line);
    }
  }
  return lines;
}

function decodeQuotedPrintable(value, charset = "utf-8") {
  const bytes = [];
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === "=" && /^[0-9A-Fa-f]{2}$/.test(value.slice(i + 1, i + 3))) {
      bytes.push(parseInt(value.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(...new TextEncoder().encode(ch));
    }
  }
  try {
    return new TextDecoder(charset).decode(new Uint8Array(bytes));
  } catch {
    return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
  }
}

const unescapeValue = (v) => v.replace(/\\([\\;,nN])/g, (_, c) => (c === "n" || c === "N" ? "\n" : c));

// Separa por `;` sin cortar en un `\;` escapado.
const splitStructured = (v) => v.split(/(?<!\\);/).map(unescapeValue);

// Una línea `[grupo.]NOMBRE[;parámetros]:valor`.
function parseLine(line) {
  const colon = line.search(/:(?=(?:[^"]*"[^"]*")*[^"]*$)/);
  if (colon < 0) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const [nameWithGroup, ...paramParts] = head.split(";");
  const dot = nameWithGroup.lastIndexOf(".");
  const group = dot >= 0 ? nameWithGroup.slice(0, dot).toLowerCase() : "";
  const name = (dot >= 0 ? nameWithGroup.slice(dot + 1) : nameWithGroup).toUpperCase();
  const params = {};
  const types = [];
  for (const p of paramParts) {
    const eq = p.indexOf("=");
    if (eq < 0) {
      types.push(p.toUpperCase()); // 2.1: TEL;CELL;PREF
      continue;
    }
    const key = p.slice(0, eq).toUpperCase();
    const val = p.slice(eq + 1).replace(/^"|"$/g, "");
    if (key === "TYPE") types.push(...val.split(",").map((t) => t.toUpperCase()));
    else params[key] = val;
  }
  let text = value;
  if ((params.ENCODING || "").toUpperCase() === "QUOTED-PRINTABLE" || types.includes("QUOTED-PRINTABLE")) {
    text = decodeQuotedPrintable(value, params.CHARSET || "utf-8");
  }
  return { group, name, types, raw: text };
}

const TEL_TYPE_LABELS = { CELL: "Móvil", WORK: "Trabajo", HOME: "Casa", MAIN: "Principal", FAX: "Fax", OTHER: "Otro" };

function telLabel(types, groupLabel) {
  if (groupLabel) return groupLabel.replace(/^_\$!<(.+)>!\$_$/, "$1");
  for (const t of types) if (TEL_TYPE_LABELS[t]) return TEL_TYPE_LABELS[t];
  return "";
}

export function parseVcards(text, { file } = {}) {
  const rows = [];
  let card = null;
  unfold(text).forEach((line) => {
    const p = parseLine(line.trim());
    if (!p) return;
    if (p.name === "BEGIN" && /^VCARD$/i.test(p.raw.trim())) {
      card = { props: [], labels: {} };
      return;
    }
    if (!card) return;
    if (p.name === "END") {
      // `line` es el número del contacto dentro del archivo.
      rows.push(toRow(card, { file, line: rows.length + 1 }));
      card = null;
      return;
    }
    if (p.name === "X-ABLABEL" && p.group) card.labels[p.group] = unescapeValue(p.raw);
    else card.props.push(p);
  });
  return rows;
}

function toRow(card, { file, line }) {
  const get = (name) => card.props.find((p) => p.name === name);
  const fn = get("FN") ? unescapeValue(get("FN").raw).trim() : "";
  let name = fn;
  if (!name && get("N")) {
    const [family = "", given = "", additional = ""] = splitStructured(get("N").raw);
    name = [given, additional, family].map((s) => s.trim()).filter(Boolean).join(" ");
  }
  const [company = "", department = ""] = get("ORG") ? splitStructured(get("ORG").raw).map((s) => s.trim()) : [];
  const phones = card.props
    .filter((p) => p.name === "TEL")
    .map((p) => ({ number: unescapeValue(p.raw).replace(/^tel:/i, "").trim(), label: telLabel(p.types, card.labels[p.group]) }))
    .filter((p) => p.number);
  const emails = card.props.filter((p) => p.name === "EMAIL").map((p) => unescapeValue(p.raw).trim()).filter(Boolean);
  return {
    name,
    company,
    department,
    role: get("TITLE") ? unescapeValue(get("TITLE").raw).trim() : "",
    notes: get("NOTE") ? unescapeValue(get("NOTE").raw).trim() : "",
    phones,
    emails,
    source: "vcard",
    file,
    line,
  };
}

const escapeValue = (v) => String(v || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");

// Corta una línea larga en trozos de hasta 73 caracteres; los siguientes
// empiezan con un espacio. Corta por caracteres, sin partir una tilde ni un
// emoji.
function fold(line) {
  const chars = Array.from(line);
  if (chars.length <= 73) return line;
  const parts = [];
  for (let i = 0; i < chars.length; i += 73) parts.push((i ? " " : "") + chars.slice(i, i + 73).join(""));
  return parts.join("\r\n");
}

const LABEL_TO_TYPE = { "móvil": "CELL", movil: "CELL", celular: "CELL", trabajo: "WORK", casa: "HOME", principal: "MAIN", fax: "FAX" };

export function buildVcards(contacts) {
  const out = [];
  for (const c of contacts) {
    const name = displayName(c);
    const lines = ["BEGIN:VCARD", "VERSION:3.0", `FN:${escapeValue(name)}`, `N:;${escapeValue(name)};;;`];
    if (c.company || c.department) lines.push(`ORG:${escapeValue(c.company)};${escapeValue(c.department)}`);
    if (c.role) lines.push(`TITLE:${escapeValue(c.role)}`);
    for (const p of c.phones || []) {
      const type = LABEL_TO_TYPE[String(p.label || "").toLowerCase()] || "VOICE";
      // El anexo va como lo muestra la app: los teléfonos no entienden ";ext=".
      lines.push(`TEL;TYPE=${type}:${String(p.number).includes(";ext=") ? escapeValue(formatPhone(p.number)) : p.number}`);
    }
    for (const e of c.emails || []) lines.push(`EMAIL;TYPE=INTERNET:${e}`);
    if (c.notes) lines.push(`NOTE:${escapeValue(c.notes)}`);
    lines.push("END:VCARD");
    out.push(...lines.map(fold));
  }
  return out.join("\r\n") + (out.length ? "\r\n" : "");
}
