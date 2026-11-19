// La revisión de una nómina: lo inusual que conviene mirar antes de pagarla.
// En Generar es una alarma; en el detalle, la explicación. Corre sobre lo que
// la pantalla ya tiene cargado (ver `buildCheckContext`) y no escribe nada.
//
// Cada alerta es de una persona y una revisión, con su clave estable
// (`checkId|persona`), que es lo que se guarda al marcarla revisada.
import { duplicateWorkdays, longStreaks, outlierQuantities, outOfCycleDates, sameDayLabors, staleQrSync, zeroAmountWorkdays } from "./workdayChecks";
import { missingGroup, missingWorker, similarNames, suggestGroupLeader, unknownGroup, withoutEmployment } from "./personChecks";
import { accountChanged, cuentaRutMismatch, firstPayment, missingPayee, sharedAccount } from "./paymentChecks";
import { pendingElsewhere, unusualAmount, zeroByAdvances } from "./amountChecks";
import { SEVERITY, buildCheckContext, severityRank } from "./checkContext";

export { SEVERITY, SEVERITY_ORDER } from "./checkContext";

// Las revisiones, en el orden en que se muestran dentro de cada nivel.
export const PAYROLL_CHECKS = [
  {
    id: "duplicateWorkday",
    run: duplicateWorkdays,
    title: "Jornada repetida",
    explanation: "La misma persona tiene dos jornadas iguales (ciclo, labor, día y tipo). Pasa cuando la ficha cambió de RUT o se unió con otra, y se paga dos veces.",
  },
  {
    id: "sameDayLabors",
    run: sameDayLabors,
    title: "Más de una labor el mismo día",
    explanation: "Trabajó en más de una labor o cosecha el mismo día, en esta nómina o en otros ciclos abiertos. Puede ser verdad (mañana y tarde), pero dos labores pagadas por día son dos días completos.",
  },
  {
    id: "zeroAmount",
    run: zeroAmountWorkdays,
    title: "Jornada en $0",
    explanation: "Una jornada que no es de sueldo mensual se paga en $0. Con cantidad y sin monto, casi siempre falta el precio de ese día en el ciclo.",
  },
  {
    id: "missingWorker",
    run: missingWorker,
    title: "Sin ficha",
    explanation: "Las jornadas son de alguien que no tiene ficha en Trabajadores, o de una ficha que se unió a otra.",
  },
  {
    id: "missingGroup",
    run: missingGroup,
    suggest: suggestGroupLeader,
    title: "Sin grupo",
    explanation: "La persona no tiene grupo. En efectivo no tiene sobre: el efectivo se arma por grupo.",
  },
  {
    id: "accountChanged",
    run: accountChanged,
    title: "La cuenta cambió",
    explanation: "La cuenta no es la de la última nómina que le pagó. Si nadie la cambió a propósito, un dígito mal puesto manda la plata a otra cuenta.",
  },
  {
    id: "cuentaRutMismatch",
    run: cuentaRutMismatch,
    title: "Cuenta RUT que no calza",
    explanation: "El número de una Cuenta RUT es el RUT de pago sin el dígito verificador, y este es otro.",
  },
  {
    id: "outlierQuantity",
    run: outlierQuantities,
    title: "Cantidad fuera de rango",
    explanation: "La cantidad (o el monto, en una labor por día) está muy sobre la del resto de la labor ese día. Suele ser un error de tipeo.",
  },
  {
    id: "outOfCycleDate",
    run: outOfCycleDates,
    title: "Fecha fuera del ciclo",
    explanation: "La jornada tiene una fecha que no está entre los días del ciclo, o que todavía no llega.",
  },
  {
    id: "staleQrSync",
    run: staleQrSync,
    title: "Pesajes QR sin sincronizar",
    explanation: "Una labor de cosecha de la nómina se llena con los pesajes QR, y su prefijo no se sincronizó después del último día que paga la nómina: puede haber pesajes que no llegaron a las jornadas.",
  },
  {
    id: "similarName",
    run: similarNames,
    title: "Puede ser la misma persona",
    explanation: "Dos personas de la nómina tienen nombres muy parecidos y RUT distintos: puede ser una ficha duplicada. Se unen en Trabajadores con Unir fichas.",
  },
  {
    id: "unknownGroup",
    run: unknownGroup,
    title: "Grupo fuera de la lista",
    explanation: "El grupo no está en la lista de líderes, o está deshabilitado. Escrito distinto, arma otro sobre de efectivo.",
  },
  {
    id: "noEmployment",
    run: withoutEmployment,
    title: "Sin contrato",
    explanation: "La nómina paga días en que la persona no tiene contrato ni honorarios vigentes.",
  },
  {
    id: "sharedAccount",
    run: sharedAccount,
    title: "Cuenta compartida",
    explanation: "Personas que cobran en la cuenta de otra, juntas por cuenta. Al titular no se lo marca. Puede ser legítimo (una familia), pero conviene verlo junto.",
  },
  {
    id: "missingPayee",
    run: missingPayee,
    title: "Sin titular",
    explanation: "Cobra en la cuenta de otra persona y la ficha no dice de quién es. El banco lo pide en el archivo.",
  },
  {
    id: "unusualAmount",
    run: unusualAmount,
    title: "Líquido sobre lo habitual",
    explanation: "Cobra más del doble de su promedio en sus últimas nóminas.",
  },
  {
    id: "longStreak",
    run: longStreaks,
    title: "Muchos días seguidos",
    explanation: "Trabajó más de 6 días seguidos sin descanso, contando los de otros ciclos abiertos.",
  },
  {
    id: "firstPayment",
    run: firstPayment,
    title: "Primera vez",
    explanation: "No está en ninguna nómina anterior. Conviene mirar sus datos de pago.",
  },
  {
    id: "zeroByAdvances",
    run: zeroByAdvances,
    title: "Queda en $0 por anticipos",
    explanation: "Tiene bruto, pero los anticipos que descuenta la nómina se lo llevan todo.",
  },
  {
    id: "pendingElsewhere",
    run: pendingElsewhere,
    title: "Le quedan días pendientes",
    explanation: "Tiene jornadas sin nómina en otros ciclos abiertos: esta nómina le paga solo una parte.",
  },
];

const checkById = new Map(PAYROLL_CHECKS.map((c, i) => [c.id, { ...c, order: i }]));
export const checkOf = (checkId) => checkById.get(checkId) || null;

export const checkKey = (checkId, person) => `${checkId}|${person}`;

// Las alertas de la nómina: `[{ key, checkId, person, rut, name, severity, lines }]`,
// de la más grave a la más leve, por revisión y por nombre. Las de "Sin
// grupo" traen además el grupo sugerido (`suggestion`, ver
// `suggestGroupLeader`), las de un grupo que no está en la lista, ese grupo
// (`missingLeader`), y las de una cuenta compartida, la cuenta (`account`,
// ver `sharedAccount`). Las que no son de una persona (un prefijo QR) van con
// `general: true`, `person: null` y su nombre en `name`. `input` es el de
// `buildCheckContext`.
export function payrollChecksOf(input) {
  const ctx = buildCheckContext(input);
  const alerts = [];
  for (const check of PAYROLL_CHECKS) {
    for (const found of check.run(ctx)) {
      if (found.general) {
        alerts.push({ key: checkKey(check.id, found.general), checkId: check.id, person: null, rut: "", name: found.label, general: true, severity: found.severity, lines: found.lines });
        continue;
      }
      const row = ctx.rowByPerson.get(found.person);
      const worker = ctx.workerById.get(found.person);
      alerts.push({
        key: checkKey(check.id, found.person),
        checkId: check.id,
        person: found.person,
        rut: row?.item.rut || worker?.rut || found.person,
        name: row?.name || worker?.name || "",
        severity: found.severity,
        lines: found.lines,
        ...(check.suggest ? { suggestion: check.suggest(ctx, found.person) } : {}),
        ...(found.missingLeader ? { missingLeader: found.missingLeader } : {}),
        ...(found.account ? { account: found.account } : {}),
      });
    }
  }
  return alerts.sort(
    (a, b) =>
      severityRank(a.severity) - severityRank(b.severity) ||
      checkById.get(a.checkId).order - checkById.get(b.checkId).order ||
      a.name.localeCompare(b.name, "es", { sensitivity: "base" }),
  );
}

// La huella de lo que dice una alerta: con ella, una marca vale mientras la
// alerta diga lo mismo que cuando se marcó.
export function alertSignature(alert) {
  const text = (alert?.lines || []).join("\n");
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// Las alertas revisadas guardadas en la nómina (`reviewedChecks`): una entrada
// por cada vez que alguien marcó, con las claves que marcó, dónde (`place`:
// "generate" o "detail") y la huella de cada alerta (`signatures`).
// Devuelve Map(clave → { by, byName, at, place, signature }); la última marca
// manda. Las marcas guardadas sin huella valen siempre.
export function reviewedIndex(reviewedChecks = []) {
  const map = new Map();
  for (const entry of reviewedChecks || []) {
    for (const key of entry?.keys || []) {
      map.set(key, {
        by: entry.by || "",
        byName: entry.byName || "",
        at: entry.at || "",
        place: entry.place || "",
        signature: entry.signatures?.[key] || "",
      });
    }
  }
  return map;
}

// Una entrada de `reviewedChecks` con solo las claves que pasan `keep`, y sus
// huellas.
function entryWith(entry, keep) {
  const keys = (entry?.keys || []).filter(keep);
  const out = { keys, by: entry?.by || "", byName: entry?.byName || "", at: entry?.at || "" };
  if (entry?.place) out.place = entry.place;
  const signatures = Object.fromEntries(Object.entries(entry?.signatures || {}).filter(([k]) => keys.includes(k)));
  if (Object.keys(signatures).length) out.signatures = signatures;
  return out;
}

// Lo que se guarda en la nómina de las revisadas: las marcas con solo las
// claves de alertas que siguen en `alerts`, sin las que quedan vacías.
export function reviewedChecksFor(reviewedChecks = [], alerts = []) {
  const live = new Set(alerts.map((a) => a.key));
  return (reviewedChecks || []).map((e) => entryWith(e, (k) => live.has(k))).filter((e) => e.keys.length);
}

// Aplica un cambio a las revisadas: `{ keys, on, by, byName, at, place,
// signatures }` marca (`on`) o desmarca esas claves, sobre lo que ya está.
// Las demás claves quedan como estaban, las haya marcado quien sea.
export function applyReviewChange(reviewedChecks = [], change) {
  const drop = new Set(change?.keys || []);
  const rest = (reviewedChecks || []).map((e) => entryWith(e, (k) => !drop.has(k))).filter((e) => e.keys.length);
  if (!change?.on || !drop.size) return rest;
  return [...rest, entryWith({ ...change, keys: [...drop] }, () => true)];
}

// Las alertas con su revisión (`review`, o `null` si no está revisada). Si la
// alerta cambió desde que se marcó, queda sin revisar y con la marca anterior
// en `staleReview`.
export function withReviews(alerts, reviewedChecks = []) {
  const index = reviewedIndex(reviewedChecks);
  return alerts.map((a) => {
    const review = index.get(a.key) || null;
    if (review?.signature && review.signature !== alertSignature(a)) return { ...a, review: null, staleReview: review };
    return { ...a, review };
  });
}

// Lo que cambió entre dos listas de revisadas: las claves que se marcaron
// (nuevas o marcadas de nuevo) y las que se desmarcaron.
export function reviewDiff(from = [], to = []) {
  const before = reviewedIndex(from);
  const after = reviewedIndex(to);
  const marked = [...after].filter(([k, r]) => !before.has(k) || before.get(k).at !== r.at).map(([k]) => k);
  const unmarked = [...before.keys()].filter((k) => !after.has(k));
  return { marked, unmarked };
}

// Cuántas alertas sin revisar hay de cada nivel, y cuántas revisadas.
export function checkSummary(alerts) {
  const summary = { [SEVERITY.red]: 0, [SEVERITY.orange]: 0, [SEVERITY.info]: 0, reviewed: 0 };
  for (const a of alerts) {
    if (a.review) summary.reviewed += 1;
    else summary[a.severity] += 1;
  }
  return summary;
}

// Las alertas de cada persona, para el ícono de su fila y su detalle de pago.
export function alertsByPerson(alerts) {
  const map = new Map();
  for (const a of alerts) {
    if (a.general) continue;
    if (!map.has(a.person)) map.set(a.person, []);
    map.get(a.person).push(a);
  }
  return map;
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const PLACE_TEXT = { generate: "en Generar", detail: "en el detalle" };

// Quién marcó, cuándo (en la hora local) y dónde: "Bruno, 18-nov 07:22, en el
// detalle". Lo que falta no se nombra.
export function reviewedByText(review) {
  const when = review?.at ? new Date(review.at) : null;
  const pad = (n) => String(n).padStart(2, "0");
  const date = when && !Number.isNaN(when.getTime()) ? `${pad(when.getDate())}-${MONTHS[when.getMonth()]} ${pad(when.getHours())}:${pad(when.getMinutes())}` : "";
  return [review?.byName, date, PLACE_TEXT[review?.place]].filter(Boolean).join(", ");
}
