// Ventanas de impresión de los comprobantes de efectivo y del detalle de pago.
import { isCashBank } from "../../utils/banks";
import { tratoUnitLabel, tratoTypeLabel, cosechaUnit } from "../../utils/cosechaCombos";
import {
  LABOR_TYPE_LABEL,
  fmtDateShort,
  renderProductionCell,
  renderProductionTotal,
  fetchPayrollWorkdays,
  buildWorkdaysByGroup,
  computeLaborSummary,
  computeBonusAdvanceSummary,
} from "./printCommon";

function buildCashReceiptHtml(payroll, cashGroups, options = {}) {
  const cycleDetails = payroll.cycleDetails || [];
  const titleOverrides = options.titleOverrides || {};
  const workdaysByGroup = options.workdaysByGroup || {}; // { leader: { cycleId: rows[] } }
  const cyclesById = options.cyclesById || {};
  const catalogs = options.catalogs || {};
  // Rut vigente para mostrar (utils/workerRut.js); sin resolver, el guardado.
  const rutOf = options.rutOf || ((r) => r);
  const mode = options.mode || "cash"; // "cash" | "detail"
  const isDetail = mode === "detail";
  const summaries = options.summaries || [];
  const subfaenaSummary = options.subfaenaSummary || null;
  const laborSummary = options.laborSummary || null;
  const bonusAdvanceSummary = options.bonusAdvanceSummary || null;
  // Filas de ajuste (Bonos / Anticipos), comunes a "Resumen por subfaena" y
  // "Resumen por labor"; el total cuadrado sale de `adjustedTotals`.
  // `labelColspan` = columnas de etiqueta antes de las 3 de plata (bank/cash/total).
  const buildAdjustmentRowsHtml = (labelColspan) => {
    const rows = [];
    if (bonusAdvanceSummary?.bonus.total > 0) {
      rows.push(`
        <tr class="adj-row">
          <td colspan="${labelColspan}" style="text-align:right">Bonos</td>
          <td style="text-align:right">${fmt(bonusAdvanceSummary.bonus.bank)}</td>
          <td style="text-align:right">${fmt(bonusAdvanceSummary.bonus.cash)}</td>
          <td style="text-align:right">${fmt(bonusAdvanceSummary.bonus.total)}</td>
        </tr>`);
    }
    if (bonusAdvanceSummary?.advance.total > 0) {
      rows.push(`
        <tr class="adj-row">
          <td colspan="${labelColspan}" style="text-align:right">Anticipos</td>
          <td style="text-align:right">− ${fmt(bonusAdvanceSummary.advance.bank)}</td>
          <td style="text-align:right">− ${fmt(bonusAdvanceSummary.advance.cash)}</td>
          <td style="text-align:right">− ${fmt(bonusAdvanceSummary.advance.total)}</td>
        </tr>`);
    }
    return rows.join("");
  };
  const adjustedTotals = (base) => ({
    bank: base.bank + (bonusAdvanceSummary?.bonus.bank || 0) - (bonusAdvanceSummary?.advance.bank || 0),
    cash: base.cash + (bonusAdvanceSummary?.bonus.cash || 0) - (bonusAdvanceSummary?.advance.cash || 0),
    total: base.total + (bonusAdvanceSummary?.bonus.total || 0) - (bonusAdvanceSummary?.advance.total || 0),
  });
  const overviewTitle = isDetail ? "Detalle de pago" : "Comprobante de pago en efectivo";
  const docTitle = isDetail ? `${payroll.name} — Detalle pago` : `${payroll.name} — Efectivo`;
  const cycleLabel = (cycleId) => titleOverrides[cycleId] || cyclesById[cycleId]?.label || cycleDetails.find((c) => c.id === cycleId)?.label || cycleId;
  // Período del ciclo como dd/mm → dd/mm: sale de firstDay/lastDay de
  // cycleDetails y, si no están guardados, de `days` del ciclo en cyclesById.
  const fmtDayShort = (d) => {
    if (!d || typeof d !== "string") return "";
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}` : d;
  };
  const cyclePeriod = (cycleId) => {
    const cd = cycleDetails.find((c) => c.id === cycleId);
    let first = cd?.firstDay || "";
    let last = cd?.lastDay || "";
    if (!first && !last) {
      const days = cyclesById[cycleId]?.days;
      if (Array.isArray(days) && days.length) {
        const sorted = [...days].sort();
        first = sorted[0]; last = sorted[sorted.length - 1];
      }
    }
    const a = fmtDayShort(first);
    const b = fmtDayShort(last);
    if (a && b && a !== b) return `${a} → ${b}`;
    return a || b || "";
  };
  // El subtítulo solo muestra los nombres de ciclo — el período va en una
  // columna propia de la tabla, no acá.
  const cyclesLine = cycleDetails.map((c) => cycleLabel(c.id)).join(" · ");
  const fmt = (v) =>
    new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", minimumFractionDigits: 0 }).format(
      Number(v) || 0,
    );
  const fmtRut = (r) => {
    const m = String(r || "").match(/^(\d+)-([0-9KBH])$/i);
    if (!m) return r || "";
    return m[1].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "-" + m[2];
  };
  const today = new Date().toLocaleDateString("es-CL");

  // Paletas por grupo de líder (las mismas de la hoja Excel).
  const LEADER_FILLS = ["#FFE699", "#C6E0B4", "#F8CBAD", "#B4C7E7", "#E2C2F0", "#FFC9C9", "#CFE7F5", "#D9D2E9"];
  const ITEM_FILLS   = ["#FFF2CC", "#E2EFDA", "#FCE4D6", "#D9E1F2", "#EAD8F2", "#FCE0E0", "#E7F2F8", "#EEE7F4"];

  const groupsHtml = cashGroups
    .map((g, idx) => {
      const itemFill = ITEM_FILLS[idx % ITEM_FILLS.length];
      const leaderFill = LEADER_FILLS[idx % LEADER_FILLS.length];

      // Columnas solo de los ciclos donde alguien del grupo tuvo producción.
      const activeCycleIds = new Set();
      for (const it of g.items) {
        for (const cid of Object.keys(it.byCycle || {})) {
          if ((it.byCycle[cid] || 0) > 0) activeCycleIds.add(cid);
        }
      }
      const cycleCols = cycleDetails.filter((c) => activeCycleIds.has(c.id));
      const showCycleCols = cycleCols.length > 1;

      const cycleHeaders = showCycleCols
        ? cycleCols.map((c) => `<th style="text-align:right">${cycleLabel(c.id)}</th>`).join("")
        : "";

      // Las columnas Anticipo y Bono aparecen solo si alguien del grupo tiene
      // un descuento o un bono.
      const groupHasAdvance = g.items.some((it) => (Number(it.advance) || 0) > 0);
      const groupHasBonus = g.items.some((it) => (Number(it.bonus) || 0) > 0);
      const advanceHeader = groupHasAdvance
        ? `<th style="width:110px;text-align:right">Anticipo</th>`
        : "";
      const bonusHeader = groupHasBonus
        ? `<th style="width:110px;text-align:right">Bono</th>`
        : "";

      // Desglose del trabajador por (subfaena, labor), sumando todos los ciclos
      // del grupo. Va solo en el comprobante de efectivo, para que se vea de
      // dónde sale el monto antes de firmar.
      const workerBreakdown = (it) => {
        const acc = new Map();
        const groupSnapshots = workdaysByGroup[g.leader] || {};
        for (const cid of Object.keys(groupSnapshots)) {
          const cd = cycleDetails.find((c) => c.id === cid);
          const subName = cd?.subfaenaName || cd?.label || cycleLabel(cid);
          const snapshots = groupSnapshots[cid] || [];
          for (const snap of snapshots) {
            const row = snap.rows.find((r) => r.rut === it.rut);
            if (!row || !(row.totalAmount > 0)) continue;
            const key = `${subName}||${snap.laborName}`;
            const cur = acc.get(key) || { subfaena: subName, labor: snap.laborName, amount: 0 };
            cur.amount += row.totalAmount;
            acc.set(key, cur);
          }
        }
        return [...acc.values()].sort((a, b) => {
          const s = a.subfaena.localeCompare(b.subfaena, "es");
          return s !== 0 ? s : a.labor.localeCompare(b.labor, "es");
        });
      };
      const renderDetalle = (it) => {
        const list = workerBreakdown(it);
        if (list.length === 0) return "—";
        return list.map((b) =>
          `<div style="font-size:10px;line-height:1.35"><span style="color:#666">${b.subfaena} · ${b.labor}:</span> <b>${fmt(b.amount)}</b></div>`
        ).join("");
      };

      const rows = g.items
        .map((it, i, arr) => {
          // Las últimas 3 filas se marcan para no cortar la página entre ellas
          // y la firma: con `break-after:avoid` en tfoot y `break-inside:avoid`
          // en .signs-block, si la firma no entra, el navegador pasa también
          // estas filas a la página siguiente.
          const keepWithSign = i >= arr.length - 3;
          const cellsByCycle = showCycleCols
            ? cycleCols
                .map(
                  (c) =>
                    `<td style="text-align:right">${
                      it.byCycle && it.byCycle[c.id] ? fmt(it.byCycle[c.id]) : ""
                    }</td>`,
                )
                .join("")
            : "";
          const advanceCell = groupHasAdvance
            ? `<td style="text-align:right;color:#b45309">${
                Number(it.advance) > 0 ? `− ${fmt(it.advance)}` : "—"
              }</td>`
            : "";
          const bonusCell = groupHasBonus
            ? `<td style="text-align:right;color:#166534">${
                Number(it.bonus) > 0 ? `+ ${fmt(it.bonus)}` : "—"
              }</td>`
            : "";
          return `
            <tr class="${keepWithSign ? "keep-with-sign" : ""}" style="background:${itemFill}">
              <td>${i + 1}</td>
              <td>${it.name}</td>
              <td class="mono">${fmtRut(rutOf(it.rut, it.workerId))}</td>
              <td style="vertical-align:top">${renderDetalle(it)}</td>
              ${cellsByCycle}
              ${advanceCell}
              ${bonusCell}
              <td style="text-align:right"><b>${fmt(it.amount)}</b></td>
              <td></td>
            </tr>`;
        })
        .join("");

      const subtotalCells = showCycleCols
        ? cycleCols
            .map((c) => {
              const sum = g.items.reduce((s, it) => s + (it.byCycle?.[c.id] || 0), 0);
              return `<td style="text-align:right;background:${leaderFill}"><b>${fmt(sum)}</b></td>`;
            })
            .join("")
        : "";
      const advanceSubtotalCell = groupHasAdvance
        ? `<td style="text-align:right;background:${leaderFill};color:#b45309"><b>${
            (() => {
              const sum = g.items.reduce((s, it) => s + (Number(it.advance) || 0), 0);
              return sum > 0 ? `− ${fmt(sum)}` : "—";
            })()
          }</b></td>`
        : "";
      const bonusSubtotalCell = groupHasBonus
        ? `<td style="text-align:right;background:${leaderFill};color:#166534"><b>${
            (() => {
              const sum = g.items.reduce((s, it) => s + (Number(it.bonus) || 0), 0);
              return sum > 0 ? `+ ${fmt(sum)}` : "—";
            })()
          }</b></td>`
        : "";

      const totalColSpan = 3; // # + Nombre + RUT

      // Producción del grupo por ciclo, como la grilla de CycleDetail: una
      // tabla por labor, filas = trabajadores, columnas = días.
      const detailHtml = cycleCols
        .map((c) => {
          const laborSnapshots = workdaysByGroup[g.leader]?.[c.id] || [];
          if (laborSnapshots.length === 0) return "";
          const laborTables = laborSnapshots
            .map((ls) => {
              // En trato manda la unidad de los tiers del día (Árbol, Metro,
              // Polín…) si hay una sola; si no hay o hay mezcla, el tipo de
              // trato (Poda, Amarre…). En cosecha la unidad sale del envase.
              let tratoLabel = "";
              if (ls.laborType === "trato") {
                const units = ls.tratoUnits || [];
                if (units.length === 1) {
                  tratoLabel = tratoUnitLabel(catalogs, units[0]) || tratoTypeLabel(catalogs, ls.tratoType ?? 0);
                } else {
                  tratoLabel = tratoTypeLabel(catalogs, ls.tratoType ?? 0);
                }
              }
              const kilosUnit = ls.laborType === "cosecha"
                ? cosechaUnit(catalogs, new Set(ls.cosechaContainers || []))
                : "";
              const typeLabel = ls.laborType === "trato" && tratoLabel
                ? tratoLabel
                : ls.laborType === "cosecha" && kilosUnit
                  ? kilosUnit
                  : (LABOR_TYPE_LABEL[ls.laborType] || ls.laborType);
              const dayHeaders = ls.dates
                .map((d) => {
                  const price = ls.priceByDate?.[d];
                  const priceLine = price ? `<div class="muted prod-price">${price}</div>` : "";
                  return `<th class="prod-day">${fmtDateShort(d)}${priceLine}</th>`;
                })
                .join("");
              const rows = ls.rows
                .map((row) => {
                  const dayCells = ls.dates
                    .map(
                      (d) => `<td class="prod-cell">${renderProductionCell(row.cells[d], ls.laborType, tratoLabel, kilosUnit, catalogs)}</td>`,
                    )
                    .join("");
                  const rowTotalAgg = {
                    amount: row.totalAmount,
                    kilos: row.totalKilos,
                    jornadas: row.totalJornadas,
                    piso: row.totalPiso || 0,
                  };
                  return `
                    <tr>
                      <td class="prod-name">${row.name || row.rut}</td>
                      ${dayCells}
                      <td class="prod-total">${renderProductionTotal(rowTotalAgg, ls.laborType, tratoLabel, kilosUnit, catalogs)}</td>
                    </tr>`;
                })
                .join("");
              const dayTotals = ls.dates
                .map((d) => `<td class="prod-total">${renderProductionTotal(ls.dayTotals[d], ls.laborType, tratoLabel, kilosUnit, catalogs)}</td>`)
                .join("");
              const grandTotalAgg = {
                amount: ls.grandAmount,
                kilos: ls.grandKilos,
                jornadas: ls.grandJornadas,
                overtimeHours: ls.grandOvertimeHours,
                extras: ls.grandExtras,
                piso: ls.grandPiso || 0,
              };
              return `
                <div class="prod-table">
                  <h4 style="background:${itemFill}">${ls.laborName} <span class="muted">(${typeLabel})</span></h4>
                  <table class="prod">
                    <thead>
                      <tr>
                        <th class="prod-name">Trabajador</th>
                        ${dayHeaders}
                        <th class="prod-total">Total</th>
                      </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                    <tfoot>
                      <tr style="background:${leaderFill}">
                        <td class="prod-name"><b>Total día</b></td>
                        ${dayTotals}
                        <td class="prod-total">${renderProductionTotal(grandTotalAgg, ls.laborType, tratoLabel, kilosUnit, catalogs)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>`;
            })
            .join("");

          return `
            <div class="detail">
              <h3 style="background:${leaderFill}">${cycleLabel(c.id)}</h3>
              ${laborTables}
            </div>`;
        })
        .join("");

      const rowsNoSign = isDetail
        ? g.items
            .map((it, i) => {
              const cellsByCycle = showCycleCols
                ? cycleCols
                    .map(
                      (c) =>
                        `<td style="text-align:right">${
                          it.byCycle && it.byCycle[c.id] ? fmt(it.byCycle[c.id]) : ""
                        }</td>`,
                    )
                    .join("")
                : "";
              const bankTag = isCashBank(it.bankCode) ? "Efectivo" : "Transferencia";
              const advanceCell = groupHasAdvance
                ? `<td style="text-align:right;color:#b45309">${
                    Number(it.advance) > 0 ? `− ${fmt(it.advance)}` : "—"
                  }</td>`
                : "";
              const bonusCell = groupHasBonus
                ? `<td style="text-align:right;color:#166534">${
                    Number(it.bonus) > 0 ? `+ ${fmt(it.bonus)}` : "—"
                  }</td>`
                : "";
              return `
                <tr style="background:${itemFill}">
                  <td>${i + 1}</td>
                  <td>${it.name}</td>
                  <td class="mono">${fmtRut(rutOf(it.rut, it.workerId))}</td>
                  <td style="font-size:10px;color:#555">${bankTag}</td>
                  ${cellsByCycle}
                  ${advanceCell}
                  ${bonusCell}
                  <td style="text-align:right"><b>${fmt(it.amount)}</b></td>
                </tr>`;
            })
            .join("")
        : rows;

      const overviewPage = (copyLabel) => `
    <section class="receipt">
      <header>
        <div class="hd">
          <div>
            <h1 class="group-h1">${overviewTitle} <span class="group-leader-name">— ${g.leader}</span>${copyLabel ? `<span class="copy-tag">${copyLabel}</span>` : ""}</h1>
            <div class="sub">${payroll.name} · ${cyclesLine}</div>
          </div>
          <div class="meta">
            <div><b>Fecha:</b> ${today}</div>
            <div><b>Líder:</b> ${g.leader}</div>
            <div><b>Personas:</b> ${g.items.length}</div>
          </div>
        </div>
      </header>
      <table>
        <thead>
          <tr>
            <th style="width:30px">#</th>
            <th>Nombre</th>
            <th style="width:110px">RUT</th>
            ${isDetail ? '<th style="width:90px">Forma pago</th>' : '<th style="width:240px">Detalle</th>'}
            ${cycleHeaders}
            ${advanceHeader}
            ${bonusHeader}
            <th style="width:120px;text-align:right">TOTAL</th>
            ${isDetail ? "" : '<th style="width:200px">Firma</th>'}
          </tr>
        </thead>
        <tbody>
          ${isDetail ? rowsNoSign : rows}
        </tbody>
        <tfoot>
          <tr style="background:${leaderFill}">
            <td colspan="${totalColSpan + 1}" style="text-align:right"><b>Subtotal ${g.leader}</b></td>
            ${subtotalCells}
            ${advanceSubtotalCell}
            ${bonusSubtotalCell}
            <td style="text-align:right"><b>${fmt(g.total)}</b></td>
            ${isDetail ? "" : "<td></td>"}
          </tr>
        </tfoot>
      </table>
      ${isDetail ? "" : `
      <div class="signs-block">
        <div class="signs-recap">
          Subtotal ${g.leader} · ${g.items.length} persona${g.items.length === 1 ? "" : "s"}:
          <b>${fmt(g.total)}</b>
        </div>
        <div class="signs">
          <div class="sign sign-right">
            <div class="line"></div>
            <div>Firma líder (${g.leader})</div>
          </div>
        </div>
      </div>`}
    </section>`;

      return `
    ${isDetail ? overviewPage("") : overviewPage("ORIGINAL — Líder")}
    ${isDetail ? "" : overviewPage("COPIA — Empresa")}
    ${
      detailHtml
        ? `<section class="receipt detail-page">
            <div class="hd">
              <div>
                <h1 class="group-h1">Detalle de producción <span class="group-leader-name">— ${g.leader}</span></h1>
                <div class="sub">${payroll.name}</div>
              </div>
              <div class="meta"><div><b>Fecha:</b> ${today}</div></div>
            </div>
            ${detailHtml}
          </section>`
        : ""
    }`;
    })
    .join("");

  // Período cubierto por un conjunto de ciclos: primer día más temprano →
  // último día más tardío. Si hay un solo ciclo, queda el rango del ciclo
  // tal cual. Compartido entre "Resumen por subfaena" y "Resumen por labor".
  const cyclesPeriod = (cycleIds) => {
    let minFirst = null;
    let maxLast = null;
    for (const cid of cycleIds) {
      const cd = cycleDetails.find((c) => c.id === cid);
      let first = cd?.firstDay || "";
      let last = cd?.lastDay || "";
      if (!first && !last) {
        const days = cyclesById[cid]?.days;
        if (Array.isArray(days) && days.length) {
          const sorted = [...days].sort();
          first = sorted[0]; last = sorted[sorted.length - 1];
        }
      }
      if (first && (!minFirst || first < minFirst)) minFirst = first;
      if (last && (!maxLast || last > maxLast)) maxLast = last;
    }
    const a = fmtDayShort(minFirst);
    const b = fmtDayShort(maxLast);
    if (a && b && a !== b) return `${a} → ${b}`;
    return a || b || "—";
  };

  // Resumen por subfaena (primera hoja del detalle imprimible). Filas:
  // subfaena, con la faena solo en la primera fila del bloque y un subtotal
  // por faena; columnas: Período, Transferencia, Efectivo y TOTAL. Solo en
  // modo "detail".
  const subfaenaSummaryHtml = (isDetail && subfaenaSummary && subfaenaSummary.rows.length > 0)
    ? (() => {
        let prevFaena = null;
        const rowsHtml = subfaenaSummary.rows.map((r, i, arr) => {
          const showFaena = r.faenaName !== prevFaena;
          prevFaena = r.faenaName;
          const row = `
            <tr>
              <td>${showFaena ? r.faenaName : ""}</td>
              <td>${r.subfaenaName}</td>
              <td style="font-size:11px;color:#444">${cyclesPeriod(r.cycleIds)}</td>
              <td style="text-align:right">${fmt(r.bank)}</td>
              <td style="text-align:right">${fmt(r.cash)}</td>
              <td style="text-align:right"><b>${fmt(r.total)}</b></td>
            </tr>`;
          const isLastOfFaena = i === arr.length - 1 || arr[i + 1].faenaName !== r.faenaName;
          if (!isLastOfFaena) return row;
          const faenaRows = arr.filter((x) => x.faenaName === r.faenaName);
          const subBank = faenaRows.reduce((s, x) => s + x.bank, 0);
          const subCash = faenaRows.reduce((s, x) => s + x.cash, 0);
          const subTotal = faenaRows.reduce((s, x) => s + x.total, 0);
          return `${row}
            <tr class="subtotal-faena">
              <td colspan="3" style="text-align:right"><b>Sub total por faena</b></td>
              <td style="text-align:right"><b>${fmt(subBank)}</b></td>
              <td style="text-align:right"><b>${fmt(subCash)}</b></td>
              <td style="text-align:right"><b>${fmt(subTotal)}</b></td>
            </tr>`;
        }).join("");
        return `<section class="receipt summary-page">
          <div class="hd">
            <div>
              <h1>Resumen por subfaena</h1>
              <div class="sub">${payroll.name} · ${cyclesLine}</div>
            </div>
            <div class="meta"><div><b>Fecha:</b> ${today}</div></div>
          </div>
          <table class="subfaena-summary">
            <thead>
              <tr>
                <th>Faena</th>
                <th>Subfaena</th>
                <th style="width:130px">Período</th>
                <th style="text-align:right">Transferencia</th>
                <th style="text-align:right">Efectivo</th>
                <th style="text-align:right">TOTAL</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
            <tfoot>
              ${buildAdjustmentRowsHtml(3)}
              <tr class="summary-total">
                <td colspan="3"><b>TOTAL</b></td>
                <td style="text-align:right"><b>${fmt(adjustedTotals(subfaenaSummary.totals).bank)}</b></td>
                <td style="text-align:right"><b>${fmt(adjustedTotals(subfaenaSummary.totals).cash)}</b></td>
                <td style="text-align:right"><b>${fmt(adjustedTotals(subfaenaSummary.totals).total)}</b></td>
              </tr>
            </tfoot>
          </table>
        </section>`;
      })()
    : "";

  // Resumen por labor (segunda hoja del detalle imprimible): la misma tabla
  // que el resumen por subfaena, desglosada también por labor. Solo en modo
  // "detail".
  const laborSummaryHtml = (isDetail && laborSummary && laborSummary.rows.length > 0)
    ? (() => {
        let prevSubfaena = null;
        const rowsHtml = laborSummary.rows.map((r, i, arr) => {
          const showSubfaena = r.subfaenaName !== prevSubfaena;
          prevSubfaena = r.subfaenaName;
          const row = `
            <tr>
              <td>${showSubfaena ? r.faenaName : ""}</td>
              <td>${showSubfaena ? r.subfaenaName : ""}</td>
              <td>${r.laborName}</td>
              <td style="font-size:11px;color:#444">${cyclesPeriod(r.cycleIds)}</td>
              <td style="text-align:right">${fmt(r.bank)}</td>
              <td style="text-align:right">${fmt(r.cash)}</td>
              <td style="text-align:right"><b>${fmt(r.total)}</b></td>
            </tr>`;
          const isLastOfFaena = i === arr.length - 1 || arr[i + 1].faenaName !== r.faenaName;
          if (!isLastOfFaena) return row;
          const faenaRows = arr.filter((x) => x.faenaName === r.faenaName);
          const subBank = faenaRows.reduce((s, x) => s + x.bank, 0);
          const subCash = faenaRows.reduce((s, x) => s + x.cash, 0);
          const subTotal = faenaRows.reduce((s, x) => s + x.total, 0);
          return `${row}
            <tr class="subtotal-faena">
              <td colspan="4" style="text-align:right"><b>Sub total por faena</b></td>
              <td style="text-align:right"><b>${fmt(subBank)}</b></td>
              <td style="text-align:right"><b>${fmt(subCash)}</b></td>
              <td style="text-align:right"><b>${fmt(subTotal)}</b></td>
            </tr>`;
        }).join("");
        return `<section class="receipt summary-page">
          <div class="hd">
            <div>
              <h1>Resumen por labor</h1>
              <div class="sub">${payroll.name} · ${cyclesLine}</div>
            </div>
            <div class="meta"><div><b>Fecha:</b> ${today}</div></div>
          </div>
          <table class="subfaena-summary">
            <thead>
              <tr>
                <th>Faena</th>
                <th>Subfaena</th>
                <th>Labor</th>
                <th style="width:130px">Período</th>
                <th style="text-align:right">Transferencia</th>
                <th style="text-align:right">Efectivo</th>
                <th style="text-align:right">TOTAL</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
            <tfoot>
              ${buildAdjustmentRowsHtml(4)}
              <tr class="summary-total">
                <td colspan="4"><b>TOTAL</b></td>
                <td style="text-align:right"><b>${fmt(adjustedTotals(laborSummary.totals).bank)}</b></td>
                <td style="text-align:right"><b>${fmt(adjustedTotals(laborSummary.totals).cash)}</b></td>
                <td style="text-align:right"><b>${fmt(adjustedTotals(laborSummary.totals).total)}</b></td>
              </tr>
            </tfoot>
          </table>
        </section>`;
      })()
    : "";

  const summariesHtml = (isDetail && summaries.length > 0)
    ? `<section class="receipt summary-page">
        <div class="hd">
          <div>
            <h1>Resumen por grupo</h1>
            <div class="sub">${payroll.name} · ${cyclesLine}</div>
          </div>
          <div class="meta"><div><b>Fecha:</b> ${today}</div></div>
        </div>
        ${summaries.map((s) => {
          const rowsHtml = s.rows.map((r) => {
            const faenas = (r.byFaena && r.byFaena.length > 0)
              ? r.byFaena
              : [{ faenaName: "—", total: r.total }];
            return faenas.map((f, i) => `
              <tr>
                <td>${i === 0 ? `<b>${r.leader}</b>` : ""}</td>
                <td>${f.faenaName}</td>
                <td style="text-align:right">${fmt(f.total)}</td>
              </tr>`).join("");
          }).join("");
          return `
          <div class="summary-block">
            <h3>${s.title}</h3>
            <table class="group-summary">
              <thead>
                <tr>
                  <th>Líder</th>
                  <th>Faena</th>
                  <th style="text-align:right">TOTAL</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
              <tfoot>
                <tr class="summary-total">
                  <td colspan="2"><b>Total ${s.title}</b></td>
                  <td style="text-align:right"><b>${fmt(s.total)}</b></td>
                </tr>
              </tfoot>
            </table>
          </div>`;
        }).join("")}
      </section>`
    : "";

  return `<!doctype html><html><head><meta charset="utf-8"><title>${docTitle}</title>
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; margin: 0; color: #222; }
  .receipt { padding: 22px 28px; page-break-after: always; }
  .receipt:last-child { page-break-after: auto; }
  .hd { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; border-bottom: 2px solid #555; padding-bottom: 10px; margin-bottom: 12px; }
  h1 { margin: 0 0 4px; font-size: 18px; }
  .copy-tag { font-size: 10px; font-weight: 600; padding: 2px 8px; margin-left: 8px; border: 1px solid #999; border-radius: 4px; vertical-align: middle; background: #FFE699; color: #555; }
  .sub { color: #666; font-size: 12px; }
  .meta { font-size: 12px; text-align: right; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #B7DEE8; }
  th, td { border: 1px solid #999; padding: 5px 7px; }
  th .muted { font-weight: normal; color: #666; font-size: 10px; }
  .mono { font-family: ui-monospace, monospace; }
  /* Bloque firma + recap del subtotal. El recap repite el subtotal del grupo
     justo encima de la firma — si la paginación rompe entre la tabla y la
     firma, el recap garantiza que la página de la firma no quede vacía de
     contexto (subtotal grupo X · N personas · $YYY). break-inside: avoid
     mantiene el recap pegado a la firma como una unidad. Tamaños comprimidos
     ~75% del original para minimizar casos borde de paginación. */
  /* Cadena de "avoid break" para que la firma jamás quede sola en una hoja:
     últimas 3 filas (.keep-with-sign) → tfoot → .signs-block. Si la firma
     no entra en la página actual, el navegador empuja también las 3 filas
     marcadas y el tfoot a la página siguiente. Soportado por todos los
     navegadores modernos en print (Chrome/Edge/Firefox/Safari). */
  tbody tr.keep-with-sign { break-after: avoid; page-break-after: avoid; }
  tfoot { break-after: avoid; page-break-after: avoid; }
  .signs-block { break-inside: avoid; page-break-inside: avoid; margin-top: 18px; }
  .signs-recap { text-align: right; font-size: 10px; color: #444; padding: 4px 0; border-top: 1px dashed #999; }
  .signs { display: flex; justify-content: flex-end; margin-top: 18px; gap: 45px; font-size: 11px; }
  .sign { width: 210px; text-align: center; }
  .sign-right { margin-left: auto; }
  .line { border-top: 1px solid #444; margin-bottom: 3px; height: 22px; }
  .detail-title { font-size: 14px; margin: 24px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #999; }
  .detail { margin-top: 12px; }
  .detail h3 { font-size: 12px; padding: 4px 8px; margin: 0 0 6px; border: 1px solid #999; }
  .prod-table { margin: 6px 0 12px; }
  .prod-table h4 { font-size: 11px; padding: 3px 6px; margin: 0 0 0; border: 1px solid #999; border-bottom: none; }
  .prod-table h4 .muted { font-weight: normal; color: #555; font-size: 10px; }
  table.prod { width: 100%; font-size: 10px; table-layout: auto; }
  table.prod .prod-name { text-align: left; min-width: 110px; }
  table.prod .prod-day { text-align: center; min-width: 60px; }
  table.prod .prod-cell { text-align: center; }
  table.prod .prod-cell .muted { color: #555; font-size: 9px; }
  table.prod .prod-day .prod-price { color: #555; font-size: 9px; font-weight: normal; margin-top: 1px; }
  table.prod .prod-breakdown { font-size: 9px; color: #555; line-height: 1.2; }
  .summary-block { margin: 16px 0; }
  .summary-block h3 { font-size: 13px; margin: 0 0 6px; padding: 4px 8px; background: #F2F2F2; border: 1px solid #999; }
  table.summary { width: 60%; min-width: 320px; }
  table.summary .summary-total td { background: #FFE699; }
  table.group-summary { width: 100%; margin-top: 8px; }
  table.group-summary .summary-total td { background: #FFE699; }
  h1.group-h1 { font-size: 22px; }
  h1.group-h1 .group-leader-name { color: #555; font-weight: 600; }
  table.subfaena-summary { width: 100%; margin-top: 8px; }
  table.subfaena-summary .summary-total td { background: #FFE699; }
  table.subfaena-summary .subtotal-faena td { background: #F2F2F2; font-style: italic; }
  table.subfaena-summary .adj-row td { background: #EAF3FA; }
  table.subfaena-summary .pending-row td { background: #FFF4E5; }
  table.prod .prod-total { text-align: right; min-width: 70px; }
  @media print { @page { margin: 14mm landscape; } .receipt { padding: 0; } }
</style>
</head><body>${subfaenaSummaryHtml}${laborSummaryHtml}${summariesHtml}${groupsHtml}
<script>window.onload = () => { window.focus(); window.print(); };</script>
</body></html>`;
}

export async function printPaymentDetails(payroll, allGroups, titleOverrides = {}, summaries = [], catalogs = {}, subfaenaSummary = null, payrollData = null, rutOf = undefined) {
  if (allGroups.length === 0) return;
  const allItems = allGroups.flatMap((g) => g.items);
  // `payrollData` viene memorizado desde el modal; si no llega, se lee acá.
  const data = payrollData || (await fetchPayrollWorkdays(payroll));
  const { cyclesById } = data;
  const workdaysByGroup = buildWorkdaysByGroup(allGroups, data, catalogs);
  const laborSummary = computeLaborSummary(payroll, allGroups, workdaysByGroup);
  const bonusAdvanceSummary = computeBonusAdvanceSummary(allItems);

  const html = buildCashReceiptHtml(payroll, allGroups, {
    titleOverrides,
    workdaysByGroup,
    cyclesById,
    catalogs,
    mode: "detail",
    summaries,
    subfaenaSummary,
    laborSummary,
    bonusAdvanceSummary,
    rutOf,
  });
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) {
    throw new Error("Permite las ventanas emergentes para imprimir.");
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

export async function printCashReceipts(payroll, cashGroups, titleOverrides = {}, catalogs = {}, payrollData = null, rutOf = undefined) {
  // La hoja que firma el líder deja fuera a quien no cobra nada ni produjo:
  // los días de asistencia de un sueldo mensual, que entran a la nómina solo
  // para quedar etiquetados. El corte es por bruto: quien produjo y quedó en
  // cero por un anticipo sí va en la hoja, como saldado.
  const gruposConPago = cashGroups
    .map((g) => {
      const items = g.items.filter(
        (it) => Math.round(Number(it.amount) || 0) > 0 || Math.round(Number(it.grossAmount) || 0) > 0,
      );
      return { ...g, items, total: items.reduce((sum, it) => sum + (Number(it.amount) || 0), 0) };
    })
    .filter((g) => g.items.length > 0);
  if (gruposConPago.length === 0) return;
  cashGroups = gruposConPago;

  const data = payrollData || (await fetchPayrollWorkdays(payroll));
  const { cyclesById } = data;
  // Los grupos son SOLO los de efectivo: la hoja que firma el líder no puede
  // mostrar la producción de su gente de banco.
  const workdaysByGroup = buildWorkdaysByGroup(cashGroups, data, catalogs);

  const html = buildCashReceiptHtml(payroll, cashGroups, {
    titleOverrides,
    workdaysByGroup,
    cyclesById,
    catalogs,
    rutOf,
  });
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) {
    throw new Error("Permite las ventanas emergentes para imprimir.");
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
