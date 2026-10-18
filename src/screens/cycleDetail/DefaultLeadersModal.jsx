import { useState, useEffect } from "react";
import Modal, { ModalCloseButton } from "../../components/Modal";
import { hasChanges } from "../../utils/formChanges";

export function DefaultLeadersModal({ open, onClose, labor, readOnly, onSave }) {
  const [draft, setDraft] = useState({});
  useEffect(() => {
    if (open && labor) setDraft({ ...(labor.bonusDefaults || {}) });
  }, [open, labor]);
  if (!labor) return null;

  const toggle = (rut, key) => {
    setDraft((d) => {
      const next = { ...d };
      const cur = next[rut] || {};
      const updated = { ...cur, [key]: !cur[key] };
      if (!updated.manejo && !updated.supervision) delete next[rut];
      else next[rut] = updated;
      return next;
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      dirty={hasChanges(labor.bonusDefaults || {}, draft)}
      title="Líderes y manejo (por defecto)"
      size="lg"
    >
      <p className="mb-3 text-sm text-[var(--color-muted)]">
        Los trabajadores marcados reciben automáticamente el bono cuando se ingrese una jornada nueva.
        Para una excepción puntual, abre el bono de esa celda y desmárcalo manualmente.
        Cambiar este default no actualiza días ya guardados.
      </p>
      <div className="max-h-96 overflow-auto rounded-md border border-[var(--color-border)]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[var(--color-surface-2)]">
            <tr className="text-left text-[var(--color-muted)]">
              <th className="px-3 py-2 font-medium">Trabajador</th>
              <th className="px-3 py-2 font-medium text-center">Manejo</th>
              <th className="px-3 py-2 font-medium text-center">Supervisión / Líder</th>
            </tr>
          </thead>
          <tbody>
            {(labor.workers || []).map((w) => {
              const e = draft[w.rut] || {};
              return (
                <tr key={w.rut} className="border-t border-[var(--color-border)]">
                  <td className="px-3 py-2">{w.name}</td>
                  <td className="px-3 py-2 text-center">
                    <input type="checkbox" checked={!!e.manejo} disabled={readOnly}
                      onChange={() => toggle(w.rut, "manejo")}
                      className="h-4 w-4 accent-[var(--color-accent)]" />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input type="checkbox" checked={!!e.supervision} disabled={readOnly}
                      onChange={() => toggle(w.rut, "supervision")}
                      className="h-4 w-4 accent-[var(--color-accent)]" />
                  </td>
                </tr>
              );
            })}
            {(labor.workers || []).length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-[var(--color-muted)]">
                  Aún no hay trabajadores en esta labor.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <ModalCloseButton className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2 text-sm hover:bg-[var(--color-accent-soft)]">
          Cancelar
        </ModalCloseButton>
        <button onClick={() => onSave(draft)} disabled={readOnly}
          className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50">
          Guardar
        </button>
      </div>
    </Modal>
  );
}
