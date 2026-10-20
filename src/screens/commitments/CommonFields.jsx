import { similarCounterparty } from "../../utils/commitments";
import { labelCls, inputCls } from "./styles";

// Campos comunes de contraparte, concepto, monto, empresa y notas. La
// contraparte se autocompleta con las ya usadas y, si lo escrito se parece a
// una de ellas sin ser igual, ofrece usar esa.
export function CommonFields({ form, set, companies, counterparties = [], counterpartyLabel, amountLabel = "Monto" }) {
  const similar = similarCounterparty(form.counterparty, counterparties);
  return (
    <>
      <div className="sm:col-span-2">
        <label className={labelCls}>{counterpartyLabel}</label>
        <input
          list="commitment-counterparties"
          autoComplete="off"
          value={form.counterparty || ""}
          onChange={(e) => set({ counterparty: e.target.value })}
          className={inputCls}
        />
        <datalist id="commitment-counterparties">
          {counterparties.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        {similar && (
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--color-warning)]">
            <span>
              Se parece a <b>{similar}</b>, que ya está registrado.
            </span>
            <button
              type="button"
              onClick={() => set({ counterparty: similar })}
              className="min-h-8 rounded-md border border-[var(--color-warning)] px-2 font-medium hover:bg-[var(--color-warning-soft)]"
            >
              Usar ese nombre
            </button>
          </div>
        )}
      </div>
      <div>
        <label className={labelCls}>{amountLabel}</label>
        <input
          type="number"
          min="0"
          inputMode="numeric"
          value={form.amount ?? ""}
          onChange={(e) => set({ amount: e.target.value })}
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>Empresa / cuenta</label>
        <select
          value={form.companyId || ""}
          onChange={(e) => set({ companyId: e.target.value || null })}
          className={inputCls}
        >
          <option value="">{form.companyLabel ? `${form.companyLabel} (sin asignar)` : "— Sin empresa —"}</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.alias || c.razonSocial}</option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls}>Concepto</label>
        <input value={form.concept || ""} onChange={(e) => set({ concept: e.target.value })} className={inputCls} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls}>Observaciones</label>
        <textarea rows={2} value={form.notes || ""} onChange={(e) => set({ notes: e.target.value })} className={inputCls} />
      </div>
    </>
  );
}
