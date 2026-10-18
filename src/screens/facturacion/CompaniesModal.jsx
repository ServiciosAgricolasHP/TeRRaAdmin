import { useState } from "react";
import { companiesService } from "../../services";
import { normalizeRut } from "../../utils/siiCsvParser";
import { toTitleName } from "../../utils/textCase";
import Modal from "../../components/Modal";
import ConfirmDialog from "../../components/ConfirmDialog";
import { useToast } from "../../contexts/ToastContext";

// CRUD inline de empresas. Lista + formulario para agregar/editar/borrar.
// El alias es lo que se muestra en la UI; razón social va en el detalle.
export function CompaniesModal({ companies, onClose, onChanged }) {
  const toast = useToast();
  const [editing, setEditing] = useState(null); // { id?, rut, razonSocial, alias }
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null); // empresa a borrar, o null

  const startNew = () => setEditing({ id: null, rut: "", razonSocial: "", alias: "" });
  const startEdit = (c) => setEditing({ id: c.id, rut: c.rut, razonSocial: c.razonSocial, alias: c.alias || "" });

  const save = async () => {
    if (!editing.rut.trim() || !editing.razonSocial.trim()) {
      toast.warning("Completa RUT y Razón Social.");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        rut: normalizeRut(editing.rut),
        razonSocial: editing.razonSocial.trim(),
        // La razón social queda tal cual (es el nombre legal del SII); el alias
        // es el nombre corto de la app y va como título.
        alias: toTitleName((editing.alias || "").trim() || editing.razonSocial),
        enabled: true,
      };
      if (editing.id) {
        await companiesService.update(editing.id, payload);
      } else {
        await companiesService.create(payload);
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
      await companiesService.remove(confirmDelete.id);
      await onChanged();
      setConfirmDelete(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
    <Modal open onClose={onClose} size="lg" title="Empresas">
      {editing ? (
        <form onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-muted)]">RUT</label>
            <input
              value={editing.rut}
              onChange={(e) => setEditing({ ...editing, rut: e.target.value })}
              placeholder="76.123.456-7"
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-muted)]">Razón Social</label>
            <input
              value={editing.razonSocial}
              onChange={(e) => setEditing({ ...editing, razonSocial: e.target.value })}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-muted)]">Alias (nombre visible)</label>
            <input
              value={editing.alias}
              onChange={(e) => setEditing({ ...editing, alias: e.target.value })}
              placeholder="HP, Agroquinta, etc."
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
            />
            <p className="mt-1 text-[10px] text-[var(--color-muted)]">
              Si lo dejas vacío, se usa la razón social.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setEditing(null)}
              disabled={busy}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] disabled:opacity-50"
            >
              {busy ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      ) : (
        <div>
          <div className="mb-3 flex justify-end">
            <button
              onClick={startNew}
              className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)]"
            >
              + Nueva empresa
            </button>
          </div>
          {companies.length === 0 ? (
            <div className="rounded-md border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-muted)]">
              No hay empresas registradas todavía.
            </div>
          ) : (
            <div className="space-y-1">
              {companies.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">
                      🏢 {c.alias || c.razonSocial}
                      {c.alias && c.alias !== c.razonSocial && (
                        <span className="ml-2 text-xs text-[var(--color-muted)]">({c.razonSocial})</span>
                      )}
                    </div>
                    <div className="font-mono text-xs text-[var(--color-muted)]">{c.rut}</div>
                  </div>
                  <button
                    onClick={() => startEdit(c)}
                    className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)]"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => remove(c)}
                    className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 flex justify-end">
            <button
              onClick={onClose}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </Modal>
    <ConfirmDialog
      open={!!confirmDelete}
      title="Eliminar empresa"
      message={confirmDelete ? `¿Eliminar la empresa "${confirmDelete.alias || confirmDelete.razonSocial}"? Los documentos importados con esta empresa quedarán huérfanos.` : ""}
      confirmLabel="Eliminar"
      danger
      busy={busy}
      onConfirm={doRemove}
      onCancel={() => !busy && setConfirmDelete(null)}
    />
    </>
  );
}
