// Contratos y honorarios de los trabajadores (`employments`): qué está vigente
// en una fecha o en un rango, qué períodos se cruzan, los días trabajados por
// faena y las filas de las listas de honorarios e imposiciones.
//
// Las fechas son etiquetas `YYYY-MM-DD` y se comparan como texto. Un período
// sin `endDate` sigue vigente; con una fecha futura, lo está hasta ese día.

export const EMPLOYMENT_TYPES = {
  contract: { label: "Contrato", icon: "📄" },
  fees: { label: "Honorarios", icon: "🧾" },
};

export const employmentTypeLabel = (type) => EMPLOYMENT_TYPES[type]?.label || "—";

export const END_REASONS = {
  jobEnd: "Término de faena",
  companyNeeds: "Necesidad de la empresa",
  resignation: "Renuncia",
  mutualAgreement: "Mutuo acuerdo",
  other: "Otro",
};

export const SETTLEMENT_STATUSES = {
  pending: "Pendiente",
  requested: "Solicitado",
  done: "Listo",
};

// Estado de una persona en el filtro: con contrato, a honorarios o sin nada.
export const EMPLOYMENT_FILTERS = {
  contract: "Con contrato",
  fees: "A honorarios",
  none: "Sin contrato ni honorarios",
};

const FAR_FUTURE = "9999-12-31";
const endOf = (e) => e?.endDate || FAR_FUTURE;

export const isActiveOn = (e, date) => !!e?.startDate && e.startDate <= date && endOf(e) >= date;

// Vigente en algún día de `from` a `to`.
export const isActiveIn = (e, from, to) => !!e?.startDate && e.startDate <= to && endOf(e) >= from;

// Los períodos vigentes en el rango, por trabajador. Un trabajador puede tener
// más de uno en un rango largo (un contrato que terminó y honorarios después).
export function activeByWorker(employments, from, to = from) {
  const map = new Map();
  for (const e of employments) {
    if (!isActiveIn(e, from, to)) continue;
    if (!map.has(e.workerId)) map.set(e.workerId, []);
    map.get(e.workerId).push(e);
  }
  return map;
}

// Si los períodos de una persona en el rango calzan con un filtro: el tipo
// (`contract`, `fees` o `none`) y, si se pide, el empleador.
export function matchesEmploymentFilter(active = [], { type = "", employerId = "" } = {}) {
  if (!type && !employerId) return true;
  if (type === "none") return active.length === 0;
  return active.some((e) => (!type || e.type === type) && (!employerId || e.employerId === employerId));
}

// Grupos de la grilla del ciclo en la vista "Por contrato", en su orden.
export const EMPLOYMENT_GROUPS = [
  { key: "contract", label: "Con contrato", icon: "📄" },
  { key: "fees", label: "A honorarios", icon: "🧾" },
  { key: "none", label: "Sin contrato ni honorarios", icon: "➖" },
];

// El grupo de una persona según sus períodos vigentes: con contrato si tuvo
// alguno, si no a honorarios, y si no, sin nada.
export function employmentGroupOf(active = []) {
  if (active.some((e) => e.type === "contract")) return "contract";
  if (active.some((e) => e.type === "fees")) return "fees";
  return "none";
}

// El período de la misma persona que se cruza con `draft`, o null. `draft`
// puede ser un período existente que se edita (se ignora a sí mismo).
export function overlapping(employments, draft) {
  return (
    employments.find(
      (e) =>
        (!draft.id || e.id !== draft.id) &&
        e.workerId === draft.workerId &&
        e.startDate <= endOf(draft) &&
        draft.startDate <= endOf(e),
    ) || null
  );
}

// Un período nuevo o editado: fechas válidas y sin cruzarse con otro de la
// misma persona. Devuelve el texto del error o "".
export function employmentError(employments, draft) {
  if (!draft.workerId) return "Falta la persona.";
  if (!EMPLOYMENT_TYPES[draft.type]) return "Falta el tipo.";
  if (!draft.employerId) return "Falta el empleador.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.startDate || "")) return "Falta la fecha de inicio.";
  if (draft.endDate && draft.endDate < draft.startDate) return "La fecha de término es anterior a la de inicio.";
  const other = overlapping(employments, draft);
  if (other) {
    const until = other.endDate ? ` al ${other.endDate}` : " sin término";
    return `Se cruza con ${employmentTypeLabel(other.type).toLowerCase()} del ${other.startDate}${until}.`;
  }
  return "";
}

// ── Acciones masivas ────────────────────────────────────────────────────────

// Contratar o pasar a honorarios a varias personas desde la misma fecha.
// `existing`: los períodos que ya tienen esas personas. Quien se cruzaría con
// otro período queda en `skipped`, con el motivo.
export function planStartEmployments(existing, people, { type, employerId, startDate, notes = "" }) {
  const create = [];
  const skipped = [];
  for (const p of people) {
    const draft = {
      workerId: p.workerId,
      workerRut: p.rut || p.workerId,
      workerName: p.name || "",
      type,
      employerId,
      startDate,
      endDate: "",
      endReason: null,
      settlementStatus: null,
      notes,
    };
    const error = employmentError([...existing, ...create], draft);
    if (error) skipped.push({ person: p, reason: error });
    else create.push(draft);
  }
  return { create, skipped };
}

// Terminar varios períodos el mismo día y por el mismo motivo. Un contrato
// queda con el finiquito pendiente. Uno que empezó después de esa fecha queda
// en `skipped`.
export function planEndEmployments(employments, { endDate, endReason }) {
  const update = [];
  const skipped = [];
  for (const e of employments) {
    if (endDate < e.startDate) {
      skipped.push({ employment: e, reason: "Empezó después de esa fecha." });
      continue;
    }
    update.push({ id: e.id, patch: { endDate, endReason, settlementStatus: e.type === "contract" ? "pending" : null } });
  }
  return { update, skipped };
}

// ── Días trabajados ─────────────────────────────────────────────────────────

// Días trabajados por persona y faena. Cuenta un día si hay al menos una
// jornada, también la asistencia de un mensual. Un día con jornadas en dos
// faenas cuenta una sola vez, en la faena de la jornada de mayor monto.
// `faenaOfCycle`: Map(cycleId → faenaId). Devuelve
// Map(workerId → Map(date → faenaId)).
export function workedDays(workdays, faenaOfCycle, { workerIdOf = (wd) => wd.workerId || wd.workerRut } = {}) {
  const best = new Map();
  for (const wd of workdays) {
    const workerId = workerIdOf(wd);
    if (!workerId || !wd.date) continue;
    const faenaId = faenaOfCycle.get(wd.cycleId) || "";
    const amount = Number(wd.amount) || 0;
    if (!best.has(workerId)) best.set(workerId, new Map());
    const days = best.get(workerId);
    const prev = days.get(wd.date);
    if (!prev || amount > prev.amount) days.set(wd.date, { faenaId, amount });
  }
  const out = new Map();
  for (const [workerId, days] of best) out.set(workerId, new Map([...days].map(([date, d]) => [date, d.faenaId])));
  return out;
}

// Filas de una lista: por persona y faena, los días trabajados dentro del
// rango que caen en un período del tipo y el empleador pedidos.
function rowsFor(employments, worked, { type, employerId, from, to }) {
  const periods = new Map();
  for (const e of employments) {
    if (e.type !== type || e.employerId !== employerId || !isActiveIn(e, from, to)) continue;
    if (!periods.has(e.workerId)) periods.set(e.workerId, []);
    periods.get(e.workerId).push(e);
  }
  const rows = [];
  for (const [workerId, list] of periods) {
    const byFaena = new Map();
    for (const [date, faenaId] of worked.get(workerId) || []) {
      if (date < from || date > to || !list.some((e) => isActiveOn(e, date))) continue;
      byFaena.set(faenaId, (byFaena.get(faenaId) || 0) + 1);
    }
    rows.push({ workerId, periods: list, byFaena });
  }
  return rows;
}

// ── Honorarios ──────────────────────────────────────────────────────────────

// Montos de una boleta de honorarios con tarifa fija por día. La tarifa es la
// líquida; el bruto por día se redondea y se multiplica, así 3 días a $18.452
// con 15,25% dan $65.316 bruto y $55.356 líquido.
export function feeAmounts(days, dailyNet, rate) {
  const n = Math.max(0, Number(days) || 0);
  const net = Number(dailyNet) || 0;
  const dailyGross = rate < 1 ? Math.round(net / (1 - (Number(rate) || 0))) : 0;
  const gross = n * dailyGross;
  return { net: n * net, gross, withholding: gross - n * net };
}

// Filas de la lista de honorarios: quienes estuvieron a honorarios con el
// empleador en el rango y trabajaron algún día, una fila por faena.
export function feeRows(employments, worked, { employerId, from, to }) {
  return rowsFor(employments, worked, { type: "fees", employerId, from, to }).flatMap(({ workerId, byFaena }) =>
    [...byFaena].map(([faenaId, days]) => ({ workerId, faenaId, days })),
  );
}

// ── Imposiciones ────────────────────────────────────────────────────────────

const pad = (n) => String(n).padStart(2, "0");

// Primer y último día de un mes `YYYY-MM`.
export function monthRange(month) {
  const [y, m] = String(month).split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(last)}` };
}

// Filas de la lista de imposiciones del mes: quienes tuvieron contrato con el
// empleador ese mes, una fila por faena con sus días. Quien tuvo contrato y no
// trabajó va con 0 días y sin faena. Si el contrato terminó ese mes, la fila
// pide liquidación y finiquito, con la fecha y el motivo.
export function contributionRows(employments, worked, { employerId, month }) {
  const { from, to } = monthRange(month);
  return rowsFor(employments, worked, { type: "contract", employerId, from, to }).flatMap(({ workerId, periods, byFaena }) => {
    const ended = periods.find((e) => e.endDate && e.endDate >= from && e.endDate <= to);
    const base = {
      workerId,
      request: ended ? "payslipAndSettlement" : "payslip",
      endDate: ended?.endDate || "",
      endReason: ended?.endReason || null,
    };
    if (byFaena.size === 0) return [{ ...base, faenaId: "", days: 0 }];
    return [...byFaena].map(([faenaId, days]) => ({ ...base, faenaId, days }));
  });
}

export const CONTRIBUTION_REQUESTS = {
  payslip: "Liquidación",
  payslipAndSettlement: "Liquidación + finiquito",
};
