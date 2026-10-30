import { useState } from "react";
import Modal, { ModalCloseButton } from "../Modal";
import { hasChanges } from "../../utils/formChanges";
import { INDICATOR_DEFS } from "./indicators";
import { attempt } from "../../utils/attempt";

// Modal para editar los 3 indicadores a la vez. Inputs numéricos simples.
export default function IndicatorsModal({ indicators, onCancel, onSave }) {
  const [form, setForm] = useState(() => ({
    sueldoBase: indicators?.sueldoBase ?? "",
    dia: indicators?.dia ?? "",
    hora: indicators?.hora ?? "",
  }));
  const [baseline] = useState(form);
  const [busy, setBusy] = useState(false);

  const set = (key, raw) => {
    // Solo dígitos — los montos en CLP no llevan decimales.
    const digits = String(raw).replace(/[^\d]/g, "");
    setForm((f) => ({ ...f, [key]: digits === "" ? "" : Number(digits) }));
  };

  const submit = async () => {
    setBusy(true);
    const { error: err } = await attempt(async () => {
      await onSave({
        sueldoBase: Number(form.sueldoBase) || 0,
        dia: Number(form.dia) || 0,
        hora: Number(form.hora) || 0,
      });
    });
    setBusy(false);
    if (err) throw err;
  };

  const inputCls = "w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";

  return (
    <Modal
      open
      onClose={onCancel}
      dirty={!busy && hasChanges(baseline, form)}
      size="sm"
      title="Editar indicadores"
      footer={
        <>
          <ModalCloseButton className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm">
            Cancelar
          </ModalCloseButton>
          <button
            onClick={submit}
            disabled={busy}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
          >
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {INDICATOR_DEFS.map((ind) => (
          <div key={ind.key}>
            <label className="mb-1 block text-xs font-medium text-[var(--color-muted)]">
              {ind.icon} {ind.label}
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-[var(--color-muted)]">$</span>
              <input
                type="text"
                inputMode="numeric"
                value={form[ind.key] === "" ? "" : Number(form[ind.key]).toLocaleString("es-CL")}
                onChange={(e) => set(ind.key, e.target.value)}
                placeholder="0"
                className={inputCls}
              />
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
