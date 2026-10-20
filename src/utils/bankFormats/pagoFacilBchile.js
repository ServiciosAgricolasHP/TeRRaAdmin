// Formato PagoFácil de Banco de Chile: la planilla de transferencias que se
// sube al portal del banco.
import { ACCOUNT_TYPES } from "../banks";
import { normalizeRut } from "../rutUtils";

// Quita tildes y caracteres especiales (BChile solo acepta ASCII).
export function cleanText(text) {
  if (!text) return "";
  return String(text)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// RUT con el DV pegado, sin guion ni puntos. Si no tiene la forma esperada,
// devuelve el valor normalizado sin guiones ni puntos.
export function rutWithDvNoDash(rut) {
  const r = normalizeRut(rut);
  const m = r.match(/^(\d+)-([0-9KBH])$/);
  if (!m) return r.replace(/[-.]/g, "");
  return m[1] + m[2];
}

// Tipo de cuenta (0/1/3) → código BChile (CTD / JUV / JUV); JUV si no se reconoce.
export function bchileAccountTypeCode(accountTypeValue) {
  const v = Number(accountTypeValue);
  const found = ACCOUNT_TYPES.find((t) => t.value === v);
  return found?.code || "JUV";
}

// El banco rechaza las filas sin mail, así que las que no lo traen se
// completan con la casilla de remuneraciones.
export const BCHILE_DEFAULT_EMAIL = "remuneracionesis@gmail.com";

export const BCHILE_HEADERS = [
  "Rut Beneficiario *",
  "Nombre Beneficiario *",
  "Cuenta beneficiario *",
  "Cod Banco *",
  "Monto *",
  "Tipo de Cuenta *",
  "Identificador",
  "Descripcion del Pago",
  "Mail destinatario",
  "Campo Libre 1  (Glosa 1)",
  "Campo Libre 2 (Glosa 2)",
];

// Las filas que ingiere el portal del banco, como matriz de primitivos. Va
// aparte de la escritura en ExcelJS para probar sin el workbook las tres
// reglas que deciden a qué cuenta va la plata.
export function buildBchileRows(items = []) {
  // Cero-neto afuera (por ejemplo, quien liquida un anticipo con todo su
  // bruto): el banco no acepta transferencias de $0.
  // Orden alfabético por nombre para que el correlativo A001…A999 sea estable.
  const ordenados = items
    .filter((it) => Math.round(Number(it.amount) || 0) > 0)
    .sort((a, b) =>
      cleanText(a.name || "").localeCompare(cleanText(b.name || ""), "es", { sensitivity: "base" }),
    );

  return ordenados.map((it, idx) => [
    // `paymentRut` viene de bankDetails[0] (la cuenta destino del banco) y
    // puede diferir del RUT de la persona — p.ej. cuando el pago va a una
    // cuenta de un familiar. El portal de BChile lo valida contra la
    // titularidad de la cuenta, así que va paymentRut, y el RUT de la persona
    // solo si no hay paymentRut.
    rutWithDvNoDash(it.paymentRut || it.rut),
    cleanText(it.name),
    String(it.accountNumber || ""),
    String(it.bankCode || ""),
    Math.round(Number(it.amount) || 0),
    bchileAccountTypeCode(it.accountType),
    `A${String(idx + 1).padStart(3, "0")}`,
    "",
    it.email || BCHILE_DEFAULT_EMAIL,
    "",
    "",
  ]);
}

export const pagoFacilBchile = {
  id: "pagoFacilBchile",
  label: "PagoFácil Banco de Chile",
  sheetName: "Nomina",
  fileSuffix: "BChile",
  headers: BCHILE_HEADERS,
  columnWidths: [16, 30, 16, 16, 16, 16, 16, 16, 28, 16, 16],
  notes: [
    "Quien cobra $0 no va: el banco rechaza las transferencias de $0.",
    "El RUT es el de la cuenta de pago, con el dígito verificador pegado y sin puntos ni guion.",
    "El nombre va sin tildes ni signos, y ordenado alfabéticamente con un identificador A001, A002…",
    "Tipo de cuenta: CTD para cuenta corriente y JUV para cuenta vista o Cuenta RUT.",
    `Sin correo, va ${BCHILE_DEFAULT_EMAIL}: el banco rechaza las filas sin correo.`,
  ],
  buildRows: buildBchileRows,
};
