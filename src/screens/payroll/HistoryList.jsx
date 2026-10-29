import { useState, useMemo } from "react";
import { pendingCashOf } from "../../services/payrollsService";
import RowMenu from "../../components/RowMenu";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useValuesChanged } from "../../hooks/useValuesChanged";
import { fmtCurrency } from "../../utils/format";
import { fmtDate } from "./helpers";
import { payStateOf } from "./payState";
import { PortalBadge, PayStatePill, PaymentDatesLine } from "./PayStatePill";

export function HistoryList({ payrolls, onMarkPaid, onMarkPending, onMarkBankPaid, onRevertBank, onAskDelete, onChangeClassification, onOpen, onRename, publishedPayrollId = null }) {
  const isMobile = useIsMobile();
  const [statusFilter, setStatusFilter] = useState("all"); // all | pending | paid | cashPending
  const [monthFilter, setMonthFilter] = useState("all"); // all | YYYY-MM
  const [search, setSearch] = useState("");
  // Pestaña del historial: "nomina" (default) | "diferencia". Una nómina sin
  // `classification` cuenta como "nomina".
  const [classificationTab, setClassificationTab] = useState("nomina");
  const classify = (p) => p.classification || "nomina";
  const classificationCounts = useMemo(() => {
    let nomina = 0, diferencia = 0;
    for (const p of payrolls) {
      if (classify(p) === "diferencia") diferencia += 1;
      else nomina += 1;
    }
    return { nomina, diferencia };
  }, [payrolls]);

  const monthKey = (v) => {
    const d = v?.toDate ? v.toDate() : v ? new Date(v) : null;
    if (!d || isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };

  const months = useMemo(() => {
    const set = new Set();
    for (const p of payrolls) {
      const k = monthKey(p.createdAt);
      if (k) set.add(k);
    }
    return [...set].sort().reverse();
  }, [payrolls]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return payrolls.filter((p) => {
      if (classify(p) !== classificationTab) return false;
      if (statusFilter === "cashPending") {
        if (pendingCashOf(p) <= 0) return false;
      } else if (statusFilter !== "all" && (p.status || "pending") !== statusFilter) {
        return false;
      }
      if (monthFilter !== "all" && monthKey(p.createdAt) !== monthFilter) return false;
      if (q && !(p.name || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [payrolls, classificationTab, statusFilter, monthFilter, search]);

  // "Pendiente" es lo que se debe: de una nómina con las transferencias
  // pagadas solo cuenta el efectivo adeudado.
  const totals = useMemo(() => {
    let pending = 0, paid = 0, cashOwed = 0;
    for (const p of filtered) {
      const total = Number(p.total) || 0;
      let owed;
      if ((p.status || "pending") === "paid") owed = 0;
      else if (p.bankPaidAt) { owed = pendingCashOf(p); cashOwed += owed; }
      else owed = total;
      pending += owed;
      paid += total - owed;
    }
    return { pending, paid, cashOwed, total: pending + paid };
  }, [filtered]);

  // Paginación de a 15: los totales operan sobre todo el conjunto filtrado y
  // solo se pagina lo que se dibuja. Cambiar filtro, pestaña o búsqueda vuelve
  // a la página 1.
  const PAGE_SIZE = 15;
  const [page, setPage] = useState(1);
  if (useValuesChanged([classificationTab, statusFilter, monthFilter, search])) setPage(1);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const paged = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage],
  );
  const pageNumbers = useMemo(() => {
    if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
    const set = new Set([1, pageCount, currentPage - 1, currentPage, currentPage + 1]);
    const nums = [...set].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b);
    const out = [];
    let prev = 0;
    for (const n of nums) {
      if (n - prev > 1) out.push("…");
      out.push(n);
      prev = n;
    }
    return out;
  }, [pageCount, currentPage]);

  // Una acción principal según el estado de la nómina (ninguna si ya está
  // pagada) y el resto en el menú ⋯. Eliminar se muestra siempre: apagado,
  // dice qué hay que hacer antes.
  const actionsOf = (p) => {
    const state = payStateOf(p);
    const move =
      classify(p) === "diferencia"
        ? { icon: "→", label: "Mover a Nóminas", onClick: () => onChangeClassification(p) }
        : { icon: "→", label: "Mover a Diferencias", onClick: () => onChangeClassification(p) };
    const rename = { icon: "✎", label: "Renombrar", onClick: () => onRename(p) };
    const remove = {
      icon: "🗑",
      label: "Eliminar",
      danger: true,
      disabled: state !== "pending",
      hint:
        state === "paid"
          ? "Primero márcala como no pagada."
          : state === "bankPaid"
            ? "Primero revierte las transferencias."
            : "Libera los días y devuelve los anticipos.",
      onClick: () => onAskDelete(p),
    };
    if (state === "paid") {
      return {
        primary: null,
        menu: [
          { icon: "↩", label: "Marcar como no pagada", hint: "Vuelve a pendiente y quita el sello de pago.", onClick: () => onMarkPending(p) },
          move,
          rename,
          { divider: true },
          remove,
        ],
      };
    }
    if (state === "bankPaid") {
      return {
        primary: { label: "💵 Pagar efectivo", title: "Cierra la nómina: sella el efectivo que faltaba entregar", onClick: () => onMarkPaid(p) },
        menu: [
          { icon: "↩", label: "Revertir transferencias", hint: "Deshace el sello de las transferencias.", onClick: () => onRevertBank(p) },
          move,
          rename,
          { divider: true },
          remove,
        ],
      };
    }
    return {
      primary: { label: "✓ Marcar pagada", title: "Marcar la nómina entera como pagada", onClick: () => onMarkPaid(p) },
      menu: [
        ...((p.cashTotal || 0) > 0
          ? [{ icon: "🏦", label: "Solo transferencias", hint: "Salieron las transferencias; el efectivo queda debiéndose.", onClick: () => onMarkBankPaid(p) }]
          : []),
        move,
        rename,
        { divider: true },
        remove,
      ],
    };
  };

  const pager = filtered.length > 0 && (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 pt-1 text-xs">
      <span className="text-[var(--color-muted)]">
        Mostrando {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} de {filtered.length}
      </span>
      {pageCount > 1 && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPage(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
            className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1 hover:bg-[var(--color-accent-soft)] disabled:opacity-40"
          >
            ‹
          </button>
          {pageNumbers.map((n, i) =>
            n === "…" ? (
              <span key={`e_${i}`} className="px-1 text-[var(--color-muted)]">…</span>
            ) : (
              <button
                key={n}
                type="button"
                onClick={() => setPage(n)}
                className={`min-h-[32px] min-w-[32px] rounded-md border px-2 py-1 tabular-nums ${
                  n === currentPage
                    ? "border-[var(--color-accent)] bg-[var(--color-accent)] font-semibold text-[var(--color-accent-fg)]"
                    : "border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-accent-soft)]"
                }`}
              >
                {n}
              </button>
            ),
          )}
          <button
            type="button"
            onClick={() => setPage(Math.min(pageCount, currentPage + 1))}
            disabled={currentPage >= pageCount}
            className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1 hover:bg-[var(--color-accent-soft)] disabled:opacity-40"
          >
            ›
          </button>
        </div>
      )}
    </div>
  );

  if (payrolls.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-[var(--color-border)] text-[var(--color-muted)]">
        No hay nóminas generadas todavía.
      </div>
    );
  }
  return (
    <div className="flex flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1 w-fit">
        {[
          { key: "nomina", label: "Nóminas", count: classificationCounts.nomina },
          { key: "diferencia", label: "Diferencias", count: classificationCounts.diferencia },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setClassificationTab(t.key)}
            className={`rounded-md px-3 py-1.5 text-sm ${
              classificationTab === t.key
                ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]"
                : "text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"
            }`}
          >
            {t.label} <span className="ml-1 text-xs opacity-75">({t.count})</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre..."
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-accent)] sm:w-56"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
        >
          <option value="all">Todos</option>
          <option value="pending">Pendientes</option>
          <option value="cashPending">💵 Efectivo pendiente</option>
          <option value="paid">Pagadas</option>
        </select>
        <select
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
        >
          <option value="all">Todos los meses</option>
          {months.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <div className="ml-auto flex gap-3 text-xs">
          <span><span className="text-[var(--color-muted)]">Pendiente:</span> <span className="font-semibold text-[var(--color-warning)]">{fmtCurrency(totals.pending)}</span></span>
          <span><span className="text-[var(--color-muted)]">Pagado:</span> <span className="font-semibold text-[var(--color-success)]">{fmtCurrency(totals.paid)}</span></span>
          <span><span className="text-[var(--color-muted)]">Total:</span> <span className="font-semibold">{fmtCurrency(totals.total)}</span></span>
          {totals.cashOwed > 0 && (
            <span title="Efectivo de nóminas cuyas transferencias ya se pagaron. Es la deuda que hay que entregar en mano.">
              <span className="text-[var(--color-muted)]">💵 Debiendo:</span>{" "}
              <span className="font-semibold text-[var(--color-warning)]">{fmtCurrency(totals.cashOwed)}</span>
            </span>
          )}
        </div>
      </div>

    {isMobile ? (
      <>
      <div className="flex-1 space-y-2 overflow-auto">
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--color-border)] py-8 text-center text-sm text-[var(--color-muted)]">
            Ninguna nómina coincide con el filtro.
          </div>
        ) : (
          paged.map((p) => {
            const { primary, menu } = actionsOf(p);
            return (
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpen(p)}
                onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && onOpen(p)}
                className="cursor-pointer rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-sm active:bg-[var(--color-surface-2)]"
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-[var(--color-accent)] [overflow-wrap:anywhere]">{p.name}</span>
                      {p.id === publishedPayrollId && <PortalBadge />}
                    </div>
                    <div className="mt-0.5 text-xs text-[var(--color-muted)]">
                      {fmtDate(p.createdAt)} · {p.workerCount || (p.items?.length ?? 0)} trab.
                    </div>
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>
                    <RowMenu items={menu} />
                  </div>
                </div>
                <div className="mt-2 flex items-end justify-between gap-2">
                  <PayStatePill p={p} />
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">Total</div>
                    <div className="text-base font-semibold tabular-nums">{fmtCurrency(p.total || 0)}</div>
                  </div>
                </div>
                <div className="mt-2 flex justify-between gap-2 border-t border-[var(--color-border)] pt-2 text-xs tabular-nums text-[var(--color-muted)]">
                  <span>🏦 {fmtCurrency(p.bankTotal || 0)} · {p.bankCount || 0}</span>
                  <span>💵 {fmtCurrency(p.cashTotal || 0)} · {p.cashCount || 0}</span>
                </div>
                {primary && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      primary.onClick();
                    }}
                    title={primary.title}
                    className="mt-2 min-h-10 w-full rounded-md border border-[var(--color-accent)] text-sm font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]"
                  >
                    {primary.label}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
      {pager}
      </>
    ) : (
    <>
    <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-[var(--color-surface-2)] text-left">
          <tr className="whitespace-nowrap">
            <th className="px-3 py-2">Nombre</th>
            <th className="px-3 py-2">Estado</th>
            <th className="px-3 py-2 text-right">Trab.</th>
            <th className="px-3 py-2 text-right">🏦 Banco</th>
            <th className="px-3 py-2 text-right">💵 Efectivo</th>
            <th className="px-3 py-2 text-right">Total</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <tr>
              <td colSpan={7} className="px-3 py-6 text-center text-[var(--color-muted)]">
                Ninguna nómina coincide con el filtro.
              </td>
            </tr>
          )}
          {paged.map((p) => {
            const { primary, menu } = actionsOf(p);
            return (
              <tr
                key={p.id}
                onClick={() => onOpen(p)}
                className="cursor-pointer border-t border-[var(--color-border)] hover:bg-[var(--color-surface-2)]"
              >
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpen(p);
                      }}
                      className="text-left font-medium text-[var(--color-accent)] hover:underline"
                    >
                      {p.name}
                    </button>
                    {p.id === publishedPayrollId && <PortalBadge />}
                  </div>
                  <div className="text-xs text-[var(--color-muted)]">{fmtDate(p.createdAt)}</div>
                </td>
                <td className="px-3 py-2">
                  <PayStatePill p={p} showDates={false} />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{p.workerCount || (p.items?.length ?? 0)}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums">
                  {fmtCurrency(p.bankTotal || 0)}
                  <div className="text-[10px] text-[var(--color-muted)]">{p.bankCount || 0} pers.</div>
                </td>
                <td className="px-3 py-2 text-right text-xs tabular-nums">
                  {fmtCurrency(p.cashTotal || 0)}
                  <div className="text-[10px] text-[var(--color-muted)]">{p.cashCount || 0} pers.</div>
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmtCurrency(p.total || 0)}</td>
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-2">
                    <PaymentDatesLine p={p} />
                    {primary && (
                      <button
                        type="button"
                        onClick={primary.onClick}
                        title={primary.title}
                        className="whitespace-nowrap rounded-md border border-[var(--color-accent)] px-2.5 py-1 text-xs font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]"
                      >
                        {primary.label}
                      </button>
                    )}
                    <RowMenu items={menu} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    {pager}
    </>
    )}
    </div>
  );
}
