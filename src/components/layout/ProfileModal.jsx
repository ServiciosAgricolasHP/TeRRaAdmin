import { useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import Modal, { ModalCloseButton } from "../Modal";
import { hasChanges } from "../../utils/formChanges";

// El alias es editable por el propio usuario y no por un admin: es cómo quiere
// que lo nombren los documentos que firma, no un permiso.
export default function ProfileModal({ onClose }) {
  const { user, displayName, updateAlias } = useAuth();
  const [alias, setAlias] = useState(user?.alias || "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await updateAlias(alias);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      dirty={!busy && hasChanges({ alias: user?.alias }, { alias })}
      title="Mi perfil"
      size="sm"
      footer={
        <>
          <ModalCloseButton className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm">
            Cancelar
          </ModalCloseButton>
          <button
            onClick={save}
            disabled={busy}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
          >
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <div>
          <span className="block text-xs text-[var(--color-muted)]">Cuenta</span>
          <span className="break-all">{user?.email}</span>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs text-[var(--color-muted)]">Alias</span>
          <input
            type="text"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder={user?.email || ""}
            maxLength={40}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
          />
          <span className="mt-1 block text-xs text-[var(--color-muted)]">
            Es el nombre con el que quedan firmados los registros que cargas a mano
            (por ejemplo, el supervisor de un pesaje). Sin alias se usa tu correo.
          </span>
        </label>
        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-xs">
          Vas a figurar como <strong>{alias.trim() || displayName}</strong>
        </div>
      </div>
    </Modal>
  );
}
