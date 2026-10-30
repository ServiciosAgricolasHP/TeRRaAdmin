import { useState, useRef, useEffect, useEffectEvent, useMemo } from "react";
import { captureFullWidthBlob } from "../../utils/imageCapture";
import Modal from "../../components/Modal";
import { tripsService } from "../../services/transportsService";
import { useToast } from "../../contexts/ToastContext";
import { useCaptureActions } from "../../hooks/useCaptureActions";
import { PRINT_SHEET_CSS, printNodes } from "../../utils/printWindow";
import { localIsoDate } from "../../utils/dates";
import { fmtCurrency } from "../../utils/format";
import { PrintableSummary } from "./PrintableSummary";
import { attempt } from "../../utils/attempt";
import { useValuesChanged } from "../../hooks/useValuesChanged";

// JSZip va en un chunk aparte y se carga solo al bajar el ZIP.
const loadJsZip = () => import("jszip").then((m) => m.default);

// ============================================================
// IMPRIMIR VARIOS: imprime o exporta varios resúmenes a la vez
// ============================================================
// Filtros: estado (pendiente/pagado/ambos), rango de fechas (cruce con
// periodFrom/periodTo), transportistas (selección múltiple) y faena/subfaena
// (necesita cargar las vueltas). Acciones: imprimir todo en una ventana, con
// salto de página entre resúmenes, o exportar un PNG por resumen en un ZIP.
export function PrintMultipleModal({
  open,
  onClose,
  payments,
  carriers,
  faenas,
  subfaenas,
  carrierById,
  faenaById,
  subfaenaById,
  cycleById,
}) {
  const toast = useToast();
  const [statusFilter, setStatusFilter] = useState("pending");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [carriersSel, setCarriersSel] = useState(() => new Set());
  const [faenasSel, setFaenasSel] = useState(() => new Set());
  const [subfaenasSel, setSubfaenasSel] = useState(() => new Set());

  // Vueltas: se cargan al filtrar por faena o subfaena, o al imprimir o
  // exportar, y quedan en memoria mientras el componente siga montado.
  const [allTrips, setAllTrips] = useState(null);
  const [tripsLoading, setTripsLoading] = useState(false);

  // Acción en curso: "" | "print" | "zip". Mientras dura, se dibujan todos los
  // PrintableSummary fuera de pantalla para imprimirlos o capturarlos.
  const { busy, run } = useCaptureActions();
  const [renderItems, setRenderItems] = useState(null);
  const itemRefs = useRef([]);

  if (useValuesChanged([open], { onMount: true }) && !open) {
    setStatusFilter("pending");
    setDateFrom("");
    setDateTo("");
    setCarriersSel(new Set());
    setFaenasSel(new Set());
    setSubfaenasSel(new Set());
    setRenderItems(null);
  }

  const ensureTrips = async () => {
    if (allTrips) return allTrips;
    setTripsLoading(true);
    const { value: list, error: err } = await attempt(() => tripsService.listAll());
    setTripsLoading(false);
    if (err) throw err;
    setAllTrips(list);
    return list;
  };

  // Carga las vueltas al activar el filtro por faena o subfaena.
  const advancedActive = faenasSel.size > 0 || subfaenasSel.size > 0;
  const loadTripsIfMissing = useEffectEvent(() => {
    if (!allTrips && !tripsLoading) ensureTrips();
  });
  useEffect(() => {
    if (open && advancedActive) loadTripsIfMissing();
  }, [open, advancedActive]);

  // Filtros que no necesitan las vueltas.
  const basicFiltered = useMemo(() => {
    return payments.filter((p) => {
      if (statusFilter !== "both" && p.status !== statusFilter) return false;
      if (carriersSel.size > 0 && !carriersSel.has(p.carrierId)) return false;
      if (dateFrom || dateTo) {
        const pFrom = p.periodFrom || p.periodTo || "";
        const pTo = p.periodTo || p.periodFrom || "";
        if (pFrom || pTo) {
          if (dateFrom && pTo && pTo < dateFrom) return false;
          if (dateTo && pFrom && pFrom > dateTo) return false;
        }
      }
      return true;
    });
  }, [payments, statusFilter, dateFrom, dateTo, carriersSel]);

  // Filtro por faena/subfaena: un resumen entra si tiene al menos una vuelta
  // de las faenas y subfaenas elegidas. El resumen impreso muestra TODAS sus
  // vueltas: el filtro decide qué resúmenes entran, no qué vueltas.
  const finalPayments = useMemo(() => {
    if (!advancedActive) return basicFiltered;
    if (!allTrips) return null;
    const tripById = new Map(allTrips.map((t) => [t.id, t]));
    return basicFiltered.filter((p) => {
      const trips = (p.tripIds || []).map((id) => tripById.get(id)).filter(Boolean);
      return trips.some((t) => {
        if (faenasSel.size > 0 && !faenasSel.has(t.faenaId)) return false;
        if (subfaenasSel.size > 0 && !subfaenasSel.has(t.subfaenaId)) return false;
        return true;
      });
    });
  }, [basicFiltered, advancedActive, allTrips, faenasSel, subfaenasSel]);

  const finalCount = finalPayments?.length ?? "—";
  const finalTotal = (finalPayments || []).reduce((s, p) => s + (Number(p.total) || 0), 0);

  // Arma lo que se dibuja por resumen: el resumen, el transportista, sus
  // vueltas y el período.
  const buildRenderItems = async () => {
    const trips = await ensureTrips();
    const tripById = new Map(trips.map((t) => [t.id, t]));
    const list = finalPayments || basicFiltered;
    return list.map((p) => {
      const carrier = carrierById.get(p.carrierId) || null;
      const myTrips = (p.tripIds || [])
        .map((id) => tripById.get(id))
        .filter(Boolean)
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      const dates = myTrips.map((t) => t.date).filter(Boolean).sort();
      const periodLabel =
        p.periodFrom && p.periodTo
          ? `${p.periodFrom} → ${p.periodTo}`
          : dates.length
            ? `${dates[0]} → ${dates[dates.length - 1]}`
            : "—";
      return { payment: p, carrier, trips: myTrips, periodLabel };
    });
  };

  const waitFor = (ms) => new Promise((r) => setTimeout(r, ms));

  // Dibuja fuera de pantalla un PrintableSummary por resumen que pasa los
  // filtros. Devuelve los resúmenes, o null si no hay ninguno.
  const renderSummaries = async () => {
    const items = await buildRenderItems();
    if (items.length === 0) {
      toast.warning("No hay resúmenes que coincidan con los filtros.");
      return null;
    }
    itemRefs.current = new Array(items.length).fill(null);
    setRenderItems(items);
    await waitFor(80); // espera el render
    return items;
  };

  const printAll = async () => {
    if (!(await renderSummaries())) return;
    printNodes(itemRefs.current, { title: "Resúmenes Transportes", css: PRINT_SHEET_CSS });
  };

  const zipAll = async () => {
    const items = await renderSummaries();
    if (!items) return;
    const JSZip = await loadJsZip();
    const zip = new JSZip();
    const usedNames = new Set();
    for (let i = 0; i < items.length; i++) {
      const node = itemRefs.current[i];
      if (!node) continue;
      const blob = await captureFullWidthBlob(node);
      if (!blob) continue;
      const it = items[i];
      const base = (it.carrier?.alias || it.payment.carrierId || "resumen")
        .toString()
        .replace(/[^a-z0-9_-]+/gi, "_");
      let name = `${base}_${it.payment.id.slice(-6)}.png`;
      while (usedNames.has(name)) name = `${base}_${i}.png`;
      usedNames.add(name);
      zip.file(name, blob);
    }
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    const stamp = localIsoDate();
    a.href = url;
    a.download = `resumenes_transportes_${stamp}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handlePrint = () => run("print", () => printAll().finally(() => setRenderItems(null)), { error: "No se pudo imprimir" });
  const handleZip = () => run("zip", () => zipAll().finally(() => setRenderItems(null)), { error: "No se pudo generar el ZIP" });

  const toggleIn = (set, setter) => (id) =>
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleCarrier = toggleIn(carriersSel, setCarriersSel);
  const toggleFaena = toggleIn(faenasSel, setFaenasSel);
  const toggleSubfaena = toggleIn(subfaenasSel, setSubfaenasSel);

  const sortedCarriers = useMemo(
    () => [...carriers].sort((a, b) => (a.alias || a.name).localeCompare(b.alias || b.name, "es")),
    [carriers],
  );
  const sortedFaenas = useMemo(
    () => [...faenas].sort((a, b) => a.name.localeCompare(b.name, "es")),
    [faenas],
  );
  const sortedSubfaenas = useMemo(() => {
    let arr = [...subfaenas];
    if (faenasSel.size > 0) arr = arr.filter((s) => faenasSel.has(s.faenaId));
    return arr.sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [subfaenas, faenasSel]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Imprimir resúmenes en lote"
      size="xl"
      footer={
        <>
          <button
            onClick={onClose}
            disabled={!!busy}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Cerrar
          </button>
          <button
            onClick={handleZip}
            disabled={!!busy || (finalPayments && finalPayments.length === 0)}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
          >
            {busy === "zip" ? "Generando ZIP..." : "📦 ZIP PNGs"}
          </button>
          <button
            onClick={handlePrint}
            disabled={!!busy || (finalPayments && finalPayments.length === 0)}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
          >
            {busy === "print" ? "Preparando..." : "🖨 Imprimir"}
          </button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-[var(--color-border)] p-3">
          <div className="mb-2 text-xs font-medium text-[var(--color-muted)]">Estado</div>
          <div className="flex flex-wrap gap-1 text-xs">
            {[
              { v: "pending", l: "⏳ Pendientes" },
              { v: "paid", l: "✓ Pagados" },
              { v: "both", l: "Ambos" },
            ].map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => setStatusFilter(o.v)}
                className={`rounded-md border px-2 py-1 ${
                  statusFilter === o.v
                    ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-fg)]"
                    : "border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-accent-soft)]"
                }`}
              >
                {o.l}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-[var(--color-border)] p-3">
          <div className="mb-2 text-xs font-medium text-[var(--color-muted)]">Rango de fechas</div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-1">
              <span className="text-[var(--color-muted)]">Desde</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1"
              />
            </label>
            <label className="flex items-center gap-1">
              <span className="text-[var(--color-muted)]">Hasta</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1"
              />
            </label>
            {(dateFrom || dateTo) && (
              <button
                type="button"
                onClick={() => {
                  setDateFrom("");
                  setDateTo("");
                }}
                className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 hover:bg-[var(--color-accent-soft)]"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>

        <div className="rounded-md border border-[var(--color-border)] p-3 sm:col-span-2">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-medium text-[var(--color-muted)]">
              Transportistas ({carriersSel.size === 0 ? "todos" : carriersSel.size})
            </span>
            {carriersSel.size > 0 && (
              <button
                type="button"
                onClick={() => setCarriersSel(new Set())}
                className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 hover:bg-[var(--color-accent-soft)]"
              >
                Limpiar
              </button>
            )}
          </div>
          <div className="grid max-h-32 grid-cols-1 gap-1 overflow-auto sm:grid-cols-2 lg:grid-cols-3">
            {sortedCarriers.map((c) => (
              <label key={c.id} className="flex items-center gap-1.5 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs">
                <input
                  type="checkbox"
                  checked={carriersSel.has(c.id)}
                  onChange={() => toggleCarrier(c.id)}
                />
                <span className="truncate">
                  <span className="font-medium">{c.alias}</span>
                  <span className="ml-1 text-[var(--color-muted)]">— {c.name}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-[var(--color-border)] p-3">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-medium text-[var(--color-muted)]">
              Faenas ({faenasSel.size === 0 ? "todas" : faenasSel.size})
            </span>
            {faenasSel.size > 0 && (
              <button
                type="button"
                onClick={() => setFaenasSel(new Set())}
                className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 hover:bg-[var(--color-accent-soft)]"
              >
                Limpiar
              </button>
            )}
          </div>
          <div className="grid max-h-28 grid-cols-1 gap-1 overflow-auto">
            {sortedFaenas.map((f) => (
              <label key={f.id} className="flex items-center gap-1.5 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs">
                <input
                  type="checkbox"
                  checked={faenasSel.has(f.id)}
                  onChange={() => toggleFaena(f.id)}
                />
                <span className="truncate">{f.name}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-[var(--color-border)] p-3">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-medium text-[var(--color-muted)]">
              Subfaenas ({subfaenasSel.size === 0 ? "todas" : subfaenasSel.size})
            </span>
            {subfaenasSel.size > 0 && (
              <button
                type="button"
                onClick={() => setSubfaenasSel(new Set())}
                className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 hover:bg-[var(--color-accent-soft)]"
              >
                Limpiar
              </button>
            )}
          </div>
          <div className="grid max-h-28 grid-cols-1 gap-1 overflow-auto">
            {sortedSubfaenas.map((s) => (
              <label key={s.id} className="flex items-center gap-1.5 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs">
                <input
                  type="checkbox"
                  checked={subfaenasSel.has(s.id)}
                  onChange={() => toggleSubfaena(s.id)}
                />
                <span className="truncate">{s.name}</span>
              </label>
            ))}
            {sortedSubfaenas.length === 0 && (
              <span className="px-2 py-1 text-[var(--color-muted)]">
                {faenasSel.size > 0 ? "Sin subfaenas para la faena seleccionada" : "—"}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm">
        <span>
          {advancedActive && !allTrips
            ? tripsLoading
              ? "Cargando vueltas para filtros avanzados..."
              : "Esperando datos para filtros avanzados..."
            : `${finalCount} resumen(es) coinciden`}
        </span>
        <span className="font-semibold tabular-nums">{fmtCurrency(finalTotal)}</span>
      </div>

      {/* Contenedor fuera de pantalla: se monta solo durante la acción, para
          capturarlo con html-to-image u outerHTML. */}
      {renderItems && (
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            left: "-10000px",
            top: 0,
            width: "1100px",
            background: "#ffffff",
          }}
        >
          {renderItems.map((it, i) => (
            <PrintableSummary
              key={it.payment.id}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
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
      )}
    </Modal>
  );
}
