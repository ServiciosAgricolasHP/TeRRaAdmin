import { useState } from "react";
import { doc, serverTimestamp } from "firebase/firestore";
import { writeBatch } from "../../services/readMeter";
import { db } from "../../firebase";
import { workersService } from "../../services";
import { advancesService } from "../../services/advancesService";
import { ConsoleCard } from "./ConsoleCard";
import { attempt } from "../../utils/attempt";

// ============================================================
// Migración única: anticipos al rut vigente
// ============================================================
// Re-apunta `advances.workerRut` del doc id del trabajador a su rut vigente,
// para que `worker.rut` sea la única clave foránea. Los dos difieren cuando el
// rut cambió (p. ej. de una cédula provisoria al definitivo). `workerId` no se
// toca: guarda el id original.
export function MigrateAdvanceRutsSection() {
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState("");
  const [toChange, setToChange] = useState(null);
  const [orphans, setOrphans] = useState([]);
  const [totals, setTotals] = useState(null);

  const preview = async () => {
    setLoading(true);
    setMsg("");
    const { error: err } = await attempt(async () => {
      const [workers, advances] = await Promise.all([
        workersService.list({ order: ["name", "asc"] }),
        advancesService.list({ order: ["date", "desc"] }),
      ]);

      // doc id -> rut vigente; sin campo `rut`, el rut es el doc id.
      const currentRutById = new Map(workers.map((w) => [w.id, w.rut || w.id]));
      const nameById = new Map(workers.map((w) => [w.id, w.name || ""]));
      const currentRuts = new Set(workers.map((w) => w.rut || w.id));

      const pendingChanges = [];
      const ownerless = [];

      for (const a of advances) {
        const storedRut = String(a.workerRut || "");
        if (!storedRut) continue;
        const targetRut = currentRutById.get(storedRut);

        if (targetRut === undefined) {
          // Ni doc id ni rut vigente de nadie: o ya migró, o quedó huérfano.
          if (!currentRuts.has(storedRut)) {
            ownerless.push({ id: a.id, name: a.workerName || "", rut: storedRut, status: a.status || "pending" });
          }
          continue;
        }
        if (targetRut !== storedRut) {
          pendingChanges.push({
            id: a.id,
            name: nameById.get(storedRut) || a.workerName || "",
            from: storedRut,
            to: targetRut,
            status: a.status || "pending",
          });
        }
      }

      setToChange(pendingChanges);
      setOrphans(ownerless);
      setTotals({
        advances: advances.length,
        divergent: workers.filter((w) => w.rut && w.rut !== w.id).length,
      });
    });
    if (err) setMsg(`Error: ${err.message || err}`);
    setLoading(false);
  };

  const apply = async () => {
    if (!toChange?.length) return;
    setRunning(true);
    setMsg("");
    const { error: err } = await attempt(async () => {
      for (let i = 0; i < toChange.length; i += 450) {
        const batch = writeBatch(db);
        for (const c of toChange.slice(i, i + 450)) {
          batch.update(doc(db, "advances", c.id), { workerRut: c.to, updatedAt: serverTimestamp() });
        }
        await batch.commit();
      }
      advancesService.invalidate();
      setMsg(`✓ Migrados ${toChange.length} anticipo(s).`);
      await preview();
    });
    if (err) setMsg(`Error al migrar: ${err.message || err}`);
    setRunning(false);
  };

  const openCount = (toChange || []).filter((c) => c.status === "pending" || c.status === "partial").length;

  return (
    <ConsoleCard
      id="migrar-anticipos-rut"
      title="Migración: anticipos al rut vigente"
      description={<>Re-apunta <code>advances.workerRut</code> al rut actual del trabajador para que <code>worker.rut</code> sea la única clave foránea. <code>workerId</code> no se toca.</>}
      actions={<>
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
          disabled={running || !toChange || toChange.length === 0}
          className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
        >
          {running ? "Migrando…" : `✔ Migrar ${toChange?.length || ""} anticipo(s)`}
        </button>
      </>}
    >
      {msg && <p className="mb-3 text-sm">{msg}</p>}

      {totals && (
        <p className="mb-3 text-xs text-[var(--color-muted)]">
          {totals.advances} anticipo(s) · {totals.divergent} trabajador(es) con rut distinto del id
          {toChange ? ` · ${toChange.length} a migrar (${openCount} vigente(s))` : ""}
        </p>
      )}

      {toChange && toChange.length === 0 && (
        <p className="text-sm text-[var(--color-muted)]">
          Nada que migrar: todos los anticipos ya apuntan al rut vigente.
        </p>
      )}

      {toChange && toChange.length > 0 && (
        <div className="max-h-72 overflow-auto rounded-md border border-[var(--color-border)]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[var(--color-surface-2)]">
              <tr className="text-left">
                <th className="px-3 py-2 font-semibold">Trabajador</th>
                <th className="px-3 py-2 font-semibold">Desde (id)</th>
                <th className="px-3 py-2 font-semibold">Hacia (rut vigente)</th>
                <th className="px-3 py-2 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {toChange.map((c) => (
                <tr key={c.id} className="border-t border-[var(--color-border)]">
                  <td className="px-3 py-2">{c.name || "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{c.from}</td>
                  <td className="px-3 py-2 font-mono text-xs font-semibold">{c.to}</td>
                  <td className="px-3 py-2">{c.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {orphans.length > 0 && (
        <div className="mt-3 rounded-md border border-[var(--color-border)] p-3">
          <p className="text-xs font-semibold">
            ⚠ {orphans.length} anticipo(s) sin trabajador que coincida — no se tocan
          </p>
          <ul className="mt-1 space-y-0.5 font-mono text-xs text-[var(--color-muted)]">
            {orphans.map((h) => (
              <li key={h.id}>{h.rut} · {h.name || "sin nombre"} · {h.status}</li>
            ))}
          </ul>
        </div>
      )}
    </ConsoleCard>
  );
}
