// La vista previa de una nómina nueva: sus filas, lo que cambia al editar un
// anticipo o un bono, las cuotas que se pueden excluir, y los items y totales
// que se guardan.
import { advanceSign, hasInstallmentPlan, installmentProgress } from "../services/advancesService";
import { isCashBank } from "./banks";
import { normalizeLeader, splitBankAndCash, validateAccountNumber } from "./payroll";
import { advanceNote, allocateAdvances } from "./payrollItem";

// Una fila por trabajador con bruto, con sus datos de pago y el reparto de sus
// anticipos y bonos pendientes, ordenadas por nombre. `payrollCycles` son los
// ciclos de la nómina: cada fila lleva una entrada por cada uno, incluso en $0.
export function previewItemsOf({ aggregates, workers, payrollCycles, pendingAdvances }) {
  const workerById = (rut) => workers.find((w) => w.id === rut);
  const advancesByRut = new Map();
  for (const adv of pendingAdvances) {
    const key = adv.workerId || adv.workerRut;
    const e = advancesByRut.get(key) || { anticipos: [], bonos: [] };
    if (advanceSign(adv) > 0) e.bonos.push(adv);
    else e.anticipos.push(adv);
    advancesByRut.set(key, e);
  }

  return aggregates
    .filter((a) => a.total > 0)
    .map((a) => {
      const w = workerById(a.rut);
      const bd = w?.bankDetails || [];
      const bankCode = bd[3] || "";
      const cash = isCashBank(bankCode);
      const byCycle = {};
      for (const { id: cid } of payrollCycles) {
        byCycle[cid] = Math.round(a.byCycle[cid] || 0);
      }
      const accountIssue = validateAccountNumber(bd[1] || "", bankCode);
      const adv = advancesByRut.get(a.workerId || a.rut) || { anticipos: [], bonos: [] };

      const grossInt = Math.round(a.total);
      // Bonos primero y anticipos después, topeados por bruto + bonos.
      // La regla y el porqué viven en src/utils/payrollItem.js.
      const allocation = allocateAdvances({
        gross: grossInt,
        anticipos: adv.anticipos,
        bonos: adv.bonos,
      });
      const { anticipoApplications, bonoApplications, anticiposTotal, bonosTotal } = allocation;

      return {
        rut: a.rut,
        workerId: a.workerId || a.rut,
        name: w?.name || "(sin nombre)",
        paymentRut: bd[0] || a.rut,
        accountNumber: bd[1] || "",
        accountType: bd[2] != null ? Number(bd[2]) : 3,
        bankCode,
        email: w?.email || "",
        groupLeader: normalizeLeader(w?.groupLeader?.[0]),
        grossAmount: grossInt,
        advance: anticiposTotal,
        bonus: bonosTotal,
        advanceNote: advanceNote(allocation),
        anticipoApplications,
        bonoApplications,
        anticiposTotal,
        bonosTotal,
        // El reparto sugerido, del que parte cada edición (ver `withPreviewEdit`).
        // No se guarda en la nómina.
        allocatedAdvances: anticipoApplications,
        allocatedBonuses: bonoApplications,
        // adelantosTotal se mantiene por compatibilidad del snapshot; siempre vale 0.
        adelantosTotal: 0,
        amount: allocation.amount,
        byCycle,
        workdayIds: a.workdayIds || [],
        include: true,
        _missing: !cash && (!w || !bd[1] || !bd[3]),
        _accountIssue: cash ? null : accountIssue,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Reparte `total` entre las aplicaciones sugeridas, del más viejo al más nuevo:
// primero hasta lo sugerido de cada una y después, si sobra, hasta `capOf`. Así
// lo que se baja se le quita primero al más nuevo, y un total igual al sugerido
// da el mismo reparto.
function spread(apps, total, capOf) {
  let remaining = total;
  const takes = apps.map((ap) => {
    const take = Math.min(ap.amount, remaining);
    remaining -= take;
    return take;
  });
  for (let k = 0; k < apps.length && remaining > 0; k++) {
    const extra = Math.min(capOf(apps[k]) - takes[k], remaining);
    if (extra > 0) {
      takes[k] += extra;
      remaining -= extra;
    }
  }
  return apps.map((ap, k) => ({ ...ap, amount: takes[k] })).filter((ap) => ap.amount > 0);
}

const sumOf = (apps, f = (ap) => ap.amount) => apps.reduce((s, ap) => s + (Number(f(ap)) || 0), 0);

// Lo más que se puede descontar y acreditar en la fila. Un bono no sube de su
// monto: se puede bajar y lo que falta queda pendiente. Un anticipo sube hasta
// su saldo (`maxAmount`, por encima de la cuota sugerida) y nunca más que
// bruto + bonos: lo que se retiene es lo que baja la deuda.
export function previewEditCaps(p, bonus = p.bonus) {
  const advances = p.allocatedAdvances || p.anticipoApplications || [];
  const bonuses = p.allocatedBonuses || p.bonoApplications || [];
  const bonusMax = sumOf(bonuses);
  const bon = Math.min(Math.max(0, Number(bonus) || 0), bonusMax);
  const advanceMax = Math.min(
    sumOf(advances, (ap) => Math.max(Number(ap.maxAmount) || 0, ap.amount)),
    Math.max(0, Math.round(Number(p.grossAmount) || 0) + bon),
  );
  return { advanceMax, bonusMax };
}

// La fila con el cambio aplicado. Si cambia el anticipo o el bono, los dos se
// ajustan a sus topes (`previewEditCaps`), se reparten entre los anticipos y
// bonos de la fila y el neto se recalcula.
export function withPreviewEdit(p, patch) {
  const next = { ...p, ...patch };
  const touchesAdvance = Object.prototype.hasOwnProperty.call(patch, "advance");
  const touchesBonus = Object.prototype.hasOwnProperty.call(patch, "bonus");
  if (touchesAdvance || touchesBonus) {
    const advances = p.allocatedAdvances || p.anticipoApplications || [];
    const bonuses = p.allocatedBonuses || p.bonoApplications || [];
    const { advanceMax, bonusMax } = previewEditCaps(p, next.bonus);
    const bon = Math.min(Math.max(0, Number(next.bonus) || 0), bonusMax);
    const adv = Math.min(Math.max(0, Number(next.advance) || 0), advanceMax);
    next.advance = adv;
    next.bonus = bon;
    next.amount = Math.max(0, Math.round((p.grossAmount || 0) - adv + bon));
    next.anticipoApplications = spread(advances, adv, (ap) => Math.max(Number(ap.maxAmount) || 0, ap.amount));
    next.anticiposTotal = sumOf(next.anticipoApplications);
    next.bonoApplications = spread(bonuses, bon, (ap) => ap.amount);
    next.bonosTotal = sumOf(next.bonoApplications);
  }
  return next;
}

// Las cuotas de anticipos con plan que descuentan los `items`, para que el
// admin confirme cuáles se aplican esta corrida.
export function installmentCandidatesOf(items, advances) {
  const advanceById = new Map((advances || []).map((a) => [a.id, a]));
  const candidates = [];
  for (const p of items) {
    for (const app of p.anticipoApplications || []) {
      const adv = advanceById.get(app.advanceId);
      if (adv && hasInstallmentPlan(adv)) {
        candidates.push({
          advanceId: app.advanceId,
          workerName: p.name,
          amount: app.amount,
          progress: installmentProgress(adv),
        });
      }
    }
  }
  return candidates;
}

// Los `items` sin los anticipos excluidos, con el neto recalculado.
export function withoutInstallments(items, excludedIds) {
  const excluded = new Set(excludedIds);
  return items.map((p) => {
    const apps = p.anticipoApplications || [];
    if (!apps.some((a) => excluded.has(a.advanceId))) return p;
    const kept = apps.filter((a) => !excluded.has(a.advanceId));
    const anticiposTotal = kept.reduce((s, x) => s + x.amount, 0);
    return {
      ...p,
      anticipoApplications: kept,
      advance: anticiposTotal,
      anticiposTotal,
      amount: Math.max(0, Math.round((Number(p.grossAmount) || 0) - anticiposTotal + (Number(p.bonus) || 0))),
    };
  });
}

// El item que se guarda en la nómina, con los montos enteros. `enLaNomina`:
// los ids de los ciclos de la nómina; el de una persona suelta que se excluyó
// en la vista previa no tiene columna.
export function payrollItemOf(p, payrollCycleIds) {
  const advanceApps = (p.anticipoApplications || []).map((x) => ({
    advanceId: x.advanceId,
    amount: Math.round(Number(x.amount) || 0),
  }));
  const bonusApps = (p.bonoApplications || []).map((x) => ({
    advanceId: x.advanceId,
    amount: Math.round(Number(x.amount) || 0),
  }));
  const advanceApplications = [...advanceApps, ...bonusApps];
  return {
    rut: p.rut,
    workerId: p.workerId || p.rut,
    paymentRut: p.paymentRut || p.rut,
    name: p.name,
    accountNumber: p.accountNumber,
    bankCode: p.bankCode,
    accountType: p.accountType,
    email: p.email || "",
    groupLeader: p.groupLeader || "",
    grossAmount: Math.round(Number(p.grossAmount) || Number(p.amount) || 0),
    advance: Math.round(Number(p.advance) || 0),
    bonus: Math.round(Number(p.bonus) || 0),
    advanceNote: p.advanceNote || "",
    advanceIds: advanceApplications.map((x) => x.advanceId),
    advanceApplications,
    anticipoApplications: advanceApps,
    bonoApplications: bonusApps,
    anticiposTotal: Math.round(Number(p.anticiposTotal) || 0),
    bonosTotal: Math.round(Number(p.bonosTotal) || 0),
    adelantosTotal: Math.round(Number(p.adelantosTotal) || 0),
    amount: Math.round(Number(p.amount) || 0),
    byCycle: Object.fromEntries(Object.entries(p.byCycle || {}).filter(([cid]) => payrollCycleIds.has(cid))),
    workdayIds: p.workdayIds || [],
  };
}

// Los totales de la cabecera de una nómina, de sus items ya guardables.
export function payrollTotalsOf(cleanItems) {
  const { bank: bankItems, cash: cashItems } = splitBankAndCash(cleanItems);
  return {
    total: cleanItems.reduce((s, x) => s + x.amount, 0),
    bankTotal: bankItems.reduce((s, x) => s + x.amount, 0),
    cashTotal: cashItems.reduce((s, x) => s + x.amount, 0),
    workerCount: cleanItems.length,
    bankCount: bankItems.length,
    cashCount: cashItems.length,
    advanceTotal: cleanItems.reduce((s, x) => s + (Number(x.advance) || 0), 0),
    bonusTotal: cleanItems.reduce((s, x) => s + (Number(x.bonus) || 0), 0),
  };
}
