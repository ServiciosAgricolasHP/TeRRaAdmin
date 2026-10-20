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

// La fila con el cambio aplicado. Si cambia el anticipo o el bono, el neto se
// recalcula y el total editado se reparte entre los anticipos o bonos de la
// fila.
export function withPreviewEdit(p, patch) {
  const next = { ...p, ...patch };
  const touchesAdvance = Object.prototype.hasOwnProperty.call(patch, "advance");
  const touchesBonus = Object.prototype.hasOwnProperty.call(patch, "bonus");
  if (touchesAdvance || touchesBonus) {
    const adv = Math.max(0, Number(next.advance) || 0);
    const bon = Math.max(0, Number(next.bonus) || 0);
    next.advance = adv;
    next.bonus = bon;
    next.amount = Math.max(0, Math.round((p.grossAmount || 0) - adv + bon));
    if (touchesAdvance) {
      // Reparte el total editado entre los anticipos, del más viejo al
      // más nuevo, para que el desglose cuadre con el total. El tope de
      // cada uno es el mayor entre su saldo real (`maxAmount`) y lo ya
      // aplicado, así el override puede superar la cuota sugerida.
      const apps = (p.anticipoApplications || []).map((x) => ({ ...x }));
      let remaining = adv;
      const out = [];
      for (const ap of apps) {
        if (remaining <= 0) break;
        const cap = Math.max(Number(ap.maxAmount) || 0, ap.amount);
        const take = Math.min(cap, remaining);
        if (take > 0) out.push({ advanceId: ap.advanceId, amount: take, maxAmount: ap.maxAmount });
        remaining -= take;
      }
      next.anticipoApplications = out;
      next.anticiposTotal = out.reduce((s, x) => s + x.amount, 0);
    }
    if (touchesBonus) {
      // Bonos: mismo reparto, topeado por el monto de cada aplicación.
      const apps = (p.bonoApplications || []).map((x) => ({ ...x }));
      let remaining = bon;
      const out = [];
      for (const ap of apps) {
        if (remaining <= 0) break;
        const take = Math.min(ap.amount, remaining);
        if (take > 0) out.push({ advanceId: ap.advanceId, amount: take });
        remaining -= take;
      }
      next.bonoApplications = out;
      next.bonosTotal = out.reduce((s, x) => s + x.amount, 0);
    }
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
