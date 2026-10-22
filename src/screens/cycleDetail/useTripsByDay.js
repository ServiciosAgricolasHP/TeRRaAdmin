import { useEffect, useMemo, useState } from "react";
import { useToast } from "../../contexts/ToastContext";
import { tripsService } from "../../services/transportsService";

// Las vueltas del ciclo mientras el modal de transportes está abierto: las
// lee al abrir, las agrupa por día con su total, y guarda o elimina la vuelta
// que se edita. `days` son los días del ciclo, que aparecen aunque no tengan
// vueltas.
export function useTripsByDay({ open, cycle, faena, subfaena, days }) {
  "use no memo";
  const toast = useToast();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null); // null | { mode: "new", date } | { mode: "edit", trip }
  const [confirmDel, setConfirmDel] = useState(null);
  const [selectedDate, setSelectedDate] = useState(days[0] || null);

  const reload = async () => {
    if (!cycle?.id) return;
    setLoading(true);
    try {
      const list = await tripsService.listByCycle(cycle.id);
      list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      setTrips(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      reload();
      setSelectedDate((d) => d || days[0] || null);
    } else {
      setEditing(null);
      setConfirmDel(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cycle?.id]);

  useEffect(() => {
    if (open && !selectedDate && days[0]) setSelectedDate(days[0]);
  }, [open, days, selectedDate]);

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
    try {
      await tripsService.remove(confirmDel.id);
      setConfirmDel(null);
      await reload();
    } catch (err) {
      toast.error(err.message || "Error al eliminar");
    }
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
