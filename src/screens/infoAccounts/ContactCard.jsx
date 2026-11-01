import { TYPE_META, rutIncluded, cardToText } from "../../utils/contactCards";
import { formatRutForDisplay, normalizeRut } from "../../utils/rutUtils";
import Field from "./Field";
import AccountBlock from "./AccountBlock";

// ============================================================
// Tarjeta de contacto
// ============================================================
export default function ContactCard({ card, onCopy, onCopyImage, onToggleFavorite, onEdit, onDelete }) {
  const meta = TYPE_META[card.type] || TYPE_META.persona;
  const accounts = Array.isArray(card.accounts) ? card.accounts : [];

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
      {/* Header */}
      <div className="flex items-start gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2">
        <span className="text-lg leading-none">{meta.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{card.name || "(sin nombre)"}</div>
          <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">{meta.label}</div>
        </div>
        <button
          type="button"
          onClick={() => onToggleFavorite(card)}
          title={card.favorite ? "Quitar de favoritas" : "Marcar como favorita"}
          className="text-lg leading-none"
        >
          {card.favorite ? "⭐" : "☆"}
        </button>
      </div>

      {/* Datos */}
      <div className="flex flex-col gap-0.5 px-3 py-2">
        {rutIncluded(card) && (
          <Field label="RUT" value={card.rut ? formatRutForDisplay(card.rut) : ""} copyValue={normalizeRut(card.rut)} onCopy={onCopy} mono />
        )}
        {card.type === "empresa" && <Field label="Giro" value={card.giro} onCopy={onCopy} />}
        <Field label="Dirección" value={card.address} onCopy={onCopy} />
        <Field label="Teléfono" value={card.phone} onCopy={onCopy} mono />
        <Field label="Email" value={card.email} onCopy={onCopy} mono />
        <Field label="Nota" value={card.note} onCopy={onCopy} />
      </div>

      {/* Cuentas bancarias */}
      {accounts.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-[var(--color-border)] px-3 py-2">
          {accounts.map((acc, i) => (
            <AccountBlock
              key={acc.id || i}
              acc={acc}
              index={i}
              multi={accounts.length > 1}
              onCopy={onCopy}
            />
          ))}
        </div>
      )}

      {/* Acciones */}
      <div className="mt-auto flex items-center gap-1 border-t border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-xs">
        <button
          type="button"
          onClick={() => onCopy(cardToText(card), "Ficha completa")}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 hover:bg-[var(--color-accent-soft)]"
        >
          📋 Texto
        </button>
        <button
          type="button"
          onClick={() => onCopyImage(card)}
          title="Copiar la ficha como imagen estilizada"
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 hover:bg-[var(--color-accent-soft)]"
        >
          🖼 Imagen
        </button>
        <button
          type="button"
          onClick={() => onEdit(card)}
          className="ml-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 hover:bg-[var(--color-accent-soft)]"
        >
          ✎ Editar
        </button>
        <button
          type="button"
          onClick={() => onDelete(card)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]"
        >
          🗑
        </button>
      </div>
    </div>
  );
}
