import { useState } from "react";
import Modal, { ModalCloseButton } from "../../components/Modal";
import { hasChanges } from "../../utils/formChanges";
import { usersService } from "../../services";
import { useToast } from "../../contexts/ToastContext";
import { GREETING_FIELDS } from "../../utils/greetings";
import { attempt } from "../../utils/attempt";
import { errorMessage, nameOf } from "./helpers";

export function GreetingsModal({ profile, onClose, onSaved }) {
  const toast = useToast();
  const [drafts, setDrafts] = useState(() => ({ ...(profile.greetings || {}) }));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const { error: err } = await attempt(async () => {
      const greetings = {};
      for (const f of GREETING_FIELDS) {
        const text = String(drafts[f.slot] || "").trim();
        if (text) greetings[f.slot] = text;
      }
      await usersService.update(profile.id, { greetings });
      toast.success("Saludos guardados");
      onSaved(greetings);
    });
    if (err) toast.error(errorMessage(err));
    setBusy(false);
  };

  return (
    <Modal
      open
      onClose={onClose}
      dirty={!busy && hasChanges(profile.greetings || {}, drafts)}
      title={`Saludos · ${nameOf(profile)}`}
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
      <p className="text-xs text-[var(--color-muted)]">
        Los ve solo esta persona, en el lugar que indica cada campo. Vacío = sin saludo.
      </p>
      {GREETING_FIELDS.map((f) => (
        <label key={f.slot} className="mt-3 block">
          <span className="block text-xs font-medium">{f.label}</span>
          <span className="block text-[11px] text-[var(--color-muted)]">{f.note}</span>
          <input
            type="text"
            value={drafts[f.slot] || ""}
            onChange={(e) => setDrafts((d) => ({ ...d, [f.slot]: e.target.value }))}
            placeholder="(sin saludo)"
            className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
          />
        </label>
      ))}
    </Modal>
  );
}
