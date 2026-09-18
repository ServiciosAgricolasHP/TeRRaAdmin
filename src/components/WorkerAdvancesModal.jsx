import { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";
import { logsService } from "../services";
import { useIsMobile } from "../hooks/useIsMobile";
import { advanceSign, advanceRemaining, advanceTypeMeta, advanceMatchesWorker } from "../services/advancesService";
import { formatRutForDisplay } from "../utils/rutUtils";

const fmtCurrency = (v) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", minimumFractionDigits: 0 }).format(
    Number(v) || 0,
  );

const toDate = (ts) => (ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null);

// El doc del anticipo solo guarda `createdBy`/`updatedBy` como uid, y la
// colección `users` no tiene nombre ni email. Quién lo puso sale del log de
// auditoría, que sí guarda el email — y se puede pedir por trabajador porque
// el log denormaliza `meta.workerRut` (REF_META_FIELDS en firestoreBase).
const whoLabel = (entry) => entry?.by || "—";

const shortWhen = (d) =>
  d instanceof Date && !isNaN(d) ? d.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "";

const STATUS_LABEL = {
  pending: "Pendiente",
  partial: "Parcial",
  applied: "Aplicado",
  cancelled: "Cancelado",
};

const STATUS_CLASS = {
  pending: "bg-[var(--color-warning-soft)] text-[var(--color-warning)]",
  partial: "bg-[var(--color-accent-soft)] text-[var(--color-accent)]",
  applied: "bg-[var(--color-success-soft)] text-[var(--color-success)]",
  cancelled: "bg-[var(--color-surface-2)] text-[var(--color-muted)]",
};

// Ficha completa de anticipos y bonos de un trabajador: TODOS sus registros,
// sin los filtros de estado ni la ventana de fechas de la pantalla. Se arma
// desde la misma lista ya cargada, así que no cuesta ninguna lectura.
//
function AdvanceTotalsTile({ title, data, tone }) {
  return (
    <div className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
      <div className="text-xs text-[var(--color-muted)]">{title} · {data.count}</div>
      <div className={`text-lg font-semibold tabular-nums ${tone}`}>{fmtCurrency(data.otorgado)}</div>
      <div className="mt-1 space-y-0.5 text-xs text-[var(--color-muted)]">
        <div>Liquidado: {fmtCurrency(data.pagado)}</div>
        <div>Saldo: {fmtCurrency(data.saldo)}</div>
      </div>
    </div>
  );
}

export default function WorkerAdvancesModal({ workerKeys, name, rut, items, onClose }) {
  const mine = useMemo(() => {
    const keys = new Set((workerKeys || []).filter(Boolean));
    return items
      .filter((a) => advanceMatchesWorker(a, keys))
      .sort((x, y) => String(y.date || "").localeCompare(String(x.date || "")));
  }, [items, workerKeys]);

  const isMobile = useIsMobile();

  // `workerKeys` llega como literal desde el padre, así que la dependencia es
  // su contenido y no la identidad del array.
  const keysKey = (workerKeys || []).filter(Boolean).join("|");
  const [attribution, setAttribution] = useState(() => ({ key: null, map: new Map() }));
  const loadingWho = keysKey !== "" && attribution.key !== keysKey;

  useEffect(() => {
    const keys = keysKey ? keysKey.split("|") : [];
    if (keys.length === 0) return;
    let cancelled = false;
    Promise.all(
      keys.map((k) =>
        logsService
          .list({ wheres: [["entity", "==", "advance"], ["meta.workerRut", "==", k]] })
          .catch(() => []),
      ),
    )
      .then((chunks) => {
        if (cancelled) return;
        const map = new Map();
        for (const row of chunks.flat()) {
          if (!row.entityId) continue;
          const when = toDate(row.timestamp);
          const by = row.email || row.uid || null;
          const entry = map.get(row.entityId) || { created: null, lastEdit: null };
          if (row.action === "create") entry.created = { by, at: when };
          else if (row.action === "update" && (!entry.lastEdit || (when && entry.lastEdit.at && when > entry.lastEdit.at))) {
            entry.lastEdit = { by, at: when };
          }
          map.set(row.entityId, entry);
        }
        setAttribution({ key: keysKey, map });
      })
      .catch(() => {
        if (!cancelled) setAttribution({ key: keysKey, map: new Map() });
      });
    return () => { cancelled = true; };
  }, [keysKey]);

  const totals = useMemo(() => {
    const base = { count: 0, otorgado: 0, pagado: 0, saldo: 0 };
    const t = { anticipo: { ...base }, bono: { ...base } };
    for (const a of mine) {
      const bucket = advanceSign(a) > 0 ? t.bono : t.anticipo;
      bucket.count += 1;
      bucket.otorgado += Number(a.amount) || 0;
      bucket.pagado += Number(a.amountPaid) || 0;
      bucket.saldo += advanceRemaining(a);
    }
    return t;
  }, [mine]);

  return (
    <Modal
      open
      onClose={onClose}
      title={`Anticipos y bonos — ${name || rut}`}
      footer={
        <button onClick={onClose} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm">
          Cerrar
        </button>
      }
    >
      <div className="space-y-3">
        <div className="font-mono text-xs text-[var(--color-muted)]">{formatRutForDisplay(rut)}</div>

        <div className="flex flex-wrap gap-2">
          <AdvanceTotalsTile title="🪙 Anticipos" data={totals.anticipo} tone="text-[var(--color-warning)]" />
          <AdvanceTotalsTile title="🎁 Bonos" data={totals.bono} tone="text-[var(--color-success)]" />
        </div>

        {mine.length === 0 ? (
          <p className="rounded-md border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-muted)]">
            Sin anticipos ni bonos registrados.
          </p>
        ) : isMobile ? (
          <div className="space-y-2">
            {mine.map((a) => {
              const status = a.status || "pending";
              const meta = advanceTypeMeta(a.type);
              const sign = advanceSign(a);
              const paid = Number(a.amountPaid) || 0;
              const who = attribution.map.get(a.id);
              return (
                <div key={a.id} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm">{meta.icon} <span className="font-medium">{meta.label}</span></div>
                      <div className="font-mono text-xs text-[var(--color-muted)]">{a.date}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className={`font-semibold tabular-nums ${sign > 0 ? "text-[var(--color-success)]" : "text-[var(--color-warning)]"}`}>
                        {sign > 0 ? "+" : "−"} {fmtCurrency(a.amount)}
                      </div>
                      <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs ${STATUS_CLASS[status]}`}>
                        {STATUS_LABEL[status]}
                      </span>
                    </div>
                  </div>
                  {a.note && <div className="mt-1 text-xs text-[var(--color-muted)]">{a.note}</div>}
                  <div className="mt-2 space-y-0.5 text-xs text-[var(--color-muted)]">
                    {paid > 0 && <div>Liquidado: {fmtCurrency(paid)}</div>}
                    {who?.created ? (
                      <div className="break-all">
                        Puesto por {whoLabel(who.created)} · {shortWhen(who.created.at)}
                      </div>
                    ) : (
                      <div>{loadingWho ? "Buscando quién lo puso…" : "Sin registro de quién lo puso"}</div>
                    )}
                    {who?.lastEdit && (
                      <div className="break-all">
                        Editado por {whoLabel(who.lastEdit)} · {shortWhen(who.lastEdit.at)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border border-[var(--color-border)]">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-[var(--color-surface-2)] text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
                <tr>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2 text-right">Monto</th>
                  <th className="px-3 py-2 text-right">Liquidado</th>
                  <th className="px-3 py-2">Puesto por</th>
                  <th className="px-3 py-2">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {mine.map((a) => {
                  const status = a.status || "pending";
                  const meta = advanceTypeMeta(a.type);
                  const sign = advanceSign(a);
                  const paid = Number(a.amountPaid) || 0;
                  return (
                    <tr key={a.id}>
                      <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{a.date}</td>
                      <td className="px-3 py-2 text-xs">
                        <div>{meta.icon} {meta.label}</div>
                        {a.note && <div className="text-[var(--color-muted)]">{a.note}</div>}
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums ${sign > 0 ? "text-[var(--color-success)]" : "text-[var(--color-warning)]"}`}>
                        {sign > 0 ? "+" : "−"} {fmtCurrency(a.amount)}
                      </td>
                      <td className="px-3 py-2 text-right text-xs tabular-nums text-[var(--color-muted)]">
                        {paid > 0 ? fmtCurrency(paid) : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {(() => {
                          const who = attribution.map.get(a.id);
                          if (!who?.created) return <span className="text-[var(--color-muted)]">{loadingWho ? "…" : "—"}</span>;
                          return (
                            <>
                              <div className="break-all">{whoLabel(who.created)}</div>
                              <div className="text-[var(--color-muted)]">{shortWhen(who.created.at)}</div>
                              {who.lastEdit && (
                                <div className="text-[var(--color-muted)]">
                                  editado por {whoLabel(who.lastEdit)} · {shortWhen(who.lastEdit.at)}
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${STATUS_CLASS[status]}`}>
                          {STATUS_LABEL[status]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}
