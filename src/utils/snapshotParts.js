// El JSON de una nómina se guarda en partes: la cabecera, con todo menos las
// jornadas, en `payrollSnapshots/{id}`, y las jornadas en
// `payrollSnapshotWorkdays/{id}__{n}`, de a lo que quepa en `PART_BYTES`. La
// cabecera dice cuántas partes tiene (`workdayParts`). Un JSON guardado entero
// en un documento (con `workdays` y sin `workdayParts`) se lee tal cual.
import { valueSize } from "./docSizes";

// Lo que lleva cada parte, lejos del límite de 1 MiB de un documento: unas
// 1.000 jornadas.
export const PART_BYTES = 600 * 1024;

export const SNAPSHOT_WORKDAYS = "payrollSnapshotWorkdays";

export const partIdOf = (payrollId, index) => `${payrollId}__${index}`;

// Las jornadas en partes de hasta `maxBytes`, en su orden. Una jornada que
// sola pasa el tope va en una parte para ella.
export function splitWorkdays(workdays, maxBytes = PART_BYTES) {
  const parts = [];
  let current = [];
  let bytes = 0;
  for (const wd of workdays || []) {
    const size = valueSize(wd);
    if (current.length && bytes + size > maxBytes) {
      parts.push(current);
      current = [];
      bytes = 0;
    }
    current.push(wd);
    bytes += size;
  }
  if (current.length) parts.push(current);
  return parts;
}

// La cabecera y las partes de un JSON armado.
export function splitSnapshot(snapshot, maxBytes = PART_BYTES) {
  const { workdays, workdayParts: _stored, ...rest } = snapshot || {};
  const parts = splitWorkdays(workdays, maxBytes);
  return { header: { ...rest, workdayParts: parts.length }, parts };
}

// Si la cabecera guarda las jornadas en partes.
export const isPartedSnapshot = (header) => Number.isInteger(header?.workdayParts);

// El JSON armado desde la cabecera y las jornadas de cada parte, en su orden.
// Una cabecera sin partes es un JSON entero y queda tal cual.
export function joinSnapshot(header, parts = []) {
  if (!isPartedSnapshot(header)) return { ...header };
  const { workdayParts: _count, ...rest } = header;
  return { ...rest, workdays: parts.flatMap((p) => p || []) };
}
