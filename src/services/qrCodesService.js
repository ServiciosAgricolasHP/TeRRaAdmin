// Asignación de códigos QR a los trabajadores y el padrón de cada prefijo, que
// lee la app de escaneo.
import { deleteField } from "firebase/firestore";
import { qrPrefixesService } from "./index";
import { workersService } from "./workersService";
import { codesOfWorker, codesToRelease, prefixOfCode } from "../utils/qrCodes";

// Deja `code` en manos de `toWorker`: se lo quita a quien lo tuviera y suelta
// el que esa persona ya tenía de la misma cosecha. Devuelve los códigos que
// quedaron libres, para informarlos.
export async function assignQrCode(code, toWorker, fromWorker) {
  const clean = String(code || "").trim().toUpperCase();
  if (!clean) throw new Error("El código es obligatorio");
  if (fromWorker && fromWorker.id === toWorker.id) return { released: [], code: clean };

  if (fromWorker) {
    await workersService.update(fromWorker.id, {
      idQr: codesOfWorker(fromWorker).filter((c) => c !== clean),
    });
  }
  const already = codesOfWorker(toWorker);
  const released = codesToRelease(already, clean);
  if (!already.includes(clean) || released.length) {
    await workersService.update(toWorker.id, {
      idQr: [...already.filter((c) => !released.includes(c)), ...(already.includes(clean) ? [] : [clean])],
    });
  }

  // El padrón se actualiza después de `worker`, y un fallo ahí no deshace la
  // asignación. La entrada del código se sobrescribe con el dueño nuevo.
  await syncPadron({
    assigned: [clean],
    released: [...released, ...(fromWorker ? [] : [])],
    worker: toWorker,
  });
  if (fromWorker) {
    await syncPadron({ assigned: [], released: [], worker: fromWorker });
  }

  return { released, code: clean };
}

// Espejo de código → trabajador dentro de `qrPrefixes/{PREFIJO}.padron`. La
// app de scan lo lee de una vez para resolver un QR sin señal: `idQr` guarda
// códigos completos y no hay consulta de trabajadores por prefijo.
//
// Es una caché, no la autoridad: quién tiene cada código lo dice
// `worker.idQr`. Si discrepan gana `worker`; "Reconstruir padrones" lo rehace
// y reporta las diferencias.
//
// Vive dentro del prefijo porque el prefijo es la cosecha: al liberar los QR
// de la temporada, el padrón se va con él.
async function syncPadron({ assigned = [], released = [], worker }) {
  const porPrefijo = new Map();
  const anotar = (code, valor) => {
    const pfx = prefixOfCode(code);
    if (!pfx) return;
    if (!porPrefijo.has(pfx)) porPrefijo.set(pfx, {});
    porPrefijo.get(pfx)[`padron.${code}`] = valor;
  };

  for (const c of released) anotar(c, deleteField());
  for (const c of assigned) {
    anotar(c, { rut: worker.id, name: worker.name || "" });
  }

  await Promise.all(
    [...porPrefijo.entries()].map(([pfx, patch]) =>
      qrPrefixesService.update(pfx, patch).catch((e) => {
        // Que falle el espejo no invalida la asignación, que ya quedó hecha en
        // `worker`. Se avisa y se sigue: el padrón se puede reconstruir.
        console.warn(`No se pudo actualizar el padrón de ${pfx}`, e);
      }),
    ),
  );
}
