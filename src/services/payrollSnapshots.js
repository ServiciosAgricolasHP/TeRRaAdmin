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

// Deja el snapshot alineado con una nómina que se achicó (se le sacó un ciclo o
// un trabajador). Sin esto el JSON —el que baja el botón 📥 y el que va a leer
// el portal de trabajadores— seguía mostrando a quien ya no está en la nómina,
// con su anticipo descontado, cobrando algo que no se le va a pagar.
//
// Recibe lo que ya quedó guardado en la nómina: los items, los agregados y,
// cuando corresponde, los ciclos que siguen y las jornadas que se soltaron.
// Igual que el resto del módulo, nunca tira.
export async function pruneSnapshot(payrollId, { items, aggregates, cycleIds = null, releasedWorkdayIds = [] }) {
  try {
    const snap = await payrollSnapshotsService.getById(payrollId);
    if (!snap) return false;
    const soltadas = new Set(releasedWorkdayIds);
    const anticipos = new Set((items || []).flatMap((it) => it.advanceIds || []));
    const patch = { workers: items };
    if (Array.isArray(snap.workdays)) patch.workdays = snap.workdays.filter((w) => !soltadas.has(w.id));
    if (Array.isArray(snap.advances)) patch.advances = snap.advances.filter((a) => anticipos.has(a.id));
    if (cycleIds && Array.isArray(snap.cycles)) {
      const siguen = new Set(cycleIds);
      patch.cycles = snap.cycles.filter((c) => siguen.has(c.id));
    }
    if (snap.payroll && aggregates) {
      patch.payroll = {
        ...snap.payroll,
        total: aggregates.total,
        bankTotal: aggregates.bankTotal,
        cashTotal: aggregates.cashTotal,
        workerCount: aggregates.workerCount,
        bankCount: aggregates.bankCount,
        cashCount: aggregates.cashCount,
        advanceTotal: aggregates.advanceTotal,
        bonusTotal: (items || []).reduce((s, it) => s + (Number(it.bonus) || 0), 0),
      };
    }
    await payrollSnapshotsService.update(payrollId, patch);
    return true;
  } catch (err) {
    console.warn("No se pudo alinear el snapshot con la nómina:", err);
    return false;
  }
}
