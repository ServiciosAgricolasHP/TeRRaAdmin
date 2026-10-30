import { useState } from "react";
import Modal from "../../components/Modal";
import { useToast } from "../../contexts/ToastContext";
import { importRows } from "../../services/commitmentsService";
import { paidLabel, STATUS_LABELS } from "../../utils/commitments";
import { bankName } from "../../utils/banks";
import { fmtCurrency } from "../../utils/format";
import { TONE_CLS, fmtDate } from "./helpers";
import { btnCls, primaryCls } from "./styles";
import { attempt } from "../../utils/attempt";
import { readChequesFile } from "./readChequesFile";

// Import de la planilla "Control de Cheques". Muestra lo que se va a crear y
// salta las filas que ya existen (mismo banco y N° de cheque).
export function ImportModal({ companies, existingIds, onCancel, onImported }) {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);

  const readFile = async (file) => {
    if (!file) return;
    setFileName(file.name);
    const { value, error: err } = await attempt(() => readChequesFile(file, companies));
    if (err) toast.error("No se pudo leer el archivo: " + (err.message || err));
    else setRows(value);
  };

  const seen = new Set();
  const classified = (rows || []).map((r) => {
    if (r.error) return { ...r, state: "error" };
    if (!r.id) return { ...r, state: "error", error: "Sin N° de cheque" };
    if (existingIds.has(r.id) || seen.has(r.id)) return { ...r, state: "exists" };
    seen.add(r.id);
    return { ...r, state: "new" };
  });
  const newRows = classified.filter((r) => r.state === "new");

  const confirm = async () => {
    setBusy(true);
    const { error: err } = await attempt(async () => {
      const n = await importRows(newRows, existingIds);
      await onImported(n);
    });
    if (err) toast.error("Error al importar: " + (err.message || err));
    setBusy(false);
  };

  const STATE = {
    new: { label: "Nuevo", cls: TONE_CLS.accent },
    exists: { label: "Ya existe", cls: TONE_CLS.muted },
    error: { label: "No se importa", cls: TONE_CLS.danger },
  };

  return (
    <Modal
      open
      size="xl"
      onClose={onCancel}
      title="Importar planilla de cheques"
      footer={
        <>
          <button type="button" className={btnCls} onClick={onCancel}>Cancelar</button>
          <button type="button" className={primaryCls} onClick={confirm} disabled={busy || !newRows.length}>
            {busy ? "Importando…" : `Importar ${newRows.length}`}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="text-[var(--color-muted)]">
          Lee la hoja "Control de Cheques" (N°, fecha, banco, N° cheque, beneficiario, concepto, monto, fecha de cobro, estado, cuenta/empresa, observaciones).
          La fecha se toma como la fecha del cheque. "Vencido" entra como pendiente: la app lo marca vencido sola.
        </p>
        <input type="file" accept=".xlsx" onChange={(e) => readFile(e.target.files?.[0])} className="text-sm" />
        {rows && (
          <>
            <div className="text-[var(--color-muted)]">
              {fileName}: {newRows.length} nuevo(s), {classified.filter((r) => r.state === "exists").length} ya existen,{" "}
              {classified.filter((r) => r.state === "error").length} con error.
            </div>
            <div className="max-h-[50vh] overflow-auto rounded-md border border-[var(--color-border)]">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-[var(--color-surface-2)] text-left text-[var(--color-muted)]">
                  <tr>
                    <th className="px-2 py-1">Fila</th>
                    <th className="px-2 py-1">Estado</th>
                    <th className="px-2 py-1">Fecha</th>
                    <th className="px-2 py-1">Banco / N°</th>
                    <th className="px-2 py-1">Beneficiario</th>
                    <th className="px-2 py-1 text-right">Monto</th>
                    <th className="px-2 py-1">Situación</th>
                    <th className="px-2 py-1">Empresa</th>
                  </tr>
                </thead>
                <tbody>
                  {classified.map((r) => (
                    <tr key={r.line} className="border-t border-[var(--color-border)]">
                      <td className="px-2 py-1">{r.line}</td>
                      <td className="px-2 py-1">
                        <span className={`rounded-full px-1.5 py-0.5 ${STATE[r.state].cls}`}>{STATE[r.state].label}</span>
                        {r.error && <div className="text-[var(--color-danger)]">{r.error}</div>}
                      </td>
                      <td className="px-2 py-1 tabular-nums">{r.data ? fmtDate(r.data.dueDate) : ""}</td>
                      <td className="px-2 py-1">{r.data ? `${bankName(r.data.bank)} · ${r.data.chequeNumber}` : ""}</td>
                      <td className="px-2 py-1">{r.data?.counterparty}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{r.data ? fmtCurrency(r.data.amount) : ""}</td>
                      <td className="px-2 py-1">{r.data ? (r.data.status === "paid" ? paidLabel(r.data.kind) : STATUS_LABELS[r.data.status]) : ""}</td>
                      <td className="px-2 py-1">
                        {r.data
                          ? r.data.companyId
                            ? companies.find((c) => c.id === r.data.companyId)?.alias || "✓"
                            : `${r.data.companyLabel || "—"} (sin asignar)`
                          : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
