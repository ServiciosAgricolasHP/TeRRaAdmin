import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { useValuesChanged } from "../../hooks/useValuesChanged";
import { useToast } from "../../contexts/ToastContext";
import { tripsService } from "../../services/transportsService";
import { attempt } from "../../utils/attempt";

// Las vueltas del ciclo mientras el modal de transportes está abierto: las
// lee al abrir, las agrupa por día con su total, y guarda o elimina la vuelta
// que se edita. `days` son los días del ciclo, que aparecen aunque no tengan
// vueltas.
export function useTripsByDay({ open, cycle, faena, subfaena, days }) {
  const toast = useToast();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null); // null | { mode: "new", date } | { mode: "edit", trip }
  const [confirmDel, setConfirmDel] = useState(null);
  const [selectedDate, setSelectedDate] = useState(days[0] || null);

  const reload = async () => {
    if (!cycle?.id) return;
    setLoading(true);
    const { error: err } = await attempt(async () => {
      const list = await tripsService.listByCycle(cycle.id);
      list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      setTrips(list);
    });
    setLoading(false);
    if (err) throw err;
  };

  // Al cerrar se descarta la vuelta en edición; abierto, siempre hay un día
  // elegido.
  if (useValuesChanged([open, cycle?.id], { onMount: true }) && !open) {
    setEditing(null);
    setConfirmDel(null);
  }
  if (open && !selectedDate && days[0]) setSelectedDate(days[0]);

  // Las vueltas se leen al abrir y al cambiar de ciclo.
  const reloadWhenOpen = useEffectEvent(() => reload());
  useEffect(() => {
    if (open) reloadWhenOpen();
  }, [open, cycle?.id]);

  const tripsByDate = useMemo(() => {
    const m = new Map();
    for (const d of days) m.set(d, []);
    for (const t of trips) {
      if (!m.has(t.date)) m.set(t.date, []);
      m.get(t.date).push(t);
    }
    return m;
  }, [trips, days]);

  const totalsByDate = useMemo(() => {
    const m = {};
    for (const [d, list] of tripsByDate.entries()) {
      m[d] = list.reduce((s, t) => s + (Number(t.amount) || 0), 0);
    }
    return m;
  }, [tripsByDate]);

  const total = useMemo(() => trips.reduce((s, t) => s + (Number(t.amount) || 0), 0), [trips]);
  const dayTrips = selectedDate ? tripsByDate.get(selectedDate) || [] : [];

  const handleSave = async (form) => {
    const payload = {
      ...form,
      cycleId: cycle.id,
      faenaId: faena?.id || null,
      subfaenaId: subfaena?.id || null,
    };
    if (editing?.mode === "edit") {
      await tripsService.update(editing.trip.id, payload);
    } else {
      await tripsService.create(payload);
    }
    setEditing(null);
    await reload();
  };

  const handleDelete = async () => {
    if (!confirmDel) return;
    const { error: err } = await attempt(async () => {
      await tripsService.remove(confirmDel.id);
      setConfirmDel(null);
      await reload();
    });
    if (err) toast.error(err.message || "Error al eliminar");
  };

  return {
    confirmDel,
    dayTrips,
    editing,
    handleDelete,
    handleSave,
    loading,
    selectedDate,
    setConfirmDel,
    setEditing,
    setSelectedDate,
    total,
    totalsByDate,
    trips,
    tripsByDate,
  };
}
