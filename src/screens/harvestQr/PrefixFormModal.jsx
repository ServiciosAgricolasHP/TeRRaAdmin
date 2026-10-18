import { useState, useEffect } from "react";
import { useToast } from "../../contexts/ToastContext";
import { cyclesService, qrPrefixesService } from "../../services";
import Modal, { ModalCloseButton } from "../../components/Modal";
import { hasChanges } from "../../utils/formChanges";
import Select from "../../components/Select";

export function PrefixFormModal({ mode, initial, faenas, onClose, onSaved }) {
  const toast = useToast();
  const [prefix, setPrefix] = useState(initial.id || "");
  const [label, setLabel] = useState(initial.label || "");
  const [faenaId, setFaenaId] = useState(initial.faenaId || "");
  const [cycleId, setCycleId] = useState(initial.cycleId || "");
  const [laborId, setLaborId] = useState(initial.laborId || "");
  const [active, setActive] = useState(initial.active !== false);
  const [cycles, setCycles] = useState([]);
  const [busy, setBusy] = useState(false);
  const values = { prefix, label, faenaId, cycleId, laborId, active };
  const [baseline] = useState(values);

  useEffect(() => {
    if (!faenaId) { setCycles([]); return; }
    cyclesService
      .list({ wheres: [["faenaId", "==", faenaId]], order: ["createdAt", "desc"] })
      .then((list) => {
        setCycles(list.sort((a, b) => (a.status === b.status ? 0 : a.status === "open" ? -1 : 1)));
      })
      // Igualdad sobre `faenaId` más `orderBy createdAt` necesita un índice
      // compuesto; si falta, se avisa con un toast y el select queda vacío.
      .catch((err) => {
        setCycles([]);
        toast.error("No se pudieron cargar los ciclos de la faena: " + (err.message || err));
      });
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [faenaId]);

  const selectedCycle = cycles.find((c) => c.id === cycleId);
  const laborOptions = (selectedCycle?.labors || [])
    .filter((l) => l.type === "cosecha")
    .map((l) => ({ value: l.id, label: l.name }));

  const submit = async () => {
    const prefixId = prefix.trim().toUpperCase();
    if (!prefixId || !label.trim() || !faenaId) {
      toast.error("Prefijo, etiqueta y faena son obligatorios");
      return;
    }
    setBusy(true);
    try {
      await qrPrefixesService.upsert(prefixId, {
        label: label.trim(),
        faenaId,
        cycleId: cycleId || null,
        laborId: laborId || null,
        active,
      });
      toast.success(mode === "create" ? "Prefijo creado" : "Prefijo actualizado");
      onSaved();
    } catch (err) {
      toast.error("No se pudo guardar: " + err.message);
    } finally {
      setBusy(false);
    }
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
          value={faenaId}
          onChange={(v) => { setFaenaId(v); setCycleId(""); setLaborId(""); }}
          options={faenas.map((f) => ({ value: f.id, label: f.name }))}
        />
        <Select
          label="Ciclo vigente"
          value={cycleId}
          onChange={(v) => { setCycleId(v); setLaborId(""); }}
          disabled={!faenaId}
          placeholder={faenaId ? "Sin ciclo asignado" : "Elige una faena primero"}
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
