import { useState } from "react";
import { workersService } from "../../services";
import { toProperName } from "../../utils/nameUtils";
import { useToast } from "../../contexts/ToastContext";
import ConfirmDialog from "../../components/ConfirmDialog";
import { fmtNumber } from "../../utils/format";
import { ConsoleCard } from "./ConsoleCard";

// ============================================================
// Sección: normalizar nombres de trabajadores a Proper Case
// ============================================================
// Aplica `toProperName` a los `worker.name` que no tengan el formato esperado
// ("Juan Pérez", "Juan de la Cruz"). Dos pasos: una vista previa que solo lee
// y lista los cambios, y aplicar, que los escribe uno a uno con progreso.
//
// Cuesta 1 lectura por trabajador (lista completa, sin caché) + 1 escritura
// por nombre cambiado. Los que ya están bien no se tocan.
export function NormalizeWorkerNamesSection() {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [scanned, setScanned] = useState(0);
  const [diffs, setDiffs] = useState([]); // [{ id, oldName, newName }]
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState(null); // { updated, errors }
  const [showAll, setShowAll] = useState(false);
  const [confirmApply, setConfirmApply] = useState(false);

  const preview = async () => {
    setLoading(true);
    setResult(null);
    setDiffs([]);
    setShowAll(false);
    try {
      // Sin caché: lee datos frescos antes de escribir.
      const list = await workersService.list();
      setScanned(list.length);
      const changes = [];
      for (const w of list) {
        const oldName = String(w.name || "");
        const newName = toProperName(oldName);
        if (newName && newName !== oldName) {
          changes.push({ id: w.id, oldName, newName });
        }
      }
      changes.sort((a, b) => a.newName.localeCompare(b.newName));
      setDiffs(changes);
    } catch (err) {
      toast.error("Error al leer trabajadores: " + (err.message || String(err)));
    } finally {
      setLoading(false);
    }
  };

  const apply = () => {
    if (diffs.length === 0) return;
    setConfirmApply(true);
  };

  const doApply = async () => {
    setRunning(true);
    setProgress({ done: 0, total: diffs.length });
    let updated = 0;
    const errors = [];
    for (let i = 0; i < diffs.length; i++) {
      const d = diffs[i];
      try {
        await workersService.update(d.id, { name: d.newName });
        updated++;
      } catch (err) {
        errors.push({ id: d.id, oldName: d.oldName, error: err.message || String(err) });
      }
      setProgress({ done: i + 1, total: diffs.length });
    }
    setResult({ updated, errors });
    setDiffs([]); // vacía la vista previa; para volver a verificar se pide otra
    setRunning(false);
  };

  const displayDiffs = showAll ? diffs : diffs.slice(0, 20);

  return (
    <ConsoleCard id="normalizar-nombres-de-trabajadores" title="Normalizar nombres de trabajadores" 
      description={<>Convierte los <code>name</code> al formato "Juan Pérez" (primera letra
            mayúscula, resto minúscula, conectores en minúscula).
            Primero la vista previa, después aplicar.</>} 
      actions={<><div className="flex items-center gap-2">
          <button
            type="button"
            onClick={preview}
            disabled={loading || running}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
          >
            {loading ? "Analizando…" : "🔎 Vista previa"}
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={running || diffs.length === 0}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
          >
            {running
              ? `Aplicando… ${progress.done}/${progress.total}`
              : `✔ Aplicar ${diffs.length || ""} cambio${diffs.length === 1 ? "" : "s"}`}
          </button>
        </div></>}>

      {scanned > 0 && !loading && (
        <p className="mb-3 text-xs text-[var(--color-muted)]">
          Escaneados: <span className="font-semibold tabular-nums text-[var(--color-text)]">{fmtNumber(scanned)}</span>{" "}
          trabajadores · A cambiar:{" "}
          <span className={`font-semibold tabular-nums ${diffs.length > 0 ? "text-[var(--color-accent)]" : "text-[var(--color-muted)]"}`}>
            {fmtNumber(diffs.length)}
          </span>
        </p>
      )}

      {diffs.length > 0 && (
        <div className="overflow-hidden rounded-md border border-[var(--color-border)]">
          <table className="w-full text-xs">
            <thead className="bg-[var(--color-surface-2)] text-left text-[var(--color-muted)]">
              <tr>
                <th className="px-3 py-1.5">RUT</th>
                <th className="px-3 py-1.5">Antes</th>
                <th className="px-3 py-1.5">Después</th>
              </tr>
            </thead>
            <tbody>
              {displayDiffs.map((d) => (
                <tr key={d.id} className="border-t border-[var(--color-border)]">
                  <td className="px-3 py-1 font-mono text-[10px] text-[var(--color-muted)]">{d.id}</td>
                  <td className="px-3 py-1 text-[var(--color-muted)] line-through">{d.oldName}</td>
                  <td className="px-3 py-1 font-medium">{d.newName}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {diffs.length > 20 && !showAll && (
            <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-center">
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="text-xs text-[var(--color-accent)] hover:underline"
              >
                Ver los {diffs.length - 20} restantes…
              </button>
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
                {result.errors.slice(0, 20).map((e, i) => (
                  <li key={i}>
                    <span className="font-mono">{e.id}</span> ({e.oldName}): {e.error}
                  </li>
                ))}
                {result.errors.length > 20 && <li>… y {result.errors.length - 20} más</li>}
              </ul>
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmApply}
        title="Aplicar cambios de nombre"
        message={`¿Aplicar ${diffs.length} cambio(s) de nombre?\n\nEsta operación no se puede deshacer automáticamente. Revisa la vista previa antes de continuar.`}
        confirmLabel="Aplicar"
        danger
        onCancel={() => setConfirmApply(false)}
        onConfirm={() => { setConfirmApply(false); doApply(); }}
      />
    </ConsoleCard>
  );
}
