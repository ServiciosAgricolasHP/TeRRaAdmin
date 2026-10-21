import { useState } from "react";
import { toTitleName } from "../../utils/textCase";
import { costCentersService } from "../../services";

// Crear, editar y eliminar centros de costo. Eliminar el centro que se está
// viendo vuelve a la vista vacía.
export function useCostCenterCatalog({ onChanged, selectedId, setSelectedId, toast }) {
  "use no memo";
  // --- CRUD del catálogo ---
  const [editing, setEditing] = useState(null); // { id?, label, emoji }
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null); // centro de costo a borrar, o null

  const startNew = () => setEditing({ id: null, label: "", emoji: "" });
  const startEdit = (c) => setEditing({ id: c.id, label: c.label, emoji: c.emoji || "" });

  const save = async () => {
    if (!editing.label.trim()) {
      toast.warning("Ponle un nombre al centro de costo.");
      return;
    }
    setBusy(true);
    try {
      const payload = { label: toTitleName(editing.label), emoji: (editing.emoji || "").trim() || null };
      if (editing.id) {
        await costCentersService.update(editing.id, payload);
      } else {
        await costCentersService.create(payload);
      }
      setEditing(null);
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  const remove = (c) => setConfirmDelete(c);
  const doRemove = async () => {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      await costCentersService.remove(confirmDelete.id);
      if (selectedId === confirmDelete.id) setSelectedId("");
      await onChanged();
      setConfirmDelete(null);
    } finally {
      setBusy(false);
    }
  };
  return {
    busy,
    confirmDelete,
    doRemove,
    editing,
    remove,
    save,
    setConfirmDelete,
    setEditing,
    startEdit,
    startNew,
  };
}
