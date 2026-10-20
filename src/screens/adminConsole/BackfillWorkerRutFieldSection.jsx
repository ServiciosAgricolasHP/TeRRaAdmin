import { useState } from "react";
import { workersService } from "../../services";
import { useToast } from "../../contexts/ToastContext";
import ConfirmDialog from "../../components/ConfirmDialog";
import { fmtNumber } from "../../utils/format";
import { ConsoleCard } from "./ConsoleCard";

// Completa `rut: doc.id` en los trabajadores que no tienen el campo. Solo toca
// esos, así que se puede volver a correr.
export function BackfillWorkerRutFieldSection() {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [candidates, setCandidates] = useState(null); // [{ id, name }]
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState(null);
  const [confirmApply, setConfirmApply] = useState(false);

  const preview = async () => {
    setLoading(true);
    setResult(null);
    setCandidates(null);
    try {
      const all = await workersService.list();
      const rows = all.filter((w) => !w.rut).map((w) => ({ id: w.id, name: w.name || "" }));
      rows.sort((a, b) => a.id.localeCompare(b.id));
      setCandidates(rows);
    } catch (err) {
      toast.error("Error al leer trabajadores: " + (err.message || String(err)));
    } finally {
      setLoading(false);
    }
  };

  const apply = () => {
    if (!candidates || candidates.length === 0) return;
    setConfirmApply(true);
  };

  const doApply = async () => {
    setRunning(true);
    setProgress({ done: 0, total: candidates.length });
    let updated = 0;
    const errors = [];
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      try {
        await workersService.update(c.id, { rut: c.id });
        updated++;
      } catch (err) {
        errors.push({ id: c.id, error: err.message || String(err) });
      }
      setProgress({ done: i + 1, total: candidates.length });
    }
    setResult({ updated, errors });
    setCandidates(null);
    setRunning(false);
  };

  return (
    <ConsoleCard id="backfill-campo-rut-en-trabajadores" title="Backfill: campo rut en trabajadores" 
      description={<>Completa <code>worker.rut</code> (= id actual del documento) en trabajadores viejos que todavía
            no lo tienen. Paso previo para poder editar el rut más adelante sin perder identidad.</>} 
      actions={<><div className="flex items-center gap-2">
          <button
            type="button"
            onClick={preview}
            disabled={loading || running}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
          >
            {loading ? "Buscando…" : "🔎 Vista previa"}
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={running || !candidates || candidates.length === 0}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
          >
            {running
              ? `Aplicando… ${progress.done}/${progress.total}`
              : `✔ Aplicar ${candidates?.length || ""} trabajador${candidates?.length === 1 ? "" : "es"}`}
          </button>
        </div></>}>

      {candidates !== null && !loading && (
        <p className="mb-3 text-xs text-[var(--color-muted)]">
          Sin campo rut:{" "}
          <span className={`font-semibold tabular-nums ${candidates.length > 0 ? "text-[var(--color-accent)]" : "text-[var(--color-muted)]"}`}>
            {fmtNumber(candidates.length)}
          </span>
        </p>
      )}

      {candidates && candidates.length > 0 && (
        <div className="overflow-hidden rounded-md border border-[var(--color-border)]">
          <table className="w-full text-xs">
            <thead className="bg-[var(--color-surface-2)] text-left text-[var(--color-muted)]">
              <tr>
                <th className="px-3 py-1.5">RUT (= id)</th>
                <th className="px-3 py-1.5">Nombre</th>
              </tr>
            </thead>
            <tbody>
              {candidates.slice(0, 10).map((c) => (
                <tr key={c.id} className="border-t border-[var(--color-border)]">
                  <td className="px-3 py-1 font-mono text-[10px]">{c.id}</td>
                  <td className="px-3 py-1">{c.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {candidates.length > 10 && (
            <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-center text-xs text-[var(--color-muted)]">
              … y {fmtNumber(candidates.length - 10)} más (muestra acotada a 10)
            </div>
          )}
        </div>
      )}

      {result && (
        <div className="mt-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-sm">
          <div>
            ✔ Actualizados:{" "}
            <span className="font-semibold tabular-nums text-[var(--color-success)]">
              {result.updated}
            </span>
          </div>
          {result.errors.length > 0 && (
            <>
              <div className="mt-1 text-[var(--color-danger)]">
                ✖ Errores: {result.errors.length}
              </div>
              <ul className="mt-1 max-h-40 overflow-y-auto text-xs text-[var(--color-muted)]">
                {result.errors.map((e, i) => (
                  <li key={i}>
                    <span className="font-mono">{e.id}</span>: {e.error}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmApply}
        title="Completar campo rut"
        message={`¿Completar el campo rut en ${candidates?.length || 0} trabajador(es) (rut = id actual)?\n\nEs aditivo — no toca ningún otro campo. Se puede re-ejecutar sin problema.`}
        confirmLabel="Aplicar"
        danger
        onCancel={() => setConfirmApply(false)}
        onConfirm={() => { setConfirmApply(false); doApply(); }}
      />
    </ConsoleCard>
  );
}
