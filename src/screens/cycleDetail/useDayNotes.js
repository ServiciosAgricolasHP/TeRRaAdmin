import { useState } from "react";
import { hasChanges } from "../../utils/formChanges";
import { unshout } from "../../utils/textCase";
import { attempt } from "../../utils/attempt";

// Anotaciones de cada día de la labor activa: cuál se muestra, qué días se
// pueden anotar y el modal que las edita, con el paso al día anterior y al
// siguiente.
export function useDayNotes({ activeLabor, activeLaborDatesWithProduction, cycle, cycleWrite, days, setCycle }) {
  // Anotaciones por (labor, día) en cycle.dayNotesByLabor = { [laborId]:
  // { "YYYY-MM-DD": "texto" } }. cycle.dayNotes (compartido entre labores)
  // solo se lee, cuando la labor no tiene anotación propia para ese día. Se
  // editan en un modal que abre el encabezado de la fecha (DayHeader).
  const [editingDayNote, setEditingDayNote] = useState(null); // { laborId, date } o null
  const [editingDayNoteText, setEditingDayNoteText] = useState("");
  const [dayNoteBusy, setDayNoteBusy] = useState(false);

  const legacyDayNotes = cycle?.dayNotes || {};
  const dayNotesByLabor = cycle?.dayNotesByLabor || {};
  const activeLaborDayNotes = (activeLabor && dayNotesByLabor[activeLabor.id]) || {};
  // Manda la anotación de la labor; si no tiene una para ese día, se usa la
  // compartida del ciclo.
  const noteForDay = (d) => activeLaborDayNotes[d] ?? legacyDayNotes[d] ?? "";
  // Se puede anotar un día con producción de esta labor o que ya tenga
  // anotación.
  const dayHasContent = (d) => activeLaborDatesWithProduction.has(d) || !!noteForDay(d);

  const openDayNote = (date) => {
    if (!activeLabor || !dayHasContent(date)) return;
    setEditingDayNote({ laborId: activeLabor.id, date });
    setEditingDayNoteText(String(noteForDay(date) || ""));
  };

  const closeDayNote = () => {
    if (dayNoteBusy) return;
    setEditingDayNote(null);
    setEditingDayNoteText("");
  };

  const editingDayNoteIdx = editingDayNote ? days.indexOf(editingDayNote.date) : -1;
  const hasPrevDayNote = editingDayNoteIdx > 0 && days.slice(0, editingDayNoteIdx).some(dayHasContent);
  const hasNextDayNote = editingDayNoteIdx >= 0 && days.slice(editingDayNoteIdx + 1).some(dayHasContent);
  // Con la anotación cambiada y sin guardar, ◀ ▶ quedan deshabilitados: pasar
  // de día la descartaría.
  const dayNoteDirty =
    !!editingDayNote && !dayNoteBusy && hasChanges({ text: noteForDay(editingDayNote.date) }, { text: editingDayNoteText });
  const goToDayNote = (delta) => {
    if (!editingDayNote) return;
    let idx = editingDayNoteIdx;
    while (true) {
      idx += delta;
      if (idx < 0 || idx >= days.length) return;
      if (dayHasContent(days[idx])) break;
    }
    const nextDate = days[idx];
    setEditingDayNote({ ...editingDayNote, date: nextDate });
    setEditingDayNoteText(String(noteForDay(nextDate) || ""));
  };

  const saveDayNote = async () => {
    if (!editingDayNote) return;
    const { laborId, date } = editingDayNote;
    setDayNoteBusy(true);
    const { error: err } = await attempt(async () => {
      const text = unshout(String(editingDayNoteText || "").trim());
      const nextByLabor = { ...(cycle?.dayNotesByLabor || {}) };
      const nextForLabor = { ...(nextByLabor[laborId] || {}) };
      if (text) nextForLabor[date] = text;
      else delete nextForLabor[date];
      nextByLabor[laborId] = nextForLabor;
      await cycleWrite({ dayNotesByLabor: nextByLabor });
      setCycle((c) => (c ? { ...c, dayNotesByLabor: nextByLabor } : c));
      setEditingDayNote(null);
      setEditingDayNoteText("");
    });
    setDayNoteBusy(false);
    if (err) throw err;
  };
  return {
    activeLaborDayNotes,
    closeDayNote,
    dayHasContent,
    dayNoteBusy,
    dayNoteDirty,
    editingDayNote,
    editingDayNoteText,
    goToDayNote,
    hasNextDayNote,
    hasPrevDayNote,
    legacyDayNotes,
    noteForDay,
    openDayNote,
    saveDayNote,
    setEditingDayNoteText,
  };
}
