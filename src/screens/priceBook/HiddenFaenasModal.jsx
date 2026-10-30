import { useState } from "react";
import { useToast } from "../../contexts/ToastContext";
import { priceBookConfigService } from "../../services";
import Modal, { ModalCloseButton } from "../../components/Modal";
import { hasChanges } from "../../utils/formChanges";
import { attempt } from "../../utils/attempt";

export default function HiddenFaenasModal({ faenas, hiddenFaenaIds, onClose, onSaved }) {
  const toast = useToast();
  const [hidden, setHidden] = useState(new Set(hiddenFaenaIds));
  const [busy, setBusy] = useState(false);

  const toggle = (id) => {
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const submit = async () => {
    setBusy(true);
    const { error: err } = await attempt(async () => {
      await priceBookConfigService.upsert("main", { hiddenFaenaIds: [...hidden] });
      toast.success("Preferencias guardadas");
      onSaved();
    });
    if (err) toast.error("No se pudo guardar: " + err.message);
    setBusy(false);
  };

  return (
    <Modal
      open
      onClose={onClose}
      dirty={!busy && hasChanges({ ids: [...hiddenFaenaIds].sort() }, { ids: [...hidden].sort() })}
      title="Faenas visibles en el selector"
      size="sm"
      footer={
        <>
          <ModalCloseButton className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm">
            Cancelar
          </ModalCloseButton>
          <button
            type="submit"
            form="pricebook-hidden-faenas-form"
            disabled={busy}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
          >
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </>
      }
    >
      <form id="pricebook-hidden-faenas-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <p className="mb-3 text-sm text-[var(--color-muted)]">
          Desmarca las faenas que no quieres ver en el selector "Faena existente" del libro de precios (ej. nombres poco legibles o de prueba). No afecta a Faenas, Calendario ni el resto de la app.
        </p>
        <div className="max-h-80 space-y-1 overflow-y-auto">
          {faenas.map((f) => (
            <label key={f.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-[var(--color-surface-2)]">
              <input type="checkbox" checked={!hidden.has(f.id)} onChange={() => toggle(f.id)} />
              <span>{f.name || "(sin nombre)"}</span>
            </label>
          ))}
        </div>
      </form>
    </Modal>
  );
}
