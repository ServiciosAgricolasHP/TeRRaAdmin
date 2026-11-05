import { comboLabel, containerLabel, parseComboKey } from "../../../utils/cosechaCombos";
import { sameQtyByUnit } from "../../../utils/harvestImport";
import { fmtCurrency, fmtNumber } from "../../../utils/format";

const fmtDate = (iso) => (iso ? iso.split("-").reverse().join("-") : "—");
const plural = (n, one, many) => `${fmtNumber(n)} ${n === 1 ? one : many}`;

// Cuántas fichas nuevas van a cada líder: CHILENOS, EXTRANJEROS en efectivo
// y sin líder (`newWorkerDefaults`).
function newWorkersText(creates) {
  const chilean = creates.filter((c) => c.groupLeader === "CHILENOS").length;
  const foreign = creates.filter((c) => c.groupLeader === "EXTRANJEROS").length;
  const none = creates.length - chilean - foreign;
  return [
    chilean > 0 && `${fmtNumber(chilean)} CHILENOS`,
    foreign > 0 && `${fmtNumber(foreign)} EXTRANJEROS en efectivo`,
    none > 0 && `${fmtNumber(none)} sin líder ni forma de pago (complét${none === 1 ? "ala" : "alas"} en Trabajadores)`,
  ].filter(Boolean).join(", ");
}

// Una cantidad por unidad (`unitKeyOf`): las unidades de cada envase, de la
// que más trae a la que menos, y los kilos al final.
function qtyText(qtyByUnit, catalogs) {
  const parts = Object.entries(qtyByUnit || {})
    .filter(([, qty]) => qty)
    .sort(([a, x], [b, y]) => (a === "kg") - (b === "kg") || y - x)
    .map(([unit, qty]) => `${fmtNumber(qty)} ${unit === "kg" ? "kg" : containerLabel(catalogs, Number(unit.slice(2)))}`);
  return parts.length ? parts.join(" · ") : "—";
}

// Paso 3 de importar la cosecha: lo que se va a escribir, día por día, lo que
// dice el archivo para lo elegido y todo lo que conviene saber antes.
export function PreviewStep({ h, catalogs }) {
  const { plan, fileTotals } = h;
  if (!plan) return <p className="text-sm text-[var(--color-muted)]">Falta elegir el archivo, los contratistas o los combos.</p>;
  const t = plan.totals;
  const qtyOk = sameQtyByUnit(t.qtyByUnit, fileTotals.qtyByUnit);
  const floorOk = Math.abs(t.floorAmount - fileTotals.floorAmount) < 0.5;
  const notes = [
    plan.blocked.length > 0 && `${plural(plan.blocked.length, "jornada ya está", "jornadas ya están")} en una nómina: no se tocan.`,
    plan.blockedDeletes.length > 0 && `${plural(plan.blockedDeletes.length, "jornada importada antes ya no viene", "jornadas importadas antes ya no vienen")}, pero está en una nómina: queda.`,
    plan.replaced.length > 0 && `Reemplaza ${plural(plan.replaced.length, "celda escrita", "celdas escritas")} a mano.`,
    plan.deletes.length > 0 && `Borra ${plural(plan.deletes.length, "jornada importada", "jornadas importadas")} antes que ya no viene${plan.deletes.length === 1 ? "" : "n"} en el archivo.`,
    plan.unchanged > 0 && `${plural(plan.unchanged, "jornada ya estaba", "jornadas ya estaban")} igual: no se vuelve${plan.unchanged === 1 ? "" : "n"} a escribir.`,
    plan.unpriced.length > 0 &&
      `Sin precio en el ciclo: ${[...new Set(plan.unpriced.map((u) => `${fmtDate(u.date)} ${comboLabel(catalogs, parseComboKey(u.ck).x, parseComboKey(u.ck).y)}`))].slice(0, 6).join(", ")}${plan.unpriced.length > 6 ? "…" : ""}. Esas jornadas quedan en $0 hasta que pongas el precio en Precios, y se recalculan solas.`,
    plan.undatedFloors.length > 0 &&
      `${plural(plan.undatedFloors.length, "piso escrito", "pisos escritos")} a mano sin fecha (${fmtCurrency(plan.undatedFloors.reduce((a, f) => a + f.amount, 0))}) no se importa${plan.undatedFloors.length === 1 ? "" : "n"}: la planilla no dice de qué día ${plan.undatedFloors.length === 1 ? "es" : "son"}.`,
    plan.unmappedFloors.length > 0 && `${plural(plan.unmappedFloors.length, "piso", "pisos")} por calidad o por un envase sin elegir va${plan.unmappedFloors.length === 1 ? "" : "n"} al piso del día.`,
    plan.daysToAdd.length > 0 && `Agrega al ciclo ${plural(plan.daysToAdd.length, "día", "días")}: ${plan.daysToAdd.map(fmtDate).join(", ")}.`,
    plan.laborWorkersToAdd.length > 0 && `Suma ${plural(plan.laborWorkersToAdd.length, "persona", "personas")} a la labor.`,
    plan.creates.length > 0 && `Crea ${plural(plan.creates.length, "ficha nueva", "fichas nuevas")}: ${newWorkersText(plan.creates)}.`,
    plan.aliases.length > 0 && `Guarda en ${plural(plan.aliases.length, "ficha elegida", "fichas elegidas")} a mano el RUT y el nombre con que la${plan.aliases.length === 1 ? "" : "s"} trae la empresa.`,
  ].filter(Boolean);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <div className="rounded-lg border border-[var(--color-border)] p-3">
          <div className="text-xs text-[var(--color-muted)]">Se importa</div>
          <div className="font-medium">{plural(t.people, "persona", "personas")} · {qtyText(t.qtyByUnit, catalogs)}</div>
          <div className="text-xs text-[var(--color-muted)]">
            {fmtCurrency(t.amount)} de producción con los precios del ciclo · {plural(t.floorCount, "piso", "pisos")} por {fmtCurrency(t.floorAmount)}
          </div>
        </div>
        <div className={`rounded-lg border p-3 ${qtyOk && floorOk ? "border-[var(--color-border)]" : "border-[var(--color-warning)]"}`}>
          <div className="text-xs text-[var(--color-muted)]">El archivo, para lo elegido</div>
          <div className="font-medium">{qtyText(fileTotals.qtyByUnit, catalogs)} · pisos {fmtCurrency(fileTotals.floorAmount)}</div>
          <div className={`text-xs ${qtyOk && floorOk ? "text-[var(--color-success)]" : "text-[var(--color-warning)]"}`}>
            {qtyOk && floorOk ? "✓ Calza con lo que se importa" : "No calza: revisa los combos y las personas que quedaron fuera"}
          </div>
        </div>
      </div>

      {notes.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {notes.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-muted)]">
              <th className="py-1.5 pr-2 font-medium">Día</th>
              <th className="py-1.5 pr-2 text-right font-medium">Personas</th>
              <th className="py-1.5 pr-2 text-right font-medium">Cantidad</th>
              <th className="py-1.5 pr-2 text-right font-medium">Producción</th>
              <th className="py-1.5 text-right font-medium">Pisos</th>
            </tr>
          </thead>
          <tbody>
            {plan.days.map((d) => (
              <tr key={d.date} className="border-b border-[var(--color-border)] last:border-0">
                <td className="whitespace-nowrap py-1.5 pr-2">{fmtDate(d.date)}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{d.people}</td>
                <td className="whitespace-nowrap py-1.5 pr-2 text-right tabular-nums">{qtyText(d.qtyByUnit, catalogs)}</td>
                <td className="whitespace-nowrap py-1.5 pr-2 text-right tabular-nums">{fmtCurrency(d.amount)}</td>
                <td className="whitespace-nowrap py-1.5 text-right tabular-nums">{d.floorCount ? `${d.floorCount} · ${fmtCurrency(d.floorAmount)}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
