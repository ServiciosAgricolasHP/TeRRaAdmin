// Cálculos del detalle de una nómina: los líderes y el filtro de sus items,
// los resúmenes por grupo, por subfaena y por labor, el período de sus
// ciclos, las filas de la tabla del resumen, lo marcado para sacar y la
// última edición.
import { isCashBank } from "./banks";
import { normalizeLeader } from "./payroll";
import { matchesSearchQuery } from "./textSearch";
import { millisOf } from "./syncedList";
import { lastSeenLabel } from "./userAccounts";

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

// El nombre corto de un ciclo en el resumen: el que se le puso en
// "📝 Editar encabezados" o, si no, su etiqueta sin el prefijo
// "Faena/Subfaena/".
export function summaryCycleName(cycleDetail, overrides = {}) {
  const override = overrides[cycleDetail.id];
  if (override) return override;
  const label = cycleDetail.label || "";
  const parts = label.split("/");
  return (parts.length >= 3 ? parts.slice(2).join("/") : label) || cycleDetail.id;
}

// Orden de los ciclos dentro de una subfaena: por su primer día y, si
// empatan, por nombre ("Ciclo 2" antes que "Ciclo 10").
const byCycleOrder = (a, b) =>
  (a.firstDay || "").localeCompare(b.firstDay || "") ||
  (a.cycleName || "").localeCompare(b.cycleName || "", "es", { numeric: true });

// Lo que queda de cada parte del bruto de una persona (un ciclo, o un ciclo y
// una labor) después de sus bonos y anticipos. El bono entra entero a la parte
// más grande, y el anticipo se descuenta desde la más grande hacia la más
// chica: baja una a cero antes de tocar la siguiente, así se ve como un solo
// descuento. `preferred` desempata (la parte donde la persona tiene sus días,
// cuando todas suman $0).
export function netPartsOf(amounts, { advance = 0, bonus = 0, preferred = 0 } = {}) {
  const net = amounts.map((a) => Math.round(Number(a) || 0));
  if (net.length === 0) return net;
  const order = net.map((_, i) => i).sort((a, b) => net[b] - net[a] || (b === preferred) - (a === preferred) || a - b);
  net[order[0]] += Math.round(Number(bonus) || 0);
  let left = Math.round(Number(advance) || 0);
  for (const i of order) {
    const take = Math.min(left, Math.max(0, net[i]));
    net[i] -= take;
    left -= take;
  }
  return net;
}

// Lo que se le paga a una persona por cada ciclo, con sus bonos y anticipos
// ya descontados (`netPartsOf`). Quien suma $0 lleva su bono al ciclo de sus
// jornadas.
export function netByCycleOf(item) {
  const cycleIds = Object.keys(item.byCycle || {});
  const firstWorkdayCycle = String(item.workdayIds?.[0] || "").split("__")[0];
  const net = netPartsOf(cycleIds.map((id) => item.byCycle[id]), {
    advance: item.advance,
    bonus: item.bonus,
    preferred: Math.max(0, cycleIds.indexOf(firstWorkdayCycle)),
  });
  return Object.fromEntries(cycleIds.map((id, i) => [id, net[i]]));
}

// Resumen por subfaena (primera hoja del "Detalle de pago" imprimible):
// subfaenas con monto > 0, ordenadas por faena y subfaena, con
// transferencia y efectivo por fila. Sin subfaena guardada, la fila usa el
// label del ciclo, y "—" sin faena. Cada fila dice cuántos ciclos con monto
// junta (`cycleCount`) y cuáles (`cycleNames`). Con `byCycle` va una fila por
// ciclo (`cycleName`), en el orden de `byCycleOrder` dentro de su subfaena, y
// `cycleCount` es el de su subfaena. `cycleNameOf(cycleDetail)` da el nombre.
// Con `net`, cada fila trae lo que se paga, con los bonos y anticipos de cada
// persona ya descontados (`netByCycleOf`), y sigue la fila que quedó en $0.
export function subfaenaSummaryOf(cycleDetails, bank, cash, { byCycle = false, net = false, cycleNameOf = (cd) => cd.label || cd.id } = {}) {
  const grossFor = (arr, cycleId) => arr.reduce((s, it) => s + (Number(it.byCycle?.[cycleId]) || 0), 0);
  const netOf = new Map(net ? [...bank, ...cash].map((it) => [it, netByCycleOf(it)]) : []);
  const sumFor = net
    ? (arr, cycleId) => arr.reduce((s, it) => s + (Number(netOf.get(it)?.[cycleId]) || 0), 0)
    : grossFor;
  const bySubfaena = new Map();
  for (const cd of cycleDetails) {
    const sId = cd.subfaenaId || `__${cd.id}__`;
    if (!bySubfaena.has(sId)) {
      bySubfaena.set(sId, {
        subfaenaName: cd.subfaenaName || cd.label || "—",
        faenaName: cd.faenaName || "—",
        cycleIds: new Set(),
        cycles: [],
      });
    }
    const s = bySubfaena.get(sId);
    s.cycleIds.add(cd.id);
    const cycle = { id: cd.id, cycleName: cycleNameOf(cd), firstDay: cd.firstDay || "", bank: sumFor(bank, cd.id), cash: sumFor(cash, cd.id) };
    const gross = net ? grossFor(bank, cd.id) + grossFor(cash, cd.id) : 0;
    if (cycle.bank + cycle.cash > 0 || gross > 0) s.cycles.push(cycle);
  }
  const rows = [];
  for (const { subfaenaName, faenaName, cycleIds, cycles } of bySubfaena.values()) {
    cycles.sort(byCycleOrder);
    const shared = { subfaenaName, faenaName, cycleCount: cycles.length, cycleNames: cycles.map((c) => c.cycleName) };
    if (byCycle) {
      for (const c of cycles) {
        rows.push({ ...shared, cycleIds: new Set([c.id]), cycleName: c.cycleName, firstDay: c.firstDay, bank: c.bank, cash: c.cash, total: c.bank + c.cash });
      }
    } else {
      const rowBank = cycles.reduce((s, c) => s + c.bank, 0);
      const rowCash = cycles.reduce((s, c) => s + c.cash, 0);
      if (cycles.length > 0) rows.push({ ...shared, cycleIds, bank: rowBank, cash: rowCash, total: rowBank + rowCash });
    }
  }
  rows.sort((a, b) =>
    a.faenaName.localeCompare(b.faenaName, "es") ||
    a.subfaenaName.localeCompare(b.subfaenaName, "es") ||
    (byCycle ? byCycleOrder(a, b) : 0));
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

// Resumen por labor (segunda hoja del "Detalle de pago" imprimible y vista
// "con labores" del Resumen en pantalla). Mismo criterio que subfaenaSummary
// (banco y efectivo por fila), desglosado también por labor y sumando a todos
// los trabajadores de la nómina. Necesita `workdaysByGroup` (ver
// buildWorkdaysByGroup): payroll.items solo trae el total por ciclo. Cada
// fila dice cuántos ciclos junta (`cycleCount`) y cuáles (`cycleNames`); con
// `byCycle` va una fila por ciclo y labor, como en subfaenaSummaryOf. Con
// `net`, cada fila trae lo que se paga: los bonos y anticipos de cada persona
// se descuentan entre sus ciclos y labores (`netPartsOf`).
export function computeLaborSummary(payroll, allGroups, workdaysByGroup, { byCycle = false, net = false, cycleNameOf = (cd) => cd.label || cd.id } = {}) {
  const allItems = allGroups.flatMap((g) => g.items);
  const cashByRut = new Map(allItems.map((it) => [it.rut, isCashBank(it.bankCode)]));
  const cycleDetails = payroll.cycleDetails || [];
  const nameOf = (cid) => {
    const cd = cycleDetails.find((c) => c.id === cid);
    return cd ? cycleNameOf(cd) : cid;
  };
  // La subfaena se reconoce por su id, como en subfaenaSummaryOf, y lleva el
  // nombre de su primer ciclo en la nómina: un ciclo que se agregó después de
  // renombrarla trae el nombre nuevo, y sigue siendo la misma subfaena.
  const subfaenaKeyOf = (cd) => cd.subfaenaId || `__${cd.id}__`;
  const subfaenaNames = new Map();
  for (const cd of cycleDetails) {
    if (!subfaenaNames.has(subfaenaKeyOf(cd))) subfaenaNames.set(subfaenaKeyOf(cd), cd.subfaenaName || cd.label || cd.id);
  }
  // Cada parte: lo de una persona en un ciclo y una labor.
  const parts = [];
  for (const g of allGroups) {
    const groupCycles = workdaysByGroup[g.leader] || {};
    for (const [cid, snapshots] of Object.entries(groupCycles)) {
      for (const snap of snapshots) {
        for (const row of snap.rows) {
          const gross = Number(row.totalAmount) || 0;
          parts.push({ cid, laborName: snap.laborName, rut: row.rut, gross, amount: gross });
        }
      }
    }
  }
  if (net) {
    const itemByRut = new Map(allItems.map((it) => [it.rut, it]));
    const partsByRut = new Map();
    for (const part of parts) {
      if (!partsByRut.has(part.rut)) partsByRut.set(part.rut, []);
      partsByRut.get(part.rut).push(part);
    }
    for (const [rut, own] of partsByRut) {
      const item = itemByRut.get(rut);
      if (!item) continue;
      const amounts = netPartsOf(own.map((x) => x.gross), { advance: item.advance, bonus: item.bonus });
      own.forEach((part, i) => { part.amount = amounts[i]; });
    }
  }
  const acc = new Map(); // clave: subfaena||labor, o ciclo||labor
  for (const part of parts) {
    if (!(part.amount > 0 || (net && part.gross > 0))) continue;
    const { cid } = part;
    const cd = cycleDetails.find((c) => c.id === cid);
    const subfaenaKey = cd ? subfaenaKeyOf(cd) : `__${cid}__`;
    const key = `${byCycle ? cid : subfaenaKey}||${part.laborName}`;
    if (!acc.has(key)) {
      const entry = {
        faenaName: cd?.faenaName || "—",
        subfaenaName: cd ? subfaenaNames.get(subfaenaKey) : cid,
        laborName: part.laborName, bank: 0, cash: 0, total: 0, cycleIds: new Set(),
      };
      if (byCycle) Object.assign(entry, { cycleName: nameOf(cid), firstDay: cd?.firstDay || "" });
      acc.set(key, entry);
    }
    const entry = acc.get(key);
    if (cashByRut.get(part.rut)) entry.cash += part.amount;
    else entry.bank += part.amount;
    entry.total += part.amount;
    entry.cycleIds.add(cid);
  }
  const rows = [...acc.values()]
    .map((r) => {
      const cycleNames = [...r.cycleIds].map(nameOf);
      return { ...r, cycleCount: cycleNames.length, cycleNames };
    })
    .sort((a, b) =>
      a.faenaName.localeCompare(b.faenaName, "es") ||
      a.subfaenaName.localeCompare(b.subfaenaName, "es") ||
      (byCycle ? byCycleOrder(a, b) : 0) ||
      a.laborName.localeCompare(b.laborName, "es"));
  const totals = rows.reduce(
    (acc2, r) => ({ bank: acc2.bank + r.bank, cash: acc2.cash + r.cash, total: acc2.total + r.total }),
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

// Cómo se llama el resumen: "por subfaena", "por labor", "por ciclo" o
// "por ciclo y labor".
export function summaryTitleOf({ showLabor, byCycle = false, gross = false }) {
  const by = byCycle ? (showLabor ? "por ciclo y labor" : "por ciclo") : showLabor ? "por labor" : "por subfaena";
  return gross ? `${by} (bruto)` : by;
}

// Las columnas de texto de la tabla del resumen, antes de Transferencia,
// Efectivo y TOTAL: por subfaena o, con labores, también por labor; con los
// ciclos separados, también por ciclo.
export function summaryLabelColumnsOf({ showLabor, byCycle = false }) {
  return [
    { key: "faena", label: "Faena" },
    { key: "subfaena", label: "Subfaena" },
    ...(byCycle ? [{ key: "cycle", label: "Ciclo" }] : []),
    ...(showLabor ? [{ key: "labor", label: "Labor" }] : []),
    { key: "period", label: "Período" },
  ];
}

// Aplana filas y subtotales por faena en una sola lista, con el texto de cada
// columna de `summaryLabelColumnsOf` en `labels`: la pantalla, el Excel y las
// impresiones arman con esto la misma tabla. La faena va al empezar cada
// faena (con labores, al empezar cada subfaena, junto con la subfaena), y con
// los ciclos separados la subfaena y el ciclo, al empezar cada uno.
// Con los ciclos juntos, una fila que junta varios lleva en `notes` la marca
// "N ciclos" para su subfaena (o su labor) y en `noteTitle` sus nombres.
// `periodOf(cycleIds)` da el período de una fila.
export function summaryDisplayRowsOf(activeSummary, { showLabor, byCycle = false, periodOf }) {
  if (!activeSummary) return [];
  const rows = activeSummary.rows;
  const out = [];
  const cycleOf = (r) => (r ? [...r.cycleIds][0] : null);
  rows.forEach((r, i, arr) => {
    const prev = arr[i - 1];
    const period = periodOf(r.cycleIds);
    if (byCycle) {
      const newFaena = r.faenaName !== prev?.faenaName;
      const newSubfaena = newFaena || r.subfaenaName !== prev?.subfaenaName;
      const newCycle = newSubfaena || cycleOf(r) !== cycleOf(prev);
      out.push({
        row: r,
        labels: showLabor
          ? [newSubfaena ? r.faenaName : "", newSubfaena ? r.subfaenaName : "", newCycle ? r.cycleName : "", r.laborName, period]
          : [newFaena ? r.faenaName : "", newSubfaena ? r.subfaenaName : "", r.cycleName, period],
      });
    } else {
      const entry = showLabor
        ? { row: r, labels: [r.subfaenaName !== prev?.subfaenaName ? r.faenaName : "", r.subfaenaName !== prev?.subfaenaName ? r.subfaenaName : "", r.laborName, period] }
        : { row: r, labels: [r.faenaName !== prev?.faenaName ? r.faenaName : "", r.subfaenaName, period] };
      if (r.cycleCount > 1) {
        entry.notes = { [showLabor ? "labor" : "subfaena"]: `${r.cycleCount} ciclos` };
        entry.noteTitle = `Junta ${r.cycleNames.join(", ")}`;
      }
      out.push(entry);
    }
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

// Los anticipos y los bonos que aplicó la nómina, una fila por cada uno: la
// persona, la fecha y la nota (de `advances`, los del snapshot) y lo que se
// aplicó en esta nómina. Cada lista va por persona y, dentro, por fecha.
export function advancesAndBonusesOf(items, advances = []) {
  const byId = new Map((advances || []).map((a) => [a.id, a]));
  const rowsOf = (key) => items
    .flatMap((it) => (it[key] || []).map((app) => {
      const adv = byId.get(app.advanceId);
      return {
        advanceId: app.advanceId,
        name: it.name || it.rut || "",
        rut: it.rut || "",
        date: adv?.date || "",
        note: adv?.note || "",
        amount: Number(app.amount) || 0,
      };
    }))
    .filter((r) => r.amount > 0)
    .sort((a, b) => a.name.localeCompare(b.name, "es") || a.date.localeCompare(b.date));
  const sum = (rows) => rows.reduce((s, r) => s + r.amount, 0);
  const advanceRows = rowsOf("anticipoApplications");
  const bonusRows = rowsOf("bonoApplications");
  return { advances: advanceRows, bonuses: bonusRows, advanceTotal: sum(advanceRows), bonusTotal: sum(bonusRows) };
}

// "Última edición: hace 5 min · Ana": cuándo se escribió la nómina por última
// vez (`updatedAt`, como "Visto por última vez" en Usuarios) y quién
// (`updatedByName`, si lo tiene). Sin `updatedAt`, null.
export function lastEditLabel(payroll, now = new Date()) {
  const ms = millisOf(payroll?.updatedAt);
  if (!ms) return null;
  const who = payroll.updatedByName ? ` · ${payroll.updatedByName}` : "";
  return `Última edición: ${lastSeenLabel(new Date(ms), now)}${who}`;
}
