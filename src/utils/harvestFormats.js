// Los formatos del archivo de cosecha que entrega una empresa. Cada uno vive
// en su archivo de `harvestFormats/` y traduce el archivo a la forma común que
// importa TeRRa (`utils/harvestImport.js`):
//
//   { name, week, period: { from, to }, status, defaultMeasure, sheets, rows, floors, warnings }
//
// - `defaultMeasure`: "units" (las unidades del envase) o "kilos", la cantidad
//   que se paga si no se elige otra.
// - `sheets`: `[{ sheet, species }]`, las cosechas del archivo cuando viene
//   una por hoja.
// - `rows`: una por persona, día y combo: `{ rut, name, contractor, sheet,
//   date, field, species, quality, container, kilos, units, companyPrice }`.
//   `companyPrice` es lo que paga la empresa, solo de referencia.
// - `floors`: `{ rut, name, date, amount, by, group, rule }`. `by` es
//   "container" (un piso por envase, con el envase del archivo en `group`),
//   "other" (por otra cosa) o null (el piso del día); `date` es null si el
//   archivo no dice de qué día es.
//
// Un formato es { id, label, matches(json), parse(json) }: `parse` devuelve
// `{ file }` o `{ error }` con un mensaje para la persona. Cuando una empresa
// cambia su archivo, se agrega un formato nuevo en vez de editar el que está
// en uso.
import { harvestLaguada } from "./harvestFormats/harvestLaguada";

export const HARVEST_FORMATS = [harvestLaguada];

// Lee un archivo de cosecha ya convertido de JSON: lo reconoce por su formato
// y lo traduce. El archivo devuelto lleva además `format` y `formatLabel`.
export function parseHarvestFile(json) {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return { error: "El archivo no es un JSON de cosecha." };
  }
  const format = HARVEST_FORMATS.find((f) => f.matches(json));
  if (!format) {
    return { error: `El archivo no es de un formato de cosecha que TeRRa conozca: ${HARVEST_FORMATS.map((f) => f.label).join(", ")}.` };
  }
  const parsed = format.parse(json);
  if (parsed.error) return parsed;
  return { file: { ...parsed.file, format: format.id, formatLabel: format.label } };
}
