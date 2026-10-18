// Filas del resumen de un trabajador: una por labor y día de cada ciclo.
import { getTratoTierTotals, containerLabel, getTratoTiers } from "./cosechaCombos";
import { DEFAULT_OVERTIME_RATE } from "./tratoHE";
import { normalizeStages, describeStage, stageTag } from "./tratoEtapas";

// Arma las filas del resumen de un ciclo, una por (labor, día). Cada tipo de
// labor llena solo los acumuladores que le corresponden; el resto queda en 0
// y la tabla esconde la columna si nadie aportó.
//
// `claves`: ruts con los que puede figurar el trabajador (ver `workerKeys`).
// `payrollById` (opcional): Map { payrollId → { name, status } } para calcular
// `paymentStatus` por fila:
//   - "unpaid"     → ningún wd de la fila tiene payrollId
//   - "in_pending" → algún wd tiene payrollId, pero no todos, o alguna de sus
//                    nóminas no está pagada
//   - "paid"       → todos los wds tienen payrollId y todas sus nóminas están
//                    pagadas
export function buildCycleRows(claves, cycle, workdaysByLabor, catalogs, payrollById) {
  const rows = [];
  const cosechaContainers = new Set();
  for (const labor of cycle.labors || []) {
    const wdMap = workdaysByLabor[labor.id] || {};
    // Agrupa por día. En trato acumula además qty y monto por tier, que
    // alimentan `tratoBreakdown`; el total de la fila es la suma del día.
    const byDate = new Map();
    for (const k in wdMap) {
      const wd = wdMap[k];
      if (!claves.has(wd.workerRut)) continue;
      const d = wd.date;
      if (!byDate.has(d)) byDate.set(d, { date: d, wds: [], tiersByIdx: new Map() });
      const bucket = byDate.get(d);
      bucket.wds.push(wd);
      if (labor.type === "trato" && !wd.pisoOnly) {
        const parts = String(k).split("__");
        const tk = parts[2] || "t0";
        const tIdx = tk.startsWith("t") ? Number(tk.slice(1)) || 0 : 0;
        const t = getTratoTierTotals(wd);
        const tr = bucket.tiersByIdx.get(tIdx) || { tierIdx: tIdx, tierKey: tk, qty: 0, amount: 0, unit: null };
        tr.qty += t.qty;
        tr.amount += t.amount;
        bucket.tiersByIdx.set(tIdx, tr);
      }
    }
    const heRate = Number(labor.overtimeRate) || DEFAULT_OVERTIME_RATE;
    const sortedGroups = [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
    for (const [, group] of sortedGroups) {
      const { date: d, wds, tiersByIdx } = group;
      let kilos = 0;
      let jornadas = 0;
      let tratoQty = 0;
      let overtimeHours = 0;
      let heAmount = 0;
      let amount = 0;
      let piso = 0;
      const containers = new Set();
      // tratoEtapas: qty y monto por etapa, para el desglose de la celda.
      const etapasPorId = new Map();
      for (const wd of wds) {
        if (wd.pisoOnly) {
          piso += Number(wd.amount) || 0;
          continue;
        }
        if (labor.type === "cosecha") {
          kilos += Number(wd.qty) || 0;
          amount += Number(wd.amount) || 0;
          if (wd.containerY != null) {
            const cy = Number(wd.containerY);
            containers.add(cy);
            cosechaContainers.add(cy);
          }
        } else if (labor.type === "trato") {
          const t = getTratoTierTotals(wd);
          tratoQty += t.qty;
          amount += t.amount;
        } else if (labor.type === "tratoEtapas") {
          // Para el trabajador cuenta la producción de todas las etapas:
          // `counts` solo decide qué se le factura al cliente.
          const q = Number(wd.qty) || 0;
          const monto = Number(wd.amount) || 0;
          amount += monto;
          tratoQty += q;
          const sid = String(wd.stageId ?? "");
          const acc = etapasPorId.get(sid) || { stageId: sid, qty: 0, amount: 0 };
          acc.qty += q;
          acc.amount += monto;
          etapasPorId.set(sid, acc);
        } else if (labor.type === "tratoHE") {
          jornadas += Number(wd.qty) || 0;
          const oh = Number(wd.overtimeHours) || 0;
          overtimeHours += oh;
          heAmount += oh * heRate;
          amount += Number(wd.amount) || 0;
        } else {
          // main, supervision, extra → pago al día (1 jornada)
          jornadas += 1;
          amount += Number(wd.amount) || 0;
        }
      }
      const containerLabels = [...containers].map((y) => containerLabel(catalogs, y)).join("/");
      // Desglose del día por tier (trato) o por etapa (tratoEtapas). En trato
      // cada entrada lleva la unidad de su tier (Árbol, Metro…).
      let tratoBreakdown = null;
      let tratoUnit = null;
      if (labor.type === "tratoEtapas" && etapasPorId.size > 0) {
        // Ordena según las etapas definidas en la labor, no según los workdays.
        const orden = normalizeStages(labor.stages).map((st) => String(st.id));
        const entries = [...etapasPorId.values()]
          .filter((e) => e.qty > 0 || e.amount > 0)
          .map((e) => ({ ...e, ...describeStage(labor, e.stageId, orden) }))
          .sort((a, b) => a.order - b.order);
        for (const e of entries) e.tag = stageTag(e);
        if (entries.length > 0) tratoBreakdown = entries;
      }
      if (labor.type === "trato") {
        const tiers = getTratoTiers(cycle.dayPrices || {}, labor.id, d);
        // Con un solo tier con producción la fila ya lo dice todo: el
        // desglose es solo para varios tiers.
        const entries = [...tiersByIdx.values()].sort((a, b) => a.tierIdx - b.tierIdx);
        for (const e of entries) {
          e.unit = tiers[e.tierIdx]?.unit ?? null;
        }
        if (entries.length > 1) tratoBreakdown = entries;
        // Unidad de la fila: la del primer tier con producción o, si no tiene,
        // la de tiers[0]. Rotula la cantidad cuando hay un solo tier.
        tratoUnit = entries[0]?.unit ?? tiers[0]?.unit ?? null;
      }
      // Estado de pago de la fila según los payrollIds de los wds del día.
      // Sin `payrollById`, la fila queda "unpaid".
      let paymentStatus = "unpaid";
      const payrollNames = [];
      if (payrollById) {
        const withPayroll = wds.filter((w) => !!w.payrollId);
        if (withPayroll.length === 0) {
          paymentStatus = "unpaid";
        } else {
          const uniquePayrollIds = [...new Set(withPayroll.map((w) => w.payrollId))];
          const statuses = uniquePayrollIds.map((pid) => payrollById.get(pid)?.status || "pending");
          for (const pid of uniquePayrollIds) {
            const p = payrollById.get(pid);
            if (p?.name) payrollNames.push(p.name);
          }
          const allPaid = statuses.every((s) => s === "paid");
          const someUnpaid = withPayroll.length < wds.length;
          if (allPaid && !someUnpaid) paymentStatus = "paid";
          else paymentStatus = "in_pending";
        }
      }
      rows.push({
        laborName: labor.name,
        laborId: labor.id,
        laborType: labor.type,
        tratoType: labor.tratoType ?? 0,
        tratoUnit,
        tratoBreakdown,
        containerLabels,
        date: d,
        kilos,
        jornadas,
        tratoQty,
        overtimeHours,
        heAmount,
        piso,
        amount,
        paymentStatus,
        payrollNames,
        rowKey: `${cycle.id}__${labor.id}__${d}`,
      });
    }
  }
  rows.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.laborName.localeCompare(b.laborName);
  });
  return { rows, cosechaContainers };
}
