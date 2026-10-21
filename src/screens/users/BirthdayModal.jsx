import { useState } from "react";
import BirthdayField from "./BirthdayField";
import Modal, { ModalCloseButton } from "../../components/Modal";
import { hasChanges } from "../../utils/formChanges";

// El cumpleaños de una cuenta, cargado por un admin. `onSave(birthday)` guarda
// ("MM-DD", o vacío para quitarlo) y cierra.
export default function BirthdayModal({ profile, name, onClose, onSave }) {
  const [birthday, setBirthday] = useState(profile.birthday || "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await onSave(birthday);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      dirty={!busy && hasChanges({ birthday: profile.birthday }, { birthday })}
      title={`Cumpleaños · ${name}`}
      size="sm"
      footer={
        <>
          <ModalCloseButton className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm">
            Cancelar
          </ModalCloseButton>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
          >
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </>
      }
    >
      <p className="mb-3 text-xs text-[var(--color-muted)]">
        Ese día, la pantalla de carga de esta persona lo celebra. Solo el día y el mes; sin los dos, queda sin cumpleaños.
      </p>
      <BirthdayField defaultValue={profile.birthday} onChange={setBirthday} />
    </Modal>
  );
}
