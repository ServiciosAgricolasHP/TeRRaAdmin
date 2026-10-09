// Importación de trabajadores desde un CSV (RUT;Nombre;APELLIDO;APELLIDO2;CORREO;BANCO;TIPOCUENTA;N_CUENTA).
import { ACCOUNT_TYPE_RUT, DEFAULT_BANK_CODE } from "./banks";
import { normalizeRut, validateRut } from "./rutUtils";

export const DEFAULT_EMAIL = "remuneracionesis@gmail.com";

const BANK_NAME_TO_CODE = {
  "BANCO DEL ESTADO DE CHILE": "012",
  "BANCO DE CHILE / BANCO A. EDWARDS / CREDICHILE / CITYBANK": "001",
  "BANCO DE CHILE": "001",
  "BANCO SANTANDER - SANTIAGO / BANCO SANTANDER / BANEFE": "037",
  "BANCO SANTANDER": "037",
  "BANCO DE CRÉDITO E INVERSIONES / TBANC": "016",
  "BANCO DE CREDITO E INVERSIONES / TBANC": "016",
  "BANCO BICE": "028",
  "BANCO FALABELLA": "051",
  "BANCO RIPLEY": "053",
  "SCOTIABANK / SUD - AMERICANO": "014",
  "TEMPO": "730",
  "MERCADOLIBRE": "875",
  "MERCADOLIBRE.COM": "875",
};

const ACCOUNT_TYPE_BY_LABEL = {
  "CUENTA RUT": 3,
  "CTA CORRIENTE / CTA VISTA OTROS BANCOS": 0,
  "CTA CORRIENTE": 0,
  "CTA VISTA": 1,
  "CHEQUERA ELECTRÓNICA": 1,
  "CHEQUERA ELECTRONICA": 1,
};

export function bankCodeFromCsv(name) {
  if (!name) return DEFAULT_BANK_CODE;
  const key = String(name).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
  return BANK_NAME_TO_CODE[key] || BANK_NAME_TO_CODE[String(name).toUpperCase().trim()] || DEFAULT_BANK_CODE;
}

export function accountTypeFromCsv(label) {
  if (!label) return ACCOUNT_TYPE_RUT;
  const key = String(label).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
  if (ACCOUNT_TYPE_BY_LABEL[key] != null) return ACCOUNT_TYPE_BY_LABEL[key];
  return ACCOUNT_TYPE_RUT;
}

// Une las partes en "Nombres Propios", sin tildes y sin caracteres que no sean letras.
export function normalizeName(...parts) {
  const raw = parts.filter(Boolean).map((p) => String(p)).join(" ");
  const noAccents = raw.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const cleaned = noAccents.replace(/[^A-Za-z\sñÑ]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned
    .toLowerCase()
    .split(" ")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export function normalizeEmail(email) {
  const e = String(email || "").trim();
  if (!e) return DEFAULT_EMAIL;
  return e;
}

// Lee el CSV separado por ";": la primera línea es el encabezado y cada una de
// las siguientes, un trabajador. No admite campos entre comillas.
export function parseCsv(text) {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { header: [], rows: [] };
  const header = lines[0].split(";").map((s) => s.trim());
  const rows = lines.slice(1).map((line) => {
    const cols = line.split(";");
    return {
      rut: (cols[0] || "").trim(),
      nombre: (cols[1] || "").trim(),
      apellido: (cols[2] || "").trim(),
      apellido2: (cols[3] || "").trim(),
      correo: (cols[4] || "").trim(),
      banco: (cols[5] || "").trim(),
      tipoCuenta: (cols[6] || "").trim(),
      nCuenta: (cols[7] || "").trim(),
    };
  });
  return { header, rows };
}

// Arma el payload del trabajador para crearlo o actualizarlo. Devuelve
// { error } si el RUT no es válido o el nombre queda vacío.
// existing: el doc actual en Firestore, o null si no existe.
export function buildWorkerPatch(row, existing) {
  const rut = normalizeRut(row.rut);
  if (!validateRut(rut)) return { error: `RUT inválido: ${row.rut}` };
  const fullName = normalizeName(row.nombre, row.apellido, row.apellido2);
  if (!fullName) return { error: `Nombre vacío para ${rut}` };
  const email = normalizeEmail(row.correo);

  if (existing) {
    // A un trabajador existente solo se le actualizan nombre y correo.
    const patch = { name: fullName, email };
    return { rut, mode: "update", patch };
  }

  // Trabajador nuevo: se crea con todos los datos, incluidos los bancarios.
  const accountType = accountTypeFromCsv(row.tipoCuenta);
  const bankCode = bankCodeFromCsv(row.banco);
  const accountNumber =
    accountType === ACCOUNT_TYPE_RUT
      ? rutWithoutDvLocal(rut)
      : (row.nCuenta || "").replace(/\s+/g, "");
  const paymentRut = rut;
  const bankDetails = [paymentRut, accountNumber, accountType, bankCode];

  return {
    rut,
    mode: "create",
    payload: { rut, name: fullName, email, bankDetails, groupLeader: [], idQr: [] },
  };
}

// RUT sin dígito verificador; misma lógica que `rutWithoutDv` de banks.js.
function rutWithoutDvLocal(rut) {
  if (!rut) return "";
  const [num] = String(rut).split("-");
  return num || "";
}
