import { useRef } from "react";
import Modal from "../../components/Modal";

// Modal intermedio: confirma la empresa y abre el selector de archivos.
// Acepta varios archivos a la vez (ventas y compras mezcladas, varios meses);
// cada uno se parsea por separado y queda como una entrada del preview.
export function CompanySelectAndPickModal({ companies, companyId, onChange, onFilesPick, onCancel }) {
  const ref = useRef(null);
  return (
    <Modal
      open
      onClose={onCancel}
      size="md"
      title="Importar CSV del SII"
      footer={
        <>
          <button
            onClick={onCancel}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm"
          >
            Cancelar
          </button>
          <button
            onClick={() => ref.current?.click()}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)]"
          >
            📥 Elegir archivos...
          </button>
          <input
            ref={ref}
            type="file"
            accept=".csv,text/csv,text/plain"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              onFilesPick(files);
              e.target.value = "";
            }}
          />
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-muted)]">
            Empresa a la que pertenecen los archivos
          </label>
          <select
            value={companyId}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
          >
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                🏢 {c.alias || c.razonSocial} · {c.rut}
              </option>
            ))}
          </select>
        </div>
        <div className="rounded-md bg-[var(--color-surface-2)] px-3 py-2 text-xs text-[var(--color-muted)] space-y-1">
          <div>Puedes seleccionar <b>varios archivos a la vez</b> (Ctrl/Cmd+click en el selector de archivos).</div>
          <div>Cada archivo se identifica como <b>ventas</b> o <b>compras</b> automáticamente según sus encabezados.</div>
          <div>Si detectamos un RUT en el nombre del archivo distinto al de la empresa, te lo avisamos en la vista previa.</div>
          <div>Reimportar un período reemplaza completo (los documentos huérfanos del mismo mes se eliminan).</div>
        </div>
      </div>
    </Modal>
  );
}
