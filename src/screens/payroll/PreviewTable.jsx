import { useState, useMemo } from "react";
import { formatRutForDisplay } from "../../utils/rutUtils";
import { isCashBank, CASH_BANK_CODE, bankName } from "../../utils/banks";
import { normalizeLeader } from "../../utils/payroll";
import { matchesSearchQuery } from "../../utils/textSearch";
import { fmtCurrency } from "../../utils/format";
import { previewEditCaps } from "../../utils/payrollPreview";
import { accountTypeShort } from "./helpers";

export function PreviewTable({
  rutOf,
  items,
  bankItems,
  cashGroups,
  updatePreview,
  bulkUpdate,
  payrollName,
  setPayrollName,
  payrollClassification,
  setPayrollClassification,
  totalSelected,
  countSelected,
  cycleOptions = [],
  onBack,
  onGenerate,
  busy,
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all"); // all | bank | cash | missing | suspicious | leader:<name>
  const [cycleFilter, setCycleFilter] = useState("all");

  const bankTotal = bankItems.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const cashTotal = cashGroups.reduce((s, g) => s + g.total, 0);
  const bankCount = bankItems.length;
  // Cuánta gente y en cuántos sobres va el efectivo: se arma un sobre por
  // líder de grupo, así que el conteo de grupos importa tanto como el monto.
  const cashCount = cashGroups.reduce((s, g) => s + g.items.length, 0);
  const totalAdvance = items.reduce((s, p) => s + (p.include ? Number(p.advance) || 0 : 0), 0);

  const leaders = useMemo(() => {
    const set = new Set();
    for (const p of items) {
      const l = normalizeLeader(p.groupLeader);
      if (l) set.add(l);
    }
    return [...set].sort();
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = search.trim();
    return items.filter((p) => {
      if (filter === "bank" && isCashBank(p.bankCode)) return false;
      if (filter === "cash" && !isCashBank(p.bankCode)) return false;
      if (filter === "missing" && !p._missing) return false;
      if (filter === "suspicious" && !p._accountIssue) return false;
      if (filter.startsWith("leader:") && normalizeLeader(p.groupLeader) !== filter.slice(7)) return false;
      if (cycleFilter !== "all" && !((p.byCycle?.[cycleFilter] || 0) > 0)) return false;
      if (q && !matchesSearchQuery(p.name, q) && !p.rut.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [items, search, filter, cycleFilter]);

  const toggleCash = (p) => {
    const newCode = isCashBank(p.bankCode) ? (p._origBank || "") : CASH_BANK_CODE;
    updatePreview(p.rut, {
      bankCode: newCode,
      _origBank: isCashBank(p.bankCode) ? p._origBank : p.bankCode,
    });
  };

  const matchPredicate = () => (p) => filteredItems.includes(p);
  const setIncludeAllVisible = (val) => bulkUpdate(matchPredicate(), { include: val });
  const setBankAllVisible = (cash) => {
    bulkUpdate(matchPredicate(), {});
    setPreviewItemsBulkBank(filteredItems, cash);
  };
  // Pasa cada item a efectivo o a banco con toggleCash, que guarda el banco
  // original en `_origBank`.
  const setPreviewItemsBulkBank = (list, cash) => {
    for (const p of list) {
      if (cash && !isCashBank(p.bankCode)) toggleCash(p);
      else if (!cash && isCashBank(p.bankCode)) toggleCash(p);
    }
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <button
          onClick={onBack}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)]"
        >
          ← Volver
        </button>
        <div className="flex flex-1 items-center gap-2">
          <label className="text-sm text-[var(--color-muted)]">Nombre:</label>
          <input
            value={payrollName}
            onChange={(e) => setPayrollName(e.target.value)}
            className="w-72 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
          />
          <label className="ml-2 text-sm text-[var(--color-muted)]">Tipo:</label>
          <select
            value={payrollClassification || "nomina"}
            onChange={(e) => setPayrollClassification(e.target.value)}
            title="Las diferencias son nóminas chicas de ajuste y se listan aparte"
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
          >
            <option value="nomina">Nómina</option>
            <option value="diferencia">Diferencia</option>
          </select>
        </div>
        <div className="flex flex-wrap items-stretch gap-2">
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-right">
            <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">Total</div>
            <div className="text-sm font-semibold tabular-nums">{fmtCurrency(totalSelected)}</div>
            <div className="text-[10px] tabular-nums text-[var(--color-muted)]">
              {countSelected} trab.
              {totalAdvance > 0 && (
                <span title="Anticipos descontados en esta nómina"> · ↩ {fmtCurrency(totalAdvance)}</span>
              )}
            </div>
          </div>
          <div
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-right"
            title="Va en el archivo del banco, por transferencia"
          >
            <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">🏦 Transferencia</div>
            <div className="text-sm font-semibold tabular-nums">{fmtCurrency(bankTotal)}</div>
            <div className="text-[10px] tabular-nums text-[var(--color-muted)]">{bankCount} trab.</div>
          </div>
          <div
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-right"
            title="Plata que hay que sacar en efectivo y repartir: un sobre por jefe de grupo"
          >
            <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">💵 Efectivo</div>
            <div className="text-sm font-semibold tabular-nums text-[var(--color-warning)]">{fmtCurrency(cashTotal)}</div>
            <div className="text-[10px] tabular-nums text-[var(--color-muted)]">
              {cashCount} trab. · {cashGroups.length} sobre{cashGroups.length === 1 ? "" : "s"}
            </div>
          </div>
        </div>
        <button
          onClick={onGenerate}
          disabled={busy || countSelected === 0}
          className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] disabled:opacity-50"
        >
          {busy ? "Generando..." : "Guardar nómina"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o RUT..."
          className="w-64 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
        >
          <option value="all">Todos ({items.length})</option>
          <option value="bank">🏦 Banco</option>
          <option value="cash">💵 Efectivo</option>
          <option value="missing">⚠ Datos faltantes</option>
          <option value="suspicious">⚠ Cuenta sospechosa</option>
          {leaders.map((l) => (
            <option key={l} value={`leader:${l}`}>👥 {l}</option>
          ))}
        </select>
        {cycleOptions.length > 1 && (
          <select
            value={cycleFilter}
            onChange={(e) => setCycleFilter(e.target.value)}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
            title="Filtra trabajadores que tienen producción en un ciclo específico"
          >
            <option value="all">📅 Todos los ciclos</option>
            {cycleOptions.map((c) => (
              <option key={c.id} value={c.id}>📅 {c.label}</option>
            ))}
          </select>
        )}
        <div className="ml-auto flex flex-wrap gap-1 text-xs">
          <span className="text-[var(--color-muted)]">{filteredItems.length} visibles:</span>
          <button
            onClick={() => setIncludeAllVisible(true)}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 hover:bg-[var(--color-accent-soft)]"
          >
            ✓ Incluir
          </button>
          <button
            onClick={() => setIncludeAllVisible(false)}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 hover:bg-[var(--color-accent-soft)]"
          >
            ✗ Excluir
          </button>
          <button
            onClick={() => setBankAllVisible(true)}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 hover:bg-[var(--color-accent-soft)]"
          >
            💵 → Efectivo
          </button>
          <button
            onClick={() => setBankAllVisible(false)}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 hover:bg-[var(--color-accent-soft)]"
          >
            🏦 → Banco
          </button>
        </div>
      </div>

      <div className="min-h-[240px] flex-1 overflow-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[var(--color-surface-2)] text-left">
            <tr>
              <th className="w-10 px-3 py-2"></th>
              <th className="px-3 py-2">RUT</th>
              <th className="px-3 py-2">Nombre</th>
              <th className="px-3 py-2">Líder</th>
              <th className="px-3 py-2">Banco / Cuenta</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2 text-right">Bruto</th>
              <th className="px-3 py-2 text-right">Anticipo</th>
              <th className="px-3 py-2 text-right">Bono</th>
              <th className="px-3 py-2 text-right">A pagar</th>
              <th className="px-3 py-2 text-center">Pago</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((p) => {
              const cash = isCashBank(p.bankCode);
              const caps = previewEditCaps(p);
              return (
                <tr
                  key={p.rut}
                  className={`border-t border-[var(--color-border)] ${
                    p._missing ? "bg-[var(--color-danger-soft)]" : cash ? "bg-[var(--color-accent-soft)]" : ""
                  }`}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={p.include}
                      onChange={(e) => updatePreview(p.rut, { include: e.target.checked })}
                    />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{formatRutForDisplay(rutOf(p.rut, p.workerId))}</td>
                  <td className="px-3 py-2">{p.name}</td>
                  <td className="px-3 py-2 text-xs text-[var(--color-muted)]">
                    {p.groupLeader || "—"}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {cash ? (
                      <span className="font-medium">Efectivo</span>
                    ) : p.bankCode ? (
                      <>
                        {bankName(p.bankCode)}
                        <span className={`ml-1 ${p._accountIssue ? "text-[var(--color-danger)]" : "text-[var(--color-muted)]"}`}>
                          · {p.accountNumber || "—"}
                        </span>
                        {p._accountIssue && (
                          <span title={p._accountIssue} className="ml-1 cursor-help text-[var(--color-danger)]">
                            ⚠
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-[var(--color-danger)]">— faltante</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">{cash ? "—" : accountTypeShort(p.accountType)}</td>
                  <td className="px-3 py-2 text-right text-xs text-[var(--color-muted)] tabular-nums">
                    {fmtCurrency(p.grossAmount || 0)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      value={p.advance || ""}
                      placeholder="0"
                      max={caps.advanceMax}
                      title={`Anticipo a descontar: hasta ${fmtCurrency(caps.advanceMax)}. Se puede bajar y el anticipo queda parcial.`}
                      onChange={(e) => updatePreview(p.rut, { advance: Number(e.target.value) || 0 })}
                      className="w-24 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-[var(--color-accent)]"
                    />
                    {Number(p.advance) > 0 && (
                      <input
                        value={p.advanceNote || ""}
                        onChange={(e) => updatePreview(p.rut, { advanceNote: e.target.value })}
                        placeholder="motivo..."
                        className="mt-1 block w-24 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-right text-[10px] text-[var(--color-muted)] outline-none focus:border-[var(--color-accent)]"
                      />
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      value={p.bonus || ""}
                      placeholder="0"
                      max={caps.bonusMax}
                      title={`Bono a sumar: hasta ${fmtCurrency(caps.bonusMax)}. Se puede bajar y el resto queda pendiente.`}
                      onChange={(e) => updatePreview(p.rut, { bonus: Number(e.target.value) || 0 })}
                      className={`w-24 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-[var(--color-accent)] ${Number(p.bonus) > 0 ? "text-[var(--color-success)]" : ""}`}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      value={p.amount || ""}
                      placeholder="0"
                      onChange={(e) => updatePreview(p.rut, { amount: Number(e.target.value) || 0 })}
                      className="w-28 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-right text-sm font-medium tabular-nums outline-none focus:border-[var(--color-accent)]"
                    />
                    {Number(p.amount) === 0 && Number(p.advance) > 0 && (
                      <div className="mt-0.5 text-[10px] font-normal text-[var(--color-warning)]" title="El anticipo cubrió todo el bruto. Igual se incluye en la nómina para marcar sus jornadas y el anticipo como aplicados, pero no se transfiere.">
                        ↩ liquidado por anticipo
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => toggleCash(p)}
                      title={cash ? "Cambiar a banco" : "Pagar en efectivo"}
                      className={`rounded-md border px-2 py-1 text-xs ${
                        cash
                          ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-fg)]"
                          : "border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-accent-soft)]"
                      }`}
                    >
                      {cash ? "💵 Efec." : "🏦 Banco"}
                    </button>
                  </td>
                </tr>
              );
            })}
            {filteredItems.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-6 text-center text-[var(--color-muted)]">
                  {items.length === 0
                    ? "No hay trabajadores con monto en lo elegido."
                    : "Ningún trabajador coincide con el filtro."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {cashGroups.length > 0 && (
        <div className="max-h-[32vh] shrink-0 overflow-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <div className="mb-2 text-sm font-semibold">💵 Efectivo agrupado por líder ({cashGroups.length})</div>
          <div className="space-y-2 text-sm">
            {cashGroups.map((g) => (
              <div key={g.leader} className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2">
                <div className="mb-1 flex items-center justify-between text-xs font-medium">
                  <span>{g.leader}</span>
                  <span>{fmtCurrency(g.total)} · {g.items.length} trab.</span>
                </div>
                <div className="text-xs text-[var(--color-muted)]">
                  {g.items.map((it) => `${it.name} (${fmtCurrency(it.amount)})`).join(" · ")}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
