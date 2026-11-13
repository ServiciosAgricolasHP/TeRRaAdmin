import { Fragment, useState } from "react";
import {
  ENTITY_META,
  entityLabelEs,
  knownEntityLabel,
  labelKey,
  missingLabelKeys,
  resolveEntityLabel,
} from "../../utils/auditLabels";
import { fmtDateTime, toDate } from "../../utils/auditLogs";
import { groupLogsByDayAndAuthor, workdayLabel } from "../../utils/auditRecord";
import { payrollHistoryEntry } from "../../utils/payrollHistory";
import FieldBlock from "./FieldBlock";
import { useWorkdayNames } from "./useWorkdayNames";

const ACTION_STYLE = {
  create: { color: "#166534", bg: "#dcfce7", label: "crear" },
  update: { color: "#92400e", bg: "#fef3c7", label: "editar" },
  delete: { color: "#b91c1c", bg: "#fee2e2", label: "eliminar" },
  import: { color: "#1e40af", bg: "#dbeafe", label: "importar" },
  bulkStart: { color: "#166534", bg: "#dcfce7", label: "contratar" },
  bulkEnd: { color: "#b91c1c", bg: "#fee2e2", label: "terminar" },
  settlement: { color: "#92400e", bg: "#fef3c7", label: "finiquito" },
  setPrincipal: { color: "#92400e", bg: "#fef3c7", label: "mandante" },
  harvestImport: { color: "#1e40af", bg: "#dbeafe", label: "importar cosecha" },
  harvestSync: { color: "#1e40af", bg: "#dbeafe", label: "sincronizar QR" },
  laborClear: { color: "#b91c1c", bg: "#fee2e2", label: "limpiar labor" },
  cascadeDelete: { color: "#b91c1c", bg: "#fee2e2", label: "eliminar en cascada" },
  workerMerge: { color: "#92400e", bg: "#fef3c7", label: "unir fichas" },
  workdaysMove: { color: "#92400e", bg: "#fef3c7", label: "mover jornadas" },
  floorApplyAll: { color: "#166534", bg: "#dcfce7", label: "piso a todos" },
  floorRemove: { color: "#b91c1c", bg: "#fee2e2", label: "quitar piso" },
  paymentStatusBatch: { color: "#166534", bg: "#dcfce7", label: "estado de pago" },
};

// La acción de un log como insignia ("editar", "importar cosecha").
export function ActionPill({ action }) {
  const s = ACTION_STYLE[action] || { color: "#374151", bg: "#f3f4f6", label: action || "?" };
  return (
    <span
      style={{ color: s.color, background: s.bg }}
      className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
    >
      {s.label}
    </span>
  );
}

// El registro afectado por un log ("Juan Pérez (Trabajador)") o, si su
// nombre no está en el log, lo que dice su id.
function EntityLabel({ entity, entityId, label }) {
  const idFallback = ENTITY_META[entity]?.idLabel?.(entityId) || entityId;
  const shown = label || idFallback;
  return (
    <span className="inline-flex min-w-0 flex-col">
      <span className="truncate font-medium">{shown || "—"}</span>
      <span className="text-[9px] text-[var(--color-muted)]">
        {entityLabelEs(entity)}
        {shown && entityId && shown !== entityId ? ` · ${entityId}` : ""}
      </span>
    </span>
  );
}

const dayTitle = (isoDay) => {
  const [y, m, d] = isoDay.split("-").map(Number);
  return new Intl.DateTimeFormat("es-CL", { weekday: "long", day: "numeric", month: "short" }).format(new Date(y, m - 1, d));
};

// Tabla de logs que usan SessionDetail (las acciones de una sesión) y
// EntitySearchPanel (el historial completo de un registro). Click en una fila
// expande el detalle (changes/before/after/meta) en tablas legibles.
//
// El nombre de cada registro sale del log o de `knownLabels` (`entity:id` →
// nombre). Los que solo se saben leyendo el registro se buscan con el botón,
// una lectura por registro. Una jornada se nombra por su id, con la labor, el
// ciclo, la fecha y la persona (`useWorkdayNames`), sin repetir lo que ya dice
// el registro elegido (`omit`, ver `workdayLabel`). Con `grouped`, las filas
// van bajo un encabezado por día y por quién hizo el cambio.
export default function LogsTable({ logs, knownLabels, omit, grouped = false }) {
  const [openIdx, setOpenIdx] = useState(null);
  // `entity:id` → nombre, de los buscados con el botón.
  const [names, setNames] = useState({});
  const [lookingUp, setLookingUp] = useState(false);
  const workdayNames = useWorkdayNames(logs);

  const labelOf = (l) => {
    if (l.entity === "workday" && workdayNames) return workdayLabel(l.entityId, workdayNames, omit);
    const key = labelKey(l.entity, l.entityId);
    if (knownLabels?.[key]) return knownLabels[key];
    if (key in names) return names[key];
    return knownEntityLabel(l);
  };
  const renderRow = (l, idx) => {
    const isOpen = openIdx === idx;
    const hasDetails = l.changes || l.before || l.after || l.meta;
    // Un registro de nómina se lee como en su 🕘 Historial: qué hizo y a quién.
    const payrollEntry = l.entity === "payroll" ? payrollHistoryEntry(l) : null;
    return (
      <Fragment key={l.id || idx}>
        <tr
          className="cursor-pointer border-t border-[var(--color-border)] hover:bg-[var(--color-surface-2)]"
          onClick={() => hasDetails && setOpenIdx(isOpen ? null : idx)}
        >
          <td className="px-2 py-1 font-mono text-[10px] text-[var(--color-muted)]">
            {fmtDateTime(toDate(l.timestamp))}
          </td>
          <td className="px-2 py-1"><ActionPill action={l.action} /></td>
          <td className="px-2 py-1">
            <EntityLabel entity={l.entity} entityId={l.entityId} label={labelOf(l)} />
            {payrollEntry && <div className="text-[10px] text-[var(--color-muted)]">{payrollEntry.title}</div>}
          </td>
          <td className="px-2 py-1 text-[var(--color-muted)]">{l.userName || l.email || l.uid || "—"}</td>
          <td className="px-2 py-1 text-right text-[var(--color-muted)]">
            {hasDetails ? (isOpen ? "▾" : "▸") : ""}
          </td>
        </tr>
        {isOpen && hasDetails && (
          <tr className="border-t border-[var(--color-border)]">
            <td colSpan={5} className="bg-[var(--color-surface-2)] px-3 py-2">
              {payrollEntry?.lines.length > 0 && (
                <ul className="mb-2 space-y-0.5 tabular-nums">
                  {payrollEntry.lines.map((line, i) => (
                    <li key={i} className="[overflow-wrap:anywhere]">{line.text}</li>
                  ))}
                </ul>
              )}
              <div className="grid gap-2 md:grid-cols-2">
                {l.changes && <FieldBlock title="Cambios" data={l.changes} kind="changes" />}
                {l.before && <FieldBlock title="Antes" data={l.before} kind="snapshot" />}
                {l.after && <FieldBlock title="Después" data={l.after} kind="snapshot" />}
                {l.meta && <FieldBlock title="Meta" data={l.meta} kind="raw" />}
              </div>
            </td>
          </tr>
        )}
      </Fragment>
    );
  };
  const groups = grouped ? groupLogsByDayAndAuthor(logs) : [];
  const missing = missingLabelKeys(logs).filter((m) => !(m.key in names) && !knownLabels?.[m.key]);

  const lookUpNames = async () => {
    setLookingUp(true);
    const found = await Promise.all(missing.map(async (m) => [m.key, await resolveEntityLabel(m.entity, m.entityId)]));
    setNames((prev) => ({ ...prev, ...Object.fromEntries(found) }));
    setLookingUp(false);
  };

  return (
    <>
      {missing.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] px-2 py-1.5 text-xs text-[var(--color-muted)]">
          <span>
            {missing.length} registro{missing.length === 1 ? "" : "s"} sin nombre en el log.
          </span>
          <button
            type="button"
            onClick={lookUpNames}
            disabled={lookingUp}
            className="min-h-[32px] rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 text-[var(--color-text)] hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
          >
            {lookingUp ? "Buscando…" : `🔎 Buscar nombres (${missing.length} lectura${missing.length === 1 ? "" : "s"})`}
          </button>
        </div>
      )}
      <table className="w-full min-w-[560px] text-xs">
        <thead className="bg-[var(--color-surface-2)] text-left text-[var(--color-muted)]">
          <tr>
            <th className="px-2 py-1.5 w-32">Fecha</th>
            <th className="px-2 py-1.5 w-20">Acción</th>
            <th className="px-2 py-1.5">Registro</th>
            <th className="px-2 py-1.5">Usuario</th>
            <th className="px-2 py-1.5"></th>
          </tr>
        </thead>
        <tbody>
          {grouped
            ? groups.map((g) => (
                <Fragment key={g.key}>
                  <tr className="border-t border-[var(--color-border)] bg-[var(--color-accent-soft)]">
                    <td colSpan={5} className="px-2 py-1 text-[11px] font-medium">
                      <span className="capitalize">{dayTitle(g.day)}</span> · {g.who}
                      <span className="text-[var(--color-muted)]"> · {g.items.length} {g.items.length === 1 ? "acción" : "acciones"}</span>
                    </td>
                  </tr>
                  {g.items.map(({ log, index }) => renderRow(log, index))}
                </Fragment>
              ))
            : logs.map((l, idx) => renderRow(l, idx))}
        </tbody>
      </table>
    </>
  );
}
