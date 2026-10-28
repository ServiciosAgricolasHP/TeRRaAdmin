import { useState } from "react";
import { useValuesChanged } from "../../hooks/useValuesChanged";
import Modal, { ModalCloseButton } from "../../components/Modal";
import { hasChanges } from "../../utils/formChanges";
import TextField from "../../components/TextField";
import Select from "../../components/Select";
import { validateVehicleAlias, CARRIER_TYPES } from "../../services/carriersService";
import { useToast } from "../../contexts/ToastContext";

export function CarrierEditModal({ open, onClose, carrier, onSave }) {
  const toast = useToast();
  const [alias, setAlias] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState("contracted");
  const [defaultRate, setDefaultRate] = useState(0);
  const [vehicles, setVehicles] = useState([]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  if (useValuesChanged([open, carrier], { onMount: true }) && open) {
    setAlias(carrier?.alias || "");
    setName(carrier?.name || "");
    setType(carrier?.type || "contracted");
    setDefaultRate(carrier?.defaultRate || 0);
    setVehicles(carrier?.vehicles ? [...carrier.vehicles] : []);
    setNotes(carrier?.notes || "");
    setError("");
  }

  const addVehicle = () => {
    const a = prompt("Alias del vehículo (ej: furgon, bus):");
    if (!a) return;
    const err = validateVehicleAlias({ vehicles }, a);
    if (err) { toast.warning(err); return; }
    setVehicles((vs) => [...vs, { alias: a.trim() }]);
  };

  const updateVehicle = (idx, patch) => {
    setVehicles((vs) => vs.map((v, i) => (i === idx ? { ...v, ...patch } : v)));
  };

  const removeVehicle = (idx) => {
    setVehicles((vs) => vs.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!alias.trim()) return setError("Alias requerido");
    if (!name.trim()) return setError("Nombre requerido");
    try {
      await onSave({ alias, name, type, defaultRate, vehicles, notes });
    } catch (err) {
      setError(err.message || "Error al guardar");
    }
  };

  const dirty = hasChanges(
    {
      alias: carrier?.alias,
      name: carrier?.name,
      type: carrier?.type || "contracted",
      defaultRate: carrier?.defaultRate || 0,
      vehicles: carrier?.vehicles || [],
      notes: carrier?.notes,
    },
    { alias, name, type, defaultRate, vehicles, notes },
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      dirty={dirty}
      title={carrier ? "Editar transportista" : "Nuevo transportista"}
      size="lg"
      footer={
        <>
          <ModalCloseButton className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm">
            Cancelar
          </ModalCloseButton>
          <button
            onClick={handleSubmit}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]"
          >
            Guardar
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Alias" value={alias} onChange={setAlias} required placeholder="ej: juan" />
        <TextField label="Nombre" value={name} onChange={setName} required placeholder="Nombre completo" />
        <Select
          label="Tipo"
          value={type}
          onChange={setType}
          options={CARRIER_TYPES.map((t) => ({ value: t.value, label: t.label }))}
        />
        {type !== "own" && (
          <TextField label="Tarifa por defecto" type="number" value={defaultRate} onChange={setDefaultRate} />
        )}
        <div className="col-span-2">
          <TextField label="Notas" value={notes} onChange={setNotes} />
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-medium">Vehículos</h3>
          <button
            onClick={addVehicle}
            className="rounded border border-[var(--color-border)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)]"
          >
            + Vehículo
          </button>
        </div>
        {vehicles.length === 0 ? (
          <p className="text-xs text-[var(--color-muted)]">Sin vehículos</p>
        ) : (
          <div className="space-y-2">
            {vehicles.map((v, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 rounded-md border border-[var(--color-border)] p-2">
                <input
                  className="col-span-3 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-sm"
                  value={v.alias}
                  onChange={(e) => updateVehicle(idx, { alias: e.target.value })}
                  placeholder="alias"
                />
                <input
                  className="col-span-3 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-sm"
                  value={v.plate || ""}
                  onChange={(e) => updateVehicle(idx, { plate: e.target.value })}
                  placeholder="patente (opc.)"
                />
                <input
                  className="col-span-2 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-sm"
                  value={v.capacity || ""}
                  onChange={(e) => updateVehicle(idx, { capacity: e.target.value })}
                  placeholder="capacidad"
                />
                <input
                  className="col-span-3 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-sm"
                  value={v.notes || ""}
                  onChange={(e) => updateVehicle(idx, { notes: e.target.value })}
                  placeholder="notas"
                />
                <button
                  onClick={() => removeVehicle(idx)}
                  className="col-span-1 rounded text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]"
                >
                  🗑
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <div className="mt-3 text-sm text-[var(--color-danger)]">{error}</div>}
    </Modal>
  );
}
