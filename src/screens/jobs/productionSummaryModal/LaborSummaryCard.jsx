import { useState, useRef } from "react";
import { useCaptureActions } from "../../../hooks/useCaptureActions";
import { PRINT_GRID_CSS } from "../../../utils/printWindow";
import { tratoTypeLabel } from "../../../utils/cosechaCombos";
import { useIsMobile } from "../../../hooks/useIsMobile";
import { fmtNum } from "./helpers";
import { HDR_BLUE, ROW_TOTAL_LIGHT, cellH, cell } from "./tableStyles";
import { fmtCurrency } from "../../../utils/format";
import { writeLaborSummaryXlsx } from "./writeLaborSummaryXlsx";
import { useValuesChanged } from "../../../hooks/useValuesChanged";

// Tarjeta por labor: encabezado con título, total, flecha de plegado y
// botones de copiar e imprimir; cuerpo con la tabla día por día. Arranca
// plegada si el ciclo está cerrado.
export function LaborSummaryCard({ data, catalogs, allClosedCollapsed }) {
  const isMobile = useIsMobile();
  const { col, rows, totalQty, totalAmount, unit, persons } = data;
  const isClosed = col.cycleStatus === "closed";
  const [collapsed, setCollapsed] = useState(isClosed);
  const { busy, run, copy, print, copyText } = useCaptureActions();
  const captureRef = useRef(null);

  // El control maestro del modal pliega o despliega a la vez las tarjetas de
  // ciclos cerrados (las de ciclos abiertos no cambian). Cada una se puede
  // plegar a mano; el siguiente cambio del control las vuelve a igualar.
  if (useValuesChanged([allClosedCollapsed], { onMount: true }) && isClosed) setCollapsed(allClosedCollapsed);

  const typeLabel = col.labor.type === "cosecha"
    ? "🌾 Cosecha"
    : col.labor.type === "tratoEtapas"
      ? "🏕 Por etapas"
      : col.labor.type === "main"
        ? "💰 Jornadas"
        : col.labor.type === "supervision"
          ? "🧑‍💼 Supervisión"
          : `🛠 ${tratoTypeLabel(catalogs, col.labor.tratoType ?? 0)}`;

  // Texto plano del desglose para pegar en un chat o una nota. Alinea las
  // columnas con padEnd sobre los textos finales: se ve bien en fuente
  // monoespaciada y aceptable en proporcional.
  const buildPlainText = () => {
    const lines = [];
    lines.push(`📊 ${col.labor.name} — ${col.cycleLabel} (${typeLabel})`);
    lines.push(
      `Total: ${fmtNum(totalQty)}${unit ? " " + unit : ""} · ${fmtCurrency(totalAmount)} · ${persons} pers`,
    );
    lines.push("");
    lines.push("Día        | Producción            | Precio              | Monto       | Rendimiento");
    for (const { day, cell } of rows) {
      const prod = `${fmtNum(cell.qty)}${cell.unit ? " " + cell.unit : ""}`;
      const price = cell.priceLabel || "—";
      const amt = fmtCurrency(cell.amount);
      const yieldText = cell.persons > 0 ? `${cell.persons} pers · prom ${fmtNum(cell.avg)}` : "—";
      lines.push(
        `${day.padEnd(10, " ")} | ${prod.padEnd(21, " ")} | ${price.padEnd(19, " ")} | ${amt.padEnd(11, " ")} | ${yieldText}`,
      );
    }
    return lines.join("\n");
  };

  const handleCopyText = () => copyText(buildPlainText());
  const handleCopyImage = () => copy(captureRef.current);

  const handleXlsx = () =>
    run("xlsx", () => writeLaborSummaryXlsx({ col, typeLabel, rows, totalQty, unit, persons, totalAmount }), { error: "No se pudo generar el Excel" });

  const handlePrint = () =>
    print(captureRef.current, { title: `Resumen ${col.labor.name}`, page: "portrait", css: PRINT_GRID_CSS });

  return (
    <div className="rounded-md border border-[var(--color-border)]">
      <div className="flex flex-wrap items-center gap-2 bg-[var(--color-surface-2)] px-3 py-2 text-sm">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="flex flex-1 items-center gap-2 text-left hover:text-[var(--color-accent)]"
        >
          <span className="text-[var(--color-muted)]">{collapsed ? "▸" : "▾"}</span>
          <div className="min-w-0">
            <div className="font-semibold truncate">{col.labor.name}</div>
            <div className="text-[10px] text-[var(--color-muted)]">
              {col.cycleLabel}
              {col.cycleStatus === "closed" && <span className="ml-1 opacity-70">·🔒 cerrado</span>}
              {" · "}{typeLabel}
            </div>
          </div>
        </button>
        <div className="text-right">
          {totalQty > 0 && (
            <div className="text-xs text-[var(--color-muted)] tabular-nums">
              {fmtNum(totalQty)}{unit ? " " + unit : ""} · {persons} pers
            </div>
          )}
          <div className="font-semibold tabular-nums text-[var(--color-accent)]">
            {fmtCurrency(totalAmount)}
          </div>
        </div>
        <div className="flex gap-1">
          <button
            onClick={handleCopyText}
            disabled={busy === "text"}
            title="Copiar como texto plano"
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[10px] hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
          >
            {busy === "text" ? "..." : "📋 Texto"}
          </button>
          <button
            onClick={handleCopyImage}
            disabled={busy === "copy"}
            title="Copiar como imagen"
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[10px] hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
          >
            {busy === "copy" ? "..." : "📋 Imagen"}
          </button>
          <button
            onClick={handleXlsx}
            disabled={busy === "xlsx"}
            title="Descargar como Excel"
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[10px] hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
          >
            {busy === "xlsx" ? "..." : "📊 Excel"}
          </button>
          <button
            onClick={handlePrint}
            title="Imprimir"
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[10px] hover:bg-[var(--color-accent-soft)]"
          >
            🖨
          </button>
        </div>
      </div>
      {!collapsed && (
        <div ref={captureRef} style={{ background: "#fff", color: "#000", padding: 12 }}>
          {/* Encabezado repetido dentro de la zona capturada, para que la
              imagen y la impresión lleven el nombre de la labor. */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{col.labor.name}</div>
            <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
              {col.cycleLabel} · {typeLabel}
              {col.cycleStatus === "closed" && " · 🔒 cerrado"}
            </div>
          </div>
          {isMobile ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {rows.map(({ day, cell: c }) => (
                <div key={day} style={{ border: "1px solid #999", borderRadius: 6, padding: "6px 8px", fontSize: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 700 }}>{day}</span>
                    <span style={{ fontWeight: 600 }}>{fmtCurrency(c.amount)}</span>
                  </div>
                  <div style={{ marginTop: 2 }}>
                    <span style={{ fontWeight: 600 }}>{fmtNum(c.qty)}</span>
                    {c.unit && <span style={{ marginLeft: 4, color: "#666" }}>{c.unit}</span>}
                    {c.priceLabel && <span style={{ marginLeft: 6, color: "#444" }}>· {c.priceLabel}</span>}
                  </div>
                  {c.persons > 0 && (
                    <div style={{ marginTop: 2, color: "#666", fontSize: 11 }}>
                      {c.persons} pers · prom {fmtNum(c.avg)}
                    </div>
                  )}
                </div>
              ))}
              <div style={{ background: ROW_TOTAL_LIGHT, fontWeight: 700, borderRadius: 6, padding: "6px 8px", fontSize: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>TOTAL</span>
                  <span>{fmtCurrency(totalAmount)}</span>
                </div>
                <div style={{ marginTop: 2, fontWeight: 400 }}>
                  {fmtNum(totalQty)}{unit && ` ${unit}`} · {persons} personas únicas
                </div>
              </div>
            </div>
          ) : (
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr style={{ background: HDR_BLUE }}>
                  <th style={cellH}>Día</th>
                  <th style={cellH}>Producción</th>
                  <th style={cellH}>Precio</th>
                  <th style={{ ...cellH, textAlign: "right" }}>Monto</th>
                  <th style={{ ...cellH, textAlign: "right" }}>Rendimiento</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ day, cell: c }) => (
                  <tr key={day}>
                    <td style={{ ...cell, fontFamily: "ui-monospace, monospace" }}>{day}</td>
                    <td style={cell}>
                      <span style={{ fontWeight: 600 }}>{fmtNum(c.qty)}</span>
                      {c.unit && <span style={{ marginLeft: 4, color: "#666" }}>{c.unit}</span>}
                    </td>
                    <td style={{ ...cell, color: "#444" }}>{c.priceLabel || "—"}</td>
                    <td style={{ ...cell, textAlign: "right", fontWeight: 600 }}>{fmtCurrency(c.amount)}</td>
                    <td style={{ ...cell, textAlign: "right", color: "#666" }}>
                      {c.persons > 0 ? `${c.persons} pers · prom ${fmtNum(c.avg)}` : "—"}
                    </td>
                  </tr>
                ))}
                <tr style={{ background: ROW_TOTAL_LIGHT, fontWeight: 700 }}>
                  <td style={cell}>TOTAL</td>
                  <td style={cell}>
                    {fmtNum(totalQty)}
                    {unit && <span style={{ marginLeft: 4, color: "#555" }}>{unit}</span>}
                  </td>
                  <td style={{ ...cell, fontSize: 10, color: "#555" }}>
                    {persons} personas únicas
                  </td>
                  <td style={{ ...cell, textAlign: "right" }}>{fmtCurrency(totalAmount)}</td>
                  <td style={cell}></td>
                </tr>
              </tbody>
            </table>
          </div>
          )}
        </div>
      )}
    </div>
  );
}
