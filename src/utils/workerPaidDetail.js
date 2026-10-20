// Detalle pagado de una persona en una nómina, como lo muestra el detalle
// por trabajador: los montos por ciclo, las jornadas agrupadas por ciclo y
// por (labor, fecha), y la vista cronológica con los ajustes intercalados.
import { getTratoTiers } from "./cosechaCombos";

// Respaldo "Por ciclo": montos sin detalle día × labor.
export function paidByCycleEntriesOf(item, cycleDetails, displayCycleLabel) {
  return Object.entries(item.byCycle || {})
    .filter(([, v]) => Number(v) > 0)
    .map(([cid, amt]) => {
      const c = cycleDetails.find((x) => x.id === cid);
      return { id: cid, label: c ? displayCycleLabel(c) : cid, faena: c?.faenaName, subfaena: c?.subfaenaName, amount: Number(amt) };
    });
}

// Con snapshot: jornadas agrupadas por ciclo y luego por (labor, fecha).
export function paidCycleSectionsOf(wds, snapshotCycles, cycleDetails) {
  const cyclesById = new Map((snapshotCycles || []).map((c) => [c.id, c]));
  const wdsByCycle = new Map();
  for (const wd of wds) {
    if (!wdsByCycle.has(wd.cycleId)) wdsByCycle.set(wd.cycleId, []);
    wdsByCycle.get(wd.cycleId).push(wd);
  }

  // Para cada ciclo, agrupar workdays por (laborId, date) y producir una
  // fila con qty + amount. Lo que se muestra en la columna "Producción"
  // depende del tipo de labor (cosecha → kg/unidad, trato → unidad del
  // catálogo, etc.).
  return [...wdsByCycle.entries()].map(([cycleId, list]) => {
    const cycle = cyclesById.get(cycleId);
    const detail = cycleDetails.find((c) => c.id === cycleId);
    const laborsById = new Map((cycle?.labors || []).map((l) => [l.id, l]));
    const groups = new Map();
    for (const wd of list) {
      const key = `${wd.laborId}__${wd.date}`;
      if (!groups.has(key)) {
        groups.set(key, {
          laborId: wd.laborId,
          labor: laborsById.get(wd.laborId),
          date: wd.date || "",
          kilos: 0,
          jornadas: 0,
          tratoQty: 0,
          tratoUnits: new Set(), // unidades de catálogo recolectadas de los tiers
          overtimeHours: 0,
          amount: 0,
          containers: new Set(),
        });
      }
      const g = groups.get(key);
      const labor = g.labor;
      const wdAmount = Number(wd.amount) || 0;
      const wdQty = Number(wd.qty) || 0;
      g.amount += wdAmount;
      if (labor?.type === "cosecha") {
        g.kilos += wdQty;
        if (wd.containerY != null) g.containers.add(Number(wd.containerY));
      } else if (labor?.type === "trato") {
        // En trato, la unidad del catálogo (Planta, Metro…) no está en
        // wd.tiers sino por día en cycle.dayPrices, que el snapshot siempre
        // trae: se resuelve con getTratoTiers para ese (labor, fecha), de
        // índice a unidad.
        const dayTiers = getTratoTiers(cycle?.dayPrices || {}, wd.laborId, wd.date);
        const unitByIdx = new Map();
        for (const t of dayTiers) {
          if (t.unit != null) unitByIdx.set(t.index, Number(t.unit));
        }
        if (wd.tiers && typeof wd.tiers === "object") {
          for (const k in wd.tiers) {
            const t = wd.tiers[k];
            g.tratoQty += Number(t?.qty) || 0;
            // Clave del tier ("t0", "t1"…) → índice numérico, para buscar la unidad.
            const raw = String(k);
            const idx = raw.startsWith("t") ? Number(raw.slice(1)) : Number(raw);
            if (Number.isFinite(idx) && unitByIdx.has(idx)) {
              g.tratoUnits.add(unitByIdx.get(idx));
            } else if (t?.unit != null) {
              // Si no, la unidad que traiga el propio tier.
              g.tratoUnits.add(Number(t.unit));
            }
          }
        } else {
          g.tratoQty += wdQty;
          // Jornada sin tiers: la unidad del primer tier del día que la tenga.
          if (unitByIdx.size > 0) {
            g.tratoUnits.add([...unitByIdx.values()][0]);
          }
        }
        // Último recurso: labor.tratoUnit, si el snapshot lo trae.
        if (g.tratoUnits.size === 0 && labor?.tratoUnit != null) {
          g.tratoUnits.add(Number(labor.tratoUnit));
        }
      } else if (labor?.type === "tratoHE") {
        g.jornadas += wdQty;
        g.overtimeHours += Number(wd.overtimeHours) || 0;
      } else {
        // main / supervision / extra: 1 jornada por wd
        g.jornadas += 1;
      }
    }
    const rows = [...groups.values()].sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return (a.labor?.name || "").localeCompare(b.labor?.name || "", "es");
    });
    const totalAmount = rows.reduce((s, r) => s + r.amount, 0);
    const header = [detail?.faenaName, detail?.subfaenaName, cycle?.label || cycleId]
      .filter(Boolean)
      .join(" · ");
    return { cycleId, header, rows, totalAmount };
  })
    .sort((a, b) => a.header.localeCompare(b.header, "es"));
}

// Vista cronológica: jornadas y ajustes en una sola tabla ordenada por
// fecha; los ajustes sin fecha quedan al final.
export function paidChronoRowsOf(cycleSections, anticipoRows, bonoRows) {
  const KIND_ORDER = { work: 0, anticipo: 1, bono: 2 };
  const chronoRows = [];
  for (const sec of cycleSections) {
    for (const r of sec.rows) {
      chronoRows.push({ kind: "work", date: r.date, cycleHeader: sec.header, row: r });
    }
  }
  for (const a of anticipoRows) chronoRows.push(a);
  for (const b of bonoRows) chronoRows.push(b);
  chronoRows.sort((a, b) => {
    const da = a.date || "9999-12-31";
    const db = b.date || "9999-12-31";
    if (da !== db) return da < db ? -1 : 1;
    return (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9);
  });
  return chronoRows;
}
