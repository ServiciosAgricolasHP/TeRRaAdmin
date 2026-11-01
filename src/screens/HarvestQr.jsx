import { useState, useEffect, useEffectEvent, useMemo } from "react";
import { useToast } from "../contexts/ToastContext";
import { qrPrefixesService, cyclesService } from "../services";
import { syncJobs } from "../services/jobLists";
import { countedList } from "../services/cache";
import { useAuth } from "../contexts/AuthContext";
import ConfirmDialog from "../components/ConfirmDialog";
import { readsLabel, TAP, lastSyncLabel, dayMonth } from "./harvestQr/helpers";
import { PrefixFormModal } from "./harvestQr/PrefixFormModal";
import { QrManager } from "./harvestQr/QrManager";
import { SyncModal } from "./harvestQr/SyncModal";
import { WeightsExplorer } from "./harvestQr/WeightsExplorer";
import ScreenLoader from "../components/ScreenLoader";
import { attempt } from "../utils/attempt";

// Puente entre los prefijos QR físicos (impresos de antemano, app scan_IS) y
// el (faena, ciclo, labor) vigente al que se sincronizan sus pesajes.
//
// El ciclo y la labor vigentes se reapuntan a mano: cuándo se cierra un ciclo
// y se abre el siguiente es una decisión de negocio, y el ciclo más reciente
// no siempre es el vigente.

function healthOf(prefix, cyclesById) {
  if (!prefix.cycleId || !prefix.laborId) {
    return { level: "red", label: "Sin ciclo/labor configurado" };
  }
  const cycle = cyclesById.get(prefix.cycleId);
  if (!cycle) return { level: "red", label: "El ciclo configurado ya no existe" };
  // Un ciclo cerrado ya se liquidó o está por liquidarse: escribirle jornadas
  // por detrás descuadra lo que se pagó. Va en `red`, el nivel que deshabilita
  // el botón de sincronizar.
  if (cycle.status === "closed") {
    return { level: "red", label: "El ciclo vigente está cerrado — reapunta el prefijo al ciclo abierto" };
  }
  const harvestLabors = (cycle.labors || []).filter((l) => l.type === "cosecha");
  const labor = harvestLabors.find((l) => l.id === prefix.laborId);
  if (!labor) {
    if (harvestLabors.length === 0) {
      return { level: "red", label: "El ciclo vigente no tiene ninguna labor de cosecha" };
    }
    return { level: "red", label: "La labor configurada ya no es de tipo cosecha en este ciclo" };
  }
  if (harvestLabors.length > 1) {
    return { level: "yellow", label: `Hay ${harvestLabors.length} labores de cosecha en este ciclo — verifica que sea la correcta` };
  }
  return { level: "green", label: "OK" };
}

const HEALTH_STYLES = {
  green: "border-[var(--color-success,#16a34a)] text-[var(--color-success,#16a34a)] bg-[var(--color-success-soft,rgba(22,163,74,0.12))]",
  yellow: "border-[var(--color-warning,#d97706)] text-[var(--color-warning,#d97706)] bg-[var(--color-warning-soft,rgba(217,119,6,0.12))]",
  red: "border-[var(--color-danger,#dc2626)] text-[var(--color-danger,#dc2626)] bg-[var(--color-danger-soft,rgba(220,38,38,0.12))]",
};

export default function HarvestQr() {
  const toast = useToast();
  const { isAdmin } = useAuth();
  const [reads, setReads] = useState(null);
  const [tab, setTab] = useState("sync"); // sync | weights | qr
  const [prefixes, setPrefixes] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [cyclesById, setCyclesById] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [formState, setFormState] = useState(null); // null | { mode: "create" | "edit", data }
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [syncFor, setSyncFor] = useState(null); // doc del prefijo mientras se elige el rango

  const reload = async () => {
    setLoading(true);
    const { error: err } = await attempt(async () => {
      // `qrPrefixes` va sin caché: son pocos documentos y es la configuración
      // que hay que reapuntar al abrir un ciclo, así que se muestra al día.
      const [px, jobsResult] = await Promise.all([
        countedList(qrPrefixesService, { order: ["label", "asc"] }),
        syncJobs(),
      ]);
      setPrefixes(px.data);
      setJobs(jobsResult.data);
      const cycleIds = [...new Set(px.data.map((p) => p.cycleId).filter(Boolean))];
      const cycles = await Promise.all(cycleIds.map((id) => cyclesService.getById(id)));
      // Los ciclos van por `getById`, que nunca cachea: 1 lectura por ciclo apuntado.
      setReads(px.reads + jobsResult.reads + cycleIds.length);
      const map = new Map();
      cycles.forEach((c) => { if (c) map.set(c.id, c); });
      setCyclesById(map);
    });
    if (err) toast.error("No se pudo cargar la configuración de prefijos QR: " + err.message);
    setLoading(false);
  };

  // Carga al montar; `useEffectEvent` lee la versión actual de la función sin
  // volver a correr el efecto cuando cambia.
  const loadOnMount = useEffectEvent(() => reload());
  useEffect(() => { loadOnMount(); }, []);

  const jobById = useMemo(() => new Map(jobs.map((f) => [f.id, f])), [jobs]);

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleteBusy(true);
    const { error: err } = await attempt(async () => {
      await qrPrefixesService.remove(confirmDelete.id);
      setConfirmDelete(null);
      toast.success(`Prefijo ${confirmDelete.id} eliminado`);
      await reload();
    });
    if (err) toast.error("No se pudo eliminar: " + (err.message || err));
    setDeleteBusy(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">
            📷 Cosecha QR
            {isAdmin && tab === "sync" && reads != null ? (
              <span className="ml-2 text-xs font-normal text-[var(--color-muted)]">{readsLabel(reads)}</span>
            ) : null}
          </h1>
          <p className="text-sm text-[var(--color-muted)]">
            {tab === "sync"
              ? "A qué faena/ciclo/labor apunta cada prefijo QR físico (app scan_IS), y sincronización de sus pesajes hacia las jornadas."
              : tab === "weights"
                ? "Lectura directa de los pesajes que escribe la app de escaneo, antes de sincronizarlos hacia las jornadas."
                : "Qué QR físico tiene asignado cada trabajador, agrupados por prefijo."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-1 text-sm">
            <button
              onClick={() => setTab("sync")}
              className={`${TAP} flex-1 rounded px-3 ${tab === "sync" ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]" : "text-[var(--color-muted)]"}`}
            >
              🔄 Sincronizar cosechas
            </button>
            <button
              onClick={() => setTab("weights")}
              className={`${TAP} flex-1 rounded px-3 ${tab === "weights" ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]" : "text-[var(--color-muted)]"}`}
            >
              ⚖️ Pesajes
            </button>
            <button
              onClick={() => setTab("qr")}
              className={`${TAP} flex-1 rounded px-3 ${tab === "qr" ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]" : "text-[var(--color-muted)]"}`}
            >
              📱 Gestión QRs
            </button>
          </div>
        </div>
      </div>

      {tab === "sync" && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-[var(--color-muted)]">
            {loading ? "Cargando…" : `${prefixes.length} prefijo(s) configurado(s)`}
          </span>
          <button
            onClick={() => setFormState({ mode: "create", data: { active: true } })}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]"
          >
            + Nuevo prefijo
          </button>
        </div>
      )}

      {tab === "sync" && (loading ? (
        <ScreenLoader />
      ) : prefixes.length === 0 ? (
        <p className="rounded-md border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-muted)]">
          No hay prefijos configurados todavía.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-[var(--color-border)]">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-[var(--color-surface-2)] text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
              <tr>
                <th className="px-3 py-2">Prefijo</th>
                <th className="px-3 py-2">Faena</th>
                <th className="px-3 py-2">Ciclo / labor vigente</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Última sincronización</th>
                <th className="px-3 py-2">Activo</th>
                <th className="px-3 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {prefixes.map((p) => {
                const health = healthOf(p, cyclesById);
                const cycle = p.cycleId ? cyclesById.get(p.cycleId) : null;
                const labor = cycle?.labors?.find((l) => l.id === p.laborId);
                return (
                  <tr key={p.id}>
                    <td className="px-3 py-2 font-mono font-semibold">{p.id}</td>
                    <td className="px-3 py-2">
                      <div>{jobById.get(p.faenaId)?.name || "—"}</div>
                      <div className="text-xs text-[var(--color-muted)]">{p.label}</div>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <div>{cycle?.label || cycle?.name || (p.cycleId ? "(ciclo no encontrado)" : "—")}</div>
                      <div className="text-[var(--color-muted)]">{labor?.name || (p.laborId ? "(labor no encontrada)" : "—")}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded-full border px-2 py-0.5 text-xs ${HEALTH_STYLES[health.level]}`} title={health.label}>
                        {health.level === "green" ? "🟢" : health.level === "yellow" ? "🟡" : "🔴"} {health.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {lastSyncLabel(p.lastSync) ? (
                        <>
                          <div>{lastSyncLabel(p.lastSync)}</div>
                          <div className="text-[var(--color-muted)]" title={p.lastSync.at}>
                            {dayMonth(String(p.lastSync.at || "").slice(0, 10)) || "—"}
                            {p.lastSync.written != null && ` · ${p.lastSync.written} jornada(s)`}
                          </div>
                        </>
                      ) : (
                        <span className="text-[var(--color-muted)]">Nunca</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{p.active ? "Sí" : "No"}</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1.5">
                        <button
                          onClick={() => setSyncFor(p)}
                          disabled={health.level === "red"}
                          className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          🔄 Sincronizar
                        </button>
                        <button
                          onClick={() => setFormState({ mode: "edit", data: p })}
                          className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)]"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => setConfirmDelete(p)}
                          className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger-soft,rgba(220,38,38,0.12))]"
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      {tab === "weights" && <WeightsExplorer prefixes={prefixes} jobById={jobById} />}

      {tab === "qr" && <QrManager prefixes={prefixes} onPrefixesChanged={reload} />}

      {formState && (
        <PrefixFormModal
          mode={formState.mode}
          initial={formState.data}
          jobs={jobs}
          onClose={() => setFormState(null)}
          onSaved={() => { setFormState(null); reload(); }}
        />
      )}

      {syncFor && (
        <SyncModal
          prefix={syncFor}
          cycle={cyclesById.get(syncFor.cycleId)}
          onClose={() => setSyncFor(null)}
          onSynced={reload}
        />
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="Eliminar prefijo"
        message={confirmDelete ? `¿Eliminar el prefijo "${confirmDelete.id}"? Esto no borra los pesajes ya registrados, solo el mapeo hacia la faena/ciclo.` : ""}
        confirmLabel="Eliminar"
        danger
        busy={deleteBusy}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
