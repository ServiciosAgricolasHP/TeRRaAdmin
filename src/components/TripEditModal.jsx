import { useState } from "react";
import Modal, { ModalCloseButton } from "./Modal";
import { hasChanges } from "../utils/formChanges";
import TextField from "./TextField";
import Select from "./Select";
import { TRIP_KINDS } from "../services/transportsService";
import { fmtCurrency } from "../utils/format";
import CarrierCombobox from "./tripEditModal/CarrierCombobox";
import QuickCreateCarrierModal from "./tripEditModal/QuickCreateCarrierModal";
import { loadRecents, pushRecent } from "./tripEditModal/recentCarriers";
import { attempt } from "../utils/attempt";
import { useValuesChanged } from "../hooks/useValuesChanged";

// Alta y edición de una vuelta: transportista, vehículo, fecha, tipo, labor,
// lugar, destino, personas, vueltas y tarifa. La usan la grilla del ciclo y
// Transportes; `onSave` recibe el formulario y la escribe quien abrió el modal.
export function TripEditModal({ open, onClose, trip, carriers, days, defaultDate, cycleId, labors = [], onSave }) {
  const [carrierId, setCarrierId] = useState("");
  const [vehicleAlias, setVehicleAlias] = useState("");
  const [date, setDate] = useState(defaultDate || "");
  const [kind, setKind] = useState("regular");
  // A qué labor del ciclo se imputa el viaje. Opcional — solo tiene sentido
  // elegirlo cuando el ciclo tiene más de una labor simultánea; con una sola
  // no hay ambigüedad y el viaje sigue aplicando al ciclo completo.
  const [laborId, setLaborId] = useState("");
  const [qty, setQty] = useState(1);
  const [rate, setRate] = useState(0);
  const [lugar, setLugar] = useState("");
  const [destino, setDestino] = useState("");
  const [personCount, setPersonCount] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [creatingCarrier, setCreatingCarrier] = useState(false);
  const [recentIds, setRecentIds] = useState([]);

  if (useValuesChanged([open, cycleId], { onMount: true }) && open) setRecentIds(loadRecents(cycleId));

  if (useValuesChanged([open, trip, defaultDate], { onMount: true }) && open) {
    if (trip) {
      setCarrierId(trip.carrierId || "");
      setVehicleAlias(trip.vehicleAlias || "");
      setDate(trip.date || defaultDate || "");
      setKind(trip.kind || "regular");
      setLaborId(trip.laborId || "");
      setQty(trip.qty || 1);
      setRate(trip.rate || 0);
      setLugar(trip.lugar || "");
      setDestino(trip.destino || "");
      setPersonCount(trip.personCount ?? "");
      setNotes(trip.notes || "");
    } else {
      setCarrierId("");
      setVehicleAlias("");
      setDate(defaultDate || "");
      setKind("regular");
      setLaborId("");
      setQty(1);
      setRate(0);
      setLugar("");
      setDestino("");
      setPersonCount("");
      setNotes("");
    }
    setError("");
  }

  const carrier = carriers.find((c) => c.id === carrierId);
  const isOwn = carrier?.type === "own";

  // Al cambiar de transportista: con un solo vehículo, lo elige; con varios,
  // elige el primero solo si no había vehículo elegido; sin vehículos, limpia
  // el campo. `created` es el transportista recién creado, que todavía no está
  // en `carriers`.
  const handleCarrierChange = (nextId, created = null) => {
    setCarrierId(nextId);
    const c = created || carriers.find((x) => x.id === nextId);
    const vehicles = c?.vehicles || [];
    if (vehicles.length > 0 && (vehicles.length === 1 || !vehicleAlias)) {
      setVehicleAlias(vehicles[0].alias);
    } else if (vehicles.length === 0) {
      setVehicleAlias("");
    }
  };

  if (useValuesChanged([carrierId, open, trip, isOwn, carrier], { onMount: true }) && open && !trip) {
    if (isOwn) setRate(0);
    else if (carrier?.defaultRate) setRate(carrier.defaultRate);
  }

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!carrierId) return setError("Selecciona transportista");
    if (!vehicleAlias) return setError("Selecciona vehículo");
    if (!date) return setError("Selecciona fecha");
    setSaving(true);
    const { error: err } = await attempt(async () => {
      await onSave({
        carrierId,
        vehicleAlias,
        date,
        kind,
        laborId: laborId || null,
        qty: Number(qty) || 1,
        rate: isOwn ? 0 : Number(rate) || 0,
        lugar,
        destino,
        personCount,
        notes,
      });
      pushRecent(cycleId, carrierId);
    });
    if (err) setError(err.message || "Error al guardar");
    setSaving(false);
  };

  const vehicleOptions = (carrier?.vehicles || []).map((v) => ({ value: v.alias, label: v.alias }));
  const dayOptions = (days || []).map((d) => ({ value: d, label: d }));
  const kindOptions = TRIP_KINDS.map((k) => ({ value: k.value, label: k.label }));
  const laborOptions = labors.map((l) => ({ value: l.id, label: l.name }));
  const amount = (Number(qty) || 0) * (Number(rate) || 0);
  // Los mismos valores con que el efecto de arriba llena el formulario.
  const baseline = trip
    ? {
        carrierId: trip.carrierId,
        vehicleAlias: trip.vehicleAlias,
        date: trip.date || defaultDate,
        kind: trip.kind || "regular",
        laborId: trip.laborId,
        qty: trip.qty || 1,
        rate: trip.rate || 0,
        lugar: trip.lugar,
        destino: trip.destino,
        personCount: trip.personCount,
        notes: trip.notes,
      }
    : { date: defaultDate, kind: "regular", qty: 1, rate: 0 };
  const dirty =
    !saving &&
    hasChanges(baseline, { carrierId, vehicleAlias, date, kind, laborId, qty, rate, lugar, destino, personCount, notes });

  return (
    <Modal
      section="Editar vuelta"
      open={open}
      onClose={onClose}
      dirty={dirty}
      title={trip ? "Editar vuelta" : "Agregar vuelta"}
      size="lg"
      footer={
        <>
          <ModalCloseButton className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm">
            Cancelar
          </ModalCloseButton>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
        <CarrierCombobox
          value={carrierId}
          onChange={handleCarrierChange}
          carriers={carriers}
          recentIds={recentIds}
          onCreateNew={() => setCreatingCarrier(true)}
          autoFocus={!trip}
        />
        <Select
          label="Vehículo"
          value={vehicleAlias}
          onChange={setVehicleAlias}
          options={vehicleOptions}
          required
          placeholder={carrier ? "Selecciona..." : "Elige transportista primero"}
        />
        {dayOptions.length > 0 ? (
          <Select label="Fecha" value={date} onChange={setDate} options={dayOptions} required />
        ) : (
          <TextField label="Fecha" type="date" value={date} onChange={setDate} required />
        )}
        <Select label="Tipo" value={kind} onChange={setKind} options={kindOptions} />
        {labors.length > 1 && (
          <Select
            label="Labor (opcional)"
            value={laborId}
            onChange={setLaborId}
            options={laborOptions}
            placeholder="Todo el ciclo"
          />
        )}
        <TextField label="Lugar (origen)" value={lugar} onChange={setLugar} placeholder="ej: C.ALTO/PURRANQUE" />
        <TextField label="Destino" value={destino} onChange={setDestino} placeholder="ej: FRESIA" />
        <TextField label="N° personas" type="number" value={personCount} onChange={setPersonCount} />
        <TextField label="Cantidad de vueltas" type="number" value={qty} onChange={setQty} />
        <TextField
          label={isOwn ? "Tarifa (propio = 0)" : "Tarifa por vuelta"}
          type="number"
          value={isOwn ? 0 : rate}
          onChange={(v) => !isOwn && setRate(v)}
        />
        <div className="flex items-center justify-between rounded-md bg-[var(--color-surface-2)] px-3 py-2 text-sm">
          <span className="text-[var(--color-muted)]">Monto</span>
          <span className="font-semibold tabular-nums">{fmtCurrency(amount)}</span>
        </div>
        <div className="col-span-2">
          <TextField label="Notas" value={notes} onChange={setNotes} />
        </div>
        {error && <div className="col-span-2 text-sm text-[var(--color-danger)]">{error}</div>}
      </form>

      <QuickCreateCarrierModal
        open={creatingCarrier}
        onClose={() => setCreatingCarrier(false)}
        onCreated={(created) => {
          setCreatingCarrier(false);
          if (!created?.id) return;
          handleCarrierChange(created.id, created);
        }}
      />
    </Modal>
  );
}
