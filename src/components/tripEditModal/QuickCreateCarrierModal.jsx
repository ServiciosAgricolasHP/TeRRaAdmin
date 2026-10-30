import { useState } from "react";
import Modal, { ModalCloseButton } from "../Modal";
import TextField from "../TextField";
import Select from "../Select";
import { hasChanges } from "../../utils/formChanges";
import { useCarriers } from "../../contexts/CarriersContext";
import { CARRIER_TYPES } from "../../services/carriersService";
import { attempt } from "../../utils/attempt";
import { useValuesChanged } from "../../hooks/useValuesChanged";

// Alta rápida de un transportista desde el modal de la vuelta: alias, nombre,
// tipo, tarifa y un vehículo. El resto se edita en Transportes.
export default function QuickCreateCarrierModal({ open, onClose, onCreated }) {
  const { addCarrier } = useCarriers();
  const [alias, setAlias] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState("contracted");
  const [defaultRate, setDefaultRate] = useState("");
  const [vehicleAlias, setVehicleAlias] = useState("");
  const [plate, setPlate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (useValuesChanged([open], { onMount: true }) && open) {
    setAlias("");
    setName("");
    setType("contracted");
    setDefaultRate("");
    setVehicleAlias("");
    setPlate("");
    setError("");
  }

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!alias.trim()) return setError("Alias requerido");
    if (!name.trim()) return setError("Nombre requerido");
    if (!vehicleAlias.trim()) return setError("Agrega al menos un vehículo");
    setBusy(true);
    const { error: err } = await attempt(async () => {
      const created = await addCarrier({
        alias: alias.trim(),
        name: name.trim(),
        type,
        defaultRate: type === "contracted" ? Number(defaultRate) || 0 : 0,
        vehicles: [
          {
            alias: vehicleAlias.trim(),
            plate: plate.trim() || undefined,
          },
        ],
      });
      onCreated?.(created);
    });
    if (err) setError(err.message || "Error al crear");
    setBusy(false);
  };

  const typeOptions = CARRIER_TYPES.map((t) => ({ value: t.value, label: t.label }));
  const dirty =
    !busy && hasChanges({ type: "contracted" }, { alias, name, type, defaultRate, vehicleAlias, plate });

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      dirty={dirty}
      title="Nuevo transportista"
      size="md"
      footer={(
        <>
          <ModalCloseButton
            disabled={busy}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Cancelar
          </ModalCloseButton>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
          >
            {busy ? "Creando..." : "Crear"}
          </button>
        </>
      )}
    >
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <TextField label="Alias" value={alias} onChange={setAlias} required autoFocus placeholder="ej: JC" />
        <TextField label="Nombre" value={name} onChange={setName} required placeholder="ej: Juan Cárcamo" />
        <Select label="Tipo" value={type} onChange={setType} options={typeOptions} />
        {type === "contracted" && (
          <TextField
            label="Tarifa por defecto"
            type="number"
            value={defaultRate}
            onChange={setDefaultRate}
            placeholder="ej: 25000"
          />
        )}
        <TextField label="Vehículo (alias)" value={vehicleAlias} onChange={setVehicleAlias} required placeholder="ej: Camión 1" />
        <TextField label="Patente" value={plate} onChange={setPlate} placeholder="opcional" />
        {error && <div className="col-span-2 text-sm text-[var(--color-danger)]">{error}</div>}
        <p className="col-span-2 text-[11px] text-[var(--color-muted)]">
          Para agregar más vehículos o ajustar otros datos, edita el transportista desde el módulo de Transportes.
        </p>
      </form>
    </Modal>
  );
}
