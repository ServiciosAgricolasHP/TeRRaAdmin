"use no memo";
import { useState } from "react";
import Modal, { ModalCloseButton } from "../../components/Modal";
import { hasChanges } from "../../utils/formChanges";
import { useToast } from "../../contexts/ToastContext";
import { BANKS, ACCOUNT_TYPES } from "../../utils/banks";
import { TYPE_META, emptyCard, emptyAccount, rutIncluded } from "../../utils/contactCards";

// ============================================================
// Modal de creación / edición
// ============================================================
export default function ContactCardModal({ initial, onCancel, onSave }) {
  const toast = useToast();
  const [form, setForm] = useState(() => {
    const base = { ...emptyCard(initial.type), ...initial, accounts: (initial.accounts || []).map((a) => ({ ...a })) };
    // Si la ficha no trae `includeRut`, rutIncluded() lo deduce (se muestra si
    // tiene RUT).
    return { ...base, includeRut: rutIncluded(base) };
  });
  const [baseline] = useState(form);
  const [busy, setBusy] = useState(false);
  // En una ficha nueva, elegir persona o empresa sin escribir nada más no es un
  // cambio que se pierda.
  const dirty = !busy && hasChanges(baseline, form, { ignore: form.id ? [] : ["type", "includeRut"] });

  const meta = TYPE_META[form.type] || TYPE_META.persona;
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const setAccount = (id, patch) =>
    setForm((f) => ({ ...f, accounts: f.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
  const addAccount = () => setForm((f) => ({ ...f, accounts: [...f.accounts, emptyAccount()] }));
  const removeAccount = (id) => setForm((f) => ({ ...f, accounts: f.accounts.filter((a) => a.id !== id) }));

  const submit = async () => {
    if (!form.name.trim()) {
      toast.warning(`Ingresa ${meta.nameLabel.toLowerCase()}.`);
      return;
    }
    setBusy(true);
    try {
      await onSave(form);
    } catch (err) {
      toast.error("Error al guardar: " + (err.message || err));
    } finally {
      setBusy(false);
    }
  };

  const inputCls = "w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";
  const labelCls = "mb-1 block text-xs font-medium text-[var(--color-muted)]";

  return (
    <Modal
      open
      onClose={onCancel}
      dirty={dirty}
      size="lg"
      title={form.id ? "Editar ficha" : "Nueva ficha"}
      footer={
        <>
          <ModalCloseButton className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm">
            Cancelar
          </ModalCloseButton>
          <button type="submit" form="contact-card-form" disabled={busy} className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-60">
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </>
      }
    >
      <form id="contact-card-form" onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-4">
        {/* Tipo */}
        <div className="flex gap-2">
          {Object.entries(TYPE_META).map(([key, m]) => (
            <button
              key={key}
              type="button"
              onClick={() => set({ type: key })}
              className={`flex-1 rounded-md border px-3 py-2 text-sm ${
                form.type === key
                  ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)] font-medium"
                  : "border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-accent-soft)]"
              }`}
            >
              {m.icon} {m.label}
            </button>
          ))}
        </div>

        {/* Datos generales */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelCls}>{meta.nameLabel}</label>
            <input value={form.name} onChange={(e) => set({ name: e.target.value })} className={inputCls} />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className={labelCls.replace("mb-1 ", "")}>RUT</span>
              {form.type === "persona" && (
                <label className="flex items-center gap-1 text-[10px] text-[var(--color-muted)]">
                  <input
                    type="checkbox"
                    checked={!!form.includeRut}
                    onChange={(e) => set({ includeRut: e.target.checked })}
                  />
                  Incluir RUT
                </label>
              )}
            </div>
            {(form.type !== "persona" || form.includeRut) && (
              <input value={form.rut} onChange={(e) => set({ rut: e.target.value })} placeholder="12.345.678-9" className={inputCls} />
            )}
          </div>
          {form.type === "empresa" && (
            <div>
              <label className={labelCls}>Giro</label>
              <input value={form.giro} onChange={(e) => set({ giro: e.target.value })} className={inputCls} />
            </div>
          )}
          <div>
            <label className={labelCls}>Teléfono</label>
            <input value={form.phone} onChange={(e) => set({ phone: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Email</label>
            <input value={form.email} onChange={(e) => set({ email: e.target.value })} className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Dirección</label>
            <input value={form.address} onChange={(e) => set({ address: e.target.value })} className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Nota</label>
            <textarea value={form.note} onChange={(e) => set({ note: e.target.value })} rows={2} className={inputCls} />
          </div>
        </div>

        {/* Cuentas bancarias */}
        <div className="space-y-2 border-t border-[var(--color-border)] pt-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Cuentas bancarias</h3>
            <button type="button" onClick={addAccount} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)]">
              + Agregar cuenta
            </button>
          </div>
          {form.accounts.length === 0 && (
            <p className="text-xs text-[var(--color-muted)]">Sin cuentas. Agrega una si quieres guardar datos bancarios.</p>
          )}
          {form.accounts.map((acc, i) => (
            <div key={acc.id} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
              <div className="mb-2 flex items-center gap-2">
                <input
                  value={acc.label}
                  onChange={(e) => setAccount(acc.id, { label: e.target.value })}
                  placeholder={`Etiqueta (ej. "Cuenta ${i + 1}", "Operaciones")`}
                  className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs outline-none focus:border-[var(--color-accent)]"
                />
                <button type="button" onClick={() => removeAccount(acc.id)} title="Eliminar cuenta" className="text-[var(--color-danger)]">✕</button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>Titular</label>
                  <input value={acc.titular} onChange={(e) => setAccount(acc.id, { titular: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>RUT titular</label>
                  <input value={acc.rutTitular} onChange={(e) => setAccount(acc.id, { rutTitular: e.target.value })} placeholder="12.345.678-9" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Banco</label>
                  <select value={acc.bankCode} onChange={(e) => setAccount(acc.id, { bankCode: e.target.value })} className={inputCls}>
                    {BANKS.map((b) => (
                      <option key={b.code} value={b.code}>{b.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Tipo de cuenta</label>
                  <select value={acc.accountType} onChange={(e) => setAccount(acc.id, { accountType: Number(e.target.value) })} className={inputCls}>
                    {ACCOUNT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>N° de cuenta</label>
                  <input value={acc.accountNumber} onChange={(e) => setAccount(acc.id, { accountNumber: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Email (opcional)</label>
                  <input value={acc.email} onChange={(e) => setAccount(acc.id, { email: e.target.value })} className={inputCls} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </form>
    </Modal>
  );
}
