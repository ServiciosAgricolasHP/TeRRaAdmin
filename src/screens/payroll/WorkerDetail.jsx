import { useMemo, useState } from "react";
import { formatRutForDisplay } from "../../utils/rutUtils";
import { useCatalogs } from "../../contexts/CatalogsContext";
import WorkerSummaryModal from "../../components/WorkerSummaryModal";
import { fmtCurrency } from "../../utils/format";
import { WorkerPayrollDetailModal } from "./WorkerPayrollDetailModal";

export function WorkerDetail({ worker, onBack, onExport, exporting }) {
  const { catalogs } = useCatalogs();
  // Gráfico: una barra por pago; X = orden cronológico, Y = monto neto.
  const chartData = useMemo(() => {
    const sorted = [...worker.payments].sort((a, b) => a.payrollDate - b.payrollDate);
    const maxAmt = Math.max(1, ...sorted.map((p) => p.amount));
    return { sorted, maxAmt };
  }, [worker.payments]);

  // Resumen completo del trabajador, el mismo modal de la pantalla
  // Trabajadores: todas sus jornadas, también las que no entraron a ninguna
  // nómina, por ciclo y fecha.
  const [summaryOpen, setSummaryOpen] = useState(false);
  // Pago elegido, para ver su detalle en esa nómina sin abrirla entera (ver
  // WorkerPayrollDetailModal).
  const [payDetailFor, setPayDetailFor] = useState(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div>
          <button
            onClick={onBack}
            className="mb-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-accent)]"
          >
            ← Volver al listado
          </button>
          <div className="text-xl font-semibold">{worker.name}</div>
          <div className="font-mono text-sm text-[var(--color-muted)]">{formatRutForDisplay(worker.rut)}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSummaryOpen(true)}
            title="Ver todos sus días registrados (incluyendo los que aún no entraron a ninguna nómina)"
            className="rounded-md border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-fg)]"
          >
            📅 Ver días sin pagar
          </button>
          <button
            onClick={onExport}
            disabled={exporting}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
          >
            {exporting ? "Exportando…" : "📥 Descargar XLSX"}
          </button>
        </div>
      </div>

      <WorkerSummaryModal
        open={summaryOpen}
        worker={{ id: worker.workerId, rut: worker.rut, name: worker.name }}
        onClose={() => setSummaryOpen(false)}
      />

      <WorkerPayrollDetailModal
        open={!!payDetailFor}
        payment={payDetailFor}
        worker={worker}
        catalogs={catalogs}
        onClose={() => setPayDetailFor(null)}
        onShowFullHistory={() => {
          setPayDetailFor(null);
          setSummaryOpen(true);
        }}
      />

      {/* Métricas */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <MetricCard label="Total neto pagado" value={fmtCurrency(worker.totalAmount)} accent />
        <MetricCard label="Pagos" value={String(worker.payments.length)} />
        <MetricCard label="Bruto acumulado" value={fmtCurrency(worker.totalGross)} />
        <MetricCard
          label="Anticipos / Bonos"
          value={
            <span>
              <span className="text-amber-600 dark:text-amber-400">−{fmtCurrency(worker.totalAdvance)}</span>
              {" / "}
              <span className="text-emerald-600 dark:text-emerald-400">+{fmtCurrency(worker.totalBonus)}</span>
            </span>
          }
        />
      </div>

      {/* Gráfico: barras por pago en orden cronológico */}
      {chartData.sorted.length > 0 && (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <div className="mb-2 text-xs font-medium text-[var(--color-muted)]">
            Pagos en el tiempo · {chartData.sorted.length} eventos
          </div>
          <PaymentsBarChart data={chartData.sorted} maxAmt={chartData.maxAmt} />
        </div>
      )}

      {/* Listado de pagos */}
      <div className="rounded-lg border border-[var(--color-border)]">
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm font-medium">
          Detalle de pagos ({worker.payments.length})
        </div>
        <div className="divide-y divide-[var(--color-border)]">
          {worker.payments.map((pay, i) => (
            <button
              key={`${pay.payrollId}_${i}`}
              onClick={() => setPayDetailFor(pay)}
              title="Ver el detalle de lo que fue en esta nómina"
              className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-[var(--color-accent-soft)]"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{pay.payrollName}</span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                    pay.classification === "diferencia"
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                      : "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                  }`}>
                    {pay.classification === "diferencia" ? "diferencia" : "nómina"}
                  </span>
                  <span className={`text-[10px] ${
                    pay.status === "paid" ? "text-[var(--color-success)]" : "text-[var(--color-warning)]"
                  }`}>
                    {pay.status === "paid" ? "pagado" : "pendiente"}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-[var(--color-muted)]">
                  📅 {pay.payrollDateISO || "—"}
                  {pay.groupLeader && (
                    <> · 👥 Líder: <span className="text-[var(--color-text)] font-medium">{pay.groupLeader}</span></>
                  )}
                  {pay.faenaNames.length > 0 && (
                    <> · 🏞 {pay.faenaNames.join(" / ")}</>
                  )}
                </div>
                {(pay.advance > 0 || pay.bonus > 0) && (
                  <div className="mt-0.5 text-[11px] tabular-nums">
                    Bruto {fmtCurrency(pay.gross)}
                    {pay.advance > 0 && <span className="text-amber-600 dark:text-amber-400"> · −{fmtCurrency(pay.advance)}</span>}
                    {pay.bonus > 0 && <span className="text-emerald-600 dark:text-emerald-400"> · +{fmtCurrency(pay.bonus)}</span>}
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className="font-bold tabular-nums">{fmtCurrency(pay.amount)}</div>
                <div className="text-[10px] text-[var(--color-muted)] opacity-0 transition-opacity group-hover:opacity-100">→</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, accent = false }) {
  return (
    <div className={`rounded-lg border p-3 ${accent ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]" : "border-[var(--color-border)] bg-[var(--color-surface)]"}`}>
      <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">{label}</div>
      <div className={`mt-1 text-base font-bold tabular-nums ${accent ? "text-[var(--color-accent)]" : ""}`}>{value}</div>
    </div>
  );
}

function PaymentsBarChart({ data, maxAmt }) {
  // SVG inline: ancho 100% y alto fijo.
  const H = 140;
  const padTop = 8, padBottom = 24, padLeft = 4, padRight = 4;
  const innerH = H - padTop - padBottom;
  const n = data.length;
  // Cada barra ocupa una franja proporcional + 4px de gap entre barras.
  const VW = Math.max(280, n * 36);
  const innerW = VW - padLeft - padRight;
  const barW = Math.max(8, Math.min(40, innerW / Math.max(1, n) - 4));
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${VW} ${H}`} width="100%" height={H} style={{ display: "block", minWidth: 280 }}>
        {data.map((p, i) => {
          const h = (p.amount / maxAmt) * innerH;
          const x = padLeft + (i + 0.5) * (innerW / n) - barW / 2;
          const y = padTop + (innerH - h);
          const isDif = p.classification === "diferencia";
          return (
            <g key={`${p.payrollId}_${i}`}>
              <title>{`${p.payrollDateISO} — ${p.payrollName}\n${fmtCurrency(p.amount)}${p.advance > 0 ? `  (anticipo −${fmtCurrency(p.advance)})` : ""}${p.bonus > 0 ? `  (bono +${fmtCurrency(p.bonus)})` : ""}`}</title>
              <rect
                x={x}
                y={y}
                width={barW}
                height={h}
                fill={isDif ? "#f59e0b" : "#16a34a"}
                opacity={p.status === "paid" ? 1 : 0.5}
                rx={2}
              />
              {n <= 24 && (
                <text
                  x={x + barW / 2}
                  y={H - 8}
                  textAnchor="middle"
                  fontSize="9"
                  fill="currentColor"
                  opacity="0.6"
                >
                  {p.payrollDateISO?.slice(5) /* MM-DD */}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex items-center gap-3 text-[10px] text-[var(--color-muted)]">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm" style={{ background: "#16a34a" }} /> Nómina</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm" style={{ background: "#f59e0b" }} /> Diferencia</span>
        <span className="flex items-center gap-1 opacity-50"><span className="inline-block h-2 w-2 rounded-sm" style={{ background: "#16a34a" }} /> pendiente</span>
      </div>
    </div>
  );
}
