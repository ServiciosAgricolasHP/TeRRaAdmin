import { useMemo, useState, useRef } from "react";
import { captureFullWidthBlob } from "../../utils/imageCapture";
import { useToast } from "../../contexts/ToastContext";
import Modal from "../../components/Modal";
import { DEFAULT_AVAILABLE, estimateCashBreakdown, isBill, CASH_DENOMINATIONS } from "../../utils/cashBreakdown";
import { fmtCurrency } from "../../utils/format";

// Modal de estimación de efectivo: cuántos billetes y monedas de cada
// denominación hacen falta, usando solo los que se marcan como disponibles
// (por defecto `DEFAULT_AVAILABLE`). Cada monto se arma con la menor cantidad
// de piezas y, si no calza justo, se redondea hacia arriba (ver
// `estimateCashBreakdown`). El resumen y la lista por trabajador se copian
// como texto o como imagen, y las dos dicen de qué nómina son y cuánto
// efectivo pendiente de otras incluyen.
export function CashEstimationModal({ cashItems, payrollName, pendingExtra = [], onClose }) {
  const toast = useToast();
  // El efectivo pendiente de otras nóminas se entrega aparte, pero la plata se
  // saca del banco de una sola vez — así que el desglose de billetes y sencillo
  // tiene que poder cubrir todo junto. Cada persona pendiente lleva el nombre
  // de su nómina en `pendingFrom`.
  const extraItems = useMemo(
    () => pendingExtra.flatMap((x) => x.items.map((it) => ({ ...it, pendingFrom: x.name }))),
    [pendingExtra],
  );
  const extraTotal = useMemo(
    () => extraItems.reduce((s, it) => s + (Number(it.amount) || 0), 0),
    [extraItems],
  );
  const ownTotal = useMemo(() => cashItems.reduce((s, it) => s + (Number(it.amount) || 0), 0), [cashItems]);
  const [includePending, setIncludePending] = useState(true);
  const usePending = includePending && extraItems.length > 0;
  const allItems = useMemo(
    () => (usePending ? [...cashItems, ...extraItems] : cashItems),
    [cashItems, extraItems, usePending],
  );
  const [available, setAvailable] = useState(() => new Set(DEFAULT_AVAILABLE));
  const toggleAvailable = (value) =>
    setAvailable((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  const est = useMemo(() => estimateCashBreakdown(allItems, [...available]), [allItems, available]);
  const denominations = [...est.counts.keys()];
  const [showDetail, setShowDetail] = useState(false);
  const [busy, setBusy] = useState("");
  const captureRef = useRef(null);
  const listRef = useRef(null);
  const diff = est.totalNeeded - est.totalOriginal;
  const totalPieces = [...est.counts.values()].reduce((s, v) => s + v, 0);

  // Las personas del desglose (`perWorker` va en el orden de `allItems`),
  // agrupadas: primero las de esta nómina por líder y después las de cada
  // nómina con efectivo pendiente.
  const workerGroups = useMemo(() => {
    const groups = new Map();
    est.perWorker.forEach((w, i) => {
      const from = allItems[i]?.pendingFrom || "";
      const key = from ? `pending:${from}` : `own:${w.leader || ""}`;
      if (!groups.has(key)) {
        groups.set(key, { key, label: from ? `Pendiente de ${from}` : w.leader || "Sin grupo", pending: !!from, rows: [] });
      }
      groups.get(key).rows.push(w);
    });
    const list = [...groups.values()];
    for (const g of list) g.rows.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "es"));
    return list.sort((a, b) => Number(a.pending) - Number(b.pending) || a.label.localeCompare(b.label, "es"));
  }, [est, allItems]);

  const pendingNote = usePending
    ? `Incluye ${fmtCurrency(extraTotal)} de efectivo pendiente de otras nóminas (${pendingExtra.map((x) => x.name).join(", ")}), que se entrega aparte.`
    : "";
  // "3 × $10.000 + 1 × $5.000", de mayor a menor.
  const piecesText = (breakdown) =>
    denominations.filter((d) => breakdown[d]).map((d) => `${breakdown[d]} × ${fmtCurrency(d)}`).join(" + ");

  // Desglose principal en texto plano, para pegar en un chat o una nota.
  // padStart alinea las cantidades en monospace.
  const buildSummaryText = () => {
    const lines = [];
    lines.push(`💵 Estimación de efectivo — ${payrollName}`);
    lines.push(`${allItems.length} trabajador(es) · Total: ${fmtCurrency(est.totalNeeded)}`);
    if (usePending) {
      lines.push(`Esta nómina: ${fmtCurrency(ownTotal)} · Pendiente de otras nóminas: ${fmtCurrency(extraTotal)}`);
      lines.push(pendingNote);
    }
    if (diff > 0) {
      lines.push(`(Original ${fmtCurrency(est.totalOriginal)} + redondeo ${fmtCurrency(diff)})`);
    }
    lines.push("");
    lines.push("Billetes y monedas:");
    for (const d of denominations) {
      const n = est.counts.get(d) || 0;
      if (n === 0) continue;
      const denomStr = fmtCurrency(d).padStart(9, " ");
      const qtyStr = String(n).padStart(4, " ");
      const subStr = fmtCurrency(n * d).padStart(11, " ");
      lines.push(`  ${denomStr} ${isBill(d) ? "billete" : " moneda"} × ${qtyStr} = ${subStr}`);
    }
    lines.push("");
    lines.push(`Total: ${totalPieces} billetes/monedas · ${fmtCurrency(est.totalNeeded)}`);
    return lines.join("\n");
  };

  // La lista por trabajador en texto plano: cuánto recibe cada uno y con qué
  // billetes y monedas, por grupo.
  const buildListText = () => {
    const lines = [`💵 Efectivo por trabajador — ${payrollName}`];
    if (usePending) lines.push(pendingNote);
    for (const g of workerGroups) {
      lines.push("", g.label);
      for (const w of g.rows) {
        const amount = w.delta > 0 ? `${fmtCurrency(w.rounded)} (de ${fmtCurrency(w.original)})` : fmtCurrency(w.rounded);
        lines.push(`  ${w.name}: ${amount} → ${piecesText(w.breakdown) || "sin efectivo"}`);
      }
    }
    lines.push("", `Total: ${est.perWorker.length} trabajador(es) · ${fmtCurrency(est.totalNeeded)}`);
    lines.push(`Billetes y monedas: ${piecesText(Object.fromEntries(est.counts))}`);
    return lines.join("\n");
  };

  const copyText = async (kind, text) => {
    setBusy(kind);
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Texto copiado");
    } catch (err) {
      toast.error("Error al copiar: " + (err.message || err));
    } finally {
      setBusy("");
    }
  };

  // `prepare` corre antes de capturar (por ejemplo, desplegar la lista).
  const copyImage = async (kind, ref, prepare) => {
    setBusy(kind);
    try {
      if (prepare) await prepare();
      if (!ref.current) throw new Error("No se pudo generar la imagen");
      const blob = await captureFullWidthBlob(ref.current);
      if (!blob) throw new Error("No se pudo generar la imagen");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast.success("Imagen copiada");
    } catch (err) {
      toast.error("Error al copiar: " + (err.message || err));
    } finally {
      setBusy("");
    }
  };
  // La lista se despliega antes de capturarla; dos cuadros dan tiempo a que
  // se pinte.
  const showListForCapture = async () => {
    if (showDetail) return;
    setShowDetail(true);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  };

  const copyBtn = "rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-50";
  const nothingAvailable = available.size === 0;

  return (
    <Modal open onClose={onClose} title="💵 Estimación de efectivo" size="lg">
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-[var(--color-muted)]">
            Cada monto se arma con los billetes y monedas disponibles y, si no calza justo, se redondea hacia arriba.
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => copyText("text", buildSummaryText())}
              disabled={busy === "text" || nothingAvailable}
              className={copyBtn}
              title="Copiar el resumen como texto plano (para pegar en chat o notas)"
            >
              {busy === "text" ? "..." : "📋 Texto"}
            </button>
            <button
              onClick={() => copyImage("image", captureRef)}
              disabled={busy === "image" || nothingAvailable}
              className={copyBtn}
              title="Copiar el resumen como imagen al portapapeles"
            >
              {busy === "image" ? "..." : "📋 Imagen"}
            </button>
          </div>
        </div>
        {extraItems.length > 0 && (
          <label
            className="flex cursor-pointer items-start gap-2 rounded-md border border-dashed border-[var(--color-warning)] bg-[var(--color-warning-soft)]/40 px-3 py-2 text-xs"
            title="Se entrega en sobres aparte, pero la plata se saca del banco de una sola vez."
          >
            <input
              type="checkbox"
              checked={includePending}
              onChange={(e) => setIncludePending(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
            />
            <span>
              <span className="font-medium">
                Incluir efectivo pendiente de nóminas anteriores ({fmtCurrency(extraTotal)})
              </span>
              <span className="mt-0.5 block text-[var(--color-muted)]">
                {extraItems.length} persona(s) en {pendingExtra.length} nómina(s):{" "}
                {pendingExtra.map((x) => x.name).join(" · ")}. Se entrega aparte, con su propio
                sobre — se suma acá solo para que el conteo de billetes y sencillo cuadre.
              </span>
            </span>
          </label>
        )}
        <div className="space-y-1.5 rounded-md border border-[var(--color-border)] px-3 py-2">
          <div className="text-xs font-semibold text-[var(--color-muted)]">Disponibles para pagar</div>
          {[["bill", "Billetes"], ["coin", "Monedas"]].map(([kind, label]) => (
            <div key={kind} className="flex flex-wrap items-center gap-1.5">
              <span className="w-full text-[11px] text-[var(--color-muted)] sm:w-16">{label}</span>
              {CASH_DENOMINATIONS.filter((d) => d.kind === kind).map(({ value }) => {
                const on = available.has(value);
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleAvailable(value)}
                    title={on ? "Disponible: click para no usarlo" : "No disponible: click para usarlo"}
                    className={`min-h-8 rounded-full border px-2.5 py-1 text-xs tabular-nums ${
                      on
                        ? "border-[var(--color-accent)] bg-[var(--color-accent)] font-medium text-[var(--color-accent-fg)]"
                        : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]"
                    }`}
                  >
                    {on ? "✓ " : ""}{fmtCurrency(value)}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        {nothingAvailable ? (
          <p className="rounded-md border border-dashed border-[var(--color-warning)] px-3 py-3 text-center text-xs text-[var(--color-warning)]">
            Marca al menos un billete o una moneda disponible.
          </p>
        ) : (
          <>
            {/* Lo que sale en la imagen del resumen. */}
            <div ref={captureRef} className="space-y-4 p-1" style={{ background: "var(--color-surface)" }}>
              <div>
                <div className="font-semibold">💵 Efectivo — {payrollName}</div>
                <div className="text-[11px] text-[var(--color-muted)]">{allItems.length} trabajador(es) en efectivo</div>
              </div>

              <div className="rounded-lg border border-[var(--color-accent)] bg-[var(--color-accent-soft)] p-3">
                <div className="text-xs text-[var(--color-muted)]">Total efectivo a llevar</div>
                <div className="text-2xl font-bold tabular-nums text-[var(--color-accent)]">
                  {fmtCurrency(est.totalNeeded)}
                </div>
                {usePending && (
                  <div className="mt-1 text-[11px] tabular-nums">
                    Esta nómina: <b>{fmtCurrency(ownTotal)}</b> · Pendiente de otras nóminas: <b>{fmtCurrency(extraTotal)}</b>
                  </div>
                )}
                {diff > 0 && (
                  <div className="mt-1 text-[11px] text-[var(--color-muted)]">
                    Original: {fmtCurrency(est.totalOriginal)} · Redondeo hacia arriba: +{fmtCurrency(diff)}
                  </div>
                )}
              </div>

              {usePending && (
                <div className="rounded-md border border-dashed border-[var(--color-warning)] bg-[var(--color-warning-soft)] px-3 py-2 text-[11px]">
                  <div className="font-semibold">Incluye efectivo pendiente de otras nóminas, que se entrega aparte:</div>
                  {pendingExtra.map((x) => (
                    <div key={x.payrollId} className="tabular-nums">
                      {x.name}: {fmtCurrency(x.amount)} · {x.items.length} persona(s)
                    </div>
                  ))}
                </div>
              )}

              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                  Billetes y monedas necesarios
                </h4>
                <div className="overflow-hidden rounded-md border border-[var(--color-border)]">
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--color-surface-2)] text-left text-[var(--color-muted)]">
                      <tr>
                        <th className="px-3 py-1.5">Denominación</th>
                        <th className="px-3 py-1.5 text-right">Cantidad</th>
                        <th className="px-3 py-1.5 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {denominations.map((d) => {
                        const n = est.counts.get(d) || 0;
                        return (
                          <tr key={d} className="border-t border-[var(--color-border)]">
                            <td className="px-3 py-1.5">
                              <span className="font-medium">{fmtCurrency(d)}</span>
                              <span className="ml-2 text-[10px] text-[var(--color-muted)]">
                                {isBill(d) ? "billete" : "moneda"}
                              </span>
                            </td>
                            <td className={`px-3 py-1.5 text-right tabular-nums ${n === 0 ? "text-[var(--color-muted)]" : "font-semibold"}`}>
                              {n}
                            </td>
                            <td className={`px-3 py-1.5 text-right tabular-nums ${n === 0 ? "text-[var(--color-muted)]" : ""}`}>
                              {fmtCurrency(n * d)}
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="border-t-2 border-[var(--color-border)] bg-[var(--color-surface-2)]/60 font-semibold">
                        <td className="px-3 py-1.5">Total</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{totalPieces}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-[var(--color-accent)]">
                          {fmtCurrency(est.totalNeeded)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Lista por trabajador: plegable y con su propia copia, para que la
                imagen del resumen no se alargue con ella. */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setShowDetail((v) => !v)}
                  aria-expanded={showDetail}
                  className="flex items-center gap-2 text-left text-xs font-semibold text-[var(--color-muted)] hover:text-[var(--color-accent)]"
                >
                  <span>{showDetail ? "▾" : "▸"}</span>
                  <span>Por trabajador ({est.perWorker.length})</span>
                </button>
                <div className="flex gap-1">
                  <button
                    onClick={() => copyText("listText", buildListText())}
                    disabled={busy === "listText"}
                    className={copyBtn}
                    title="Copiar la lista por trabajador, con sus billetes y monedas, como texto"
                  >
                    {busy === "listText" ? "..." : "📋 Lista"}
                  </button>
                  <button
                    onClick={() => copyImage("listImage", listRef, showListForCapture)}
                    disabled={busy === "listImage"}
                    className={copyBtn}
                    title="Copiar la lista por trabajador como imagen"
                  >
                    {busy === "listImage" ? "..." : "📋 Imagen de la lista"}
                  </button>
                </div>
              </div>
              {showDetail && (
                <div ref={listRef} className="mt-2 space-y-2 p-1" style={{ background: "var(--color-surface)" }}>
                  <div>
                    <div className="font-semibold">💵 Efectivo por trabajador — {payrollName}</div>
                    {usePending && <div className="text-[11px] text-[var(--color-warning)]">{pendingNote}</div>}
                  </div>
                  <div className="overflow-x-auto rounded-md border border-[var(--color-border)]">
                    <table className="w-full text-xs">
                      <thead className="bg-[var(--color-surface-2)] text-left text-[var(--color-muted)]">
                        <tr>
                          <th className="px-2 py-1">Nombre</th>
                          <th className="px-2 py-1 text-right">Monto</th>
                          {denominations.map((d) => (
                            <th key={d} className="px-2 py-1 text-right">{fmtCurrency(d)}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {workerGroups.map((g) => [
                          <tr key={g.key} className="border-t border-[var(--color-border)] bg-[var(--color-surface-2)]/60">
                            <td
                              colSpan={2 + denominations.length}
                              className={`px-2 py-1 text-[11px] font-semibold ${g.pending ? "text-[var(--color-warning)]" : ""}`}
                            >
                              {g.label} · {g.rows.length}
                            </td>
                          </tr>,
                          ...g.rows.map((w, i) => (
                            <tr key={`${g.key}|${w.rut}|${i}`} className="border-t border-[var(--color-border)]">
                              <td className="px-2 py-1 font-medium">{w.name}</td>
                              <td className="px-2 py-1 text-right tabular-nums font-semibold">
                                {fmtCurrency(w.rounded)}
                                {w.delta > 0 && (
                                  <div className="text-[9px] font-normal text-[var(--color-muted)]">de {fmtCurrency(w.original)}</div>
                                )}
                              </td>
                              {denominations.map((d) => (
                                <td key={d} className="px-2 py-1 text-right tabular-nums">
                                  {w.breakdown[d] || ""}
                                </td>
                              ))}
                            </tr>
                          )),
                        ])}
                        <tr className="border-t-2 border-[var(--color-border)] bg-[var(--color-surface-2)]/60 font-semibold">
                          <td className="px-2 py-1">Total · {est.perWorker.length}</td>
                          <td className="px-2 py-1 text-right tabular-nums">{fmtCurrency(est.totalNeeded)}</td>
                          {denominations.map((d) => (
                            <td key={d} className="px-2 py-1 text-right tabular-nums">
                              {est.counts.get(d) || ""}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
