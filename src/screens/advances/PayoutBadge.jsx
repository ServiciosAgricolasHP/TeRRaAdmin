const dayText = (iso) => String(iso || "").slice(0, 10).split("-").reverse().join("-");

// La insignia de un anticipo que una nómina entrega: desde cuándo.
export function PayoutBadge({ advance }) {
  const since = dayText(advance.payoutAt);
  return (
    <span
      className="mt-1 block whitespace-nowrap text-[10px] text-[var(--color-accent)]"
      title="Una nómina le paga este anticipo a la persona. Sigue pendiente hasta que otra nómina lo descuente."
    >
      💸 Se entrega en nómina{since ? ` · ${since}` : ""}
    </span>
  );
}
