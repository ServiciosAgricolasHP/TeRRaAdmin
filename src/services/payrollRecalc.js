// Recalcular una nómina pendiente: compararla contra la producción vigente de
// sus ciclos y dejarla como si se armara hoy. También es la forma de sacarle
// ciclos o labores: lo que se saca (`removed`) no entra a la cuenta, así la
// nómina queda como si se hubiera armado sin eso.
//
// `planPayrollRecalc` arma la vista previa sin escribir nada y
// `applyPayrollRecalc` la guarda. La regla de cada parte vive en
// src/utils/payrollItem.js (`planRecalcExisting`, `allocateAdvances`,
// `inRecalcScope`, `cycleScopeAfterRemoval`).
import { workdaysService } from "./index";
import {
  payrollsService,
  assertEditable,
  recalcPayrollAggregates,
  tagWorkdaysWithPayroll,
  untagWorkdaysFromPayroll,
} from "./payrollsService";
import {
  listPendingForWorkers,
  readPayrollApplications,
  setPayrollAdvanceAmounts,
  applyAdvancesToPayroll,
  advanceRemaining,
  advanceSign,
} from "./advancesService";
import { syncSnapshotAfterRecalc, snapshotWorkdayOf, snapshotAdvanceOf } from "./payrollSnapshots";
import { aggregateWorkerAmounts, normalizeLeader } from "../utils/payroll";
import {
  allocateAdvances,
  advanceNote,
  recalcNeedsRefit,
  planRecalcExisting,
  payrollLaborScope,
  inRecalcScope,
  isRemovedFromPayroll,
  cycleScopeAfterRemoval,
} from "../utils/payrollItem";
import { currentRutResolver } from "../utils/workerRut";

// Los datos de cuenta y de grupo de la ficha de un trabajador, con la forma de
// un item de nómina. Con estos entra quien se agrega a una nómina, y contra
// estos compara Recalcular.
export function liveProfileOf(w) {
  const bd = w?.bankDetails || [];
  return {
    name: w?.name || "",
    paymentRut: bd[0] || w?.rut || "",
    accountNumber: bd[1] || "",
    bankCode: bd[3] || "",
    accountType: bd[2] != null ? Number(bd[2]) : 3,
    email: w?.email || "",
    groupLeader: normalizeLeader(w?.groupLeader?.[0]) || "",
  };
}

const PROFILE_FIELDS = [
  { key: "name", label: "Nombre" },
  { key: "paymentRut", label: "RUT de pago" },
  { key: "accountNumber", label: "N° de cuenta" },
  { key: "bankCode", label: "Banco" },
  { key: "accountType", label: "Tipo de cuenta" },
  { key: "email", label: "Email" },
  { key: "groupLeader", label: "Grupo" },
];

// Vista previa del recálculo. Trae las jornadas vigentes de los ciclos de la
// nómina, de las labores que abarca (`inRecalcScope`), menos lo que se saca, y
// las compara con lo guardado: ediciones o días nuevos, trabajadores nuevos
// con producción (entran como en "+ Agregar ciclo"), anticipos o bonos
// cargados después y datos de cuenta o grupo que cambiaron en la ficha. Si el
// bruto de alguien baja, lo ya descontado se re-encaja y lo que no cabe vuelve
// al mismo anticipo; quien se queda sin producción sale.
//
// `cycles` y `workers` son las listas ya cargadas en pantalla. Devuelve
// `empty: true` si no hay nada que cambiar. Tira si sacar `removed` deja la
// nómina sin ciclos o sin nadie: para eso se elimina la nómina.
export async function planPayrollRecalc(payroll, { cycles = [], workers = [], removed = new Map() } = {}) {
  const items = payroll.items || [];
  const cycleDetails = payroll.cycleDetails || [];
  const recalcCycleIds = payroll.cycleIds || cycleDetails.map((c) => c.id);
  const laborTypeById = new Map();
  for (const cycle of cycles.filter((c) => recalcCycleIds.includes(c.id))) {
    for (const labor of cycle.labors || []) laborTypeById.set(labor.id, labor.type);
  }

  const scope = removed.size
    ? cycleScopeAfterRemoval({
        cycleDetails,
        cycleIds: payroll.cycleIds,
        cycleLabels: payroll.cycleLabels,
        removed,
        laborIdsOf: (cid) => (cycles.find((c) => c.id === cid)?.labors || []).map((l) => l.id),
      })
    : null;
  if (scope && scope.cycleIds.length === 0) {
    throw new Error("Eso deja la nómina sin ciclos: para sacar todo, elimina la nómina.");
  }

  // Lo etiquetado con esta nómina, más lo pendiente de las labores que abarca.
  // Lo que se dejó afuera al generarla o al agregarle cosas no vuelve a entrar
  // solo. Lo sacado se separa: si está etiquetado con la nómina, se suelta.
  const alcance = payrollLaborScope(cycleDetails);
  const current = [];
  const released = [];
  for (let i = 0; i < recalcCycleIds.length; i += 10) {
    const chunk = recalcCycleIds.slice(i, i + 10);
    // Directo de Firestore, sin caché: de acá sale lo que se etiqueta.
    const wds = await workdaysService.list({ wheres: [["cycleId", "in", chunk]] });
    for (const wd of wds) {
      if (isRemovedFromPayroll(wd, removed)) {
        if (wd.payrollId === payroll.id) released.push(wd);
      } else if (inRecalcScope(wd, payroll.id, alcance)) {
        current.push(wd);
      }
    }
  }

  const aggregates = aggregateWorkerAmounts(current, laborTypeById);
  const freshByKey = new Map(aggregates.map((a) => [a.workerId || a.rut, a]));
  const existingByKey = new Map(items.map((it) => [it.workerId || it.rut, it]));
  const workerByKey = (key) => workers.find((w) => w.id === key) || workers.find((w) => w.rut === key);
  const rutOf = currentRutResolver(workers);
  const claveDe = (x) => rutOf(x.rut, x.workerId);

  // Trabajadores con producción en estos ciclos que todavía no están en la
  // nómina: mismo criterio que "+ Agregar ciclo" para uno nuevo.
  const newWorkerAggs = aggregates.filter((a) => a.total > 0 && !existingByKey.has(a.workerId || a.rut));

  // Anticipos y bonos pendientes de todos los involucrados: uno creado
  // después de generar la nómina se aplica acá, igual que al armarla.
  const allIds = [...items.map(claveDe), ...newWorkerAggs.map(claveDe)];
  const pendingAdvances = allIds.length ? await listPendingForWorkers(allIds) : [];
  const advancesByKey = new Map();
  for (const adv of pendingAdvances) {
    const key = adv.workerId || adv.workerRut;
    const e = advancesByKey.get(key) || { anticipos: [], bonos: [] };
    if (advanceSign(adv) > 0) e.bonos.push(adv);
    else e.anticipos.push(adv);
    advancesByKey.set(key, e);
  }
  const newAdvanceApplications = [];
  const profileChanges = [];
  const advanceChanges = [];
  const updatedByKey = new Map();

  // Primero se achica: quien se quedó sin producción sale, y a quien sigue se
  // le re-encaja lo ya descontado en su bruto nuevo. Los anticipos se leen
  // solo de quienes cambian.
  const appliedByAdvance = await readPayrollApplications(
    payroll.id,
    items
      .filter((it) => recalcNeedsRefit(it, freshByKey.get(it.workerId || it.rut)))
      .flatMap((it) => it.advanceIds || []),
  );
  const {
    patches,
    leaving: leavingWorkers,
    leavingKeys,
    advanceTargets,
    amountChanges,
  } = planRecalcExisting({ items, freshByKey, appliedByAdvance });

  for (const it of items) {
    const key = it.workerId || it.rut;
    if (leavingKeys.has(key)) continue;
    const fresh = freshByKey.get(key);
    const newGross = Math.round(fresh?.total || 0);
    let patch = patches.get(key) || null;

    // Anticipos y bonos nuevos de alguien que YA está en la nómina, sobre lo
    // que quedó después del re-encaje. La base arranca de lo que ya se le
    // descontó y acreditó (caso incremental de `allocateAdvances`).
    const advForWorker = advancesByKey.get(key) || { anticipos: [], bonos: [] };
    const existingAdvIds = new Set(it.advanceIds || []);
    const newAnticipos = advForWorker.anticipos.filter((a) => !existingAdvIds.has(a.id) && advanceRemaining(a) > 0);
    const newBonos = advForWorker.bonos.filter((a) => !existingAdvIds.has(a.id) && advanceRemaining(a) > 0);
    if (newAnticipos.length || newBonos.length) {
      const currentAdvance = Number((patch || it).advance) || 0;
      const currentBonus = Number((patch || it).bonus) || 0;
      const reparto = allocateAdvances({
        gross: newGross,
        anticipos: newAnticipos,
        bonos: newBonos,
        alreadyAdvanced: currentAdvance,
        alreadyBonused: currentBonus,
      });
      const addedAnticipoTotal = reparto.anticiposTotal;
      const addedBonoTotal = reparto.bonosTotal;
      if (addedAnticipoTotal > 0 || addedBonoTotal > 0) {
        const base = patch || it;
        const appliedNow = [...reparto.anticipoApplications, ...reparto.bonoApplications];
        patch = {
          ...base,
          advance: currentAdvance + addedAnticipoTotal,
          bonus: currentBonus + addedBonoTotal,
          amount: reparto.amount,
          advanceIds: [...(base.advanceIds || []), ...appliedNow.map((x) => x.advanceId)],
          advanceApplications: [...(base.advanceApplications || []), ...appliedNow],
          anticipoApplications: [...(base.anticipoApplications || []), ...reparto.anticipoApplications],
          bonoApplications: [...(base.bonoApplications || []), ...reparto.bonoApplications],
          anticiposTotal: (Number(base.anticiposTotal ?? currentAdvance) || 0) + addedAnticipoTotal,
          bonosTotal: (Number(base.bonosTotal ?? currentBonus) || 0) + addedBonoTotal,
        };
        newAdvanceApplications.push(...appliedNow);
        advanceChanges.push({
          key,
          rut: it.rut,
          name: it.name,
          addedAnticipoTotal,
          addedBonoTotal,
          oldNet: Math.round(Number(base.amount) || 0),
          newNet: reparto.amount,
        });
      }
    }

    const w = workerByKey(key);
    if (w) {
      const live = liveProfileOf(w);
      const changedFields = PROFILE_FIELDS.filter(({ key: f }) => String(it[f] ?? "") !== String(live[f] ?? "")).map(
        ({ key: f, label }) => ({ field: f, label, old: it[f], new: live[f] }),
      );
      if (changedFields.length) {
        profileChanges.push({ key, rut: it.rut, name: it.name, fields: changedFields });
        patch = { ...(patch || it), ...live };
      }
    }

    if (patch) updatedByKey.set(key, patch);
  }

  const newWorkerItems = [];
  const newWorkers = [];
  for (const a of newWorkerAggs) {
    const key = a.workerId || a.rut;
    const w = workerByKey(key) || workers.find((x) => x.id === a.rut);
    const bd = w?.bankDetails || [];
    const grossInt = Math.round(a.total);
    const byCycle = {};
    for (const [cid, amt] of Object.entries(a.byCycle)) byCycle[cid] = Math.round(amt);
    const adv = advancesByKey.get(key) || { anticipos: [], bonos: [] };
    // Mismo reparto que al armar la nómina: bonos primero, anticipos después
    // topeados por bruto + bonos.
    const reparto = allocateAdvances({ gross: grossInt, anticipos: adv.anticipos, bonos: adv.bonos });
    const { anticipoApplications, bonoApplications, anticiposTotal, bonosTotal } = reparto;
    const advanceApplications = [...anticipoApplications, ...bonoApplications];
    newAdvanceApplications.push(...advanceApplications);

    const item = {
      rut: a.rut,
      workerId: a.workerId || a.rut,
      paymentRut: bd[0] || a.rut,
      name: w?.name || "(sin nombre)",
      accountNumber: bd[1] || "",
      bankCode: bd[3] || "",
      accountType: bd[2] != null ? Number(bd[2]) : 3,
      email: w?.email || "",
      groupLeader: normalizeLeader(w?.groupLeader?.[0]),
      grossAmount: grossInt,
      advance: anticiposTotal,
      bonus: bonosTotal,
      advanceNote: advanceNote(reparto),
      advanceIds: advanceApplications.map((x) => x.advanceId),
      advanceApplications,
      anticipoApplications,
      bonoApplications,
      anticiposTotal,
      bonosTotal,
      adelantosTotal: 0,
      amount: Math.max(0, grossInt - anticiposTotal + bonosTotal),
      byCycle,
      workdayIds: a.workdayIds || [],
    };
    newWorkerItems.push(item);
    newWorkers.push({ key, rut: a.rut, name: item.name, gross: grossInt, net: item.amount });
  }

  const mergedItems = [
    ...items.filter((it) => !leavingKeys.has(it.workerId || it.rut)).map((it) => updatedByKey.get(it.workerId || it.rut) || it),
    ...newWorkerItems,
  ];
  if (scope && mergedItems.length === 0) {
    throw new Error("Eso deja la nómina sin nadie: para sacar todo, elimina la nómina.");
  }

  const empty =
    !scope &&
    !released.length &&
    !amountChanges.length &&
    !profileChanges.length &&
    !newWorkers.length &&
    !advanceChanges.length &&
    !leavingWorkers.length;

  return {
    empty,
    amountChanges,
    profileChanges,
    advanceChanges,
    newWorkers,
    leavingWorkers,
    mergedItems,
    // Todo lo que el recálculo miró: lo que queda en la nómina se etiqueta y
    // el resto que estaba etiquetado con ella se suelta.
    workdays: [...current, ...released],
    releasedCount: released.length,
    newAdvanceApplications,
    advanceTargets,
    pendingAdvances,
    scope,
  };
}

// Guarda una vista previa de `planPayrollRecalc`. Mismo orden que "Generar":
// primero el documento de la nómina (con los ciclos que le quedan, si se sacó
// algo), después las jornadas, los anticipos y el snapshot.
export async function applyPayrollRecalc(payrollId, plan) {
  const p = await payrollsService.getById(payrollId);
  if (!p) throw new Error("Nómina no encontrada");
  assertEditable(p, "recalcular");
  const {
    mergedItems: items,
    workdays = [],
    advanceTargets = [],
    newAdvanceApplications = [],
    pendingAdvances = [],
    scope = null,
  } = plan;

  const aggregates = recalcPayrollAggregates(items);
  await payrollsService.update(payrollId, {
    ...aggregates,
    ...(scope ? { cycleIds: scope.cycleIds, cycleLabels: scope.cycleLabels, cycleDetails: scope.cycleDetails } : {}),
  });
  // Se etiqueta exactamente lo que contiene la nómina y se suelta lo que le
  // quedó etiquetado sin estar en ningún item: lo sacado, las jornadas de
  // quien salió y las de $0 de quien nunca entró.
  const enNomina = new Set(items.flatMap((it) => it.workdayIds || []));
  await untagWorkdaysFromPayroll(
    workdays.filter((wd) => !enNomina.has(wd.id) && wd.payrollId === payrollId).map((wd) => wd.id),
  );
  await tagWorkdaysWithPayroll(
    workdays.filter((wd) => enNomina.has(wd.id)).map((wd) => wd.id),
    payrollId,
  );
  // Primero se achica lo ya aplicado y después se aplica lo nuevo: son
  // anticipos distintos (lo nuevo excluye lo que la nómina ya tenía).
  if (advanceTargets.length) await setPayrollAdvanceAmounts(payrollId, advanceTargets);
  if (newAdvanceApplications.length) await applyAdvancesToPayroll(newAdvanceApplications, payrollId);

  const nuevos = new Set(newAdvanceApplications.map((x) => x.advanceId));
  await syncSnapshotAfterRecalc(payrollId, {
    items,
    aggregates,
    workdays: workdays.filter((wd) => enNomina.has(wd.id)).map(snapshotWorkdayOf),
    newAdvances: pendingAdvances.filter((a) => nuevos.has(a.id)).map(snapshotAdvanceOf),
    cycleIds: scope ? scope.cycleIds : null,
  });
  return aggregates;
}
