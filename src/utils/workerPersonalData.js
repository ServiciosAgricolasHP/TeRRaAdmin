// Datos personales de un trabajador que piden los contratos y las boletas de
// honorarios: dirección, comuna, nacionalidad, estado civil, fecha de
// nacimiento, AFP y salud. Viven en el documento del trabajador (`worker`).

export const PERSONAL_DATA_FIELDS = [
  "address",
  "commune",
  "nationality",
  "maritalStatus",
  "birthDate",
  "pensionFund",
  "healthInsurance",
];

export const MARITAL_STATUSES = {
  single: "Soltero(a)",
  married: "Casado(a)",
  civilUnion: "Conviviente civil",
  divorced: "Divorciado(a)",
  widowed: "Viudo(a)",
};

export const PENSION_FUNDS = ["Capital", "Cuprum", "Habitat", "Modelo", "PlanVital", "Provida", "Uno"];

export const HEALTH_INSURERS = ["Fonasa", "Banmédica", "Colmena", "Consalud", "Cruz Blanca", "Esencial", "Nueva Masvida", "Vida Tres"];

export const NATIONALITIES = ["Chilena", "Venezolana", "Haitiana", "Colombiana", "Peruana", "Boliviana", "Argentina"];

// Los campos del formulario a partir del trabajador: vacíos si no los tiene.
export function personalDataOf(worker) {
  return Object.fromEntries(PERSONAL_DATA_FIELDS.map((k) => [k, String(worker?.[k] ?? "")]));
}

// Lo que se guarda: cada campo sin espacios en los bordes. Una fecha de
// nacimiento que no es `YYYY-MM-DD` queda vacía.
export function personalDataPatch(form) {
  const out = Object.fromEntries(PERSONAL_DATA_FIELDS.map((k) => [k, String(form?.[k] ?? "").trim()]));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(out.birthDate)) out.birthDate = "";
  if (!MARITAL_STATUSES[out.maritalStatus]) out.maritalStatus = "";
  return out;
}

// Cuántos de los datos personales están llenos.
export const personalDataCount = (data) => PERSONAL_DATA_FIELDS.filter((k) => String(data?.[k] ?? "").trim()).length;
