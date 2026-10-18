import { bankName, accountTypeLabel } from "../../utils/banks";
import Modal from "../../components/Modal";
import { fmtCurrency } from "../../utils/format";
import { fmtDayShortEs } from "./helpers";

const formatProfileValue = (field, value) => {
  if (field === "bankCode") return bankName(value);
  if (field === "accountType") return accountTypeLabel(value);
  const s = String(value ?? "").trim();
  return s || "—";
};

// Modal de revisión del recálculo — muestra montos/trabajadores/datos que
// cambiaron desde que se generó la nómina, antes de escribir nada.
export function RecalcModal({ preview, busy, onClose, onConfirm }) {
  if (!preview) return null;
  const { amountChanges, profileChanges, advanceChanges, newWorkers, leavingWorkers = [], removalLines = [], releasedCount = 0, cycleChanges = [] } = preview;
  const fmtRange = ([first, last]) =>
    first ? (last && last !== first ? `${fmtDayShortEs(first)} → ${fmtDayShortEs(last)}` : fmtDayShortEs(first)) : "sin período";
  const fmtCycleValue = (field, value) => (field === "period" ? fmtRange(value) : value || "—");
  return (
    <Modal
      open={!!preview}
      onClose={onClose}
      title={removalLines.length ? "Sacar de la nómina y recalcular" : "Recalcular nómina"}
      size="lg"
      footer={
        <>
          <button onClick={onClose} disabled={busy} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm disabled:opacity-60">
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] disabled:opacity-50"
          >
            {busy ? "Aplicando..." : "Aplicar cambios"}
          </button>
        </>
      }
    >
      <div className="max-h-[60vh] space-y-4 overflow-y-auto text-sm">
        {removalLines.length > 0 && (
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">Se saca de la nómina</h4>
            <ul className="space-y-0.5 rounded-md border border-[var(--color-danger)] bg-[var(--color-danger-soft)] px-2.5 py-1.5 text-xs">
              {removalLines.map((line) => (
                <li key={line}>✕ {line}</li>
              ))}
            </ul>
            {releasedCount > 0 && (
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                {releasedCount} jornada(s) vuelven a quedar pendientes para otra nómina.
              </p>
            )}
          </div>
        )}

        {leavingWorkers.length > 0 && (
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
              Salen de la nómina ({leavingWorkers.length})
            </h4>
            <p className="mb-1.5 text-xs text-[var(--color-muted)]">
              Se quedan sin producción en esta nómina. Sus anticipos vuelven a quedar pendientes para la próxima.
            </p>
            <div className="overflow-x-auto rounded-md border border-[var(--color-border)]">
              <table className="w-full text-xs">
                <thead className="bg-[var(--color-surface-2)] text-left">
                  <tr>
                    <th className="px-2 py-1.5">Trabajador</th>
                    <th className="px-2 py-1.5 text-right">Neto antes</th>
                    <th className="px-2 py-1.5 text-right">Anticipo que vuelve</th>
                  </tr>
                </thead>
                <tbody>
                  {leavingWorkers.map((w) => (
                    <tr key={w.key} className="border-t border-[var(--color-border)]">
                      <td className="px-2 py-1.5">{w.name}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmtCurrency(w.oldNet)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{w.liberado > 0 ? fmtCurrency(w.liberado) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {amountChanges.length > 0 && (
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
              Montos actualizados ({amountChanges.length})
            </h4>
            <div className="overflow-x-auto rounded-md border border-[var(--color-border)]">
              <table className="w-full text-xs">
                <thead className="bg-[var(--color-surface-2)] text-left">
                  <tr>
                    <th className="px-2 py-1.5">Trabajador</th>
                    <th className="px-2 py-1.5 text-right">Bruto antes</th>
                    <th className="px-2 py-1.5 text-right">Bruto ahora</th>
                    <th className="px-2 py-1.5 text-right">Neto antes</th>
                    <th className="px-2 py-1.5 text-right">Neto ahora</th>
                  </tr>
                </thead>
                <tbody>
                  {amountChanges.map((c) => (
                    <tr key={c.key} className="border-t border-[var(--color-border)] align-top">
                      <td className="px-2 py-1.5">
                        {c.name}
                        {c.devuelto > 0 && (
                          <div className="mt-0.5 text-[10px] text-[var(--color-warning)]">
                            ↩ {fmtCurrency(c.devuelto)} del anticipo ya no alcanzan a cubrirse y vuelven a quedar pendientes.
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmtCurrency(c.oldGross)}</td>
                      <td className={`px-2 py-1.5 text-right tabular-nums font-medium ${c.newGross < c.oldGross ? "text-[var(--color-danger)]" : c.newGross > c.oldGross ? "text-[var(--color-success)]" : ""}`}>
                        {fmtCurrency(c.newGross)}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmtCurrency(c.oldNet)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-medium">{fmtCurrency(c.newNet)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {newWorkers.length > 0 && (
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
              Trabajadores nuevos ({newWorkers.length})
            </h4>
            <div className="overflow-x-auto rounded-md border border-[var(--color-border)]">
              <table className="w-full text-xs">
                <thead className="bg-[var(--color-surface-2)] text-left">
                  <tr>
                    <th className="px-2 py-1.5">Trabajador</th>
                    <th className="px-2 py-1.5 text-right">Bruto</th>
                    <th className="px-2 py-1.5 text-right">Neto</th>
                  </tr>
                </thead>
                <tbody>
                  {newWorkers.map((w) => (
                    <tr key={w.key} className="border-t border-[var(--color-border)]">
                      <td className="px-2 py-1.5">{w.name}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmtCurrency(w.gross)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-medium">{fmtCurrency(w.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {advanceChanges.length > 0 && (
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
              Anticipos/bonos nuevos aplicados ({advanceChanges.length})
            </h4>
            <div className="overflow-x-auto rounded-md border border-[var(--color-border)]">
              <table className="w-full text-xs">
                <thead className="bg-[var(--color-surface-2)] text-left">
                  <tr>
                    <th className="px-2 py-1.5">Trabajador</th>
                    <th className="px-2 py-1.5 text-right">Anticipo nuevo</th>
                    <th className="px-2 py-1.5 text-right">Bono nuevo</th>
                    <th className="px-2 py-1.5 text-right">Neto antes</th>
                    <th className="px-2 py-1.5 text-right">Neto ahora</th>
                  </tr>
                </thead>
                <tbody>
                  {advanceChanges.map((c) => (
                    <tr key={c.key} className="border-t border-[var(--color-border)]">
                      <td className="px-2 py-1.5">{c.name}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{c.addedAnticipoTotal > 0 ? `− ${fmtCurrency(c.addedAnticipoTotal)}` : "—"}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{c.addedBonoTotal > 0 ? `+ ${fmtCurrency(c.addedBonoTotal)}` : "—"}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmtCurrency(c.oldNet)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-medium">{fmtCurrency(c.newNet)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {profileChanges.length > 0 && (
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
              Datos actualizados ({profileChanges.length})
            </h4>
            <div className="space-y-1.5">
              {profileChanges.map((p) => (
                <div key={p.key} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1.5 text-xs">
                  <div className="font-medium">{p.name}</div>
                  {p.fields.map((f) => (
                    <div key={f.field} className="text-[var(--color-muted)]">
                      {f.label}: {formatProfileValue(f.field, f.old)} → <span className="text-[var(--color-fg)]">{formatProfileValue(f.field, f.new)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {cycleChanges.length > 0 && (
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
              Ciclos actualizados ({cycleChanges.length})
            </h4>
            <p className="mb-1.5 text-xs text-[var(--color-muted)]">
              Los nombres vigentes del ciclo, la faena y la subfaena, y el período: del primer al último día que la nómina paga en cada ciclo.
            </p>
            <div className="space-y-1.5">
              {cycleChanges.map((c) => (
                <div key={c.cycleId} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1.5 text-xs">
                  <div className="font-medium break-words">{c.label}</div>
                  {c.fields.map((f) => (
                    <div key={f.field} className="break-words text-[var(--color-muted)]">
                      {f.label}: {fmtCycleValue(f.field, f.old)} pasa a{" "}
                      <span className="font-medium text-[var(--color-text)]">{fmtCycleValue(f.field, f.new)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
