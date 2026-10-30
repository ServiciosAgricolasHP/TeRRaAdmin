import { useState, useEffect } from "react";
import { useToast } from "../../contexts/ToastContext";
import { cyclesService, qrPrefixesService } from "../../services";
import Modal, { ModalCloseButton } from "../../components/Modal";
import { hasChanges } from "../../utils/formChanges";
import Select from "../../components/Select";
import { attempt } from "../../utils/attempt";
import { useValuesChanged } from "../../hooks/useValuesChanged";

export function PrefixFormModal({ mode, initial, jobs, onClose, onSaved }) {
  const toast = useToast();
  const [prefix, setPrefix] = useState(initial.id || "");
  const [label, setLabel] = useState(initial.label || "");
  const [jobId, setJobId] = useState(initial.faenaId || "");
  const [cycleId, setCycleId] = useState(initial.cycleId || "");
  const [laborId, setLaborId] = useState(initial.laborId || "");
  const [active, setActive] = useState(initial.active !== false);
  const [cycles, setCycles] = useState([]);
  const [busy, setBusy] = useState(false);
  const values = { prefix, label, faenaId: jobId, cycleId, laborId, active };
  const [baseline] = useState(values);

  if (useValuesChanged([jobId], { onMount: true }) && !jobId) setCycles([]);
  useEffect(() => {
    if (!jobId) return;
    cyclesService
      .list({ wheres: [["faenaId", "==", jobId]], order: ["createdAt", "desc"] })
      .then((list) => {
        setCycles(list.sort((a, b) => (a.status === b.status ? 0 : a.status === "open" ? -1 : 1)));
      })
      // Igualdad sobre `faenaId` más `orderBy createdAt` necesita un índice
      // compuesto; si falta, se avisa con un toast y el select queda vacío.
      .catch((err) => {
        setCycles([]);
        toast.error("No se pudieron cargar los ciclos de la faena: " + (err.message || err));
      });
  }, [jobId, toast]);

  const selectedCycle = cycles.find((c) => c.id === cycleId);
  const laborOptions = (selectedCycle?.labors || [])
    .filter((l) => l.type === "cosecha")
    .map((l) => ({ value: l.id, label: l.name }));

  const submit = async () => {
    const prefixId = prefix.trim().toUpperCase();
    if (!prefixId || !label.trim() || !jobId) {
      toast.error("Prefijo, etiqueta y faena son obligatorios");
      return;
    }
    setBusy(true);
    const { error: err } = await attempt(async () => {
      await qrPrefixesService.upsert(prefixId, {
        label: label.trim(),
        faenaId: jobId,
        cycleId: cycleId || null,
        laborId: laborId || null,
        active,
      });
      toast.success(mode === "create" ? "Prefijo creado" : "Prefijo actualizado");
      onSaved();
    });
    if (err) toast.error("No se pudo guardar: " + err.message);
    setBusy(false);
  };

  return (
    <Modal
      open
      onClose={onClose}
      dirty={!busy && hasChanges(baseline, values)}
      title={mode === "create" ? "Nuevo prefijo QR" : `Editar prefijo ${initial.id}`}
      size="sm"
      footer={
        <>
          <ModalCloseButton className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm">
            Cancelar
          </ModalCloseButton>
          <button
            type="submit"
            form="harvestqr-prefix-form"
            disabled={busy}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
          >
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </>
      }
    >
      <form id="harvestqr-prefix-form" onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm text-[var(--color-muted)]">
            Prefijo <span className="text-[var(--color-danger)]">*</span>
          </span>
          <input
            type="text"
            value={prefix}
            disabled={mode === "edit"}
            onChange={(e) => setPrefix(e.target.value.toUpperCase())}
            placeholder="HP"
            maxLength={5}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm uppercase outline-none focus:border-[var(--color-accent)] disabled:opacity-60"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-[var(--color-muted)]">
            Etiqueta <span className="text-[var(--color-danger)]">*</span>
          </span>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Ej. HP — Berries Ejemplo"
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
          />
        </label>
        <Select
          label="Faena"
          required
          value={jobId}
          onChange={(v) => { setJobId(v); setCycleId(""); setLaborId(""); }}
          options={jobs.map((f) => ({ value: f.id, label: f.name }))}
        />
        <Select
          label="Ciclo vigente"
          value={cycleId}
          onChange={(v) => { setCycleId(v); setLaborId(""); }}
          disabled={!jobId}
          placeholder={jobId ? "Sin ciclo asignado" : "Elige una faena primero"}
          options={cycles.map((c) => ({ value: c.id, label: `${c.label || c.name || c.id}${c.status === "closed" ? " (cerrado)" : ""}` }))}
        />
        <Select
          label="Labor de cosecha vigente"
          value={laborId}
          onChange={setLaborId}
          disabled={!cycleId}
          placeholder={
            !cycleId ? "Elige un ciclo primero" : laborOptions.length === 0 ? "Este ciclo no tiene labores de cosecha" : "Sin labor asignada"
          }
          options={laborOptions}
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Activo (visible como opción en la app de escaneo)
        </label>
      </form>
    </Modal>
  );
}
