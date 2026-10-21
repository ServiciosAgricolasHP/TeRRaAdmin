import { useState } from "react";
import Modal from "../../components/Modal";
import { employersService } from "../../services/employmentsService";
import { normalizeRut, validateRut, formatRutForDisplay } from "../../utils/rutUtils";

const inputCls =
  "w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";

// Las empresas empleadoras: alta, edición y desactivar. Una desactivada no se
// ofrece para períodos nuevos, pero sigue en los que ya tiene.
export default function EmployersModal({ employers, onClose, onChanged }) {
  const [form, setForm] = useState({ id: null, name: "", rut: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const name = form.name.trim();
    const rut = form.rut.trim() ? normalizeRut(form.rut) : "";
    if (!name) return setError("Falta el nombre.");
    if (rut && !validateRut(rut)) return setError("RUT inválido.");
    const id = form.id;
    const write = id ? () => employersService.update(id, { name, rut }) : () => employersService.create({ name, rut, enabled: true });
    setBusy(true);
    try {
      await write();
      setForm({ id: null, name: "", rut: "" });
      setError("");
      await onChanged();
    } catch (e) {
      setError(e.message || "No se pudo guardar.");
    }
    setBusy(false);
  };

  const toggle = async (x) => {
    const enabled = x.enabled === false;
    setBusy(true);
    try {
      await employersService.update(x.id, { enabled });
      await onChanged();
    } catch (e) {
      setError(e.message || "No se pudo guardar.");
    }
    setBusy(false);
  };

  return (
    <Modal open onClose={onClose} title="Empleadores" size="md">
      <div className="space-y-4">
        <ul className="divide-y divide-[var(--color-border)] rounded-md border border-[var(--color-border)]">
          {employers.length === 0 && <li className="px-3 py-2 text-sm text-[var(--color-muted)]">Todavía no hay empleadores.</li>}
          {employers.map((x) => (
            <li key={x.id} className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm ${x.enabled === false ? "opacity-60" : ""}`}>
              <span>
                <b>{x.name}</b>
                {x.rut && <span className="text-[var(--color-muted)]"> · {formatRutForDisplay(x.rut)}</span>}
                {x.enabled === false && <span className="text-[var(--color-muted)]"> · desactivado</span>}
              </span>
              <span className="flex gap-1">
                <button type="button" disabled={busy} onClick={() => setForm({ id: x.id, name: x.name || "", rut: x.rut || "" })} className="rounded border border-[var(--color-border)] px-2 py-1 text-xs hover:bg-[var(--color-surface-2)]">
                  ✏️ Editar
                </button>
                <button type="button" disabled={busy} onClick={() => toggle(x)} className="rounded border border-[var(--color-border)] px-2 py-1 text-xs hover:bg-[var(--color-surface-2)]">
                  {x.enabled === false ? "Activar" : "Desactivar"}
                </button>
              </span>
            </li>
          ))}
        </ul>
        <div className="rounded-md border border-[var(--color-border)] p-3">
          <div className="mb-2 text-sm font-medium">{form.id ? "Editar empleador" : "Nuevo empleador"}</div>
          <div className="grid gap-2 sm:grid-cols-[1fr_10rem_auto]">
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Nombre (Transporte HP)" className={inputCls} />
            <input value={form.rut} onChange={(e) => setForm((f) => ({ ...f, rut: e.target.value }))} placeholder="RUT" className={inputCls} />
            <button type="button" onClick={save} disabled={busy} className="rounded-md bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-[var(--color-accent-fg)] disabled:opacity-60">
              {form.id ? "Guardar" : "+ Agregar"}
            </button>
          </div>
          {form.id && (
            <button type="button" onClick={() => setForm({ id: null, name: "", rut: "" })} className="mt-2 text-xs text-[var(--color-muted)] underline">
              Cancelar edición
            </button>
          )}
          {error && <p className="mt-2 text-sm text-[var(--color-danger)]">{error}</p>}
        </div>
      </div>
    </Modal>
  );
}
