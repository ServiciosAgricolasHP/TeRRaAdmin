import { useState } from "react";
import Modal, { ModalCloseButton } from "../../components/Modal";
import { useToast } from "../../contexts/ToastContext";
import { BANK_FORMATS, bankFormatOf } from "../../utils/bankFormats";
import { hasChanges } from "../../utils/formChanges";

const btnCls = "rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm";
const primaryCls =
  "rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-60";

// La configuración de la nómina: el formato del archivo del banco. Todos la
// ven; solo un admin la cambia.
export function PayrollSettingsModal({ config, isAdmin, onSave, onClose }) {
  const toast = useToast();
  const [initial] = useState({ bankFormat: config.bankFormat });
  const [bankFormatId, setBankFormatId] = useState(config.bankFormat);
  const [saving, setSaving] = useState(false);
  const format = bankFormatOf(bankFormatId);
  const dirty = !saving && hasChanges(initial, { bankFormat: bankFormatId });

  const save = async () => {
    setSaving(true);
    try {
      await onSave({ bankFormat: format.id });
      toast.success(`Archivo del banco: ${format.label}`);
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("No se pudo guardar la configuración.");
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      size="md"
      onClose={onClose}
      dirty={dirty}
      title="⚙ Configuración de nómina"
      footer={
        isAdmin ? (
          <>
            <ModalCloseButton className={btnCls}>Cancelar</ModalCloseButton>
            <button type="button" className={primaryCls} onClick={save} disabled={saving || !dirty}>
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </>
        ) : (
          <ModalCloseButton className={btnCls}>Cerrar</ModalCloseButton>
        )
      }
    >
      <div className="space-y-4 text-sm">
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-muted)]">Formato del archivo del banco</label>
          <select
            value={format.id}
            onChange={(e) => setBankFormatId(e.target.value)}
            disabled={!isAdmin || saving}
            className="min-h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-fg)] outline-none focus:border-[var(--color-accent)] disabled:opacity-70"
          >
            {BANK_FORMATS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Vale para todos los usuarios. Lo usan “🏦 Sólo Nómina” y la primera hoja del “XLSX completo”, también al volver a descargar una nómina anterior.
            {!isAdmin && " Solo un administrador puede cambiarlo."}
          </p>
        </div>

        <div className="space-y-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
          <div className="text-xs text-[var(--color-muted)]">
            Hoja <b className="text-[var(--color-fg)]">{format.sheetName}</b> · archivo{" "}
            <b className="break-all text-[var(--color-fg)]">NombreNómina_{format.fileSuffix}.xlsx</b>
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-[var(--color-muted)]">Columnas ({format.headers.length})</div>
            <ol className="list-decimal space-y-0.5 pl-6 text-xs sm:columns-2 sm:gap-6">
              {format.headers.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ol>
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-[var(--color-muted)]">Reglas</div>
            <ul className="list-disc space-y-0.5 pl-6 text-xs">
              <li>Solo van las transferencias: el efectivo queda fuera.</li>
              {format.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Modal>
  );
}
