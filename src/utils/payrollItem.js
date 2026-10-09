// Reparto de anticipos y bonos sobre el bruto de un trabajador.
//
// Lo usan los cuatro caminos de `Payroll.jsx`: armar la nómina, agregar
// ciclos, recalcular y aplicar anticipos nuevos sobre alguien que ya está. El
// último parte de una base con descuentos ya aplicados (`alreadyAdvanced` /
// `alreadyBonused`).
//
// La regla:
//
//   1. Los BONOS van primero y se aplican completos. Engrosan la base contra
//      la que después se descuenta el anticipo.
//   2. Los ANTICIPOS van después, del más viejo al más nuevo, topeados por
//      esa base. De cada uno se toma `advanceDueNow`: la cuota si tiene plan,
//      el saldo entero si no.
//
// Así el bono ayuda a cerrar la deuda en vez de pagarse aparte mientras el
// anticipo sigue abierto: bruto 376.000 + bono 24.000 contra un anticipo de
// 400.000 deja el anticipo saldado y el neto en 0.
import { advanceRemaining, advanceDueNow, advanceSign } from "../services/advancesService";
import { aggregateWorkerAmounts, workdayPayAmount } from "./payroll";

const porFechaAsc = (a, b) => {
  const da = a?.date || "";
  const db = b?.date || "";
  return da < db ? -1 : da > db ? 1 : 0;
};

export function allocateAdvances({
  gross,
  anticipos = [],
  bonos = [],
  alreadyAdvanced = 0,
  alreadyBonused = 0,
}) {
  const brutoInt = Math.round(Number(gross) || 0);
  const yaDescontado = Number(alreadyAdvanced) || 0;
  const yaAcreditado = Number(alreadyBonused) || 0;

  // Bonos: completos, nunca tienen plan de cuotas.
  const bonoApplications = [];
  for (const bono of [...bonos].sort(porFechaAsc)) {
    const saldo = Math.round(advanceRemaining(bono));
    if (saldo <= 0) continue;
    bonoApplications.push({ advanceId: bono.id, amount: saldo });
  }
  const bonosTotal = bonoApplications.reduce((s, x) => s + x.amount, 0);

  // Anticipos: del más viejo al más nuevo, topeados por lo que queda de base.
  let base = Math.max(0, brutoInt + yaAcreditado + bonosTotal - yaDescontado);
  const anticipoApplications = [];
  for (const anticipo of [...anticipos].sort(porFechaAsc)) {
    if (base <= 0) break;
    const cuota = Math.round(advanceDueNow(anticipo));
    if (cuota <= 0) continue;
    const aplicar = Math.min(base, cuota);
    if (aplicar <= 0) continue;
    // `maxAmount` es el saldo REAL, sin el tope de la cuota. Es lo que deja
    // que el override manual del preview suba por encima de la cuota sugerida
    // sin descuadrar lo descontado contra lo acreditado.
    anticipoApplications.push({
      advanceId: anticipo.id,
      amount: aplicar,
      maxAmount: Math.round(advanceRemaining(anticipo)),
    });
    base -= aplicar;
  }
  const anticiposTotal = anticipoApplications.reduce((s, x) => s + x.amount, 0);

  const advanceTotal = yaDescontado + anticiposTotal;
  const bonusTotal = yaAcreditado + bonosTotal;

  return {
    anticipoApplications,
    bonoApplications,
    // Lo aplicado EN ESTA PASADA.
    anticiposTotal,
    bonosTotal,
    // Acumulado, contando lo que ya venía aplicado.
    advanceTotal,
    bonusTotal,
    // Neto. Nunca negativo: un anticipo no puede dejar debiendo al trabajador.
    amount: Math.max(0, brutoInt - advanceTotal + bonusTotal),
  };
}

// Etiqueta corta para la columna "Anticipo" del preview ("Anticipos 2 · Bonos 1").
export function advanceNote({ anticipoApplications = [], bonoApplications = [] }) {
  const partes = [];
  if (anticipoApplications.length) partes.push(`Anticipos ${anticipoApplications.length}`);
  if (bonoApplications.length) partes.push(`Bonos ${bonoApplications.length}`);
  return partes.join(" · ");
}

// ───────────────────────── Achicar una nómina ya armada ─────────────────────────
//
// Cuando una nómina pendiente pierde producción —se le saca un ciclo, o el
// recálculo encuentra menos jornadas— lo que ya se había aplicado de anticipos
// y bonos tiene que volver a caber en el bruto nuevo. La regla de estas
// funciones es una sola: **la nómina tiene que quedar igual que si se hubiera
// armado sin lo que se le sacó**, y cada anticipo tiene que reflejar
// exactamente lo que esta nómina le descuenta, sin crear anticipos nuevos.

// Lo que esta nómina le aplica hoy a cada anticipo/bono de un trabajador.
//
// La fuente de verdad es el `payments[]` del anticipo (`appliedByAdvance`, lo
// que devuelve `readPayrollApplications`): es lo que leen el borrado de la
// nómina y la pantalla de Anticipos. El item guarda una copia, que se usa solo
// si el documento del anticipo ya no existe — en ese caso se respeta lo que
// dice el item y se marca `missing`, para no descontar de menos por algo que
// no se puede verificar ni intentar escribir un documento que no está.
export function appliedFromItem(item, appliedByAdvance = new Map()) {
  const guardado = new Map();
  for (const a of item?.anticipoApplications || []) {
    guardado.set(a.advanceId, { kind: "anticipo", amount: Number(a.amount) || 0 });
  }
  for (const b of item?.bonoApplications || []) {
    guardado.set(b.advanceId, { kind: "bono", amount: Number(b.amount) || 0 });
  }
  const ids = [...new Set([...(item?.advanceIds || []), ...guardado.keys()])].filter(Boolean);
  const out = [];
  ids.forEach((advanceId, order) => {
    const doc = appliedByAdvance.get(advanceId);
    if (doc) {
      out.push({ advanceId, kind: doc.kind, date: doc.date || "", amount: Number(doc.amount) || 0, order });
      return;
    }
    const g = guardado.get(advanceId);
    if (g) out.push({ advanceId, kind: g.kind, date: "", amount: g.amount, order, missing: true });
  });
  return out;
}

// Vuelve a encajar lo ya aplicado en un bruto que bajó. **Solo achica, nunca
// agranda**: cada monto ya fue validado contra el saldo del anticipo cuando se
// aplicó, así que bajarlo siempre es válido y no hace falta volver a mirar
// cuotas ni saldos.
//
// Mismo orden que `allocateAdvances`: los bonos quedan enteros y engrosan la
// base; los anticipos se llenan del más viejo al más nuevo, así que el que se
// achica primero es el más nuevo. Lo que no cabe vuelve al anticipo
// (`devuelto`) — queda pendiente para la próxima nómina, con su fecha y su plan
// de cuotas originales, sin crear ningún registro nuevo.
export function refitAppliedAdvances({ gross, applied = [] }) {
  const bruto = Math.max(0, Math.round(Number(gross) || 0));
  const norm = applied.map((a, i) => ({
    ...a,
    amount: Math.max(0, Math.round(Number(a.amount) || 0)),
    order: a.order ?? i,
  }));
  const bonos = norm.filter((a) => a.kind === "bono");
  const anticipos = norm
    .filter((a) => a.kind !== "bono")
    .sort((a, b) => {
      const da = a.date || "";
      const db = b.date || "";
      if (da !== db) return da < db ? -1 : 1;
      return a.order - b.order;
    });

  const bonosTotal = bonos.reduce((s, b) => s + b.amount, 0);
  let base = bruto + bonosTotal;
  const ajustados = anticipos.map((a) => {
    const queda = Math.min(base, a.amount);
    base -= queda;
    return { ...a, queda };
  });
  const anticiposTotal = ajustados.reduce((s, a) => s + a.queda, 0);

  return {
    // Monto FINAL que esta nómina le aplica a cada anticipo/bono (0 = lo
    // suelta entero). Incluye los que no cambiaron.
    targets: [
      ...bonos.map((b) => ({ advanceId: b.advanceId, amount: b.amount, missing: !!b.missing })),
      ...ajustados.map((a) => ({ advanceId: a.advanceId, amount: a.queda, missing: !!a.missing })),
    ],
    anticipoApplications: ajustados
      .filter((a) => a.queda > 0)
      .map((a) => ({ advanceId: a.advanceId, amount: a.queda })),
    bonoApplications: bonos
      .filter((b) => b.amount > 0)
      .map((b) => ({ advanceId: b.advanceId, amount: b.amount })),
    anticiposTotal,
    bonosTotal,
    devuelto: ajustados.reduce((s, a) => s + (a.amount - a.queda), 0),
    // Nunca negativo, y sin ningún `Math.max` que lo esconda: los anticipos
    // se toparon contra bruto + bonos.
    amount: bruto - anticiposTotal + bonosTotal,
  };
}

// Los campos del item que dependen del reparto, a partir de un refit.
export function itemAdvanceFields(refit) {
  const advanceApplications = [...refit.anticipoApplications, ...refit.bonoApplications];
  return {
    advance: refit.anticiposTotal,
    bonus: refit.bonosTotal,
    anticiposTotal: refit.anticiposTotal,
    bonosTotal: refit.bonosTotal,
    anticipoApplications: refit.anticipoApplications,
    bonoApplications: refit.bonoApplications,
    advanceApplications,
    advanceIds: advanceApplications.map((x) => x.advanceId),
    advanceNote: advanceNote(refit),
    amount: refit.amount,
  };
}

// Qué pasa con cada trabajador al sacar un ciclo de una nómina pendiente.
//
// Un trabajador SALE entero cuando el bruto que le queda es 0, no cuando se le
// acaban las claves de `byCycle`: `byCycle` guarda una entrada por CADA ciclo,
// aunque esté en $0. Es el mismo criterio que usa armar la nómina
// (`a.total > 0`), así el resultado queda "como si se hubiera armado sin este
// ciclo".
//
// El que sale suelta TODOS sus anticipos y bonos de esta nómina y todas sus
// jornadas, incluidas las de $0 de otros ciclos: armada sin este ciclo, esa
// persona no estaría. El que se queda pierde las jornadas del ciclo (también
// las de $0) y re-encaja sus anticipos con `refitAppliedAdvances`.
export function planCycleRemoval({ items = [], cycleId, appliedByAdvance = new Map() }) {
  const prefix = `${cycleId}__`;
  const nextItems = [];
  const untagWorkdayIds = [];
  const advanceTargets = [];
  const salen = [];
  const ajustados = [];

  for (const it of items) {
    const wds = it.workdayIds || [];
    const delCiclo = wds.filter((id) => id.startsWith(prefix));
    const aporte = Math.round(Number(it.byCycle?.[cycleId]) || 0);
    if (delCiclo.length === 0 && aporte === 0) {
      nextItems.push(it);
      continue;
    }

    const brutoAntes = Math.round(Number(it.grossAmount || it.amount) || 0);
    const brutoNuevo = Math.max(0, brutoAntes - aporte);
    const aplicado = appliedFromItem(it, appliedByAdvance);

    if (brutoNuevo <= 0) {
      untagWorkdayIds.push(...wds);
      for (const a of aplicado) {
        if (!a.missing) advanceTargets.push({ advanceId: a.advanceId, amount: 0 });
      }
      salen.push({
        rut: it.rut,
        name: it.name,
        liberado: aplicado.filter((a) => a.kind !== "bono").reduce((s, a) => s + a.amount, 0),
      });
      continue;
    }

    untagWorkdayIds.push(...delCiclo);
    const refit = refitAppliedAdvances({ gross: brutoNuevo, applied: aplicado });
    for (const t of refit.targets) {
      if (!t.missing) advanceTargets.push({ advanceId: t.advanceId, amount: t.amount });
    }
    const byCycle = { ...(it.byCycle || {}) };
    delete byCycle[cycleId];
    nextItems.push({
      ...it,
      ...itemAdvanceFields(refit),
      grossAmount: brutoNuevo,
      byCycle,
      workdayIds: wds.filter((id) => !id.startsWith(prefix)),
    });
    if (refit.devuelto > 0) {
      ajustados.push({ rut: it.rut, name: it.name, devuelto: refit.devuelto });
    }
  }

  return { items: nextItems, untagWorkdayIds, advanceTargets, salen, ajustados };
}

const brutoDe = (it) => Math.round(Number(it?.grossAmount || it?.amount) || 0);
const idsDe = (ids) => [...(ids || [])].sort().join(",");

// Más descontado del que el bruto (más bonos) respalda. Recalcular re-reparte
// a quien quedó así.
export function isOverApplied(it) {
  return (Number(it?.advance) || 0) > brutoDe(it) + (Number(it?.bonus) || 0);
}

// Si un trabajador que ya está en la nómina hay que re-repartirlo al
// recalcular contra su producción vigente (`fresh`, de `aggregateWorkerAmounts`).
// La pantalla lo usa para leer solo los anticipos de estos trabajadores: el
// resto de la nómina no paga lecturas.
export function recalcNeedsRefit(it, fresh) {
  const newGross = Math.round(Number(fresh?.total) || 0);
  return (
    newGross <= 0 ||
    newGross !== brutoDe(it) ||
    idsDe(fresh?.workdayIds) !== idsDe(it?.workdayIds) ||
    isOverApplied(it)
  );
}

// El lado "achicar" del recálculo, con la misma regla que `planCycleRemoval`:
// quien se quedó sin producción sale entero y suelta todo; quien sigue
// re-encaja lo ya aplicado en su bruto nuevo, y lo que no cabe vuelve al
// mismo anticipo. Lo que el recálculo AGREGA (anticipos nuevos, trabajadores
// nuevos, datos de cuenta) se resuelve después, en la pantalla, sobre lo que
// devuelve esto.
export function planRecalcExisting({ items = [], freshByKey = new Map(), appliedByAdvance = new Map() }) {
  const patches = new Map();
  const leaving = [];
  const leavingKeys = new Set();
  const advanceTargets = [];
  const amountChanges = [];

  for (const it of items) {
    const key = it.workerId || it.rut;
    const fresh = freshByKey.get(key);
    if (!recalcNeedsRefit(it, fresh)) continue;
    const newGross = Math.round(Number(fresh?.total) || 0);
    const aplicado = appliedFromItem(it, appliedByAdvance);
    const oldNet = Math.round(Number(it.amount) || 0);

    if (newGross <= 0) {
      for (const a of aplicado) {
        if (!a.missing) advanceTargets.push({ advanceId: a.advanceId, amount: 0 });
      }
      leavingKeys.add(key);
      leaving.push({
        key,
        rut: it.rut,
        name: it.name,
        oldNet,
        liberado: aplicado.filter((a) => a.kind !== "bono").reduce((s, a) => s + a.amount, 0),
      });
      continue;
    }

    const byCycle = {};
    for (const [cid, amt] of Object.entries(fresh?.byCycle || {})) byCycle[cid] = Math.round(amt);
    const refit = refitAppliedAdvances({ gross: newGross, applied: aplicado });
    for (const t of refit.targets) {
      if (!t.missing) advanceTargets.push({ advanceId: t.advanceId, amount: t.amount });
    }
    amountChanges.push({
      key,
      rut: it.rut,
      name: it.name,
      oldGross: brutoDe(it),
      newGross,
      oldNet,
      newNet: refit.amount,
      devuelto: refit.devuelto,
    });
    patches.set(key, {
      ...it,
      ...itemAdvanceFields(refit),
      grossAmount: newGross,
      byCycle,
      workdayIds: fresh?.workdayIds || [],
    });
  }

  return { patches, leaving, leavingKeys, advanceTargets, amountChanges };
}

// ───────────────────────── Agrandar una nómina ya armada ─────────────────────────
//
// Agregar un ciclo, unas labores o los días puntuales de una persona a una
// nómina pendiente es el camino inverso de achicarla, con la misma regla: la
// nómina tiene que quedar como si se hubiera armado con eso adentro.

// Los datos de un ciclo que la nómina guarda en `cycleDetails`. El período
// sale de `cycle.days`, que son los días que se marcaron en el ciclo.
export function cycleDetailOf(cycle, { faenas = [], subfaenas = [] } = {}) {
  const f = faenas.find((x) => x.id === cycle.faenaId);
  const s = subfaenas.find((x) => x.id === cycle.subfaenaId);
  const days = Array.isArray(cycle.days) ? [...cycle.days].sort() : [];
  return {
    id: cycle.id,
    label: cycle.label || cycle.id,
    faenaId: cycle.faenaId || "",
    faenaName: f?.name || "",
    subfaenaId: cycle.subfaenaId || "",
    subfaenaName: s?.name || "",
    firstDay: days[0] || "",
    lastDay: days[days.length - 1] || "",
  };
}

// Qué labores de cada ciclo le pertenecen a la nómina: las que Recalcular
// puede traer cuando aparece producción nueva. Sale de `cycleDetails[].laborIds`:
//
//   - sin el campo → el ciclo entero (por ejemplo, un ciclo que se agregó con
//     todas sus labores);
//   - una lista → solo esas labores;
//   - `[]` → ninguna: el ciclo está en la nómina solo por días puntuales que
//     se agregaron a mano, y de ahí no se trae nada más.
//
// Así Recalcular respeta las labores que se dejaron afuera al generar la
// nómina o al agregarle cosas.
export function payrollLaborScope(cycleDetails = []) {
  const scope = new Map();
  for (const cd of cycleDetails || []) {
    if (cd?.id && Array.isArray(cd.laborIds)) scope.set(cd.id, new Set(cd.laborIds));
  }
  return scope;
}

// Si una jornada de los ciclos de la nómina entra a su recálculo. Lo que ya
// está etiquetado con esta nómina entra siempre: es lo que se le paga hoy,
// incluidos los días agregados a mano. Lo pendiente entra solo si es de una
// labor que la nómina abarca.
export function inRecalcScope(wd, payrollId, scope = new Map()) {
  if (String(wd?.workerRut || "").startsWith("TEMP-")) return false;
  if (wd.payrollId) return wd.payrollId === payrollId;
  const labores = scope.get(wd.cycleId);
  return !labores || labores.has(wd.laborId);
}

// Firestore rechaza `undefined`: un ciclo entero se guarda SIN `laborIds`, no
// con `laborIds: undefined`.
function conLabores(cd, laborIds) {
  const { laborIds: _previo, ...resto } = cd;
  return Array.isArray(laborIds) ? { ...resto, laborIds } : resto;
}

// Junta los `cycleDetails` de una nómina con los que se le agregan. Un ciclo
// que ya estaba no se repite: se le suman las labores. Si cualquiera de los
// dos lo trae entero (sin `laborIds`), queda entero.
export function mergeCycleDetails(existing = [], toAdd = []) {
  const out = (existing || []).map((cd) => ({ ...cd }));
  const posicion = new Map(out.map((cd, i) => [cd.id, i]));
  for (const cd of toAdd || []) {
    if (!cd?.id) continue;
    const i = posicion.get(cd.id);
    if (i == null) {
      posicion.set(cd.id, out.length);
      out.push(conLabores(cd, cd.laborIds));
      continue;
    }
    const antes = out[i];
    const union =
      Array.isArray(antes.laborIds) && Array.isArray(cd.laborIds)
        ? [...new Set([...antes.laborIds, ...cd.laborIds])]
        : null;
    out[i] = conLabores(antes, union);
  }
  return out;
}

// Suma jornadas a una nómina pendiente: las de un ciclo o unas labores que se
// agregan, o los días puntuales de una persona.
//
//   - Quien ya está suma el bruto, las jornadas (también las de $0) y su
//     `byCycle` SUMADO, no pisado: el ciclo puede estar ya en la nómina con
//     otras labores u otros días. Además se le aplican los anticipos y bonos
//     pendientes que esta nómina todavía no le tocaba, con el mismo reparto
//     incremental que usa Recalcular.
//   - Quien no está entra si su bruto es mayor que 0, con el reparto completo,
//     igual que al generar. Sin bruto no entra (va a `sinBruto`) y sus
//     jornadas de $0 siguen pendientes.
//
// Lo que esta nómina ya descuenta de un anticipo no crece acá: re-encajar
// hacia arriba obligaría a revisar cuotas, y Recalcular sigue la misma regla.
//
// `profileFor(agg)` devuelve los datos de cuenta y de grupo de la ficha del
// trabajador, o `null` si no está en el catálogo.
export function planAddWorkdays({
  items = [],
  workdays = [],
  laborTypeById = new Map(),
  pendingAdvances = [],
  profileFor = () => null,
}) {
  // Una persona puede venir partida en varios agregados: sus jornadas viejas
  // guardan el rut que tenía entonces. Se juntan con la misma clave que usan
  // los items.
  const porClave = new Map();
  for (const a of aggregateWorkerAmounts(workdays, laborTypeById)) {
    const key = a.workerId || a.rut;
    const e = porClave.get(key);
    if (!e) {
      porClave.set(key, { ...a, byCycle: { ...a.byCycle }, workdayIds: [...a.workdayIds] });
      continue;
    }
    e.total += a.total;
    for (const [cid, monto] of Object.entries(a.byCycle)) e.byCycle[cid] = (e.byCycle[cid] || 0) + monto;
    e.workdayIds.push(...a.workdayIds);
  }

  const pendientesPorClave = new Map();
  for (const adv of pendingAdvances || []) {
    const key = adv.workerId || adv.workerRut;
    const e = pendientesPorClave.get(key) || { anticipos: [], bonos: [] };
    if (advanceSign(adv) > 0) e.bonos.push(adv);
    else e.anticipos.push(adv);
    pendientesPorClave.set(key, e);
  }

  const limpio = (x) => ({ advanceId: x.advanceId, amount: Math.round(Number(x.amount) || 0) });
  const out = [...items];
  const posicion = new Map(out.map((it, i) => [it.workerId || it.rut, i]));
  const workdayIds = [];
  const newAdvanceApplications = [];
  const added = [];
  const sinBruto = [];

  for (const [key, a] of porClave) {
    const suma = Math.round(a.total);
    const pendientes = pendientesPorClave.get(key) || { anticipos: [], bonos: [] };
    const i = posicion.get(key);

    if (i != null) {
      const it = out[i];
      const yaTocados = new Set(it.advanceIds || []);
      const nuevos = (xs) => xs.filter((x) => !yaTocados.has(x.id) && advanceRemaining(x) > 0);
      const gross = brutoDe(it) + suma;
      const byCycle = { ...(it.byCycle || {}) };
      for (const [cid, monto] of Object.entries(a.byCycle)) {
        byCycle[cid] = Math.round((Number(byCycle[cid]) || 0) + monto);
      }
      const reparto = allocateAdvances({
        gross,
        anticipos: nuevos(pendientes.anticipos),
        bonos: nuevos(pendientes.bonos),
        alreadyAdvanced: Number(it.advance) || 0,
        alreadyBonused: Number(it.bonus) || 0,
      });
      const ant = reparto.anticipoApplications.map(limpio);
      const bon = reparto.bonoApplications.map(limpio);
      const ahora = [...ant, ...bon];
      const anticipoApplications = [...(it.anticipoApplications || []), ...ant];
      const bonoApplications = [...(it.bonoApplications || []), ...bon];
      out[i] = {
        ...it,
        grossAmount: gross,
        byCycle,
        workdayIds: [...new Set([...(it.workdayIds || []), ...a.workdayIds])],
        advance: reparto.advanceTotal,
        bonus: reparto.bonusTotal,
        anticiposTotal: reparto.advanceTotal,
        bonosTotal: reparto.bonusTotal,
        anticipoApplications,
        bonoApplications,
        advanceApplications: [...(it.advanceApplications || []), ...ahora],
        advanceIds: [...(it.advanceIds || []), ...ahora.map((x) => x.advanceId)],
        advanceNote: advanceNote({ anticipoApplications, bonoApplications }),
        amount: reparto.amount,
      };
      workdayIds.push(...a.workdayIds);
      newAdvanceApplications.push(...ahora);
      added.push({
        key,
        rut: it.rut,
        name: it.name,
        isNew: false,
        gross: suma,
        anticipos: reparto.anticiposTotal,
        bonos: reparto.bonosTotal,
        oldGross: brutoDe(it),
        newGross: gross,
        oldNet: Math.round(Number(it.amount) || 0),
        newNet: reparto.amount,
      });
      continue;
    }

    if (suma <= 0) {
      sinBruto.push({ key, rut: a.rut, workdayIds: a.workdayIds });
      continue;
    }

    const perfil = profileFor(a) || {};
    const reparto = allocateAdvances({ gross: suma, anticipos: pendientes.anticipos, bonos: pendientes.bonos });
    const ant = reparto.anticipoApplications.map(limpio);
    const bon = reparto.bonoApplications.map(limpio);
    const ahora = [...ant, ...bon];
    const byCycle = {};
    for (const [cid, monto] of Object.entries(a.byCycle)) byCycle[cid] = Math.round(monto);
    const nuevo = {
      rut: a.rut,
      workerId: key,
      paymentRut: perfil.paymentRut || a.rut,
      name: perfil.name || "(sin nombre)",
      accountNumber: perfil.accountNumber || "",
      bankCode: perfil.bankCode || "",
      accountType: perfil.accountType ?? 3,
      email: perfil.email || "",
      groupLeader: perfil.groupLeader || "",
      grossAmount: suma,
      advance: reparto.anticiposTotal,
      bonus: reparto.bonosTotal,
      advanceNote: advanceNote(reparto),
      advanceIds: ahora.map((x) => x.advanceId),
      advanceApplications: ahora,
      anticipoApplications: ant,
      bonoApplications: bon,
      anticiposTotal: reparto.anticiposTotal,
      bonosTotal: reparto.bonosTotal,
      adelantosTotal: 0,
      amount: reparto.amount,
      byCycle,
      workdayIds: a.workdayIds,
    };
    posicion.set(key, out.length);
    out.push(nuevo);
    workdayIds.push(...a.workdayIds);
    newAdvanceApplications.push(...ahora);
    added.push({
      key,
      rut: a.rut,
      name: nuevo.name,
      isNew: true,
      gross: suma,
      anticipos: reparto.anticiposTotal,
      bonos: reparto.bonosTotal,
      oldGross: 0,
      newGross: suma,
      oldNet: 0,
      newNet: reparto.amount,
    });
  }

  return { items: out, workdayIds, newAdvanceApplications, added, sinBruto };
}

// Los días y anticipos de UNA persona, listos para `planAddWorkdays`, bajo la
// clave con la que figura en la nómina: la de su item si ya está, la de su
// ficha si no. Sus jornadas viejas pueden guardar el rut que tenía entonces y
// sus anticipos otro distinto; sin unificarlos entraría partida en dos items,
// o sin que se le descuente lo que debe. Devuelve copias: lo que se etiqueta
// y lo que va al snapshot sigue saliendo de los documentos originales.
export function asPayrollWorker({ items = [], keys = [], fallbackKey, rut, workdays = [], advances = [] }) {
  const claves = new Set(keys);
  const existing = items.find((it) => claves.has(it.workerId) || claves.has(it.rut)) || null;
  const key = existing ? existing.workerId || existing.rut : fallbackKey;
  const rutItem = existing?.rut || rut || key;
  return {
    key,
    existing,
    workdays: workdays.map((wd) => ({ ...wd, workerId: key, workerRut: rutItem })),
    advances: advances.map((a) => ({ ...a, workerId: key })),
  };
}

// Los días de una persona, para elegir cuáles sumar a una nómina: una fila
// por (ciclo, labor, fecha) y estado. El monto es lo que esa fila sumaría al
// bruto, con la misma cuenta que `aggregateWorkerAmounts`: lo que se ve al
// elegir es lo que entra.
//
// `status`: "pending" (se puede agregar), "here" (ya está en esta nómina) u
// "other" (está en otra; `payrollId` dice en cuál).
export function workerDayRows(workdays = [], { laborTypeById = new Map(), payrollId = null } = {}) {
  const filas = new Map();
  for (const wd of workdays || []) {
    const status = !wd.payrollId ? "pending" : wd.payrollId === payrollId ? "here" : "other";
    const key = [wd.cycleId, wd.laborId, wd.date || "", status, status === "other" ? wd.payrollId : ""].join("|");
    let fila = filas.get(key);
    if (!fila) {
      fila = {
        key,
        cycleId: wd.cycleId,
        laborId: wd.laborId,
        date: wd.date || "",
        status,
        payrollId: wd.payrollId || null,
        workdayIds: [],
        workdays: [],
        amount: 0,
      };
      filas.set(key, fila);
    }
    fila.workdayIds.push(wd.id);
    fila.workdays.push(wd);
    fila.amount += workdayPayAmount(wd, laborTypeById.get(wd.laborId));
  }
  return [...filas.values()].sort(
    (a, b) =>
      String(a.cycleId).localeCompare(String(b.cycleId)) ||
      a.date.localeCompare(b.date) ||
      String(a.laborId).localeCompare(String(b.laborId)),
  );
}

// ───────────────────────── Armar una nómina nueva ─────────────────────────
//
// Al generar se eligen ciclos con sus labores y, además o en vez de eso, los
// días puntuales de personas sueltas. La elección de ciclos llega como
// `chosen`: Map(cycleId → laborIds), con la misma convención que
// `cycleDetails[].laborIds` (`undefined` = el ciclo entero, una lista = solo
// esas labores, `[]` = ninguna).

// Si una jornada ya entra a la nómina nueva por los ciclos y labores elegidos.
// Los días de una persona suelta que entran así se muestran incluidos, en vez
// de dejarlos elegir por segunda vez.
export function inChosenCycles(wd, chosen = new Map()) {
  if (!chosen.has(wd?.cycleId)) return false;
  const laborIds = chosen.get(wd.cycleId);
  return !Array.isArray(laborIds) || laborIds.includes(wd.laborId);
}

// Los `cycleDetails` de una nómina nueva: los ciclos elegidos con al menos una
// labor, con lo que se eligió de cada uno, y con `laborIds: []` los que entran
// solo por los días de una persona suelta. Es lo mismo que deja "+ Agregar
// persona" en una nómina ya armada: Recalcular no trae después el resto de ese
// ciclo. Un ciclo elegido sin ninguna labor no entra, salvo que lo traiga una
// persona.
//
// Va en el orden de `cycles`, el de la pantalla: las columnas por ciclo del
// XLSX no dependen del orden en que se fue eligiendo cada cosa.
export function newPayrollCycleDetails({ cycles = [], chosen = new Map(), workdays = [], faenas = [], subfaenas = [] }) {
  const alcance = new Map();
  for (const [cycleId, laborIds] of chosen) {
    if (Array.isArray(laborIds) && laborIds.length === 0) continue;
    alcance.set(cycleId, laborIds);
  }
  for (const wd of workdays || []) {
    if (wd?.cycleId && !alcance.has(wd.cycleId)) alcance.set(wd.cycleId, []);
  }
  return cycles
    .filter((c) => alcance.has(c.id))
    .map((c) => conLabores(cycleDetailOf(c, { faenas, subfaenas }), alcance.get(c.id)));
}

// De los días que se le eligieron a una persona, los que siguen libres al
// releerlos: entre que se eligieron y ahora, otra nómina pudo tomar alguno.
// `tomadas` cuenta los que quedan afuera, también los que ya no existen.
export function stillFreeWorkdays(fresh = [], workdayIds = []) {
  const pedidas = new Set(workdayIds);
  const libres = (fresh || []).filter((wd) => pedidas.has(wd.id) && !wd.payrollId);
  return { libres, tomadas: pedidas.size - libres.length };
}
