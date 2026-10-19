import { useState } from "react";
import { workdaysService } from "../../services";
import { tripsService } from "../../services/transportsService";
import { greeting, GREETING_SLOTS } from "../../utils/greetings";
import { localIsoDate } from "../../utils/dates";

const todayStr = () => localIsoDate();

// Días del ciclo: agregarlos desde el calendario y quitar uno que no tenga
// jornadas ni vueltas de transporte.
export function useCycleDays({ cycleWrite, days, id, setCycle, showToast, toast, user }) {
  "use no memo";
  const [addDayOpen, setAddDayOpen] = useState(false);
  const [newDay, setNewDay] = useState(todayStr());
  const [selectedDays, setSelectedDays] = useState(() => new Set());
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const [confirmRemoveDay, setConfirmRemoveDay] = useState(null); // fecha (string) o null

  // Guardan los días y una labor del ciclo (agregar o quitar día o trabajador,
  // toggle de mensual). Si la escritura falla muestran un toast de error y
  // devuelven false; si guarda, true, y el llamador decide si avisa.
  const persistDays = async (nextDays) => {
    try {
      await cycleWrite({ days: nextDays });
      setCycle((c) => ({ ...c, days: nextDays }));
      return true;
    } catch (err) {
      toast.error("No se pudo guardar el cambio de días: " + (err.message || err));
      return false;
    }
  };

  // ============================================================
  // Días
  // ============================================================

  const addDay = async () => {
    if (!newDay) return;
    if (days.includes(newDay)) { setAddDayOpen(false); return; }
    const ok = await persistDays([...days, newDay].sort());
    setAddDayOpen(false);
    if (ok) showToast(`Día ${newDay} agregado`);
  };

  const addSelectedDays = async () => {
    const toAdd = [...selectedDays].filter((d) => !days.includes(d));
    if (toAdd.length === 0) { setAddDayOpen(false); return; }
    const ok = await persistDays([...days, ...toAdd].sort());
    setSelectedDays(new Set());
    setAddDayOpen(false);
    if (ok) showToast(`${toAdd.length} día${toAdd.length === 1 ? "" : "s"} agregado${toAdd.length === 1 ? "" : "s"}`);
  };

  const toggleSelectedDay = (date) => {
    setSelectedDays((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  // Un día se quita solo si no le queda nada: ni jornadas ni vueltas de
  // transporte. Las vueltas no se borran con el día, y quedarían colgando de
  // una fecha que el ciclo ya no muestra. El aviso dice todo lo que lo impide
  // de una vez, con el saludo del usuario al final.
  const removeDay = async (date) => {
    const [wds, cycleTrips] = await Promise.all([
      workdaysService.list({ wheres: [["cycleId", "==", id], ["date", "==", date]], take: 1 }),
      tripsService.listByCycle(id),
    ]);
    const trips = cycleTrips.filter((t) => t.date === date);
    const reasons = [];
    if (wds.length) {
      reasons.push("• Tiene producción registrada en alguna labor: bórrala primero desde la grilla.");
    }
    if (trips.length) {
      reasons.push(
        `• Tiene ${trips.length} vuelta${trips.length === 1 ? "" : "s"} de transporte: ` +
        `elimína${trips.length === 1 ? "la" : "las"} primero desde 🚐 Transportes.`,
      );
    }
    if (reasons.length) {
      const saludo = greeting(user, GREETING_SLOTS.removeDayBlocked);
      toast.warning(
        [`No se puede quitar ${date}:`, ...reasons].join("\n") + (saludo ? `\n\n${saludo}` : ""),
      );
      return;
    }
    setConfirmRemoveDay(date);
  };
  const doRemoveDay = async (date) => {
    const ok = await persistDays(days.filter((d) => d !== date));
    if (ok) showToast(`Día ${date} quitado`);
  };
  return {
    addDayOpen,
    addSelectedDays,
    confirmRemoveDay,
    doRemoveDay,
    removeDay,
    selectedDays,
    setAddDayOpen,
    setConfirmRemoveDay,
    setSelectedDays,
    setViewMonth,
    toggleSelectedDay,
    viewMonth,
  };
}
