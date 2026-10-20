import Modal, { ModalCloseButton } from "../../components/Modal";
import { hasChanges } from "../../utils/formChanges";
import TextField from "../../components/TextField";
import Select from "../../components/Select";
import { LABOR_TYPES } from "../../utils/laborTypes";
import { COSECHA_MODES } from "../../utils/cosechaCombos";
import { StagesEditor } from "./StagesEditor";
import { useCycleDetail } from "./CycleDetailContext";

// Formulario para crear o editar una labor: nombre, agrupación, tipo y la
// configuración propia de cada tipo.
export function LaborFormModal() {
  "use no memo";
  const {
    catalogs,
    laborForm,
    laborGroups,
    setLaborForm,
    submitLabor,
  } = useCycleDetail();
  return (
    <Modal
      open={!!laborForm}
      onClose={() => setLaborForm(null)}
      dirty={!!laborForm && hasChanges(laborForm.initial, laborForm.data)}
      title={laborForm?.mode === "edit" ? "Editar labor" : "Nueva labor"}
    >
      {laborForm && (
        <form onSubmit={submitLabor} className="space-y-4">
          <TextField
            label="Nombre" required autoFocus
            value={laborForm.data.name}
            onChange={(v) => setLaborForm((s) => ({ ...s, data: { ...s.data, name: v } }))}
          />
          <Select
            label="Tipo" required
            value={laborForm.data.type}
            onChange={(v) => setLaborForm((s) => ({ ...s, data: { ...s.data, type: v } }))}
            options={LABOR_TYPES}
          />
          <div>
            <Select
              label="Grupo de labor (opcional)"
              value={laborForm.data.laborGroupId}
              onChange={(v) => setLaborForm((s) => ({ ...s, data: { ...s.data, laborGroupId: v } }))}
              placeholder="Sin grupo"
              options={[
                ...laborGroups.map((g) => ({ value: g.id, label: g.name })),
                { value: "__new__", label: "+ Crear grupo nuevo…" },
              ]}
            />
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              Hila esta labor con las de mismo nombre en otros ciclos de esta subfaena (ej. "Poda" del ciclo pasado
              con "Poda" del actual), para poder ver su historial junto.
            </p>
            {laborForm.data.laborGroupId === "__new__" && (
              <div className="mt-2">
                <TextField
                  label="Nombre del grupo nuevo" required autoFocus
                  value={laborForm.data.newGroupName}
                  onChange={(v) => setLaborForm((s) => ({ ...s, data: { ...s.data, newGroupName: v } }))}
                />
              </div>
            )}
          </div>
          {laborForm.data.type === "cosecha" && (
            <Select
              label="Modo por defecto al agregar tipos"
              value={laborForm.data.cosechaMode}
              onChange={(v) => setLaborForm((s) => ({ ...s, data: { ...s.data, cosechaMode: v } }))}
              options={COSECHA_MODES}
            />
          )}
          {laborForm.data.type === "trato" && (
            <>
              <Select
                label="Tipo de trato"
                value={laborForm.data.tratoType}
                onChange={(v) => setLaborForm((s) => ({ ...s, data: { ...s.data, tratoType: Number(v) } }))}
                options={(catalogs.tratoTypes || []).map((t) => ({ value: t.value, label: t.label }))}
              />
              <p className="text-xs text-[var(--color-muted)]">
                ¿No está en la lista? Agrégalo desde el botón ⚙ Catálogos.
              </p>
              <Select
                label="Modo por defecto"
                value={laborForm.data.tratoMode}
                onChange={(v) => setLaborForm((s) => ({ ...s, data: { ...s.data, tratoMode: v } }))}
                options={COSECHA_MODES}
              />
            </>
          )}
          {laborForm.data.type === "tratoEtapas" && (
            <StagesEditor
              stages={laborForm.data.stages || []}
              onChange={(next) => setLaborForm((s) => ({ ...s, data: { ...s.data, stages: next } }))}
            />
          )}
          {["main", "supervision", "extra"].includes(laborForm.data.type) && (
            <TextField
              label="Precio diario por defecto ($)" type="number"
              value={laborForm.data.baseDayDefault}
              onChange={(v) => setLaborForm((s) => ({ ...s, data: { ...s.data, baseDayDefault: v } }))}
            />
          )}
          {laborForm.data.type === "tratoHE" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label="Base diaria por defecto ($)" type="number"
                value={laborForm.data.baseDayDefault}
                onChange={(v) => setLaborForm((s) => ({ ...s, data: { ...s.data, baseDayDefault: v } }))}
              />
              <TextField
                label="Tarifa hora extra ($/h)" type="number"
                value={laborForm.data.overtimeRate}
                onChange={(v) => setLaborForm((s) => ({ ...s, data: { ...s.data, overtimeRate: v } }))}
              />
              <TextField
                label="Bono manejo ($)" type="number"
                value={laborForm.data.bonusManejo}
                onChange={(v) => setLaborForm((s) => ({ ...s, data: { ...s.data, bonusManejo: v } }))}
              />
              <TextField
                label="Bono supervisión/líder ($)" type="number"
                value={laborForm.data.bonusSupervision}
                onChange={(v) => setLaborForm((s) => ({ ...s, data: { ...s.data, bonusSupervision: v } }))}
              />
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <ModalCloseButton className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2 text-sm hover:bg-[var(--color-accent-soft)]">
              Cancelar
            </ModalCloseButton>
            <button type="submit" className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]">
              Guardar
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
