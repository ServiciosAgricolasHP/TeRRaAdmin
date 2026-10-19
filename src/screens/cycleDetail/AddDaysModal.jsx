import Modal from "../../components/Modal";
import { DayCalendarPicker } from "./DayCalendarPicker";
import { useCycleDetail } from "./CycleDetailContext";

// Agrega días al ciclo eligiéndolos en el calendario.
export function AddDaysModal() {
  "use no memo";
  const {
    addDayOpen,
    addSelectedDays,
    days,
    selectedDays,
    setAddDayOpen,
    setSelectedDays,
    setViewMonth,
    toggleSelectedDay,
    viewMonth,
  } = useCycleDetail();
  return (
    <Modal
      open={addDayOpen}
      onClose={() => { setAddDayOpen(false); setSelectedDays(new Set()); }}
      title="Agregar días"
      size="md"
      footer={
        <>
          <button onClick={() => { setAddDayOpen(false); setSelectedDays(new Set()); }} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)]">
            Cancelar
          </button>
          <button
            onClick={addSelectedDays}
            disabled={selectedDays.size === 0}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
          >
            {selectedDays.size === 0 ? "Agregar" : `Agregar ${selectedDays.size} día${selectedDays.size > 1 ? "s" : ""}`}
          </button>
        </>
      }
    >
      <DayCalendarPicker
        viewMonth={viewMonth}
        setViewMonth={setViewMonth}
        selectedDays={selectedDays}
        toggleDay={toggleSelectedDay}
        existingDays={days}
      />
      <p className="mt-3 text-xs text-[var(--color-muted)]">
        Click sobre los días para seleccionar varios a la vez. Los días ya agregados aparecen en gris.
      </p>
    </Modal>
  );
}
