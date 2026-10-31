import { FilterChips, FilterToken } from "../FilterChips";
import { fmtCurrency } from "../../../utils/format";

// Barra de filtros fija, fuera del scroll, de borde a borde entre el
// encabezado y el cuerpo. Grupo y Ciclo van en un panel; lo que esté activo se
// ve igual, como etiquetas que se quitan con ✕.
export function DetailFilterBar({ cycleDetails, displayCycleLabel, filters, items }) {
  const { activeCycleFilter, activeLeaderFilter, allLeaders, clearFilters, filteredItems, hasActiveFilter, moreFilterCount, paymentMethod, search, setCycleFilter, setLeaderFilter, setPaymentMethod, setSearch, setShowFilters, showFilters, toggleSetItem } = filters;
  return (
    <div className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 sm:px-5 sm:py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-auto sm:min-w-[220px] sm:flex-1">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--color-muted)]">🔍</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por RUT, nombre o líder"
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] py-1.5 pl-8 pr-2.5 text-sm outline-none focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)]"
          />
        </div>
        <div className="inline-flex rounded-lg bg-[var(--color-surface-2)] p-0.5 text-xs" role="group" aria-label="Medio de pago">
          {[
            { v: "all", l: "Todos" },
            { v: "bank", l: "🏦 Banco" },
            { v: "cash", l: "💵 Efectivo" },
          ].map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => setPaymentMethod(o.v)}
              aria-pressed={paymentMethod === o.v}
              className={`min-h-7 rounded-md px-2.5 py-1 ${
                paymentMethod === o.v
                  ? "bg-[var(--color-surface)] font-medium text-[var(--color-text)] shadow-sm"
                  : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              {o.l}
            </button>
          ))}
        </div>
        {(allLeaders.length > 1 || cycleDetails.length > 1) && (
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            className={`min-h-8 rounded-lg border px-2.5 py-1 text-xs ${
              showFilters || moreFilterCount > 0
                ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            Filtros{moreFilterCount > 0 ? ` (${moreFilterCount})` : ""} {showFilters ? "▴" : "▾"}
          </button>
        )}
        <span className="ml-auto flex items-center gap-2 text-xs tabular-nums text-[var(--color-muted)]">
          <span>
            {hasActiveFilter ? `${filteredItems.length} de ${items.length}` : items.length} trabajador{items.length === 1 ? "" : "es"}
            {hasActiveFilter && (
              <>
                {" · "}
                <b className="text-[var(--color-text)]">{fmtCurrency(filteredItems.reduce((s, x) => s + (Number(x.amount) || 0), 0))}</b>
              </>
            )}
          </span>
          {hasActiveFilter && (
            <button type="button" onClick={clearFilters} className="hover:text-[var(--color-danger)]">
              Limpiar
            </button>
          )}
        </span>
      </div>
      {!showFilters && moreFilterCount > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          {[...activeLeaderFilter].map((l) => (
            <FilterToken key={`g_${l}`} label={`Grupo: ${l}`} onRemove={() => toggleSetItem(setLeaderFilter, l)} />
          ))}
          {cycleDetails
            .filter((c) => activeCycleFilter.has(c.id))
            .map((c) => (
              <FilterToken key={`c_${c.id}`} label={displayCycleLabel(c)} onRemove={() => toggleSetItem(setCycleFilter, c.id)} />
            ))}
        </div>
      )}
      {showFilters && (
        <div className="mt-2 space-y-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2.5">
          {allLeaders.length > 1 && (
            <FilterChips
              label="Grupo"
              options={allLeaders.map((g) => ({ id: g.leader, label: g.leader, count: g.count }))}
              active={activeLeaderFilter}
              onToggle={(id) => toggleSetItem(setLeaderFilter, id)}
            />
          )}
          {cycleDetails.length > 1 && (
            <FilterChips
              label="Ciclo"
              options={cycleDetails.map((c) => ({
                id: c.id,
                label: displayCycleLabel(c),
                title: c.faenaName ? `${c.faenaName}${c.subfaenaName ? " / " + c.subfaenaName : ""}` : c.label,
              }))}
              active={activeCycleFilter}
              onToggle={(id) => toggleSetItem(setCycleFilter, id)}
            />
          )}
        </div>
      )}
    </div>
  );
}
