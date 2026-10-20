import RowMenu from "../../components/RowMenu";
import { contactTypeLabel, displayName, formatPhone, phoneContactText } from "../../utils/phoneBook";

// Un contacto de la agenda: nombre, empresa · departamento · cargo, sus otros
// nombres y, a la derecha (abajo en el teléfono), sus números y correos. Tocar
// el nombre copia el contacto entero, y tocar un número o un correo, solo ese
// dato; 📤 comparte el contacto y el menú ⋯ lo copia, lo descarga como
// tarjeta .vcf, lo edita o lo borra.
// `hideCompany`: la lista ya está agrupada por empresa.
export default function PhoneContactRow({ contact, hideCompany = false, onCopy, onShare, onDownload, onEdit, onDelete }) {
  const c = contact;
  // Sin nombre, la empresa ya es el título.
  const meta = [c.name && !hideCompany ? c.company : "", c.department, c.role].filter(Boolean).join(" · ");
  return (
    <li className="relative flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-start sm:gap-4">
      {/* En el teléfono, las acciones van en la esquina para no sumar una línea. */}
      <div className="min-w-0 pr-28 sm:w-2/5 sm:pr-0">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <button
            type="button"
            onClick={() => onCopy(phoneContactText(c), "Contacto")}
            title="Copiar contacto (nombre, empresa, números y correos)"
            className="-mx-1 rounded px-1 text-left hover:bg-[var(--color-accent-soft)] active:bg-[var(--color-accent-soft)]"
          >
            <span className="font-medium break-words">{displayName(c)}</span>
            <span className="ml-1 text-xs text-[var(--color-muted)]" aria-hidden>📋</span>
          </button>
          {c.contactType && (
            <span className="rounded-full bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--color-muted)]">
              {contactTypeLabel(c.contactType)}
            </span>
          )}
        </div>
        {meta && <div className="text-xs text-[var(--color-muted)] break-words">{meta}</div>}
        {c.otherNames?.length > 0 && (
          <div className="text-[11px] text-[var(--color-muted)] break-words">También: {c.otherNames.join(", ")}</div>
        )}
        {c.notes && <div className="mt-0.5 whitespace-pre-line text-[11px] italic text-[var(--color-muted)] break-words">{c.notes}</div>}
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
        {(c.phones || []).map((p) => (
          <CopyChip key={p.number} icon="📞" value={formatPhone(p.number)} hint={p.label} what="Número" onCopy={onCopy} mono />
        ))}
        {(c.emails || []).map((e) => (
          <CopyChip key={e} icon="✉" value={e} what="Correo" onCopy={onCopy} />
        ))}
      </div>
      <div className="absolute right-3 top-2.5 flex shrink-0 items-center gap-1 sm:static">
        <button
          type="button"
          onClick={() => onShare(c)}
          title="Compartir el contacto (WhatsApp, correo…); en el computador, lo copia"
          aria-label="Compartir contacto"
          className="min-h-8 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs hover:bg-[var(--color-accent-soft)]"
        >
          📤<span className="ml-1 hidden sm:inline">Compartir</span>
        </button>
        <RowMenu
          items={[
            { icon: "📋", label: "Copiar contacto", hint: "Nombre, empresa, números y correos", onClick: () => onCopy(phoneContactText(c), "Contacto") },
            { icon: "📲", label: "Descargar contacto (.vcf)", hint: "Al abrirlo en el teléfono, se guarda en los contactos", onClick: () => onDownload(c) },
            { icon: "✎", label: "Editar", onClick: () => onEdit(c) },
            { divider: true },
            { icon: "🗑", label: "Eliminar", danger: true, onClick: () => onDelete(c) },
          ]}
        />
      </div>
    </li>
  );
}

function CopyChip({ icon, value, hint, what, onCopy, mono = false }) {
  return (
    <button
      type="button"
      onClick={() => onCopy(value, what)}
      title={`Copiar ${what.toLowerCase()}`}
      className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 text-left text-xs hover:bg-[var(--color-accent-soft)] active:bg-[var(--color-accent-soft)]"
    >
      <span aria-hidden>{icon}</span>
      <span className={`min-w-0 break-all ${mono ? "font-mono" : ""}`}>{value}</span>
      {hint && <span className="shrink-0 text-[10px] text-[var(--color-muted)]">{hint}</span>}
    </button>
  );
}
