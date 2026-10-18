import { useState, useRef } from "react";
import { captureFullWidthBlob } from "../../utils/imageCapture";
import { advanceTypeMeta } from "../../services/advancesService";
import { formatRutForDisplay } from "../../utils/rutUtils";
import { getTratoTiers } from "../../utils/cosechaCombos";
import { useToast } from "../../contexts/ToastContext";
import { fmtCurrency } from "../../utils/format";
import {
  workerDetailDateLabel,
  laborDisplayLabel,
  formatWorkerDetailProd,
  WORKER_DETAIL_CELL_H,
  WORKER_DETAIL_CELL,
  laborSubtypeLabel,
} from "./workerDetailLabels";

// Detalle pagado en la nómina, con el formato del módulo Trabajadores. Vista
// "Por ciclo": una tabla por ciclo (faena · subfaena · ciclo de encabezado,
// filas labor × día); vista "Cronológico": una sola tabla por fecha con los
// ajustes intercalados. Sin snapshot, o sin jornadas de la persona en él,
// muestra solo los montos por ciclo.
export function WorkerPaidDetailTables({ displayRut, item, snapshot, snapshotLoading, cycleDetails, displayCycleLabel, catalogs }) {
  const toast = useToast();
  const [busy, setBusy] = useState("");
  // cronologico (default): una sola tabla ordenada por fecha, con los
  // anticipos y bonos intercalados en su fecha. porCiclo: una tabla por ciclo
  // con subtotales y un bloque final de ajustes.
  const [viewMode, setViewMode] = useState("cronologico");
  const captureRef = useRef(null);

  // Respaldo "Por ciclo": montos sin detalle día × labor.
  const byCycleEntries = Object.entries(item.byCycle || {})
    .filter(([, v]) => Number(v) > 0)
    .map(([cid, amt]) => {
      const c = cycleDetails.find((x) => x.id === cid);
      return { id: cid, label: c ? displayCycleLabel(c) : cid, faena: c?.faenaName, subfaena: c?.subfaenaName, amount: Number(amt) };
    });

  if (snapshotLoading) {
    return <div className="rounded-md border border-dashed border-[var(--color-border)] px-3 py-2 text-[11px] text-[var(--color-muted)]">Cargando detalle…</div>;
  }

  // Sin snapshot o sin jornadas de la persona: solo los montos por ciclo.
  const wds = snapshot ? (snapshot.workdays || []).filter((w) => w.workerRut === item.rut) : [];
  if (!snapshot || wds.length === 0) {
    if (byCycleEntries.length === 0) return null;
    return (
      <div>
        <div className="mb-0.5 text-[10px] uppercase tracking-wide text-[var(--color-muted)]">Por ciclo</div>
        <div className="grid gap-1 sm:grid-cols-2">
          {byCycleEntries.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-2 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs">
              <div className="min-w-0">
                <div className="truncate font-medium">{e.label}</div>
                {(e.faena || e.subfaena) && (
                  <div className="truncate text-[10px] text-[var(--color-muted)]">
                    {e.faena}{e.subfaena ? ` / ${e.subfaena}` : ""}
                  </div>
                )}
              </div>
              <span className="shrink-0 font-semibold tabular-nums">{fmtCurrency(e.amount)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Con snapshot: jornadas agrupadas por ciclo y luego por (labor, fecha).
  const cyclesById = new Map((snapshot.cycles || []).map((c) => [c.id, c]));
  const wdsByCycle = new Map();
  for (const wd of wds) {
    if (!wdsByCycle.has(wd.cycleId)) wdsByCycle.set(wd.cycleId, []);
    wdsByCycle.get(wd.cycleId).push(wd);
  }

  // Para cada ciclo, agrupar workdays por (laborId, date) y producir una
  // fila con qty + amount. Lo que se muestra en la columna "Producción"
  // depende del tipo de labor (cosecha → kg/unidad, trato → unidad del
  // catálogo, etc.).
  const cycleSections = [...wdsByCycle.entries()].map(([cycleId, list]) => {
    const cycle = cyclesById.get(cycleId);
    const detail = cycleDetails.find((c) => c.id === cycleId);
    const laborsById = new Map((cycle?.labors || []).map((l) => [l.id, l]));
    const groups = new Map();
    for (const wd of list) {
      const key = `${wd.laborId}__${wd.date}`;
      if (!groups.has(key)) {
        groups.set(key, {
          laborId: wd.laborId,
          labor: laborsById.get(wd.laborId),
          date: wd.date || "",
          kilos: 0,
          jornadas: 0,
          tratoQty: 0,
          tratoUnits: new Set(), // unidades de catálogo recolectadas de los tiers
          overtimeHours: 0,
          amount: 0,
          containers: new Set(),
        });
      }
      const g = groups.get(key);
      const labor = g.labor;
      const wdAmount = Number(wd.amount) || 0;
      const wdQty = Number(wd.qty) || 0;
      g.amount += wdAmount;
      if (labor?.type === "cosecha") {
        g.kilos += wdQty;
        if (wd.containerY != null) g.containers.add(Number(wd.containerY));
      } else if (labor?.type === "trato") {
        // En trato, la unidad del catálogo (Planta, Metro…) no está en
        // wd.tiers sino por día en cycle.dayPrices, que el snapshot siempre
        // trae: se resuelve con getTratoTiers para ese (labor, fecha), de
        // índice a unidad.
        const dayTiers = getTratoTiers(cycle?.dayPrices || {}, wd.laborId, wd.date);
        const unitByIdx = new Map();
        for (const t of dayTiers) {
          if (t.unit != null) unitByIdx.set(t.index, Number(t.unit));
        }
        if (wd.tiers && typeof wd.tiers === "object") {
          for (const k in wd.tiers) {
            const t = wd.tiers[k];
            g.tratoQty += Number(t?.qty) || 0;
            // Clave del tier ("t0", "t1"…) → índice numérico, para buscar la unidad.
            const raw = String(k);
            const idx = raw.startsWith("t") ? Number(raw.slice(1)) : Number(raw);
            if (Number.isFinite(idx) && unitByIdx.has(idx)) {
              g.tratoUnits.add(unitByIdx.get(idx));
            } else if (t?.unit != null) {
              // Si no, la unidad que traiga el propio tier.
              g.tratoUnits.add(Number(t.unit));
            }
          }
        } else {
          g.tratoQty += wdQty;
          // Jornada sin tiers: la unidad del primer tier del día que la tenga.
          if (unitByIdx.size > 0) {
            g.tratoUnits.add([...unitByIdx.values()][0]);
          }
        }
        // Último recurso: labor.tratoUnit, si el snapshot lo trae.
        if (g.tratoUnits.size === 0 && labor?.tratoUnit != null) {
          g.tratoUnits.add(Number(labor.tratoUnit));
        }
      } else if (labor?.type === "tratoHE") {
        g.jornadas += wdQty;
        g.overtimeHours += Number(wd.overtimeHours) || 0;
      } else {
        // main / supervision / extra: 1 jornada por wd
        g.jornadas += 1;
      }
    }
    const rows = [...groups.values()].sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return (a.labor?.name || "").localeCompare(b.labor?.name || "", "es");
    });
    const totalAmount = rows.reduce((s, r) => s + r.amount, 0);
    const header = [detail?.faenaName, detail?.subfaenaName, cycle?.label || cycleId]
      .filter(Boolean)
      .join(" · ");
    return { cycleId, header, rows, totalAmount };
  })
  .sort((a, b) => a.header.localeCompare(b.header, "es"));

  if (cycleSections.length === 0) return null;

  const totalAllCycles = cycleSections.reduce((s, sec) => s + sec.totalAmount, 0);

  // Anticipos y bonos aplicados en esta nómina, con la fecha sacada de
  // snapshot.advances. Sin fecha, el ajuste va al final en la vista
  // cronológica.
  const advancesById = new Map((snapshot?.advances || []).map((a) => [a.id, a]));
  const anticipoRows = (item.anticipoApplications || [])
    .map((app) => {
      const adv = advancesById.get(app.advanceId);
      return {
        kind: "anticipo",
        date: adv?.date || "",
        amount: Number(app.amount) || 0,
        note: adv?.note || "",
        typeMeta: advanceTypeMeta(adv?.type || "anticipo"),
      };
    })
    .filter((r) => r.amount > 0);
  const bonoRows = (item.bonoApplications || [])
    .map((app) => {
      const adv = advancesById.get(app.advanceId);
      return {
        kind: "bono",
        date: adv?.date || "",
        amount: Number(app.amount) || 0,
        note: adv?.note || "",
        typeMeta: advanceTypeMeta(adv?.type || "bono"),
      };
    })
    .filter((r) => r.amount > 0);

  // Vista cronológica: jornadas y ajustes en una sola tabla ordenada por
  // fecha; los ajustes sin fecha quedan al final.
  const KIND_ORDER = { work: 0, anticipo: 1, bono: 2 };
  const chronoRows = [];
  for (const sec of cycleSections) {
    for (const r of sec.rows) {
      chronoRows.push({ kind: "work", date: r.date, cycleHeader: sec.header, row: r });
    }
  }
  for (const a of anticipoRows) chronoRows.push(a);
  for (const b of bonoRows) chronoRows.push(b);
  chronoRows.sort((a, b) => {
    const da = a.date || "9999-12-31";
    const db = b.date || "9999-12-31";
    if (da !== db) return da < db ? -1 : 1;
    return (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9);
  });

  // Resumen para incluir en la imagen — item ya trae los totales calculados.
  const bruto = Number(item.grossAmount || item.amount || 0);
  const anticiposTotal = Number(item.advance) || 0;
  const bonosTotal = Number(item.bonus) || 0;
  const neto = Number(item.amount) || 0;

  // Texto plano — cambia según viewMode.
  const buildPlainText = () => {
    const lines = [];
    lines.push(`📅 ${item.name} (${formatRutForDisplay(displayRut || item.rut)})`);
    lines.push(`Bruto: ${fmtCurrency(bruto)} · Anticipos: -${fmtCurrency(anticiposTotal)} · Bonos: +${fmtCurrency(bonosTotal)} · Neto: ${fmtCurrency(neto)}`);
    lines.push("");
    if (viewMode === "cronologico") {
      lines.push("Fecha   | Detalle                    | Contexto                       | Monto");
      for (const r of chronoRows) {
        const fecha = r.date ? workerDetailDateLabel(r.date) : "s/f";
        if (r.kind === "work") {
          const det = laborDisplayLabel(r.row.labor, catalogs);
          const prod = formatWorkerDetailProd(r.row, catalogs);
          const monto = fmtCurrency(r.row.amount);
          lines.push(
            `${fecha.padEnd(7, " ")} | ${det.padEnd(27, " ").slice(0, 27)} | ${(r.cycleHeader || "").padEnd(30, " ").slice(0, 30)} | ${monto}`,
          );
        } else {
          const label = r.kind === "anticipo" ? `${r.typeMeta.icon} ${r.typeMeta.label}` : `${r.typeMeta.icon} ${r.typeMeta.label}`;
          const sign = r.kind === "anticipo" ? "-" : "+";
          lines.push(
            `${fecha.padEnd(7, " ")} | ${label.padEnd(27, " ").slice(0, 27)} | ${(r.note || "").padEnd(30, " ").slice(0, 30)} | ${sign}${fmtCurrency(r.amount)}`,
          );
        }
      }
    } else {
      for (const sec of cycleSections) {
        lines.push(sec.header);
        lines.push("─".repeat(Math.min(sec.header.length, 60)));
        lines.push("Detalle Jornada          | Fecha   | Producción            | Monto");
        for (const r of sec.rows) {
          const det = laborDisplayLabel(r.labor, catalogs);
          const fecha = workerDetailDateLabel(r.date);
          const prod = formatWorkerDetailProd(r, catalogs);
          const monto = fmtCurrency(r.amount);
          lines.push(
            `${det.padEnd(24, " ").slice(0, 24)} | ${fecha.padEnd(7, " ")} | ${prod.padEnd(21, " ").slice(0, 21)} | ${monto}`,
          );
        }
        lines.push(`Subtotal ciclo: ${fmtCurrency(sec.totalAmount)}`);
        lines.push("");
      }
      if (anticipoRows.length > 0 || bonoRows.length > 0) {
        lines.push("Ajustes aplicados:");
        for (const r of anticipoRows) {
          const fecha = r.date ? workerDetailDateLabel(r.date) : "s/f";
          lines.push(`  ${r.typeMeta.icon} ${r.typeMeta.label.padEnd(10, " ")} ${fecha.padEnd(7, " ")} ${(r.note || "").padEnd(25, " ").slice(0, 25)} -${fmtCurrency(r.amount)}`);
        }
        for (const r of bonoRows) {
          const fecha = r.date ? workerDetailDateLabel(r.date) : "s/f";
          lines.push(`  ${r.typeMeta.icon} ${r.typeMeta.label.padEnd(10, " ")} ${fecha.padEnd(7, " ")} ${(r.note || "").padEnd(25, " ").slice(0, 25)} +${fmtCurrency(r.amount)}`);
        }
        lines.push("");
      }
    }
    lines.push(`NETO A PAGAR: ${fmtCurrency(neto)}`);
    return lines.join("\n");
  };

  const handleCopyText = async () => {
    setBusy("text");
    try {
      await navigator.clipboard.writeText(buildPlainText());
      toast.success("Texto copiado");
    } catch (err) {
      toast.error("Error al copiar: " + (err.message || err));
    } finally { setBusy(""); }
  };

  const handleCopyImage = async () => {
    if (!captureRef.current) return;
    setBusy("image");
    try {
      const blob = await captureFullWidthBlob(captureRef.current);
      if (!blob) throw new Error("No se pudo generar la imagen");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast.success("Imagen copiada");
    } catch (err) {
      toast.error("Error al copiar: " + (err.message || err));
    } finally { setBusy(""); }
  };

  const tabBtn = (active) =>
    `rounded-md border px-2 py-0.5 text-[10px] ${
      active
        ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-fg)]"
        : "border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-accent-soft)]"
    }`;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <span className="text-[10px] uppercase tracking-wide text-[var(--color-muted)] mr-1">Vista:</span>
          <button type="button" onClick={() => setViewMode("porCiclo")} className={tabBtn(viewMode === "porCiclo")}>
            Por ciclo
          </button>
          <button type="button" onClick={() => setViewMode("cronologico")} className={tabBtn(viewMode === "cronologico")}>
            Cronológico
          </button>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={handleCopyText}
            disabled={busy === "text"}
            title="Copiar como texto plano"
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 text-[10px] hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
          >
            {busy === "text" ? "..." : "📋 Texto"}
          </button>
          <button
            type="button"
            onClick={handleCopyImage}
            disabled={busy === "image"}
            title="Copiar como imagen (PNG)"
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 text-[10px] hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
          >
            {busy === "image" ? "..." : "📋 Imagen"}
          </button>
        </div>
      </div>
      <div ref={captureRef} style={{ background: "#fff", padding: 8 }} className="space-y-2 rounded-md">
        {/* Encabezado del trabajador */}
        <div style={{ fontSize: 11, color: "#444", borderBottom: "1px solid #ddd", paddingBottom: 4 }}>
          <b style={{ color: "#000" }}>{item.name}</b>
          <span style={{ marginLeft: 6, fontFamily: "ui-monospace, monospace" }}>{formatRutForDisplay(displayRut || item.rut)}</span>
          <span style={{ marginLeft: 8, color: "#666" }}>Producción: <b style={{ color: "#000" }}>{fmtCurrency(totalAllCycles)}</b></span>
        </div>

        {/* Resumen de pago dentro de la imagen: bruto, anticipos, bonos, neto */}
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ background: "#f8cbad" }}>
              <th style={WORKER_DETAIL_CELL_H}>Bruto</th>
              <th style={WORKER_DETAIL_CELL_H}>Anticipos</th>
              <th style={WORKER_DETAIL_CELL_H}>Bonos</th>
              <th style={{ ...WORKER_DETAIL_CELL_H, background: "#c6efce" }}>Neto a pagar</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ ...WORKER_DETAIL_CELL, fontWeight: 600 }}>{fmtCurrency(bruto)}</td>
              <td style={{ ...WORKER_DETAIL_CELL, color: anticiposTotal > 0 ? "#b45309" : "#999" }}>
                {anticiposTotal > 0 ? `− ${fmtCurrency(anticiposTotal)}` : "—"}
              </td>
              <td style={{ ...WORKER_DETAIL_CELL, color: bonosTotal > 0 ? "#166534" : "#999" }}>
                {bonosTotal > 0 ? `+ ${fmtCurrency(bonosTotal)}` : "—"}
              </td>
              <td style={{ ...WORKER_DETAIL_CELL, background: "#c6efce", fontWeight: 700 }}>{fmtCurrency(neto)}</td>
            </tr>
          </tbody>
        </table>

        {viewMode === "cronologico" ? (
          <div className="overflow-x-auto">
            <div style={{ fontSize: 12, fontWeight: 700, color: "#000", marginBottom: 4 }}>Detalle cronológico</div>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr style={{ background: "#9dc3e6" }}>
                  <th style={WORKER_DETAIL_CELL_H}>Fecha</th>
                  <th style={WORKER_DETAIL_CELL_H}>Detalle</th>
                  <th style={WORKER_DETAIL_CELL_H}>Contexto</th>
                  <th style={{ ...WORKER_DETAIL_CELL_H, textAlign: "right" }}>Producción</th>
                  <th style={{ ...WORKER_DETAIL_CELL_H, textAlign: "right" }}>Monto</th>
                </tr>
              </thead>
              <tbody>
                {chronoRows.map((r, i) => {
                  const fecha = r.date ? workerDetailDateLabel(r.date) : "s/f";
                  if (r.kind === "work") {
                    return (
                      <tr key={i}>
                        <td style={{ ...WORKER_DETAIL_CELL, fontFamily: "ui-monospace, monospace" }}>{fecha}</td>
                        <td style={WORKER_DETAIL_CELL}>
                          <div>{r.row.labor?.name || r.row.laborId}</div>
                          <div style={{ fontSize: 9, color: "#777", marginTop: 1 }}>{laborSubtypeLabel(r.row.labor, catalogs)}</div>
                        </td>
                        <td style={{ ...WORKER_DETAIL_CELL, fontSize: 10, color: "#555" }}>{r.cycleHeader}</td>
                        <td style={{ ...WORKER_DETAIL_CELL, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {formatWorkerDetailProd(r.row, catalogs)}
                        </td>
                        <td style={{ ...WORKER_DETAIL_CELL, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                          {fmtCurrency(r.row.amount)}
                        </td>
                      </tr>
                    );
                  }
                  const isAnticipo = r.kind === "anticipo";
                  const bg = isAnticipo ? "#fce4d6" : "#dcfce7";
                  const color = isAnticipo ? "#b45309" : "#166534";
                  const sign = isAnticipo ? "−" : "+";
                  return (
                    <tr key={i} style={{ background: bg }}>
                      <td style={{ ...WORKER_DETAIL_CELL, fontFamily: "ui-monospace, monospace" }}>{fecha}</td>
                      <td style={WORKER_DETAIL_CELL}>
                        <div style={{ fontWeight: 600 }}>{r.typeMeta.icon} {r.typeMeta.label}</div>
                      </td>
                      <td style={{ ...WORKER_DETAIL_CELL, fontSize: 10, color: "#555" }}>{r.note || "—"}</td>
                      <td style={{ ...WORKER_DETAIL_CELL, textAlign: "right", color: "#999" }}>—</td>
                      <td style={{ ...WORKER_DETAIL_CELL, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700, color }}>
                        {sign} {fmtCurrency(r.amount)}
                      </td>
                    </tr>
                  );
                })}
                <tr style={{ background: "#c6efce", fontWeight: 700 }}>
                  <td style={WORKER_DETAIL_CELL} colSpan={4}>NETO A PAGAR</td>
                  <td style={{ ...WORKER_DETAIL_CELL, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {fmtCurrency(neto)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <>
            {cycleSections.map((sec) => (
              <div key={sec.cycleId} className="overflow-x-auto">
                <div style={{ fontSize: 12, fontWeight: 700, color: "#000", marginBottom: 4 }}>{sec.header}</div>
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead>
                    <tr style={{ background: "#9dc3e6" }}>
                      <th style={WORKER_DETAIL_CELL_H}>Detalle Jornada</th>
                      <th style={WORKER_DETAIL_CELL_H}>Fecha</th>
                      <th style={{ ...WORKER_DETAIL_CELL_H, textAlign: "right" }}>Producción</th>
                      <th style={{ ...WORKER_DETAIL_CELL_H, textAlign: "right" }}>Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sec.rows.map((r, i) => (
                      <tr key={i}>
                        <td style={WORKER_DETAIL_CELL}>
                          <div>{r.labor?.name || r.laborId}</div>
                          <div style={{ fontSize: 9, color: "#777", marginTop: 1 }}>
                            {laborSubtypeLabel(r.labor, catalogs)}
                          </div>
                        </td>
                        <td style={{ ...WORKER_DETAIL_CELL, fontFamily: "ui-monospace, monospace" }}>{workerDetailDateLabel(r.date)}</td>
                        <td style={{ ...WORKER_DETAIL_CELL, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {formatWorkerDetailProd(r, catalogs)}
                        </td>
                        <td style={{ ...WORKER_DETAIL_CELL, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                          {fmtCurrency(r.amount)}
                        </td>
                      </tr>
                    ))}
                    <tr style={{ background: "#c6efce", fontWeight: 700 }}>
                      <td style={WORKER_DETAIL_CELL} colSpan={3}>Subtotal ciclo</td>
                      <td style={{ ...WORKER_DETAIL_CELL, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {fmtCurrency(sec.totalAmount)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ))}

            {/* Ajustes aplicados (anticipos y bonos), dentro de la imagen para
                que el detalle se entienda solo: de ahí sale el neto. */}
            {(anticipoRows.length > 0 || bonoRows.length > 0) && (
              <div className="overflow-x-auto">
                <div style={{ fontSize: 12, fontWeight: 700, color: "#000", marginBottom: 4 }}>Ajustes aplicados</div>
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead>
                    <tr style={{ background: "#f8cbad" }}>
                      <th style={WORKER_DETAIL_CELL_H}>Tipo</th>
                      <th style={WORKER_DETAIL_CELL_H}>Fecha</th>
                      <th style={WORKER_DETAIL_CELL_H}>Nota</th>
                      <th style={{ ...WORKER_DETAIL_CELL_H, textAlign: "right" }}>Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...anticipoRows, ...bonoRows].map((r, i) => {
                      const isAnticipo = r.kind === "anticipo";
                      const color = isAnticipo ? "#b45309" : "#166534";
                      const sign = isAnticipo ? "−" : "+";
                      return (
                        <tr key={i}>
                          <td style={{ ...WORKER_DETAIL_CELL, fontWeight: 600 }}>
                            {r.typeMeta.icon} {r.typeMeta.label}
                          </td>
                          <td style={{ ...WORKER_DETAIL_CELL, fontFamily: "ui-monospace, monospace" }}>
                            {r.date ? workerDetailDateLabel(r.date) : "s/f"}
                          </td>
                          <td style={{ ...WORKER_DETAIL_CELL, fontSize: 10, color: "#555" }}>{r.note || "—"}</td>
                          <td style={{ ...WORKER_DETAIL_CELL, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700, color }}>
                            {sign} {fmtCurrency(r.amount)}
                          </td>
                        </tr>
                      );
                    })}
                    <tr style={{ background: "#c6efce", fontWeight: 700 }}>
                      <td style={WORKER_DETAIL_CELL} colSpan={3}>NETO A PAGAR</td>
                      <td style={{ ...WORKER_DETAIL_CELL, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {fmtCurrency(neto)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
