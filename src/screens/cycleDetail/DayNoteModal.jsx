import Modal, { ModalCloseButton } from "../../components/Modal";
import { useCycleDetail } from "./CycleDetailContext";

// Anotación de un día de la labor, con el paso al día anterior y al
// siguiente que tengan contenido.
export function DayNoteModal() {
  "use no memo";
  const {
    closeDayNote,
    cycle,
    dayNoteBusy,
    dayNoteDirty,
    editingDayNote,
    editingDayNoteText,
    goToDayNote,
    hasNextDayNote,
    hasPrevDayNote,
    readOnly,
    saveDayNote,
    setEditingDayNoteText,
  } = useCycleDetail();
  return (
    <Modal
      open={!!editingDayNote}
      onClose={closeDayNote}
      dirty={dayNoteDirty}
      size="lg"
      title={editingDayNote ? (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => goToDayNote(-1)}
            disabled={!hasPrevDayNote || dayNoteDirty}
            title={dayNoteDirty ? "Guarda la anotación antes de cambiar de día" : "Día anterior"}
            className="rounded px-1.5 py-0.5 text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] disabled:opacity-30 disabled:hover:bg-transparent"
          >
            ◀
          </button>
          <span>
            Anotación del {editingDayNote.date} · {cycle?.labors?.find((l) => l.id === editingDayNote.laborId)?.name || ""}
          </span>
          <button
            type="button"
            onClick={() => goToDayNote(1)}
            disabled={!hasNextDayNote || dayNoteDirty}
            title={dayNoteDirty ? "Guarda la anotación antes de cambiar de día" : "Día siguiente"}
            className="rounded px-1.5 py-0.5 text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] disabled:opacity-30 disabled:hover:bg-transparent"
          >
            ▶
          </button>
        </div>
      ) : "Anotación"}
      footer={(
        <>
          <ModalCloseButton
            disabled={dayNoteBusy}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
          >
            Cancelar
          </ModalCloseButton>
          <button
            type="button"
            onClick={saveDayNote}
            disabled={dayNoteBusy || readOnly}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
          >
            {dayNoteBusy ? "..." : "Guardar"}
          </button>
        </>
      )}
    >
      <textarea
        value={editingDayNoteText}
        onChange={(e) => setEditingDayNoteText(e.target.value)}
        disabled={readOnly}
        autoFocus
        placeholder="Ej: día con lluvia leve, solo media jornada, etc."
        rows={5}
        className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] disabled:opacity-70"
      />
      <p className="mt-1 text-[11px] text-[var(--color-muted)]">
        La anotación es propia de esta labor — otras labores del mismo día no la ven. Dejar el campo vacío y guardar la elimina.
      </p>
    </Modal>
  );
}
