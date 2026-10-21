import { useState } from "react";
import {
  MARITAL_STATUSES,
  PENSION_FUNDS,
  HEALTH_INSURERS,
  NATIONALITIES,
  personalDataCount,
} from "../../utils/workerPersonalData";

const inputCls =
  "w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-[var(--color-muted)]">{label}</span>
      {children}
    </label>
  );
}

// Los datos personales que piden los contratos y las boletas de honorarios.
// Se pliega; abre desplegada si la persona ya tiene alguno.
export default function PersonalDataFields({ form, onChange }) {
  const filled = personalDataCount(form);
  const [open, setOpen] = useState(filled > 0);
  const text = (key, props = {}) => (
    <input value={form[key]} onChange={(e) => onChange(key, e.target.value)} className={inputCls} {...props} />
  );
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <h3 className="text-sm font-semibold">Datos personales</h3>
        <span className="text-xs text-[var(--color-muted)]">
          {filled} de 7 {open ? "▾" : "▸"}
        </span>
      </button>
      {open && (
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="Dirección">{text("address", { placeholder: "Calle, número, villa" })}</Field>
          <Field label="Comuna">{text("commune")}</Field>
          <Field label="Nacionalidad">
            {text("nationality", { list: "worker-nationalities" })}
            <datalist id="worker-nationalities">
              {NATIONALITIES.map((n) => <option key={n} value={n} />)}
            </datalist>
          </Field>
          <Field label="Estado civil">
            <select value={form.maritalStatus} onChange={(e) => onChange("maritalStatus", e.target.value)} className={inputCls}>
              <option value="">—</option>
              {Object.entries(MARITAL_STATUSES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </Field>
          <Field label="Fecha de nacimiento">{text("birthDate", { type: "date" })}</Field>
          <Field label="AFP">
            {text("pensionFund", { list: "worker-pension-funds" })}
            <datalist id="worker-pension-funds">
              {PENSION_FUNDS.map((n) => <option key={n} value={n} />)}
            </datalist>
          </Field>
          <Field label="Salud">
            {text("healthInsurance", { list: "worker-health-insurers", placeholder: "Fonasa o la Isapre" })}
            <datalist id="worker-health-insurers">
              {HEALTH_INSURERS.map((n) => <option key={n} value={n} />)}
            </datalist>
          </Field>
        </div>
      )}
    </div>
  );
}
