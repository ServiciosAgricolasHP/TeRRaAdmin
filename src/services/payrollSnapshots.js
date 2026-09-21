// Ciclo de vida del snapshot inmutable de una nómina.
//
// El snapshot es el contrato que va a consumir el portal público de
// trabajadores, así que las tres operaciones que lo crean, lo borran y lo
// leen de vuelta importan más que el resto. Vivían sueltas dentro de
// `Payroll.jsx` y no se podían ejercitar sin montar la pantalla entera.
//
// Los `catch` silenciosos son deliberados y hay que conservarlos: el
// snapshot es un derivado, y que falle no puede tumbar la generación ni el
// borrado de la nómina, que son las operaciones que mueven la plata.
import { payrollSnapshotsService } from "./index";

// Devuelve `true` si quedó guardado. La nómina ya existe cuando esto corre,
// así que un fallo acá deja una nómina sin snapshot, no una nómina rota.
export async function saveSnapshot(payrollId, snapshot) {
  try {
    await payrollSnapshotsService.upsert(payrollId, snapshot);
    return true;
  } catch (err) {
    console.warn("No se pudo guardar el snapshot en payrollSnapshots:", err);
    return false;
  }
}

// Borrar una nómina que nunca llegó a tener snapshot tiene que funcionar
// igual, así que esto nunca tira.
export async function deleteSnapshot(payrollId) {
  try {
    await payrollSnapshotsService.remove(payrollId);
    return true;
  } catch {
    return false;
  }
}

// Lee el snapshot para volver a bajarlo. Cae al campo `snapshot` embebido en
// la nómina para las que se crearon antes de separar las colecciones.
// Devuelve `null` cuando no hay ninguno de los dos.
export async function readSnapshot(payroll) {
  if (!payroll?.id) return null;
  try {
    const doc = await payrollSnapshotsService.getById(payroll.id);
    if (doc) {
      // Sacar el `id` que inyecta Firestore: no es parte del contrato.
      const { id: _omit, ...rest } = doc;
      return rest;
    }
  } catch {
    /* se intenta el legacy */
  }
  if (payroll.snapshot) return { ...payroll.snapshot, payrollId: payroll.id };
  return null;
}
