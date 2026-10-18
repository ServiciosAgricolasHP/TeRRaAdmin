import { useState, useRef } from "react";
import { captureFullWidthDataUrl, captureFullWidthBlob } from "../../utils/imageCapture";
import Modal from "../../components/Modal";
import { tripsService, paymentsService } from "../../services/transportsService";
import { useToast } from "../../contexts/ToastContext";
import { fmtCurrency } from "../../utils/format";
import { PaymentDetailModal } from "./PaymentDetailModal";
import { PrintableFortnightTable } from "./PrintableFortnightTable";
import { PrintableSummary } from "./PrintableSummary";
import { paymentSplit } from "./fortnights";

export function FortnightDetailModal({
  fortnight, items, carriers = [], carriersById, faenaById, subfaenaById, cycleById, looseSummaries,
  onClose, onEditMeta, onDeleteFortnight, onAddSummaries, onRemoveSummary,
  onMarkFortnightPaid, onRevertFortnight, onMarkItemPaid, onRevertItem, onItemChanged,
}) {
  const toast = useToast();
  const [addingOpen, setAddingOpen] = useState(false);
  const [adding, setAdding] = useState(new Set());
  const printRef = useRef(null);
  // "Imprimir quincena + resúmenes": dibuja fuera de pantalla la tabla de la
  // quincena y un PrintableSummary por resumen, y abre la ventana de impresión
  // con su outerHTML.
  const summaryRefs = useRef([]);
  const [printItems, setPrintItems] = useState(null);
  const [busy, setBusy] = useState("");
  // Resumen abierto en detalle, para ver o editar sus vueltas sin salir de la
  // quincena.
  const [viewingPayment, setViewingPayment] = useState(null);
  const isPaid = fortnight.status === "paid";
  // Totales por estado: una quincena pendiente puede tener resúmenes ya
  // pagados uno por uno (botón "💰 Pagar") o con abonos; el pendiente se
  // muestra aparte. El reparto lo hace paymentSplit, el mismo del balance.
  const totalAll = items.reduce((s, it) => s + (Number(it.total) || 0), 0);
  const totalPaid = items.reduce((s, it) => s + paymentSplit(it).paid, 0);
  const totalPending = items.reduce((s, it) => s + paymentSplit(it).pending, 0);
  const paidCount = items.filter((it) => it.status === "paid").length;
  const pendingCount = items.length - paidCount;

  const onAddConfirm = async () => {
    await onAddSummaries([...adding]);
    setAdding(new Set());
    setAddingOpen(false);
  };

  const handleDownload = async () => {
    if (!printRef.current) return;
    setBusy("download");
    try {
      const dataUrl = await captureFullWidthDataUrl(printRef.current);
      const link = document.createElement("a");
      link.download = `quincena_${fortnight.name.replace(/[^\w-]+/g, "_")}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      toast.error("Error al generar imagen: " + (err.message || err));
    } finally {
      setBusy("");
    }
  };

  const handleCopy = async () => {
    if (!printRef.current) return;
    setBusy("copy");
    try {
      const blob = await captureFullWidthBlob(printRef.current);
      if (!blob) throw new Error("No se pudo generar la imagen");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast.success("Imagen copiada al portapapeles");
    } catch (err) {
      toast.error("Error al copiar: " + (err.message || err));
    } finally {
      setBusy("");
    }
  };

  const handlePrint = () => {
    if (!printRef.current) return;
    const html = printRef.current.outerHTML;
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) {
      toast.warning("Permite las ventanas emergentes para imprimir.");
      return;
    }
    win.document.write(`<!DOCTYPE html><html><head><title>Quincena ${fortnight.name}</title>
      <style>
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
        body { font-family: ui-sans-serif, system-ui, sans-serif; padding: 20px; color: #000; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #999; padding: 6px 8px; font-size: 12px; }
        thead th { background: #92d050 !important; text-align: left; }
        @media print { @page { size: landscape; margin: 12mm; } }
      </style>
    </head><body>${html}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 250);
  };

  // Imprime la tabla de la quincena y una hoja por resumen con el detalle de
  // sus vueltas. Las vueltas se leen al hacer click (tripsService.listAll) y
  // se filtran por los tripIds de cada resumen.
  const handlePrintAll = async () => {
    if (items.length === 0) {
      toast.warning("La quincena no tiene resúmenes para imprimir.");
      return;
    }
    setBusy("printAll");
    try {
      const allTrips = await tripsService.listAll();
      const tripById = new Map(allTrips.map((t) => [t.id, t]));
      const built = items.map((it) => {
        const carrier = carriersById.get(it.carrierId) || null;
        const myTrips = (it.tripIds || [])
          .map((id) => tripById.get(id))
          .filter(Boolean)
          .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
        const dates = myTrips.map((t) => t.date).filter(Boolean).sort();
        const periodLabel =
          it.periodFrom && it.periodTo
            ? `${it.periodFrom} → ${it.periodTo}`
            : dates.length
              ? `${dates[0]} → ${dates[dates.length - 1]}`
              : "—";
        return { payment: it, carrier, trips: myTrips, periodLabel };
      });
      summaryRefs.current = new Array(built.length).fill(null);
      setPrintItems(built);
      // Espera a que React dibuje los nodos fuera de pantalla.
      await new Promise((r) => setTimeout(r, 100));
      const headerHtml = printRef.current?.outerHTML || "";
      const summariesHtml = summaryRefs.current
        .filter(Boolean)
        .map((n) => `<div class="page">${n.outerHTML}</div>`)
        .join("");
      const win = window.open("", "_blank", "width=1000,height=800");
      if (!win) {
        toast.warning("Permite las ventanas emergentes para imprimir.");
        return;
      }
      win.document.write(`<!DOCTYPE html><html><head><title>Quincena ${fortnight.name} — completa</title>
        <style>
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; box-sizing: border-box; }
          body { font-family: ui-sans-serif, system-ui, sans-serif; color: #000; margin: 0; padding: 0; }
          .page { padding: 20px; page-break-after: always; }
          .page:last-child { page-break-after: auto; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #999; padding: 6px 8px; font-size: 12px; }
          thead th { background: #92d050 !important; text-align: left; }
          .month-tag { background: #e6c0e0 !important; padding: 2px 8px; font-weight: 600; display: inline-block; }
          tr.tot-row td, .tot-row td { background: #c6efce !important; font-weight: 700; }
          @media print { @page { size: landscape; margin: 12mm; } }
        </style>
      </head><body>
        <div class="page">${headerHtml}</div>
        ${summariesHtml}
        <script>window.onload = () => { window.focus(); window.print(); };</script>
      </body></html>`);
      win.document.close();
    } catch (err) {
      toast.error("Error al imprimir: " + (err?.message || err));
    } finally {
      setPrintItems(null);
      setBusy("");
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`📅 ${fortnight.name}`}
      size="xl"
      footer={
        <>
          <button onClick={onClose} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm">
            Cerrar
          </button>
          {!isPaid && (
            <>
              <button onClick={onEditMeta} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)]">
                ✏️ Editar
              </button>
              <button onClick={onDeleteFortnight} className="rounded-md border border-[var(--color-danger)] px-3 py-1.5 text-sm text-[var(--color-danger)]">
                Eliminar
              </button>
              <button onClick={onMarkFortnightPaid} className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]">
                💰 Marcar quincena pagada
              </button>
            </>
          )}
          {isPaid && (
            <button onClick={onRevertFortnight} className="rounded-md border border-[var(--color-warning)] px-3 py-1.5 text-sm text-[var(--color-warning)]">
              ↶ Revertir pago
            </button>
          )}
        </>
      }
    >
      <div className="mb-3 flex flex-wrap items-baseline gap-3 text-sm">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
          isPaid
            ? "bg-[var(--color-success-soft)] text-[var(--color-success)]"
            : "bg-[var(--color-warning-soft)] text-[var(--color-warning)]"
        }`}>
          {isPaid ? "Pagada" : "Pendiente"}
        </span>
        {(fortnight.periodFrom || fortnight.periodTo) && (
          <span className="text-[var(--color-muted)]">
            {fortnight.periodFrom || "?"} → {fortnight.periodTo || "?"}
          </span>
        )}
        <span className="ml-auto flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <span>
            <span className="text-[var(--color-muted)]">Total: </span>
            <span className="font-semibold tabular-nums">{fmtCurrency(totalAll)}</span>
          </span>
          {totalPending > 0 && !isPaid && (
            <span>
              <span className="text-[var(--color-muted)]">Pendiente: </span>
              <span className="font-semibold tabular-nums text-[var(--color-warning)]">{fmtCurrency(totalPending)}</span>
              {paidCount > 0 && (
                <span className="ml-1 text-[10px] text-[var(--color-muted)]">
                  ({paidCount} de {items.length} pagado{paidCount === 1 ? "" : "s"})
                </span>
              )}
            </span>
          )}
        </span>
      </div>
      {fortnight.notes && (
        <div className="mb-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm">
          {fortnight.notes}
        </div>
      )}

      {/* Tabla imprimible fuera de pantalla, para html-to-image y outerHTML.
          Con "Imprimir quincena + resúmenes" se suma un PrintableSummary por
          resumen (refs en summaryRefs). */}
      <div style={{ position: "absolute", left: -99999, top: 0, pointerEvents: "none" }} aria-hidden>
        <PrintableFortnightTable ref={printRef} fortnight={fortnight} items={items} carriersById={carriersById} />
        {printItems && printItems.map((it, i) => (
          <PrintableSummary
            key={it.payment.id}
            ref={(el) => { summaryRefs.current[i] = el; }}
            payment={it.payment}
            carrier={it.carrier}
            trips={it.trips}
            periodLabel={it.periodLabel}
            faenaById={faenaById}
            subfaenaById={subfaenaById}
            cycleById={cycleById}
          />
        ))}
      </div>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">Resúmenes ({items.length})</h4>
        <div className="flex flex-wrap gap-1">
          {items.length > 0 && (
            <>
              <button
                onClick={handleCopy}
                disabled={busy === "copy"}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
                title="Copiar tabla como imagen"
              >
                {busy === "copy" ? "Copiando..." : "📋 Copiar"}
              </button>
              <button
                onClick={handleDownload}
                disabled={busy === "download"}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
                title="Descargar tabla como PNG"
              >
                {busy === "download" ? "..." : "📥 PNG"}
              </button>
              <button
                onClick={handlePrint}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)]"
                title="Imprimir solo la tabla resumen de la quincena"
              >
                🖨 Imprimir
              </button>
              <button
                onClick={handlePrintAll}
                disabled={busy === "printAll"}
                className="rounded-md border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-2 py-1 text-xs font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-fg)] disabled:opacity-60"
                title="Imprimir el resumen de la quincena seguido del detalle de cada resumen (1 hoja por resumen)"
              >
                {busy === "printAll" ? "Cargando vueltas..." : "🖨 Imprimir quincena + resúmenes"}
              </button>
            </>
          )}
          {!isPaid && looseSummaries.length > 0 && (
            <button
              onClick={() => setAddingOpen((v) => !v)}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)]"
            >
              {addingOpen ? "▾" : "▸"} + Agregar resumen
            </button>
          )}
        </div>
      </div>

      {addingOpen && (
        <div className="mb-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2">
          <div className="mb-2 max-h-48 space-y-1 overflow-auto">
            {looseSummaries.map((s) => {
              const isSel = adding.has(s.id);
              const carrier = carriersById.get(s.carrierId);
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    setAdding((prev) => {
                      const n = new Set(prev);
                      if (n.has(s.id)) n.delete(s.id); else n.add(s.id);
                      return n;
                    });
                  }}
                  className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs ${
                    isSel ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]" : "border-[var(--color-border)] bg-[var(--color-surface)]"
                  }`}
                >
                  <input type="checkbox" checked={isSel} readOnly className="pointer-events-none" />
                  <span className="flex-1 truncate font-medium">{carrier?.alias || s.carrierId}</span>
                  <span className="tabular-nums">{fmtCurrency(s.total)}</span>
                </button>
              );
            })}
          </div>
          <button
            onClick={onAddConfirm}
            disabled={adding.size === 0}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1 text-xs font-medium text-[var(--color-accent-fg)] disabled:opacity-50"
          >
            Agregar {adding.size} a la quincena
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--color-border)] py-4 text-center text-xs text-[var(--color-muted)]">
          La quincena está vacía. Agrega resúmenes con el botón de arriba.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-[var(--color-border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-surface-2)] text-xs uppercase tracking-wide text-[var(--color-muted)]">
              <tr>
                <th className="px-2 py-2 text-left">#</th>
                <th className="px-2 py-2 text-left">Transportista</th>
                <th className="px-2 py-2 text-center">Vueltas</th>
                <th className="hidden px-2 py-2 text-left md:table-cell">Período</th>
                <th className="px-2 py-2 text-left">Estado</th>
                <th className="px-2 py-2 text-right">Total</th>
                {!isPaid && <th className="px-2 py-2 text-right">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => {
                const carrier = carriersById.get(it.carrierId);
                const itemPaid = it.status === "paid";
                const itemPeriod = (it.periodFrom || it.periodTo) ? `${it.periodFrom || "?"} → ${it.periodTo || "?"}` : "—";
                return (
                  <tr
                    key={it.id}
                    className="cursor-pointer border-t border-[var(--color-border)] hover:bg-[var(--color-accent-soft)]"
                    onClick={() => setViewingPayment(it)}
                    title="Click para ver el detalle del resumen (vueltas)"
                  >
                    <td className="px-2 py-2 text-[var(--color-muted)] tabular-nums">{i + 1}</td>
                    <td className="px-2 py-2 font-medium">{carrier?.alias || it.carrierId}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{(it.tripIds || []).length}</td>
                    <td className="hidden px-2 py-2 text-xs text-[var(--color-muted)] md:table-cell">{itemPeriod}</td>
                    <td className="px-2 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        itemPaid ? "bg-[var(--color-success-soft)] text-[var(--color-success)]" : "bg-[var(--color-warning-soft)] text-[var(--color-warning)]"
                      }`}>
                        {itemPaid ? "Pagado" : "Pendiente"}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right font-semibold tabular-nums">{fmtCurrency(it.total)}</td>
                    {!isPaid && (
                      <td className="px-2 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => setViewingPayment(it)}
                            title="Ver detalle del resumen"
                            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-[10px] hover:bg-[var(--color-accent-soft)]"
                          >
                            👁
                          </button>
                          {!itemPaid && (
                            <>
                              <button
                                onClick={() => onMarkItemPaid(it)}
                                className="rounded-md bg-[var(--color-accent)] px-2 py-1 text-[10px] font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]"
                              >
                                💰 Pagar
                              </button>
                              <button
                                onClick={() => onRemoveSummary(it.id)}
                                title="Sacar de la quincena (vuelve a estar suelto)"
                                className="rounded-md border border-[var(--color-border)] px-2 py-1 text-[10px] text-[var(--color-danger)] hover:bg-[var(--color-accent-soft)]"
                              >
                                ✕
                              </button>
                            </>
                          )}
                          {itemPaid && (
                            <button
                              onClick={() => onRevertItem(it)}
                              className="rounded-md border border-[var(--color-warning)] px-2 py-1 text-[10px] text-[var(--color-warning)]"
                            >
                              ↶
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
              <tr className="border-t-2 border-[var(--color-border)] bg-[var(--color-surface-2)]">
                <td className="px-2 py-2 font-semibold" colSpan={2}>TOTAL</td>
                <td className="px-2 py-2 text-center font-semibold tabular-nums">
                  {items.reduce((s, it) => s + (it.tripIds || []).length, 0)}
                </td>
                <td className="hidden md:table-cell" />
                <td />
                <td className="px-2 py-2 text-right font-semibold tabular-nums">
                  {fmtCurrency(totalAll)}
                </td>
                {!isPaid && <td />}
              </tr>
              {totalPaid > 0 && totalPending > 0 && (
                <tr className="bg-[var(--color-surface)]">
                  <td className="px-2 py-1.5 text-xs text-[var(--color-muted)]" colSpan={2}>
                    Pagado y abonado
                  </td>
                  <td />
                  <td className="hidden md:table-cell" />
                  <td />
                  <td className="px-2 py-1.5 text-right text-xs tabular-nums text-[var(--color-muted)]">
                    {fmtCurrency(totalPaid)}
                  </td>
                  {!isPaid && <td />}
                </tr>
              )}
              {pendingCount > 0 && !isPaid && (
                <tr className="bg-[var(--color-warning-soft)]">
                  <td className="px-2 py-2 text-sm font-semibold text-[var(--color-warning)]" colSpan={2}>
                    PENDIENTE ({pendingCount})
                  </td>
                  <td />
                  <td className="hidden md:table-cell" />
                  <td />
                  <td className="px-2 py-2 text-right text-sm font-semibold tabular-nums text-[var(--color-warning)]">
                    {fmtCurrency(totalPending)}
                  </td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Detalle del resumen elegido: PaymentDetailModal completo (editar y
          quitar vueltas), sin onPay, onRevert ni onDelete, que se manejan
          desde la quincena. */}
      <PaymentDetailModal
        open={!!viewingPayment}
        onClose={() => setViewingPayment(null)}
        payment={viewingPayment}
        carrier={viewingPayment ? carriersById.get(viewingPayment.carrierId) : null}
        carriers={carriers}
        faenaById={faenaById}
        subfaenaById={subfaenaById}
        cycleById={cycleById}
        onPay={null}
        onRevert={null}
        onDelete={null}
        onChanged={async () => {
          if (onItemChanged) await onItemChanged();
          // Relee el resumen abierto y se lo vuelve a pasar al modal hijo, que
          // recibe el objeto y no el id.
          if (viewingPayment) {
            try {
              const updated = await paymentsService.getById(viewingPayment.id);
              if (updated) setViewingPayment(updated);
            } catch { /* noop */ }
          }
        }}
      />
    </Modal>
  );
}
