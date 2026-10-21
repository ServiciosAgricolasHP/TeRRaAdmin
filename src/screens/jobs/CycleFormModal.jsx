import { ImportSection } from "./ImportSection";
import { LABOR_TYPES } from "../../utils/laborTypes";
import Modal, { ModalCloseButton } from "../../components/Modal";
import Select from "../../components/Select";
import TextField from "../../components/TextField";
import { hasChanges } from "../../utils/formChanges";

// En el alta de un ciclo, lo que se ofrece para importar no es un dato del
// formulario.
const CYCLE_FORM_IGNORE = ["importCandidates", "labors", "days"];

// Alta y edición de un ciclo. En el alta se elige la primera labor (y si
// suma una de Supervisión) o se importa desde otro ciclo abierto de la
// subfaena.
export function CycleFormModal({ busy, cycleForm, cyclePrefix, selectedSubjobs, setCycleForm, submitCycle }) {
  "use no memo";
  return (
    <Modal
      open={!!cycleForm}
      onClose={() => !busy && setCycleForm(null)}
      dirty={!!cycleForm && !busy && hasChanges(cycleForm.initial, cycleForm.data, { ignore: CYCLE_FORM_IGNORE })}
      title={cycleForm?.mode === "edit" ? "Editar ciclo" : "Nuevo ciclo"}
    >
      {cycleForm && (
        <form onSubmit={submitCycle} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm text-[var(--color-muted)]">
              Etiqueta<span className="ml-0.5 text-[var(--color-danger)]">*</span>
            </span>
            <div className="flex items-stretch overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)]">
              <span className="flex items-center bg-[var(--color-surface)] px-2 text-xs text-[var(--color-muted)] border-r border-[var(--color-border)]">
                {cyclePrefix(cycleForm.jobId, cycleForm.data.subfaenaId) || "—"}
              </span>
              <input
                required
                autoFocus
                value={cycleForm.data.labelSuffix ?? ""}
                onChange={(e) => setCycleForm((c) => ({ ...c, data: { ...c.data, labelSuffix: e.target.value } }))}
                placeholder="Ciclo 1"
                className="flex-1 bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
              />
            </div>
            <span className="mt-1 block text-[10px] text-[var(--color-muted)]">
              El prefijo Faena/Subfaena/ es fijo
            </span>
          </label>
          {selectedSubjobs && selectedSubjobs.length > 0 && (
            <Select
              label="Subfaena"
              required
              value={cycleForm.data.subfaenaId || ""}
              onChange={(v) => setCycleForm((c) => ({ ...c, data: { ...c.data, subfaenaId: v } }))}
              options={selectedSubjobs.map((s) => ({ value: s.id, label: s.name }))}
              placeholder="Selecciona la subfaena"
            />
          )}
          <TextField
            label="Fecha inicio"
            type="date"
            value={cycleForm.data.startDate}
            onChange={(v) => setCycleForm((c) => ({ ...c, data: { ...c.data, startDate: v } }))}
          />
          <TextField
            label="Notas"
            value={cycleForm.data.notes}
            onChange={(v) => setCycleForm((c) => ({ ...c, data: { ...c.data, notes: v } }))}
          />
          {cycleForm.mode === "create" && !cycleForm.data.importEnabled && (
            <div className="space-y-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
              <Select
                label="Primera labor"
                value={cycleForm.data.laborType || "main"}
                onChange={(v) => setCycleForm((c) => ({ ...c, data: { ...c.data, laborType: v } }))}
                options={LABOR_TYPES}
              />
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!cycleForm.data.withSupervision}
                  onChange={(e) =>
                    setCycleForm((c) => ({ ...c, data: { ...c.data, withSupervision: e.target.checked } }))
                  }
                  disabled={cycleForm.data.laborType === "supervision"}
                  className="mt-0.5"
                />
                <span className={cycleForm.data.laborType === "supervision" ? "text-[var(--color-muted)]" : ""}>
                  Agregar también una labor de Supervisión
                  {cycleForm.data.laborType === "supervision" ? " (ya es la primera)" : ""}
                </span>
              </label>
            </div>
          )}
          {cycleForm.mode === "create" && (cycleForm.data.importCandidates || []).length > 0 && (
            <ImportSection
              data={cycleForm.data}
              onChange={(patch) =>
                setCycleForm((c) => ({ ...c, data: { ...c.data, ...patch } }))
              }
            />
          )}
          <p className="text-xs text-[var(--color-muted)]">
            {cycleForm.mode === "create" && cycleForm.data.importEnabled
              ? "Se clonarán las labores marcadas. Si activaste 'Mover jornadas', se transferirán al nuevo ciclo y desaparecerán del origen."
              : cycleForm.mode === "create"
                ? `El ciclo arranca con la fecha de inicio como primer día y ${
                    cycleForm.data.withSupervision && cycleForm.data.laborType !== "supervision" ? "dos labores" : "una labor"
                  }. Podrás agregar más al abrirlo.`
                : "Podrás agregar más labores al abrir el ciclo."}
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <ModalCloseButton
              disabled={busy}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
            >
              Cancelar
            </ModalCloseButton>
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] shadow-sm hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
            >
              {busy ? "..." : "Guardar"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
