// Entregar anticipos en una nómina: la nómina le paga a la persona un anticipo
// que ya existe en Anticipos / Bonos, además de sus jornadas o sin ellas. El
// anticipo sigue pendiente (lo descuenta otra nómina) y queda marcado con la
// nómina que lo entregó (`payoutPayrollId`) y el ciclo al que se asocia
// (`payoutCycleId`).
//
// En el item de la nómina, `payoutApplications` guarda cada anticipo
// entregado (`{ advanceId, amount, cycleId, date, note }`) y `payoutTotal` su
// suma, que va entera al líquido: bruto − anticipos + bonos + entregado. Lo
// entregado no engrosa la base de los descuentos, y una nómina no descuenta un
// anticipo que ella misma entrega.
import { advanceSign } from "../services/advancesService";
import { payoutOf } from "./payrollItem";

const amountOf = (x) => Math.max(0, Math.round(Number(x?.amount) || 0));
const itemKey = (it) => it?.workerId || it?.rut || "";

// Por qué un anticipo no se puede entregar en una nómina, o "" si se puede:
// tiene que ser un anticipo pendiente, sin nada descontado y sin entregar.
export function payoutBlockReason(advance) {
  if (!advance) return "Ese anticipo ya no existe.";
  if (advanceSign(advance) > 0) return "Un bono no se entrega: se paga solo en la nómina.";
  if (advance.payoutPayrollId) return "Ese anticipo ya se entrega en una nómina.";
  if ((Number(advance.amountPaid) || 0) > 0 || (advance.status || "pending") !== "pending") {
    return "Una nómina ya descontó ese anticipo.";
  }
  if (amountOf(advance) <= 0) return "Ese anticipo no tiene monto.";
  return "";
}

// Los anticipos que se pueden entregar a quienes trabajaron en un ciclo:
// `workdays` son las jornadas del ciclo y `advances`, los pendientes de esas
// personas. Cada fila dice si la persona ya está en la nómina (`inPayroll`).
// Van por nombre y, dentro, por fecha.
export function payoutCandidates({ advances = [], workdays = [], items = [] }) {
  const worked = new Set();
  for (const wd of workdays) {
    if (wd.workerId) worked.add(wd.workerId);
    if (wd.workerRut) worked.add(wd.workerRut);
  }
  const inPayroll = new Set(items.flatMap((it) => [it.workerId, it.rut]).filter(Boolean));
  return advances
    .filter((a) => !payoutBlockReason(a) && [a.workerId, a.workerRut].some((k) => k && worked.has(k)))
    .map((a) => ({
      advanceId: a.id,
      rut: a.workerRut || "",
      name: a.workerName || a.workerRut || "",
      amount: amountOf(a),
      date: a.date || "",
      note: a.note || "",
      inPayroll: [a.workerId, a.workerRut].some((k) => k && inPayroll.has(k)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "es") || a.date.localeCompare(b.date));
}

// Los items de la nómina con los anticipos `advances` entregados, asociados a
// `cycleId`. Quien ya está suma lo entregado a su líquido; quien no, entra con
// bruto $0 y los datos de su ficha (`profileFor(advance)`: `{ workerId, rut,
// ...liveProfileOf }`, o null si no está en el catálogo). Un anticipo que el
// item ya entrega no se repite.
//
// `added` trae una fila por persona, con su líquido antes y después.
export function planPayouts({ items = [], advances = [], cycleId = "", profileFor = () => null }) {
  const out = [...items];
  const added = new Map();
  for (const adv of advances) {
    const amount = amountOf(adv);
    if (amount <= 0) continue;
    const profile = profileFor(adv) || {};
    const keys = new Set([profile.workerId, adv.workerId, profile.rut, adv.workerRut].filter(Boolean));
    let i = out.findIndex((it) => keys.has(it.workerId) || keys.has(it.rut));
    const application = { advanceId: adv.id, amount, cycleId, date: adv.date || "", note: adv.note || "" };

    if (i === -1) {
      const rut = profile.rut || adv.workerRut || "";
      out.push({
        rut,
        workerId: profile.workerId || adv.workerId || rut,
        paymentRut: profile.paymentRut || rut,
        paymentName: profile.paymentName || "",
        name: profile.name || adv.workerName || "(sin nombre)",
        accountNumber: profile.accountNumber || "",
        bankCode: profile.bankCode || "",
        accountType: profile.accountType ?? 3,
        email: profile.email || "",
        groupLeader: profile.groupLeader || "",
        grossAmount: 0,
        advance: 0,
        bonus: 0,
        advanceNote: "",
        advanceIds: [],
        advanceApplications: [],
        anticipoApplications: [],
        bonoApplications: [],
        anticiposTotal: 0,
        bonosTotal: 0,
        adelantosTotal: 0,
        amount: 0,
        byCycle: {},
        workdayIds: [],
        payoutApplications: [],
        payoutTotal: 0,
      });
      i = out.length - 1;
    }

    const it = out[i];
    if ((it.payoutApplications || []).some((p) => p.advanceId === adv.id)) continue;
    const key = itemKey(it);
    if (!added.has(key)) {
      added.set(key, {
        key,
        rut: it.rut,
        name: it.name,
        isNew: !items.some((x) => itemKey(x) === key),
        amount: 0,
        oldNet: Math.round(Number(it.amount) || 0),
        newNet: 0,
      });
    }
    out[i] = {
      ...it,
      payoutApplications: [...(it.payoutApplications || []), application],
      payoutTotal: payoutOf(it) + amount,
      amount: Math.round(Number(it.amount) || 0) + amount,
    };
    const row = added.get(key);
    row.amount += amount;
    row.newNet = out[i].amount;
  }
  return { items: out, added: [...added.values()] };
}

// Los items sin las entregas `advanceIds` de la persona `rut`. Quien queda
// sin jornadas y sin nada entregado sale de la nómina (`leaves`), y suelta los
// bonos que la nómina le pagaba (`releasedAdvanceIds`). Devuelve null si la
// persona no está o no tiene ninguna de esas entregas.
export function planPayoutRemoval({ items = [], rut, advanceIds = [] }) {
  const item = items.find((it) => it.rut === rut);
  const drop = new Set(advanceIds);
  const removed = (item?.payoutApplications || []).filter((p) => drop.has(p.advanceId));
  if (!item || removed.length === 0) return null;
  const kept = item.payoutApplications.filter((p) => !drop.has(p.advanceId));
  const removedTotal = removed.reduce((s, p) => s + amountOf(p), 0);
  const oldNet = Math.round(Number(item.amount) || 0);
  const leaves = kept.length === 0 && (item.workdayIds || []).length === 0;
  const next = {
    ...item,
    payoutApplications: kept,
    payoutTotal: kept.reduce((s, p) => s + amountOf(p), 0),
    amount: oldNet - removedTotal,
  };
  return {
    items: leaves ? items.filter((it) => it !== item) : items.map((it) => (it === item ? next : it)),
    removed,
    removedTotal,
    leaves,
    releasedAdvanceIds: leaves ? item.advanceIds || [] : [],
    name: item.name || item.rut,
    oldNet,
    newNet: leaves ? 0 : next.amount,
  };
}

// Las entregas de la nómina, una fila por anticipo, por persona y por fecha.
export function payoutRowsOf(items = []) {
  return items
    .flatMap((it) =>
      (it.payoutApplications || []).map((p) => ({
        advanceId: p.advanceId,
        name: it.name || it.rut || "",
        rut: it.rut || "",
        date: p.date || "",
        note: p.note || "",
        cycleId: p.cycleId || "",
        amount: amountOf(p),
      })),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "es") || a.date.localeCompare(b.date));
}

// Lo entregado por ciclo asociado: `[{ cycleId, amount, count }]`, en el
// orden en que aparecen.
export function payoutsByCycle(items = []) {
  const byCycle = new Map();
  for (const row of payoutRowsOf(items)) {
    const e = byCycle.get(row.cycleId) || { cycleId: row.cycleId, amount: 0, count: 0 };
    e.amount += row.amount;
    e.count += 1;
    byCycle.set(row.cycleId, e);
  }
  return [...byCycle.values()];
}

// El total entregado de una nómina.
export const payoutTotalOf = (items = []) => items.reduce((s, it) => s + payoutOf(it), 0);
