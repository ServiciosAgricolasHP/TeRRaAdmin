import { accountToText } from "../../utils/contactCards";
import { bankName, accountTypeLabel } from "../../utils/banks";
import { formatRutForDisplay } from "../../utils/rutUtils";
import Field from "./Field";

// Bloque de una cuenta bancaria con copia por dato y copia del bloque entero.
export default function AccountBlock({ acc, index, multi, onCopy }) {
  return (
    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-xs font-semibold">
          🏦 {acc.label || (multi ? `Cuenta ${index + 1}` : "Cuenta")}
        </span>
        <button
          type="button"
          onClick={() => onCopy(accountToText(acc), "Cuenta")}
          title="Copiar toda la cuenta"
          className="ml-auto rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-[11px] hover:bg-[var(--color-accent-soft)]"
        >
          📋 Copiar cuenta
        </button>
      </div>
      <div className="flex flex-col gap-0.5">
        <Field label="Titular" value={acc.titular} onCopy={onCopy} />
        <Field label="RUT" value={acc.rutTitular ? formatRutForDisplay(acc.rutTitular) : ""} copyValue={formatRutForDisplay(acc.rutTitular)} onCopy={onCopy} mono />
        <Field label="Banco" value={bankName(acc.bankCode)} onCopy={onCopy} />
        <Field label="Tipo" value={accountTypeLabel(acc.accountType)} onCopy={onCopy} />
        <Field label="N° Cuenta" value={acc.accountNumber} onCopy={onCopy} mono />
        <Field label="Email" value={acc.email} onCopy={onCopy} mono />
      </div>
    </div>
  );
}
