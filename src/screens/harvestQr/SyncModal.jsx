import { useState } from "react";
import { Link } from "react-router-dom";
import { useToast } from "../../contexts/ToastContext";
import { syncPrefixRange } from "../../services/harvestSyncService";
import Modal from "../../components/Modal";
import { nextSyncRange, lastSyncLabel } from "./helpers";
import { ProgressBar } from "../../components/ProgressBar";
import { attempt } from "../../utils/attempt";

const STAGE_LABELS = {
  cycle: "Leyendo el ciclo…",
  weights: "Leyendo pesajes…",
  workers: "Buscando trabajadores…",
  attach: "Agregando días y trabajadores al ciclo…",
  check: "Revisando jornadas ya liquidadas…",
  write: "Escribiendo jornadas…",
  save: "Guardando el resultado…",
};

// Sincroniza un rango de fechas de un prefijo (`syncPrefixRange`,
// services/harvestSyncService.js) y muestra lo que hizo.
export function SyncModal({ prefix, cycle, onClose, onSynced }) {
  const toast = useToast();
  const [dateFrom, setDateFrom] = useState(() => nextSyncRange(prefix.lastSync).from);
  const [dateTo, setDateTo] = useState(() => nextSyncRange(prefix.lastSync).to);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState(null);

  const run = async () => {
    setBusy(true);
    setResult(null);
    const { value, error: err } = await attempt(() =>
      syncPrefixRange({ prefix, dateFrom, dateTo, onProgress: (p) => setProgress({ ...p, label: STAGE_LABELS[p.stage] }) }),
    );
    if (err) toast.error("No se pudo sincronizar: " + err.message);
    if (value) {
      setResult(value);
      toast.success(`Sincronizado: ${value.written} jornada(s) actualizadas desde ${value.weightsRead} pesaje(s)`);
      onSynced?.();
    }
    setBusy(false);
    setProgress(null);
  };

  return (
    <Modal section="Sincronizar pesajes" open onClose={onClose} title={`Sincronizar pesajes — ${prefix.id}`} size="sm">
      <div className="space-y-3">
        <p className="text-sm text-[var(--color-muted)]">
          Recalcula y sobreescribe las jornadas de <strong>{cycle?.label || cycle?.name}</strong> en el rango elegido, sumando los pesajes de este prefijo. Los días y trabajadores que falten se agregan al ciclo para que las jornadas sean visibles en la grilla. Se puede repetir sin problema — vuelve a calcular desde cero cada vez.
        </p>
        {lastSyncLabel(prefix.lastSync) && (
          <p className="text-xs text-[var(--color-muted)]">
            Última sincronización: <strong>{lastSyncLabel(prefix.lastSync)}</strong> — el rango de abajo sigue desde ahí.
          </p>
        )}
        <div className="flex gap-2">
          <label className="block flex-1">
            <span className="mb-1 block text-sm text-[var(--color-muted)]">Desde</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm"
            />
          </label>
          <label className="block flex-1">
            <span className="mb-1 block text-sm text-[var(--color-muted)]">Hasta</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm"
            />
          </label>
        </div>
        {busy && progress && <ProgressBar label={progress.label} done={progress.done} total={progress.total} />}

        {result && (
          <div className="space-y-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-sm">
            <div>Pesajes leídos: {result.weightsRead}</div>
            <div>Combinaciones trabajador/día: {result.groups}</div>
            <div>Jornadas escritas: {result.written}</div>
            {result.daysAdded.length > 0 && (
              <div>Días agregados al ciclo: {result.daysAdded.length} ({result.daysAdded.join(", ")})</div>
            )}
            {result.workersAdded > 0 && <div>Trabajadores agregados a la labor: {result.workersAdded}</div>}
            {result.unknownRuts.length > 0 && (
              <div className="text-[var(--color-danger)]">
                ⚠ Sin ficha en Trabajadores: {result.unknownRuts.join(", ")} — sus jornadas quedan invisibles hasta que los crees y vuelvas a sincronizar.
              </div>
            )}
            {result.blocked.length > 0 && (
              <div className="text-[var(--color-warning,#d97706)]">
                ⚠ No se tocaron {result.blocked.length} jornada(s) ya liquidadas: {result.blocked.join(", ")}. Si el pesaje cambió, la diferencia hay que corregirla desde la nómina que las pagó.
              </div>
            )}
            {result.zeroPriceDays.length > 0 && (
              <div className="text-[var(--color-warning,#d97706)]">
                ⚠ Días sin precio para ese combo: {result.zeroPriceDays.join(", ")} — esas jornadas quedaron en $0. Configura el precio en el ciclo y vuelve a sincronizar.
              </div>
            )}
            {cycle?.id && (
              <Link
                to={`/cycles/${cycle.id}`}
                className="mt-2 inline-block rounded-md border border-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]"
              >
                Ir a {cycle.label || cycle.name || "el ciclo"} →
              </Link>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm">
            Cerrar
          </button>
          <button
            onClick={run}
            disabled={busy}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
          >
            {busy ? "Sincronizando…" : "Sincronizar"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
