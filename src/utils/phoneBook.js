import { toProperName } from "./nameUtils";
import { normalizeRut } from "./rutUtils";
import { normalizeSearchText, matchesSearchQuery } from "./textSearch";
import { unshout } from "./textCase";

// Agenda telefónica (`phoneContacts`): números, tipos de contacto y las reglas
// para juntar lo que llega de la planilla de las secretarias, de Google, de
// Outlook y de archivos vCard.

export const CONTACT_TYPES = [
  { value: "client", label: "Cliente" },
  { value: "supplier", label: "Proveedor" },
  { value: "bank", label: "Banco" },
  { value: "carrier", label: "Transportista" },
  { value: "contractor", label: "Contratista" },
  { value: "advisor", label: "Asesor" },
  { value: "publicAgency", label: "Organismo público" },
  { value: "other", label: "Otro" },
];

// Las áreas de la lista desplegable de la planilla. El departamento se guarda
// como texto, así que una fila puede traer otra.
export const DEPARTMENTS = [
  "Administración",
  "Servicio técnico",
  "Rent a Car / Arriendo",
  "Cobranza",
  "Ventas",
  "Compras",
  "Repuestos",
  "Facturación",
  "Contabilidad",
  "Finanzas",
  "Operaciones",
  "Transporte",
  "Recursos humanos",
];

export const PHONE_SOURCES = {
  sheet: "Planilla",
  google: "Google",
  outlook: "Outlook",
  vcard: "vCard",
  manual: "A mano",
};

export function contactTypeLabel(value) {
  return CONTACT_TYPES.find((t) => t.value === value)?.label || "";
}

// El tipo a partir de su etiqueta en español (o de su valor). Un texto que no
// es ninguno cuenta como "Otro"; vacío, sin tipo.
export function contactTypeFromLabel(label) {
  const k = normalizeSearchText(label).trim();
  if (!k) return null;
  const hit = CONTACT_TYPES.find((t) => normalizeSearchText(t.label) === k || t.value.toLowerCase() === k);
  return hit ? hit.value : "other";
}

const EXTENSION_RE = /^(.*?)[\s,]*(?:anexo|anx\.?|ext\.?|extensi[oó]n|int\.?)\s*(\d+)\s*$/i;

// Número normalizado, que es también la clave para juntar contactos. Quedan
// los dígitos y el `+`, y `00` inicial pasa a `+`. Un número chileno de 9
// dígitos, o de 11 que empieza con 56, queda como `+56…`. Con `+` queda como
// viene; lo demás (8 dígitos, números raros) queda solo con sus dígitos. Un
// anexo va al final como `;ext=N`, así la central de una empresa con anexos
// distintos no junta a sus personas.
export function normalizePhone(raw) {
  let text = String(raw ?? "").trim();
  if (!text) return "";
  let ext = "";
  const m = text.match(EXTENSION_RE);
  if (m) {
    text = m[1];
    ext = m[2];
  }
  let s = text.replace(/[^\d+]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  const plus = s.startsWith("+");
  const digits = s.replace(/\+/g, "");
  if (!digits) return "";
  let number;
  if (plus) number = "+" + digits;
  else if (digits.length === 9) number = "+56" + digits;
  else if (digits.length === 11 && digits.startsWith("56")) number = "+" + digits;
  else number = digits;
  return ext ? `${number};ext=${ext}` : number;
}

// Cómo se muestra un número normalizado: `+56 9 1234 5678`, `+56 2 2345 6789`
// o `+56 72 234 5678`; el resto, como está. El anexo va como "anexo N".
export function formatPhone(number) {
  const [main, extPart] = String(number || "").split(";ext=");
  let shown = main;
  const cl = main.match(/^\+56(\d{9})$/);
  if (cl) {
    const d = cl[1];
    shown = d[0] === "9" || d[0] === "2"
      ? `+56 ${d[0]} ${d.slice(1, 5)} ${d.slice(5)}`
      : `+56 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5)}`;
  }
  return extPart ? `${shown} anexo ${extPart}` : shown;
}

// Etiquetas de teléfono en español: las de Google y Outlook vienen en inglés.
const PHONE_LABELS = { mobile: "Móvil", cell: "Móvil", home: "Casa", work: "Trabajo", main: "Principal", other: "Otro", business: "Trabajo", fax: "Fax" };

export function phoneLabelEs(label) {
  const clean = String(label || "").replace(/^\*\s*/, "").trim();
  return PHONE_LABELS[clean.toLowerCase()] || clean;
}

const collapse = (v) => String(v ?? "").replace(/\s+/g, " ").trim();

// Un nombre entero en mayúsculas o en minúsculas pasa a "Nombre Propio"; si
// trae mezcla, se respeta ("Banco BCI").
export function fixNameCase(name) {
  const n = collapse(name);
  if (!/\p{L}/u.test(n)) return n;
  if (n === n.toUpperCase() || n === n.toLowerCase()) return toProperName(n);
  return n;
}

const isEmail = (e) => /^[^\s@]+@[^\s@]+$/.test(e);

const uniqueBy = (items, keyOf) => {
  const seen = new Set();
  return items.filter((it) => {
    const k = keyOf(it);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

// Una fila de cualquier archivo, con los datos limpios: el nombre corregido,
// los números normalizados y sin repetir, los correos en minúsculas.
export function cleanIncoming(row) {
  const phones = uniqueBy(
    (row.phones || [])
      .map((p) => ({ number: normalizePhone(p.number), label: phoneLabelEs(p.label) }))
      .filter((p) => p.number),
    (p) => p.number,
  );
  const emails = uniqueBy(
    (row.emails || []).map((e) => collapse(e).toLowerCase()).filter(isEmail),
    (e) => e,
  );
  return {
    name: fixNameCase(row.name),
    company: collapse(row.company),
    companyRut: row.companyRut ? normalizeRut(collapse(row.companyRut)) : "",
    contactType: row.contactType || null,
    department: collapse(row.department),
    role: collapse(row.role),
    phones,
    emails,
    notes: unshout(String(row.notes || "").trim()),
    source: row.source || "manual",
  };
}

export const phoneKeysOf = (c) => (c.phones || []).map((p) => normalizePhone(p.number)).filter(Boolean);
const emailsOf = (c) => (c.emails || []).map((e) => String(e).trim().toLowerCase()).filter(Boolean);
const nameKey = (n) => normalizeSearchText(n).replace(/\s+/g, " ").trim();

// Cómo se nombra un contacto en las listas: el nombre, o la empresa, o su
// primer número.
export function displayName(c) {
  return c.name || c.company || (c.phones?.[0] ? formatPhone(c.phones[0].number) : "") || c.emails?.[0] || "(sin nombre)";
}

const TEXT_FIELDS = ["company", "companyRut", "contactType", "department", "role", "notes"];

export function emptyPhoneContact() {
  return {
    name: "",
    otherNames: [],
    company: "",
    companyRut: "",
    contactType: null,
    department: "",
    role: "",
    phones: [],
    emails: [],
    notes: "",
    sources: [],
  };
}

// Solo los campos que se guardan, en un orden fijo, para comparar y escribir.
export function phoneContactFields(c) {
  const base = emptyPhoneContact();
  const out = {};
  for (const k of Object.keys(base)) out[k] = c?.[k] ?? base[k];
  out.otherNames = [...(out.otherNames || [])];
  out.phones = (out.phones || []).map((p) => ({ number: p.number, label: p.label || "" }));
  out.emails = [...(out.emails || [])];
  out.sources = [...(out.sources || [])];
  return out;
}

// Junta en `base` (un contacto existente, o nada si es nuevo) las filas que
// llegaron para él. La planilla manda: su nombre y sus datos pisan lo que hay
// (el nombre anterior queda en `otherNames`). Google, Outlook y vCard solo
// llenan lo vacío. Teléfonos, correos, nombres y orígenes se suman sin
// repetir. `blockedKeys` son números de otros contactos existentes, que no se
// agregan a este.
export function mergePhoneContact(base, rows, { blockedKeys = new Set() } = {}) {
  const out = phoneContactFields(base || emptyPhoneContact());
  const sheetRows = rows.filter((r) => r.source === "sheet");
  const otherRows = rows.filter((r) => r.source !== "sheet");
  const ordered = [...sheetRows, ...otherRows];

  const sheetName = sheetRows.find((r) => r.name)?.name;
  const previousName = out.name;
  if (sheetName) out.name = sheetName;
  else if (!out.name) {
    // El más largo, entre las filas que traen teléfono si hay alguna: una
    // fila que llegó solo por su correo no le pone el nombre al contacto.
    const withPhone = ordered.filter((r) => r.phones?.length);
    out.name = (withPhone.length ? withPhone : ordered)
      .map((r) => r.name).filter(Boolean).sort((a, b) => b.length - a.length)[0] || "";
  }
  out.otherNames = uniqueBy(
    [...out.otherNames, previousName, ...ordered.map((r) => r.name)].filter(Boolean),
    nameKey,
  ).filter((n) => nameKey(n) !== nameKey(out.name));

  for (const f of TEXT_FIELDS) {
    const fromSheet = sheetRows.map((r) => r[f]).find(Boolean);
    if (fromSheet) out[f] = fromSheet;
    else if (!out[f]) out[f] = otherRows.map((r) => r[f]).find(Boolean) || out[f];
  }

  const seen = new Set(out.phones.map((p) => normalizePhone(p.number)));
  for (const r of ordered) {
    for (const p of r.phones || []) {
      const k = normalizePhone(p.number);
      if (!k || seen.has(k) || blockedKeys.has(k)) continue;
      seen.add(k);
      out.phones.push({ number: k, label: p.label || "" });
    }
  }
  out.emails = uniqueBy([...out.emails, ...ordered.flatMap((r) => r.emails || [])], (e) => e.toLowerCase());
  out.sources = uniqueBy([...out.sources, ...ordered.map((r) => r.source)].filter(Boolean), (s) => s);
  return out;
}

// Si una importación no le cambia nada a un contacto. El origen no cuenta:
// descargar la agenda y volver a importarla no es un cambio, aunque sus
// contactos de Google pasen por la planilla.
const sameContact = (a, b) => {
  const { sources: _a, ...restA } = phoneContactFields(a);
  const { sources: _b, ...restB } = phoneContactFields(b);
  return JSON.stringify(restA) === JSON.stringify(restB);
};

const FIELD_LABELS = {
  name: "nombre",
  company: "empresa",
  companyRut: "RUT empresa",
  contactType: "tipo",
  department: "departamento",
  role: "cargo",
  notes: "observaciones",
};

// Lo que una importación le agrega o le cambia a un contacto existente.
export function phoneContactChanges(before, after) {
  const b = phoneContactFields(before);
  const a = phoneContactFields(after);
  const prevPhones = new Set(b.phones.map((p) => p.number));
  const prevEmails = new Set(b.emails);
  const prevNames = new Set([b.name, ...b.otherNames].map(nameKey));
  return {
    addedPhones: a.phones.filter((p) => !prevPhones.has(p.number)).map((p) => p.number),
    addedEmails: a.emails.filter((e) => !prevEmails.has(e)),
    addedNames: [a.name, ...a.otherNames].filter((n) => !prevNames.has(nameKey(n))),
    fields: Object.keys(FIELD_LABELS).filter((k) => k !== "name" && (a[k] || "") !== (b[k] || "")).map((k) => FIELD_LABELS[k]),
  };
}

// Plan de importación: qué se crea, qué se actualiza y qué no se toca, sin
// escribir nada.
//
// - Las filas (y los contactos existentes) que comparten un número son el
//   mismo contacto, aunque los nombres difieran.
// - Una fila sin teléfono se junta con el contacto que tiene su correo. Un
//   correo no junta a dos contactos que tienen teléfono: un correo genérico de
//   empresa lo comparten varias personas.
// - Una fila sin teléfono ni correo no se importa.
// - Si las filas unen a dos contactos existentes, no se fusionan: se agregan
//   al primero, sin los números del otro, y queda un aviso.
export function planPhoneBookImport(existing = [], rows = []) {
  const skipped = [];
  const incoming = [];
  for (const row of rows) {
    const c = cleanIncoming(row);
    if (!c.phones.length && !c.emails.length) {
      skipped.push({ row, reason: "Sin teléfono ni correo" });
      continue;
    }
    incoming.push({ ...c, file: row.file, line: row.line });
  }

  const items = [
    ...existing.map((c) => ({ c, existing: true })),
    ...incoming.map((c) => ({ c, existing: false })),
  ];
  const parent = items.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    // La raíz queda en el índice menor: los existentes van primero.
    if (ra < rb) parent[rb] = ra;
    else parent[ra] = rb;
  };

  const byPhone = new Map();
  items.forEach((it, i) => {
    for (const k of phoneKeysOf(it.c)) {
      if (byPhone.has(k)) union(i, byPhone.get(k));
      else byPhone.set(k, i);
    }
  });
  const byEmail = new Map();
  items.forEach((it, i) => {
    for (const e of emailsOf(it.c)) if (!byEmail.has(e)) byEmail.set(e, i);
  });
  items.forEach((it, i) => {
    if (it.existing || phoneKeysOf(it.c).length) return;
    for (const e of emailsOf(it.c)) union(i, byEmail.get(e));
  });

  const groups = new Map();
  items.forEach((it, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(it);
  });

  const create = [];
  const update = [];
  const mergedGroups = [];
  const warnings = [];
  let unchanged = 0;
  for (const members of groups.values()) {
    const fromFiles = members.filter((m) => !m.existing).map((m) => m.c);
    if (!fromFiles.length) continue;
    const found = members.filter((m) => m.existing).map((m) => m.c);
    if (!found.length) {
      const contact = mergePhoneContact(null, fromFiles);
      create.push({ contact, rows: fromFiles });
      if (fromFiles.length > 1) mergedGroups.push({ contact, rows: fromFiles });
      continue;
    }
    const [target, ...others] = found;
    if (others.length) {
      warnings.push({ kind: "linksExisting", names: found.map(displayName), kept: displayName(target) });
    }
    const blockedKeys = new Set(others.flatMap(phoneKeysOf));
    const contact = mergePhoneContact(target, fromFiles, { blockedKeys });
    if (fromFiles.length > 1) mergedGroups.push({ contact, rows: fromFiles });
    if (sameContact(target, contact)) unchanged += 1;
    else update.push({ id: target.id, before: target, contact, changes: phoneContactChanges(target, contact), rows: fromFiles });
  }
  const byDisplay = (a, b) => displayName(a.contact).localeCompare(displayName(b.contact), "es", { sensitivity: "base" });
  create.sort(byDisplay);
  update.sort(byDisplay);
  return { create, update, unchanged, skipped, mergedGroups, warnings };
}

// Si el contacto calza con lo buscado. Cada palabra tiene que aparecer, en
// cualquier orden y sin importar tildes, en el nombre, los otros nombres, la
// empresa, el departamento, el cargo, el tipo, los correos o las
// observaciones. Lo escrito solo con dígitos, espacios, `+`, guiones o
// paréntesis se busca además dentro de los números, desde 3 dígitos.
export function phoneContactMatches(c, query) {
  const q = String(query || "").trim();
  if (!q) return true;
  const text = [
    c.name, ...(c.otherNames || []), c.company, c.department, c.role,
    contactTypeLabel(c.contactType), ...(c.emails || []), c.notes,
  ].join(" ");
  if (matchesSearchQuery(text, q)) return true;
  if (!/^[\d\s+\-().]+$/.test(q)) return false;
  const digits = q.replace(/\D/g, "");
  if (digits.length < 3) return false;
  return (c.phones || []).some((p) => String(p.number).replace(/\D/g, "").includes(digits));
}
