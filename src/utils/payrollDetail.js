// Cálculos del detalle de una nómina: los líderes y el filtro de sus items,
// los resúmenes por grupo y por subfaena, el período de sus ciclos, las filas
// de la tabla del resumen y lo marcado para sacar.
import { isCashBank } from "./banks";
import { normalizeLeader } from "./payroll";
import { matchesSearchQuery } from "./textSearch";

// Líderes únicos en la nómina (para el filtro de grupo).
export function payrollLeadersOf(items) {
  const set = new Map(); // líder → cantidad
  for (const it of items) {
    const l = normalizeLeader(it.groupLeader || "") || "SIN GRUPO";
    set.set(l, (set.get(l) || 0) + 1);
  }
  return [...set.entries()]
    .map(([leader, count]) => ({ leader, count }))
    .sort((a, b) => a.leader.localeCompare(b.leader, "es"));
}

// Filtrado de items aplicando todos los criterios juntos.
export function filterPayrollItems(items, { search, paymentMethod, activeLeaderFilter, activeCycleFilter, rutOf }) {
  const q = search.trim();
  return items.filter((it) => {
    if (q) {
      const hay = `${it.rut || ""} ${rutOf(it.rut, it.workerId)} ${it.name || ""} ${it.groupLeader || ""}`;
      if (!matchesSearchQuery(hay, q)) return false;
    }
    const isCash = isCashBank(it.bankCode);
    if (paymentMethod === "bank" && isCash) return false;
    if (paymentMethod === "cash" && !isCash) return false;
    if (activeLeaderFilter.size > 0) {
      const l = normalizeLeader(it.groupLeader || "") || "SIN GRUPO";
      if (!activeLeaderFilter.has(l)) return false;
    }
    if (activeCycleFilter.size > 0) {
      const hasAny = [...activeCycleFilter].some((cid) => (Number(it.byCycle?.[cid]) || 0) > 0);
      if (!hasAny) return false;
    }
    return true;
  });
}

// Las dos tablas de totales por líder ("Resumen por grupo") de "Detalle de
// pago", con una fila por líder:
//   1) "Con cuenta RUT": CHILENOS y EXTRANJEROSCONCUENTARUT.
//   2) "Otros grupos": el resto de los líderes.
export function detailSummariesOf(allGroups, cycleDetails) {
  const CRUT_LEADERS = new Set(["CHILENOS", "EXTRANJEROSCONCUENTARUT"]);
  const compact = (s) => normalizeLeader(s).replace(/\s+/g, "");
  const inCrut = (g) => CRUT_LEADERS.has(compact(g.leader));

  // cycleId → faenaName; sin faena guardada, usa el label del ciclo.
  const faenaByCycle = new Map();
  for (const cd of cycleDetails || []) {
    faenaByCycle.set(cd.id, cd.faenaName || cd.label || "—");
  }
  const groupWithFaenas = (g) => {
    const byFaena = new Map();
    for (const it of g.items) {
      for (const [cid, amt] of Object.entries(it.byCycle || {})) {
        const fName = faenaByCycle.get(cid) || "—";
        byFaena.set(fName, (byFaena.get(fName) || 0) + (Number(amt) || 0));
      }
    }
    const byFaenaList = [...byFaena.entries()]
      .map(([faenaName, total]) => ({ faenaName, total }))
      .filter((f) => f.total > 0)
      .sort((a, b) => a.faenaName.localeCompare(b.faenaName, "es"));
    return { leader: g.leader, total: g.total, byFaena: byFaenaList };
  };

  const crut = allGroups.filter(inCrut).map(groupWithFaenas);
  const others = allGroups.filter((g) => !inCrut(g)).map(groupWithFaenas);
  const sumOf = (arr) => arr.reduce((s, g) => s + (Number(g.total) || 0), 0);
  const out = [];
  if (crut.length) {
    out.push({ title: "Con cuenta RUT", rows: crut, total: sumOf(crut) });
  }
  if (others.length) {
    out.push({ title: "Otros grupos", rows: others, total: sumOf(others) });
  }
  return out;
}

// Resumen por subfaena (primera hoja del "Detalle de pago" imprimible):
// subfaenas con monto > 0, ordenadas por faena y subfaena, con
// transferencia y efectivo por fila. Sin subfaena guardada, la fila usa el
// label del ciclo, y "—" sin faena.
export function subfaenaSummaryOf(cycleDetails, bank, cash) {
  const bySubfaena = new Map();
  for (const cd of cycleDetails) {
    const sId = cd.subfaenaId || `__${cd.id}__`;
    if (!bySubfaena.has(sId)) {
      bySubfaena.set(sId, {
        subfaenaName: cd.subfaenaName || cd.label || "—",
        faenaName: cd.faenaName || "—",
        cycleIds: new Set(),
      });
    }
    bySubfaena.get(sId).cycleIds.add(cd.id);
  }
  const sumForCycles = (arr, cycleIds) =>
    arr.reduce((s, it) => {
      let row = 0;
      for (const cid of cycleIds) row += Number(it.byCycle?.[cid]) || 0;
      return s + row;
    }, 0);
  const rows = [...bySubfaena.values()]
    .map((r) => ({
      ...r,
      bank: sumForCycles(bank, r.cycleIds),
      cash: sumForCycles(cash, r.cycleIds),
    }))
    .filter((r) => r.bank + r.cash > 0)
    .map((r) => ({ ...r, total: r.bank + r.cash }))
    .sort((a, b) => {
      const fa = a.faenaName.localeCompare(b.faenaName, "es");
      if (fa !== 0) return fa;
      return a.subfaenaName.localeCompare(b.subfaenaName, "es");
    });
  const totals = rows.reduce(
    (acc, r) => ({
      bank: acc.bank + r.bank,
      cash: acc.cash + r.cash,
      total: acc.total + r.total,
    }),
    { bank: 0, cash: 0, total: 0 },
  );
  return { rows, totals };
}

// Período de un grupo de ciclos de la nómina, del primer día al último
// ("01/10 → 03/10"), o "—" si ninguno lo tiene.
export function cyclesPeriodOf(cycleDetails, cycleIdsIn) {
  const fmtDayShort = (d) => {
    if (!d || typeof d !== "string") return "";
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}` : d;
  };
  let minFirst = null, maxLast = null;
  for (const cid of cycleIdsIn) {
    const cd = cycleDetails.find((c) => c.id === cid);
    const first = cd?.firstDay || "";
    const last = cd?.lastDay || "";
    if (first && (!minFirst || first < minFirst)) minFirst = first;
    if (last && (!maxLast || last > maxLast)) maxLast = last;
  }
  const a = fmtDayShort(minFirst), b = fmtDayShort(maxLast);
  if (a && b && a !== b) return `${a} → ${b}`;
  return a || b || "—";
}

// Aplana filas y subtotales por faena en una sola lista, así el JSX hace un
// .map() sin mirar la fila siguiente.
export function summaryDisplayRowsOf(activeSummary, summaryShowLabor) {
  if (!activeSummary) return [];
  const rows = activeSummary.rows;
  const out = [];
  rows.forEach((r, i, arr) => {
    const prev = arr[i - 1];
    const showLabel = summaryShowLabor ? r.subfaenaName !== prev?.subfaenaName : r.faenaName !== prev?.faenaName;
    out.push({ row: r, showLabel });
    const isLastOfFaena = i === arr.length - 1 || arr[i + 1].faenaName !== r.faenaName;
    if (isLastOfFaena) {
      const faenaRows = arr.filter((x) => x.faenaName === r.faenaName);
      out.push({
        subtotal: {
          bank: faenaRows.reduce((s, x) => s + x.bank, 0),
          cash: faenaRows.reduce((s, x) => s + x.cash, 0),
          total: faenaRows.reduce((s, x) => s + x.total, 0),
        },
      });
    }
  });
  return out;
}

export function removalSummaryOf(cycleBreakdown, activeRemoval) {
  let cyclesOut = 0;
  let laborsOut = 0;
  let amount = 0;
  let unknown = false;
  const lines = [];
  for (const c of cycleBreakdown) {
    const r = activeRemoval.get(c.id);
    if (!r) continue;
    if (r === true) {
      cyclesOut += 1;
      amount += c.amount;
      lines.push(`${c.label} (ciclo entero)`);
      continue;
    }
    const labs = c.labors.filter((l) => r.has(l.id));
    laborsOut += labs.length;
    for (const l of labs) {
      if (l.amount == null) unknown = true;
      else amount += l.amount;
    }
    lines.push(`${c.label}: ${labs.map((l) => l.name).join(", ")}`);
  }
  const allOut = cycleBreakdown.length > 0 && cycleBreakdown.every((c) => activeRemoval.get(c.id) === true);
  return { cyclesOut, laborsOut, amount, unknown, lines, allOut };
}
