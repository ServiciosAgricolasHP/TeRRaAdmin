// Reparto de anticipos y bonos sobre el bruto de un trabajador.
//
// Esta cuenta estaba escrita cuatro veces adentro de `Payroll.jsx` —al armar
// la nómina, al agregar ciclos, al recalcular, y al aplicar anticipos nuevos
// sobre alguien que ya estaba— y AGENTS.md avisaba que tocar el orden o el
// tope obligaba a tocar las cuatro. Los cuatro sitios son el mismo algoritmo:
// el último arranca de una base que ya trae descuentos aplicados, y eso es
// justo lo que expresan `alreadyAdvanced` / `alreadyBonused`.
//
// La regla, y por qué importa el orden:
//
//   1. Los BONOS van primero y se aplican completos. Engrosan la base contra
//      la que después se descuenta el anticipo.
//   2. Los ANTICIPOS van después, del más viejo al más nuevo, topeados por
//      esa base. De cada uno se toma `advanceDueNow`: la cuota si tiene plan,
//      el saldo entero si no.
//
// Invertir el orden deja el anticipo sin liquidar por exactamente el monto del
// bono: al trabajador se le entrega el bono en la mano y la deuda arrastra a
// la nómina siguiente en vez de cerrarse. La plata que desembolsa la empresa
// es la misma en los dos órdenes; lo que cambia es si la deuda queda cerrada.
import { advanceRemaining, advanceDueNow } from "../services/advancesService";

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

  // Anticipos: oldest-first, topeados por lo que queda de base.
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
// exactamente lo que esta nómina le descuenta.
//
// Antes cada camino lo resolvía a su manera y los dos dejaban mal la plata:
//   - Sacar un ciclo dejaba el anticipo aplicado entero aunque el bruto que
//     quedaba no alcanzara a respaldarlo, y el `Math.max(0, …)` del neto se
//     tragaba la diferencia. Esa plata no se descontaba en ninguna nómina.
//   - Recalcular lo dejaba aplicado entero también, pero creaba un anticipo
//     NUEVO por el saldo. No se perdía plata, pero el original figuraba como
//     cobrado por una nómina que no lo retuvo, y quedaba un anticipo sintético
//     que nadie había dado.

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
// Un trabajador SALE entero cuando el bruto que le queda es 0 — no cuando "se
// le acaban las claves de `byCycle`". Ese era el bug: al armar la nómina,
// `byCycle` guarda una entrada por CADA ciclo, incluso con $0, así que quien
// solo trabajó en el ciclo sacado quedaba con `{ otroCiclo: 0 }` y se lo
// trataba como reducción parcial. Seguía en la nómina con bruto 0 y el
// anticipo aplicado; la nómina siguiente no lo veía como pendiente y nunca se
// descontaba. Cortar por bruto es además el mismo criterio que usa armar la
// nómina (`a.total > 0`), que es lo que hace que el resultado sea "como si se
// hubiera armado sin este ciclo".
//
// El que sale suelta TODOS sus anticipos y bonos de esta nómina y todas sus
// jornadas, incluidas las de $0 de otros ciclos: armada sin este ciclo, esa
// persona no estaría. El que se queda pierde las jornadas del ciclo (también
// las de $0, que antes quedaban etiquetadas a una nómina que ya no tenía ese
// ciclo) y re-encaja sus anticipos con `refitAppliedAdvances`.
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

// Más descontado del que el bruto respalda. No debería existir, pero es como
// quedaron las nóminas a las que se les sacó un ciclo antes de
// `planCycleRemoval`: recalcularlas las repara sin tocar nada a mano.
export function isOverApplied(it) {
  return (Number(it?.advance) || 0) > brutoDe(it) + (Number(it?.bonus) || 0);
}

// Si un trabajador que ya está en la nómina hay que re-repartirlo al
// recalcular contra su producción vigente (`fresh`, de `aggregateWorkerAmounts`).
// Separado de `planRecalcExisting` para que la pantalla lea solo los anticipos
// de estos: el resto de la nómina no paga lecturas.
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
