import { useState } from "react";
import { writeBatch, doc, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase";
import { workersService } from "../../services";
import { advancesService } from "../../services/advancesService";
import { ConsoleCard } from "./ConsoleCard";

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
  const [cambian, setCambian] = useState(null);
  const [huerfanos, setHuerfanos] = useState([]);
  const [totales, setTotales] = useState(null);

  const preview = async () => {
    setLoading(true);
    setMsg("");
    try {
      const [workers, advances] = await Promise.all([
        workersService.list({ order: ["name", "asc"] }),
        advancesService.list({ order: ["date", "desc"] }),
      ]);

      // doc id -> rut vigente; sin campo `rut`, el rut es el doc id.
      const rutActual = new Map(workers.map((w) => [w.id, w.rut || w.id]));
      const nombre = new Map(workers.map((w) => [w.id, w.name || ""]));
      const rutsVigentes = new Set(workers.map((w) => w.rut || w.id));

      const aCambiar = [];
      const sinDueno = [];

      for (const a of advances) {
        const actual = String(a.workerRut || "");
        if (!actual) continue;
        const destino = rutActual.get(actual);

        if (destino === undefined) {
          // Ni doc id ni rut vigente de nadie: o ya migró, o quedó huérfano.
          if (!rutsVigentes.has(actual)) {
            sinDueno.push({ id: a.id, nombre: a.workerName || "", rut: actual, status: a.status || "pending" });
          }
          continue;
        }
        if (destino !== actual) {
          aCambiar.push({
            id: a.id,
            nombre: nombre.get(actual) || a.workerName || "",
            desde: actual,
            hacia: destino,
            status: a.status || "pending",
          });
        }
      }

      setCambian(aCambiar);
      setHuerfanos(sinDueno);
      setTotales({
        advances: advances.length,
        divergentes: workers.filter((w) => w.rut && w.rut !== w.id).length,
      });
    } catch (err) {
      setMsg(`Error: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  const apply = async () => {
    if (!cambian?.length) return;
    setRunning(true);
    setMsg("");
    try {
      for (let i = 0; i < cambian.length; i += 450) {
        const batch = writeBatch(db);
        for (const c of cambian.slice(i, i + 450)) {
          batch.update(doc(db, "advances", c.id), { workerRut: c.hacia, updatedAt: serverTimestamp() });
        }
        await batch.commit();
      }
      advancesService.invalidate();
      setMsg(`✓ Migrados ${cambian.length} anticipo(s).`);
      await preview();
    } catch (err) {
      setMsg(`Error al migrar: ${err.message || err}`);
    } finally {
      setRunning(false);
    }
  };

  const vigentes = (cambian || []).filter((c) => c.status === "pending" || c.status === "partial").length;

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
          disabled={running || !cambian || cambian.length === 0}
          className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
        >
          {running ? "Migrando…" : `✔ Migrar ${cambian?.length || ""} anticipo(s)`}
        </button>
      </>}
    >
      {msg && <p className="mb-3 text-sm">{msg}</p>}

      {totales && (
        <p className="mb-3 text-xs text-[var(--color-muted)]">
          {totales.advances} anticipo(s) · {totales.divergentes} trabajador(es) con rut distinto del id
          {cambian ? ` · ${cambian.length} a migrar (${vigentes} vigente(s))` : ""}
        </p>
      )}

      {cambian && cambian.length === 0 && (
        <p className="text-sm text-[var(--color-muted)]">
          Nada que migrar: todos los anticipos ya apuntan al rut vigente.
        </p>
      )}

      {cambian && cambian.length > 0 && (
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
              {cambian.map((c) => (
                <tr key={c.id} className="border-t border-[var(--color-border)]">
                  <td className="px-3 py-2">{c.nombre || "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{c.desde}</td>
                  <td className="px-3 py-2 font-mono text-xs font-semibold">{c.hacia}</td>
                  <td className="px-3 py-2">{c.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {huerfanos.length > 0 && (
        <div className="mt-3 rounded-md border border-[var(--color-border)] p-3">
          <p className="text-xs font-semibold">
            ⚠ {huerfanos.length} anticipo(s) sin trabajador que coincida — no se tocan
          </p>
          <ul className="mt-1 space-y-0.5 font-mono text-xs text-[var(--color-muted)]">
            {huerfanos.map((h) => (
              <li key={h.id}>{h.rut} · {h.nombre || "sin nombre"} · {h.status}</li>
            ))}
          </ul>
        </div>
      )}
    </ConsoleCard>
  );
}
