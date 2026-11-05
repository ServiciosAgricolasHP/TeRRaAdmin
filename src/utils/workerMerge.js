// Unir fichas: una ficha duplicada (el clon, por ejemplo la que creó la
// importación de cosecha con el RUT provisorio que le dio otra empresa) se une
// a la ficha que queda. El cálculo vive acá, sin Firestore; lo escribe
// `mergeWorkers` (services/workerMergeService.js).
//
// - Las jornadas del clon que no están en una nómina pasan a la ficha que
//   queda: se recrean con el RUT que esa ficha usa en la labor, porque el id
//   de la jornada lleva el RUT. Las que están en una nómina no se tocan.
// - Si la ficha que queda ya tiene una jornada con ese id (mismo ciclo,
//   labor, día y tipo), es un choque, y se resuelve con `decisions`: "kept"
//   (queda la suya), "clone" (queda la del clon) o "sum" (se suman cantidad y
//   monto, solo en cosecha). Si la suya está en una nómina, queda esa.
// - En las labores de los ciclos abiertos, la ficha que queda toma el lugar
//   del clon; el clon sigue donde le quedan jornadas en una nómina.
// - La ficha que queda guarda los RUT del clon en `rutHistory` y su RUT y su
//   nombre en `fileAliases`; el clon queda marcado con `mergedInto`.

const keysOf = (w) => [...new Set([w?.id, w?.rut, ...(w?.rutHistory || [])].filter(Boolean))];
const num = (v) => Number(v) || 0;
const round2 = (n) => Math.round(n * 100) / 100;
const normName = (s) =>
  String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

export const MERGE_CHOICES = ["kept", "clone", "sum"];

// Las fichas que se muestran y se eligen: sin las unidas a otra.
export const activeWorkers = (list) => (list || []).filter((w) => !w?.mergedInto);

// La labor de una jornada: la suya o, si no la guarda, la primera del ciclo
// (como en la grilla).
const laborIdOf = (wd, cycle) => wd.laborId || cycle?.labors?.[0]?.id || "";

// El id de la jornada con el RUT de la ficha que queda en lugar del del clon.
// `null` si el id no lleva un RUT del clon.
export function retargetDocId(id, cloneKeys, rut) {
  const parts = String(id || "").split("__");
  const i = parts.findIndex((p, idx) => idx > 0 && cloneKeys.includes(p));
  if (i < 0) return null;
  parts[i] = rut;
  return parts.join("__");
}

// El RUT con que la ficha que queda figura en una labor: el de su entrada en
// la labor, si ya está, o su RUT vigente.
function keptRutIn(cycle, laborId, kept, keptKeys) {
  const labor = (cycle?.labors || []).find((l) => l.id === laborId);
  const entry = (labor?.workers || []).find((lw) => lw.id === kept.id || keptKeys.includes(lw.rut));
  return entry?.rut || kept.rut || kept.id;
}

// Lo que impide unir: elegir la misma ficha o una ya unida, y lo que el clon
// tiene y no se pasa solo (QR, anticipos o bonos con saldo, contratos y
// jornadas sin nómina en un ciclo cerrado). Devuelve los avisos, en texto.
export function mergeBlockers({ clone, kept, advances, employments, workdays, cycles }) {
  const out = [];
  if (!kept || kept.id === clone?.id) out.push("Elige otra ficha: no se puede unir una ficha consigo misma.");
  if (kept?.mergedInto) out.push("La ficha elegida ya está unida a otra.");
  if (clone?.mergedInto) out.push("Esta ficha ya está unida a otra.");
  const qr = clone?.idQr?.length || 0;
  if (qr) out.push(`Tiene ${qr} código${qr === 1 ? "" : "s"} QR: libéra${qr === 1 ? "lo" : "los"} en Cosecha QR antes de unir.`);
  const owed = (advances || []).filter((a) => ["pending", "partial"].includes(a.status || "pending") && num(a.amount) > num(a.amountPaid));
  if (owed.length) out.push(`Tiene ${owed.length} anticipo${owed.length === 1 ? "" : "s"} o bono${owed.length === 1 ? "" : "s"} con saldo: descuéntalo${owed.length === 1 ? "" : "s"} o anúla${owed.length === 1 ? "lo" : "los"} antes de unir.`);
  const jobs = employments?.length || 0;
  if (jobs) out.push(`Tiene ${jobs} contrato${jobs === 1 ? "" : "s"} u honorarios: termína${jobs === 1 ? "lo" : "los"} o pása${jobs === 1 ? "lo" : "los"} a la otra ficha antes de unir.`);
  const closed = [...new Set((workdays || [])
    .filter((w) => !w.payrollId && cycles?.[w.cycleId]?.status === "closed")
    .map((w) => cycles[w.cycleId].label || w.cycleId))];
  if (closed.length) out.push(`Tiene jornadas sin nómina en ${closed.length === 1 ? "un ciclo cerrado" : "ciclos cerrados"} (${closed.join(", ")}): reábre${closed.length === 1 ? "lo" : "los"} antes de unir.`);
  return out;
}

// El plan de la unión. `workdays`: las jornadas del clon, con su `id`.
// `existing`: las jornadas de la ficha que queda que ya ocupan un id de
// destino (`{ [id]: jornada }`). `cycles`: los ciclos de esas jornadas y los
// que tienen al clon en una labor, por id. No escribe nada.
export function planWorkerMerge({ clone, kept, workdays, existing = {}, cycles = {}, decisions = {} }) {
  const cloneKeys = keysOf(clone);
  const keptKeys = keysOf(kept);
  const moves = [];
  const conflicts = [];
  const paid = [];
  const unknown = [];
  const movedInto = new Set();

  for (const wd of workdays || []) {
    if (wd.payrollId) {
      paid.push(wd);
      continue;
    }
    const cycle = cycles[wd.cycleId];
    const laborId = laborIdOf(wd, cycle);
    const rut = keptRutIn(cycle, laborId, kept, keptKeys);
    const toId = retargetDocId(wd.id, cloneKeys, rut);
    if (!toId) {
      unknown.push(wd);
      continue;
    }
    const { id: _ID, ...rest } = wd;
    const data = { ...rest, workerRut: rut, workerId: kept.id };
    movedInto.add(`${wd.cycleId}|${laborId}`);
    const prev = existing[toId];
    if (!prev) {
      moves.push({ fromId: wd.id, toId, data });
      continue;
    }
    const labor = (cycle?.labors || []).find((l) => l.id === laborId);
    const keptPaid = !!prev.payrollId;
    const canSum = !keptPaid && labor?.type === "cosecha" && !wd.pisoOnly && !prev.pisoOnly && !wd.attendanceOnly && !prev.attendanceOnly;
    let choice = keptPaid ? "kept" : decisions[toId] || "kept";
    if (choice === "sum" && !canSum) choice = "kept";
    const { id: _PREV_ID, ...prevRest } = prev;
    conflicts.push({ fromId: wd.id, toId, cycleId: wd.cycleId, laborId, date: wd.date, clone: wd, kept: prev, keptPaid, canSum, choice, data, prevData: prevRest });
  }

  // Las escrituras de los choques: la jornada que queda en el id de destino.
  const writes = [];
  for (const c of conflicts) {
    if (c.choice === "clone") writes.push({ toId: c.toId, data: c.data });
    if (c.choice === "sum") writes.push({ toId: c.toId, data: { ...c.prevData, qty: round2(num(c.prevData.qty) + num(c.data.qty)), amount: round2(num(c.prevData.amount) + num(c.data.amount)) } });
  }

  // Las labores de los ciclos abiertos: la ficha que queda en el lugar del
  // clon. El clon sigue en la labor si le quedan jornadas ahí.
  const stays = new Set([...paid, ...unknown].map((w) => `${w.cycleId}|${laborIdOf(w, cycles[w.cycleId])}`));
  const rosters = [];
  for (const cycle of Object.values(cycles)) {
    if (!cycle || cycle.status === "closed") continue;
    let changed = false;
    const labors = (cycle.labors || []).map((labor) => {
      const entries = labor.workers || [];
      const cloneEntry = entries.find((lw) => lw.id === clone.id || cloneKeys.includes(lw.rut));
      const key = `${cycle.id}|${labor.id}`;
      if (!cloneEntry && !movedInto.has(key)) return labor;
      const keptIn = entries.some((lw) => lw.id === kept.id || keptKeys.includes(lw.rut));
      const keptEntry = { id: kept.id, rut: keptRutIn(cycle, labor.id, kept, keptKeys), name: kept.name || kept.id, ...(cloneEntry?.monthly ? { monthly: true } : {}) };
      const next = [];
      for (const lw of entries) {
        if (lw !== cloneEntry) next.push(lw);
        else {
          if (stays.has(key)) next.push(lw);
          if (!keptIn) next.push(keptEntry);
        }
      }
      if (!cloneEntry && !keptIn) next.push(keptEntry);
      if (next.length === entries.length && next.every((lw, i) => lw === entries[i])) return labor;
      changed = true;
      return { ...labor, workers: next };
    });
    if (changed) rosters.push({ cycleId: cycle.id, labors });
  }

  const rutHistory = [...new Set([...(kept.rutHistory || []), ...cloneKeys])].filter((k) => k !== kept.id && k !== kept.rut);
  const aliases = [...(kept.fileAliases || []), ...(clone.fileAliases || []), { rut: clone.rut || clone.id, name: clone.name || "" }];
  const seen = new Set();
  const fileAliases = aliases.filter((a) => {
    const k = `${a.rut}|${normName(a.name)}`;
    if (!a.rut || seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return {
    moves,
    conflicts,
    writes,
    deletes: [...moves.map((m) => m.fromId), ...conflicts.map((c) => c.fromId)],
    paid,
    unknown,
    rosters,
    keptPatch: { rutHistory, fileAliases },
    clonePatch: { mergedInto: kept.id },
  };
}
