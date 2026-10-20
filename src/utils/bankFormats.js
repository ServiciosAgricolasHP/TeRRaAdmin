// Los formatos del archivo de transferencias que acepta cada banco. Cada uno
// vive en su archivo de `bankFormats/` y la nómina usa el que diga la
// configuración (`payrollConfig/main.bankFormat`).
//
// Un formato es { id, label, sheetName, fileSuffix, headers, columnWidths,
// buildRows }: `buildRows(items)` arma las filas de la hoja, una por
// transferencia, con tantas columnas como `headers`.
import { pagoFacilBchile } from "./bankFormats/pagoFacilBchile";

export const BANK_FORMATS = [pagoFacilBchile];

export const DEFAULT_BANK_FORMAT_ID = pagoFacilBchile.id;

// El formato con ese id; si no existe, el de por defecto.
export function bankFormatOf(id) {
  return BANK_FORMATS.find((f) => f.id === id) || BANK_FORMATS.find((f) => f.id === DEFAULT_BANK_FORMAT_ID);
}
