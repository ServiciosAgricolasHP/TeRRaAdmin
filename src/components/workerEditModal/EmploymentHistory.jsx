import { useEffect, useState } from "react";
import ConfirmDialog from "../ConfirmDialog";
import EmploymentFormModal from "../EmploymentFormModal";
import EndEmploymentsModal from "../EndEmploymentsModal";
import { useEmployers } from "../../hooks/useEmployers";
import { employmentsService, listWorkerEmployments } from "../../services/employmentsService";
import { localIsoDate } from "../../utils/dates";
import { EMPLOYMENT_TYPES, END_REASONS, SETTLEMENT_STATUSES, isActiveOn } from "../../utils/employment";

const fmt = (iso) => (iso ? iso.split("-").reverse().join("-") : "");

// Contratos y honorarios de la persona: su situación de hoy y el historial,
// con alta, corrección, término y borrado de cada período. Lee los períodos
// al abrir la ficha (una lectura por período).
export default function EmploymentHistory({ worker }) {
  const today = localIsoDate();
  const { employers, nameOf } = useEmployers();
  const [list, setList] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null); // { employment } (null = nuevo)
  const [ending, setEnding] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);

  // Cada guardado sube `version` y el historial se vuelve a leer.
  const [version, setVersion] = useState(0);
  const load = () => setVersion((v) => v + 1);
  useEffect(() => {
    let cancelled = false;
    listWorkerEmployments(worker.id)
      .then((l) => !cancelled && setList(l))
      .catch((e) => !cancelled && setError(e.message || "No se pudo leer el historial."));
    return () => {
      cancelled = true;
    };
  }, [worker.id, version]);

  const current = list?.find((e) => isActiveOn(e, today));
  const btn = "rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)]";

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Contrato u honorarios</h3>
        <div className="flex gap-1.5">
          {current && (
            <button type="button" className={btn} onClick={() => setEnding(current)}>
              Terminar
            </button>
          )}
          <button type="button" className={btn} onClick={() => setEditing({ employment: null })}>
            + Período
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
      {!list ? (
        <p className="text-xs text-[var(--color-muted)]">Cargando…</p>
      ) : (
        <>
          <p className="mb-2 text-sm">
            Hoy:{" "}
            {current ? (
              <b>
                {EMPLOYMENT_TYPES[current.type]?.icon} {EMPLOYMENT_TYPES[current.type]?.label} con {nameOf(current.employerId)} desde el {fmt(current.startDate)}
                {current.endDate ? ` hasta el ${fmt(current.endDate)}` : ""}
              </b>
            ) : (
              <b>sin contrato ni honorarios</b>
            )}
          </p>
          {list.length > 0 && (
            <ul className="divide-y divide-[var(--color-border)] text-xs">
              {list.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <span>
                    {EMPLOYMENT_TYPES[e.type]?.icon} {EMPLOYMENT_TYPES[e.type]?.label} · {nameOf(e.employerId)} · {fmt(e.startDate)} → {e.endDate ? fmt(e.endDate) : "sin término"}
                    {e.endReason && <span className="text-[var(--color-muted)]"> · {END_REASONS[e.endReason]}</span>}
                    {e.settlementStatus && <span className="text-[var(--color-muted)]"> · finiquito {SETTLEMENT_STATUSES[e.settlementStatus]?.toLowerCase()}</span>}
                  </span>
                  <span className="flex gap-1">
                    <button type="button" className={btn} onClick={() => setEditing({ employment: e })} aria-label="Editar período">✏️</button>
                    <button type="button" className={btn} onClick={() => setRemoving(e)} aria-label="Eliminar período">🗑️</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {editing && (
        <EmploymentFormModal
          worker={worker}
          employment={editing.employment}
          history={list || []}
          employers={employers}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
      {ending && (
        <EndEmploymentsModal
          items={[ending]}
          onClose={() => setEnding(null)}
          onDone={() => {
            setEnding(null);
            load();
          }}
        />
      )}
      <ConfirmDialog
        open={!!removing}
        title="Eliminar período"
        message={removing ? `¿Eliminar ${EMPLOYMENT_TYPES[removing.type]?.label.toLowerCase()} con ${nameOf(removing.employerId)} del ${fmt(removing.startDate)}? Para cerrarlo, usa "Terminar"; eliminar es para un período cargado por error.` : ""}
        confirmLabel="Eliminar"
        danger
        busy={busy}
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await employmentsService.remove(removing.id);
            setRemoving(null);
            load();
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}
