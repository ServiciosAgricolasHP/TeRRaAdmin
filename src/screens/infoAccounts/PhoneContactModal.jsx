import { useMemo, useState } from "react";
import Modal, { ModalCloseButton } from "../../components/Modal";
import { hasChanges } from "../../utils/formChanges";
import { formatRutForDisplay } from "../../utils/rutUtils";
import { useToast } from "../../contexts/ToastContext";
import {
  CONTACT_TYPES,
  departmentOptions,
  displayName,
  formatPhone,
  normalizePhone,
  phoneContactFields,
} from "../../utils/phoneBook";

const PHONE_LABELS = ["Móvil", "Directo", "Alternativo", "Trabajo", "Casa", "Principal"];

// El contacto como lo edita el formulario: los números como se muestran y al
// menos una fila para escribir un teléfono y un correo.
function toForm(contact) {
  const c = phoneContactFields(contact);
  return {
    ...c,
    id: contact.id || null,
    companyRut: c.companyRut ? formatRutForDisplay(c.companyRut) : "",
    contactType: c.contactType || "",
    phones: c.phones.length ? c.phones.map((p) => ({ number: formatPhone(p.number), label: p.label })) : [{ number: "", label: "" }],
    emails: c.emails.length ? c.emails : [""],
  };
}

const inputCls = "w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";
const labelCls = "mb-1 block text-xs font-medium text-[var(--color-muted)]";
const smallBtn = "rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)]";

// Alta y edición de un contacto de la agenda. Avisa si un número ya lo tiene
// otro contacto, pero deja guardar: puede ser una central compartida.
export default function PhoneContactModal({ initial, contacts, onCancel, onSave }) {
  const toast = useToast();
  const [form, setForm] = useState(() => toForm(initial));
  const [baseline] = useState(form);
  const [busy, setBusy] = useState(false);
  const dirty = !busy && hasChanges(baseline, form);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setListItem = (key, i, value) => setForm((f) => ({ ...f, [key]: f[key].map((x, k) => (k === i ? value : x)) }));
  const addListItem = (key, value) => setForm((f) => ({ ...f, [key]: [...f[key], value] }));
  const removeListItem = (key, i) => setForm((f) => ({ ...f, [key]: f[key].filter((_, k) => k !== i) }));

  // Quién más tiene cada número escrito.
  const owners = useMemo(() => {
    const map = new Map();
    for (const c of contacts) {
      if (c.id === form.id) continue;
      for (const p of c.phones || []) map.set(normalizePhone(p.number), c);
    }
    return map;
  }, [contacts, form.id]);
  const departments = useMemo(() => departmentOptions(contacts), [contacts]);

  const submit = async () => {
    const hasPhone = form.phones.some((p) => normalizePhone(p.number));
    const hasEmail = form.emails.some((e) => e.trim());
    if (!hasPhone && !hasEmail) {
      toast.warning("Ingresa al menos un teléfono o un correo.");
      return;
    }
    setBusy(true);
    try {
      await onSave({ ...form, contactType: form.contactType || null });
    } catch (err) {
      toast.error("Error al guardar: " + (err.message || err));
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onCancel}
      dirty={dirty}
      size="lg"
      title={form.id ? "Editar contacto" : "Nuevo contacto"}
      footer={
        <>
          <ModalCloseButton className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm">Cancelar</ModalCloseButton>
          <button type="submit" form="phone-contact-form" disabled={busy} className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-60">
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </>
      }
    >
      <form id="phone-contact-form" onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="pc-name">Nombre y apellido</label>
            <input id="pc-name" value={form.name} onChange={(e) => set({ name: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="pc-company">Empresa</label>
            <input id="pc-company" value={form.company} onChange={(e) => set({ company: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="pc-rut">RUT empresa</label>
            <input id="pc-rut" value={form.companyRut} onChange={(e) => set({ companyRut: e.target.value })} placeholder="76.543.210-1" className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="pc-type">Tipo de contacto</label>
            <select id="pc-type" value={form.contactType} onChange={(e) => set({ contactType: e.target.value })} className={inputCls}>
              <option value="">Sin tipo</option>
              {CONTACT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="pc-dept">Departamento / área</label>
            <input id="pc-dept" list="pc-departments" value={form.department} onChange={(e) => set({ department: e.target.value })} className={inputCls} />
            <datalist id="pc-departments">{departments.map((d) => <option key={d} value={d} />)}</datalist>
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="pc-role">Cargo</label>
            <input id="pc-role" value={form.role} onChange={(e) => set({ role: e.target.value })} className={inputCls} />
          </div>
        </div>

        <section className="space-y-2 border-t border-[var(--color-border)] pt-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Teléfonos</h3>
            <button type="button" onClick={() => addListItem("phones", { number: "", label: "" })} className={smallBtn}>+ Agregar teléfono</button>
          </div>
          <datalist id="pc-phone-labels">{PHONE_LABELS.map((l) => <option key={l} value={l} />)}</datalist>
          {form.phones.map((p, i) => {
            const owner = owners.get(normalizePhone(p.number));
            return (
              <div key={i}>
                <div className="flex gap-2">
                  <input
                    aria-label={`Teléfono ${i + 1}`}
                    value={p.number}
                    onChange={(e) => setListItem("phones", i, { ...p, number: e.target.value })}
                    placeholder="+56 9 1234 5678"
                    inputMode="tel"
                    className={`${inputCls} min-w-0 flex-[3] font-mono`}
                  />
                  <input
                    aria-label={`Etiqueta del teléfono ${i + 1}`}
                    list="pc-phone-labels"
                    value={p.label}
                    onChange={(e) => setListItem("phones", i, { ...p, label: e.target.value })}
                    placeholder="Etiqueta"
                    className={`${inputCls} min-w-0 flex-[2]`}
                  />
                  <button type="button" onClick={() => removeListItem("phones", i)} title="Quitar teléfono" className="px-1 text-[var(--color-danger)]">✕</button>
                </div>
                {owner && <p className="mt-1 text-xs text-[var(--color-warning)]">Este número ya lo tiene {displayName(owner)}.</p>}
              </div>
            );
          })}
        </section>

        <section className="space-y-2 border-t border-[var(--color-border)] pt-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Correos</h3>
            <button type="button" onClick={() => addListItem("emails", "")} className={smallBtn}>+ Agregar correo</button>
          </div>
          {form.emails.map((e, i) => (
            <div key={i} className="flex gap-2">
              <input aria-label={`Correo ${i + 1}`} type="email" value={e} onChange={(ev) => setListItem("emails", i, ev.target.value)} className={inputCls} />
              <button type="button" onClick={() => removeListItem("emails", i)} title="Quitar correo" className="px-1 text-[var(--color-danger)]">✕</button>
            </div>
          ))}
        </section>

        {form.otherNames.length > 0 && (
          <section className="space-y-2 border-t border-[var(--color-border)] pt-3">
            <h3 className="text-sm font-semibold">Otros nombres</h3>
            <p className="text-xs text-[var(--color-muted)]">Los nombres de las copias que se juntaron en este contacto. La búsqueda también los encuentra.</p>
            {form.otherNames.map((n, i) => (
              <div key={i} className="flex gap-2">
                <input aria-label={`Otro nombre ${i + 1}`} value={n} onChange={(e) => setListItem("otherNames", i, e.target.value)} className={inputCls} />
                <button type="button" onClick={() => removeListItem("otherNames", i)} title="Quitar nombre" className="px-1 text-[var(--color-danger)]">✕</button>
              </div>
            ))}
          </section>
        )}

        <div className="border-t border-[var(--color-border)] pt-3">
          <label className={labelCls} htmlFor="pc-notes">Observaciones</label>
          <textarea id="pc-notes" value={form.notes} onChange={(e) => set({ notes: e.target.value })} rows={2} className={inputCls} />
        </div>
      </form>
    </Modal>
  );
}
