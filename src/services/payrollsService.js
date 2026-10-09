import { doc, serverTimestamp, updateDoc, writeBatch } from "firebase/firestore";
import { db, auth } from "../firebase";
import { createService } from "./firestoreBase";
import { workdaysService, listWorkdaysByCycles } from "./index";
import { isCashBank } from "../utils/banks";
import {
  restoreAdvancesFromPayroll,
  readPayrollApplications,
  setPayrollAdvanceAmounts,
  applyAdvancesToPayroll,
} from "./advancesService";
import { planCycleRemoval, mergeCycleDetails, inChosenCycles, stillFreeWorkdays } from "../utils/payrollItem";
import { pruneSnapshot } from "./payrollSnapshots";

export const PAYROLL_STATUSES = [
  { value: "pending", label: "Pendiente" },
  { value: "paid", label: "Pagada" },
];

export const payrollsService = createService("payroll", "payrolls");

// Las jornadas con que se arma una nómina nueva: lo pendiente de los ciclos y
// labores elegidos (`chosen`, ver `newPayrollCycleDetails`) y los días
// puntuales de las personas sueltas (`people`: [{ keys, workdayIds }], con
// `keys` = `workerKeys` de la persona).
//
// Los ciclos se leen con la caché corta de `listWorkdaysByCycles`: es la misma
// lectura que la pantalla acaba de hacer para mostrar lo pendiente. Los días
// de las personas se releen sin caché, porque se eligieron en un modal que
// pudo quedar abierto un buen rato y otra nómina pudo tomar alguno. Lo que esa
// relectura muestra tomado queda afuera, aunque la caché de los ciclos lo diera
// libre. `taken` cuenta los días elegidos que quedaron afuera, para avisarlo.
//
// Lo etiquetado con otra nómina no entra, ni los trabajadores temporales
// (TEMP-*), que no entran a una nómina hasta que se les asigna RUT.
export async function workdaysForNewPayroll({ chosen = new Map(), people = [] }) {
  const conLabores = [...chosen].filter(([, laborIds]) => !Array.isArray(laborIds) || laborIds.length > 0);
  const workdays = [];
  const vistas = new Set();
  for (const wd of await listWorkdaysByCycles(conLabores.map(([cycleId]) => cycleId))) {
    if (wd.payrollId) continue;
    if (String(wd.workerRut || "").startsWith("TEMP-")) continue;
    if (!inChosenCycles(wd, chosen)) continue;
    workdays.push(wd);
    vistas.add(wd.id);
  }

  const frescas = await Promise.all(
    people.map((p) => (p.keys?.length ? workdaysService.list({ wheres: [["workerRut", "in", p.keys]] }) : [])),
  );
  const ocupadas = new Set();
  let taken = 0;
  people.forEach((p, i) => {
    const { libres, tomadas } = stillFreeWorkdays(frescas[i], p.workdayIds);
    taken += tomadas;
    for (const wd of frescas[i]) if (wd.payrollId) ocupadas.add(wd.id);
    for (const wd of libres) {
      if (vistas.has(wd.id)) continue;
      vistas.add(wd.id);
      workdays.push(wd);
    }
  });
  return { workdays: workdays.filter((wd) => !ocupadas.has(wd.id)), taken };
}

// Etiqueta cada workday incluido con `payrollId`, en batches de hasta 500 (el
// límite de Firestore). `onProgress(done, total)` se llama después de cada tanda.
export async function tagWorkdaysWithPayroll(workdayIds, payrollId, onProgress) {
  await batchUpdateWorkdays(workdayIds, {
    payrollId,
    payrollTaggedAt: serverTimestamp(),
    payrollTaggedBy: auth.currentUser?.uid || null,
  }, onProgress);
}

// Suelta los workdays de la nómina: borra `payrollId` y `paidAt`.
export async function untagWorkdaysFromPayroll(workdayIds, onProgress) {
  await batchUpdateWorkdays(workdayIds, { payrollId: null, paidAt: null }, onProgress);
}

// Sella `paidAt` y `paidBy` en los workdays.
export async function markWorkdaysPaid(workdayIds, onProgress) {
  await batchUpdateWorkdays(workdayIds, {
    paidAt: serverTimestamp(),
    paidBy: auth.currentUser?.uid || null,
  }, onProgress);
}

export async function unmarkWorkdaysPaid(workdayIds, onProgress) {
  await batchUpdateWorkdays(workdayIds, { paidAt: null, paidBy: null }, onProgress);
}

// Aplica un patch a una lista de workdays, en dos niveles:
//
// - `writeBatch` de hasta 500 updates, con los commits en paralelo.
// - `batch.update` es atómico: si UN workday del batch ya no existe (p. ej. se
//   borró con su ciclo y la nómina lo sigue nombrando en `workdayIds`), el
//   batch entero falla con "No document to update". Solo ese batch se
//   reintenta con `updateDoc` uno por uno (de a 50), saltando los `not-found`.
const BATCH_LIMIT = 500;

async function updateWorkdaysIndividually(ids, patch) {
  const concurrency = 50;
  let skipped = 0;
  for (let i = 0; i < ids.length; i += concurrency) {
    const chunk = ids.slice(i, i + concurrency);
    await Promise.all(
      chunk.map(async (id) => {
        try {
          await updateDoc(doc(db, "workdays", id), patch);
        } catch (err) {
          const msg = String(err?.message || "");
          if (err?.code === "not-found" || /No document to update/.test(msg)) {
            skipped += 1;
            return;
          }
          throw err;
        }
      }),
    );
  }
  return skipped;
}

async function batchUpdateWorkdays(ids, patch, onProgress) {
  if (!ids || ids.length === 0) return;
  const total = ids.length;
  let done = 0;
  let skipped = 0;
  if (onProgress) onProgress(0, total);

  const chunks = [];
  for (let i = 0; i < ids.length; i += BATCH_LIMIT) {
    chunks.push(ids.slice(i, i + BATCH_LIMIT));
  }

  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const batch = writeBatch(db);
        for (const id of chunk) batch.update(doc(db, "workdays", id), patch);
        await batch.commit();
      } catch (err) {
        const msg = String(err?.message || "");
        const notFound = err?.code === "not-found" || /No document to update/.test(msg);
        if (!notFound) throw err;
        // Batch con referencias muertas — reintento individual solo acá.
        skipped += await updateWorkdaysIndividually(chunk, patch);
      }
      done += chunk.length;
      if (onProgress) onProgress(done, total);
    }),
  );

  if (skipped > 0) {
    console.warn(
      `batchUpdateWorkdays: ${skipped}/${ids.length} workdays ya no existen (probablemente borrados con su ciclo). Continuando con los demás.`,
    );
  }
  workdaysService.invalidate();
}

export async function markPaid(id, workdayIds = [], onProgress) {
  // Si las transferencias ya se sellaron aparte (ver "pago en dos tiempos"),
  // solo falta sellar los workdays de efectivo: re-estampar los de banco les
  // pisaría la fecha real en que salió la transferencia.
  const p = await payrollsService.getById(id);
  const ids = p?.bankPaidAt ? cashWorkdayIdsOf(p) : workdayIds;
  await markWorkdaysPaid(ids, onProgress);
  // `bankPaidAt` NO se limpia: queda como registro de cuándo salió el banco.
  // `pendingCashOf` ya devuelve 0 para las nóminas pagadas, así que no estorba.
  return payrollsService.update(id, { status: "paid", paidAt: new Date().toISOString() });
}

// ───────────────── Pago en dos tiempos (banco / efectivo) ─────────────────
// Salen las transferencias y el efectivo queda debiéndose para la vuelta
// siguiente: `bankPaidAt` es el flag que lo marca. La nómina sigue en
// `pending` (no está pagada entera), así que ninguna comparación
// `status === "paid"` de la app cambia de significado.
//
// La deuda de efectivo NO se guarda como campo: se deriva siempre con
// `pendingCashOf`, para que no exista un booleano que pueda quedar
// desincronizado de los items.

export const bankWorkdayIdsOf = (p) =>
  (p?.items || []).filter((it) => !isCashBank(it.bankCode)).flatMap((it) => it.workdayIds || []);

export const cashWorkdayIdsOf = (p) =>
  (p?.items || []).filter((it) => isCashBank(it.bankCode)).flatMap((it) => it.workdayIds || []);

// Items de efectivo que esta nómina todavía debe entregar.
export function pendingCashItemsOf(payroll) {
  if (!payroll?.bankPaidAt || payroll.status === "paid") return [];
  const alreadyPaid = new Set(payroll.cashPaidRuts || []);
  return (payroll.items || []).filter((it) => isCashBank(it.bankCode) && !alreadyPaid.has(it.rut));
}

// Plata de efectivo que esta nómina todavía debe entregar. Es 0 si ya está
// pagada entera, y también si las transferencias no se pagaron: ahí no hay
// deuda vencida, simplemente la nómina no se pagó todavía. Esa distinción es
// justamente para lo que sirve el flag.
export function pendingCashOf(payroll) {
  return pendingCashItemsOf(payroll).reduce((s, it) => s + (Number(it.amount) || 0), 0);
}

export async function markBankPaid(payrollId, onProgress) {
  const p = await payrollsService.getById(payrollId);
  if (!p) throw new Error("Nómina no encontrada");
  if (p.status === "paid") throw new Error("La nómina ya está pagada entera.");
  await markWorkdaysPaid(bankWorkdayIdsOf(p), onProgress);
  return payrollsService.update(payrollId, {
    bankPaidAt: new Date().toISOString(),
    bankPaidBy: auth.currentUser?.uid || null,
  });
}

export async function revertBankPaid(payrollId, onProgress) {
  const p = await payrollsService.getById(payrollId);
  if (!p) throw new Error("Nómina no encontrada");
  if (p.status === "paid") {
    throw new Error("La nómina está pagada entera — revierte el pago completo.");
  }
  await unmarkWorkdaysPaid(bankWorkdayIdsOf(p), onProgress);
  return payrollsService.update(payrollId, { bankPaidAt: null, bankPaidBy: null });
}

// Personas de efectivo que cobraron sueltas, antes que el resto de su grupo.
// Solo se registra el rut: NO se estampa `paidAt` en sus workdays, porque ese
// campo significa "la nómina se marcó pagada". `markPaid` los sella a todos al
// final.
export async function setCashPaidRuts(payrollId, ruts) {
  return payrollsService.update(payrollId, { cashPaidRuts: [...new Set(ruts || [])] });
}

// Una nómina con las transferencias ya pagadas no se puede editar: sacar un
// trabajador de banco liberaría sus días y le restauraría los anticipos a
// alguien que ya tiene la plata en la cuenta.
export function assertEditable(p, verb = "editar") {
  if (p.status === "paid") {
    throw new Error(`La nómina está pagada — revierte el pago antes de ${verb}.`);
  }
  if (p.bankPaidAt) {
    throw new Error(`Las transferencias de esta nómina ya se pagaron — revertilas antes de ${verb}.`);
  }
}

// ───────────────────────── Edición parcial ─────────────────────────
// "Achicar" una nómina pendiente sin eliminarla entera: sacar un trabajador o
// todo lo que aporta un ciclo. La nómina tiene que estar `pending`; si está
// pagada, primero se revierte el pago.
//
// Efectos:
//   - Suelta los workdays involucrados (libera `payrollId`).
//   - Sacar un trabajador suelta todos sus anticipos. Sacar un ciclo deja la
//     nómina como si se hubiera armado sin ese ciclo: ver `planCycleRemoval`
//     en `utils/payrollItem.js`, donde vive la regla con sus tests.
//   - Recalcula `items`, `total`, `bankTotal`, `cashTotal`, `workerCount`,
//     `bankCount`, `cashCount`, `workdayIds`, `advanceIds`, `advanceTotal`.

export function recalcPayrollAggregates(items) {
  const bank = items.filter((it) => !isCashBank(it.bankCode));
  const cash = items.filter((it) => isCashBank(it.bankCode));
  return {
    items,
    total: items.reduce((s, x) => s + (Number(x.amount) || 0), 0),
    bankTotal: bank.reduce((s, x) => s + (Number(x.amount) || 0), 0),
    cashTotal: cash.reduce((s, x) => s + (Number(x.amount) || 0), 0),
    advanceTotal: items.reduce((s, x) => s + (Number(x.advance) || 0), 0),
    workerCount: items.length,
    bankCount: bank.length,
    cashCount: cash.length,
    workdayIds: items.flatMap((x) => x.workdayIds || []),
    advanceIds: items.flatMap((x) => x.advanceIds || []),
  };
}

export async function removeWorkerFromPayroll(payrollId, workerRut) {
  const p = await payrollsService.getById(payrollId);
  if (!p) throw new Error("Nómina no encontrada");
  assertEditable(p);
  const items = Array.isArray(p.items) ? p.items : [];
  const item = items.find((it) => it.rut === workerRut);
  if (!item) throw new Error(`Trabajador ${workerRut} no está en esta nómina`);

  await untagWorkdaysFromPayroll(item.workdayIds || []);
  if ((item.advanceIds || []).length) {
    await restoreAdvancesFromPayroll(item.advanceIds, payrollId);
  }

  const newItems = items.filter((it) => it.rut !== workerRut);
  const aggregates = recalcPayrollAggregates(newItems);
  await payrollsService.update(payrollId, aggregates);
  await pruneSnapshot(payrollId, {
    items: newItems,
    aggregates,
    releasedWorkdayIds: item.workdayIds || [],
  });
}

export async function removeCycleFromPayroll(payrollId, cycleId) {
  const p = await payrollsService.getById(payrollId);
  if (!p) throw new Error("Nómina no encontrada");
  assertEditable(p);
  const items = Array.isArray(p.items) ? p.items : [];
  // Los workday docIds llevan el cycleId como prefijo
  // (`{cycleId}__{laborId}__{rut}__{date}[__{ck}]`), así que podemos
  // identificar qué workdays son de este ciclo sin leer cada doc.
  const prefix = `${cycleId}__`;

  // Solo se leen los anticipos de quienes tocan el ciclo: el resto de la
  // nómina queda igual y no paga lecturas.
  const tocados = items.filter(
    (it) =>
      (Number(it.byCycle?.[cycleId]) || 0) !== 0 ||
      (it.workdayIds || []).some((wid) => wid.startsWith(prefix)),
  );
  const appliedByAdvance = await readPayrollApplications(
    payrollId,
    tocados.flatMap((it) => it.advanceIds || []),
  );
  const plan = planCycleRemoval({ items, cycleId, appliedByAdvance });

  await untagWorkdaysFromPayroll(plan.untagWorkdayIds);
  await setPayrollAdvanceAmounts(payrollId, plan.advanceTargets);
  const newItems = plan.items;

  // Actualizar metadata de ciclos en la nómina.
  const oldCycleIds = Array.isArray(p.cycleIds) ? p.cycleIds : [];
  const oldCycleLabels = Array.isArray(p.cycleLabels) ? p.cycleLabels : [];
  const cycleIdxToDrop = oldCycleIds.indexOf(cycleId);
  const newCycleIds = oldCycleIds.filter((id) => id !== cycleId);
  const newCycleLabels = oldCycleLabels.filter((_, i) => i !== cycleIdxToDrop);
  const newCycleDetails = (p.cycleDetails || []).filter((c) => c.id !== cycleId);

  const aggregates = recalcPayrollAggregates(newItems);
  await payrollsService.update(payrollId, {
    ...aggregates,
    cycleIds: newCycleIds,
    cycleLabels: newCycleLabels,
    cycleDetails: newCycleDetails,
  });
  await pruneSnapshot(payrollId, {
    items: newItems,
    aggregates,
    cycleIds: newCycleIds,
    releasedWorkdayIds: plan.untagWorkdayIds,
  });
  return { salen: plan.salen, ajustados: plan.ajustados };
}

// Agrega ciclos a una nómina pendiente ya creada; inverso de
// `removeCycleFromPayroll`. El llamador (Payroll.jsx) trae `items` ya
// recalculado (trabajadores existentes con su byCycle/grossAmount ampliado y
// trabajadores nuevos con su anticipo/bono aplicado), porque esa cuenta
// depende de datos cargados en pantalla (ciclos, trabajadores, catálogo). Acá
// solo se persiste: recalcula los totales agregados y suma los ciclos a la
// metadata.
//
// Un ciclo que ya estaba en la nómina no se repite: se le suman las labores
// (`mergeCycleDetails`). Pasa al agregar las labores que faltaban de un ciclo,
// o días puntuales de una persona en un ciclo que ya estaba.
export async function addCyclesToPayroll(payrollId, { items, cycleDetailsToAdd = [] }) {
  const p = await payrollsService.getById(payrollId);
  if (!p) throw new Error("Nómina no encontrada");
  assertEditable(p);
  const aggregates = recalcPayrollAggregates(items);
  const yaEstan = new Set(p.cycleIds || []);
  const nuevos = cycleDetailsToAdd.filter((c) => !yaEstan.has(c.id));
  const cycleIds = [...(p.cycleIds || []), ...nuevos.map((c) => c.id)];
  const cycleLabels = [...(p.cycleLabels || []), ...nuevos.map((c) => c.label)];
  const cycleDetails = mergeCycleDetails(p.cycleDetails || [], cycleDetailsToAdd);
  await payrollsService.update(payrollId, { ...aggregates, cycleIds, cycleLabels, cycleDetails });
  return aggregates;
}

// Agrega jornadas a una nómina pendiente con los items ya armados por
// `planAddWorkdays`: escribe la nómina, etiqueta las jornadas y aplica los
// anticipos y bonos nuevos. Mismo orden que "Generar": primero el documento,
// para que una falla a mitad de camino no deje jornadas etiquetadas a una
// nómina que no las cuenta. El guard de `assertEditable` corre antes de
// tocar nada.
export async function addWorkdaysToPayroll(
  payrollId,
  { items, cycleDetailsToAdd = [], workdayIds = [], advanceApplications = [] },
) {
  const aggregates = await addCyclesToPayroll(payrollId, { items, cycleDetailsToAdd });
  await tagWorkdaysWithPayroll(workdayIds, payrollId);
  if (advanceApplications.length) await applyAdvancesToPayroll(advanceApplications, payrollId);
  return aggregates;
}

// Guarda los items de una nómina pendiente recalculados contra la producción
// actual. El llamador (Payroll.jsx) trae `items` armado desde los workdays
// vigentes de las labores que la nómina abarca (ediciones, días nuevos,
// trabajadores nuevos, datos de cuenta/grupo al día). Acá solo se persisten
// los items y sus totales; no toca `cycleIds`/`cycleDetails` porque el set de
// ciclos no cambia.
export async function recalculatePayrollItems(payrollId, { items }) {
  const p = await payrollsService.getById(payrollId);
  if (!p) throw new Error("Nómina no encontrada");
  assertEditable(p, "recalcular");
  const aggregates = recalcPayrollAggregates(items);
  await payrollsService.update(payrollId, aggregates);
}

export async function markPending(id, workdayIds = [], onProgress) {
  await unmarkWorkdaysPaid(workdayIds, onProgress);
  // Revierte el pago entero, así que también borra el sello de las
  // transferencias y las personas que habían cobrado sueltas.
  return payrollsService.update(id, {
    status: "pending",
    paidAt: null,
    bankPaidAt: null,
    bankPaidBy: null,
    cashPaidRuts: [],
  });
}
