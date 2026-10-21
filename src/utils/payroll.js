// Helpers de nómina: lo de cada trabajador y el Excel de la nómina (la hoja del
// banco, Resumen, Transferencias y Efectivo).
// ExcelJS se carga lazy, solo al exportar.
import { bankName, isCashBank } from "./banks";
import { getTratoTierTotals } from "./cosechaCombos";

// Lo que una jornada suma al bruto. Trato puede venir repartido en tiers.
// También lo usa el selector de días de "Agregar persona", así muestra lo
// mismo que después entra a la nómina.
export function workdayPayAmount(wd, laborType) {
  return laborType === "trato" ? getTratoTierTotals(wd).amount : Number(wd.amount) || 0;
}

// Suma lo de cada trabajador, en total y por ciclo, según el tipo de labor.
// Devuelve [{ rut, workerId, total, byCycle: { [cycleId]: amount }, workdayIds: [] }]
export function aggregateWorkerAmounts(workdays, laborTypeById) {
  const byWorker = new Map();
  for (const wd of workdays) {
    if (!wd.workerRut) continue;
    const amount = workdayPayAmount(wd, laborTypeById.get(wd.laborId));
    // Un día en cero SÍ entra a `workdayIds`, así queda etiquetado con
    // `payrollId` y cuadra el "pagado / pendiente" del ciclo. Es el caso de
    // los días de asistencia de un sueldo mensual (`attendanceOnly: true,
    // amount: 0`). El archivo del banco los filtra (ver `utils/bankFormats.js`).
    if (!byWorker.has(wd.workerRut)) {
      // workerId es el id estable del trabajador; si el workday no lo trae,
      // se usa el rut.
      byWorker.set(wd.workerRut, { rut: wd.workerRut, workerId: wd.workerId || wd.workerRut, total: 0, byCycle: {}, workdayIds: [] });
    }
    const e = byWorker.get(wd.workerRut);
    e.total += amount;
    e.byCycle[wd.cycleId] = (e.byCycle[wd.cycleId] || 0) + amount;
    if (wd.id) e.workdayIds.push(wd.id);
  }
  return [...byWorker.values()];
}

// Valida el número de cuenta: null si está bien (o si es efectivo), o el texto
// del error. Son chequeos básicos, no del formato de cada banco.
export function validateAccountNumber(accountNumber, bankCode) {
  if (isCashBank(bankCode)) return null;
  const s = String(accountNumber || "").trim();
  if (!s) return "cuenta vacía";
  if (!/^[0-9-]+$/.test(s)) return "contiene caracteres no numéricos";
  const digits = s.replace(/-/g, "");
  if (digits.length < 4) return "muy corta (<4 dígitos)";
  if (digits.length > 20) return "demasiado larga";
  if (/^0+$/.test(digits)) return "todo ceros";
  return null;
}

export function splitBankAndCash(items) {
  const bank = [];
  const cash = [];
  for (const it of items) {
    if (isCashBank(it.bankCode)) cash.push(it);
    else bank.push(it);
  }
  return { bank, cash };
}

// Nombre del líder en MAYÚSCULAS y sin espacios en los bordes, para que los que
// solo difieren en mayúsculas caigan en el mismo grupo ("Grupo Norte" /
// "GRUPO NORTE" / "grupo norte").
export function normalizeLeader(s) {
  return String(s || "").trim().toUpperCase();
}

export function groupCashByLeader(cashItems) {
  const groups = new Map();
  for (const it of cashItems) {
    const leader = normalizeLeader(it.groupLeader) || "Sin líder";
    if (!groups.has(leader)) groups.set(leader, { leader, items: [], total: 0 });
    const g = groups.get(leader);
    g.items.push(it);
    g.total += Number(it.amount) || 0;
  }
  return [...groups.values()].sort((a, b) => a.leader.localeCompare(b.leader));
}

export const groupItemsByLeader = groupCashByLeader;

// ─────────────────────────── Estilos ───────────────────────────
const BORDER_THIN = { style: "thin", color: { argb: "FF999999" } };
const BORDER_ALL = { top: BORDER_THIN, left: BORDER_THIN, bottom: BORDER_THIN, right: BORDER_THIN };

const fill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

// Encabezado (celeste).
const STYLE_HEADER = { font: { bold: true }, fill: fill("FFB7DEE8"), border: BORDER_ALL, alignment: { vertical: "middle" } };

// Colores por grupo de líder (subtotal e items): se alternan para que cada grupo se distinga.
const LEADER_FILLS = ["FFFFE699", "FFC6E0B4", "FFF8CBAD", "FFB4C7E7", "FFE2C2F0", "FFFFC9C9", "FFCFE7F5", "FFD9D2E9"];
const ITEM_FILLS = ["FFFFF2CC", "FFE2EFDA", "FFFCE4D6", "FFD9E1F2", "FFEAD8F2", "FFFCE0E0", "FFE7F2F8", "FFEEE7F4"];

const STYLE_GROUP_TOTAL = (idx) => ({
  font: { bold: true },
  fill: fill(LEADER_FILLS[idx % LEADER_FILLS.length]),
  border: BORDER_ALL,
});
const STYLE_GROUP_ITEM = (idx) => ({
  fill: fill(ITEM_FILLS[idx % ITEM_FILLS.length]),
  border: BORDER_ALL,
});

const STYLE_GRAND_TOTAL = { font: { bold: true, size: 12 }, fill: fill("FFC6EFCE"), border: BORDER_ALL };
const STYLE_BANK_TOTAL = { font: { bold: true }, fill: fill("FFD9E1F2"), border: BORDER_ALL };
const STYLE_CELL = { border: BORDER_ALL };

// ─────────────────────────── Hoja del banco ───────────────────────────
// La hoja que se sube al banco, en el formato elegido (`utils/bankFormats.js`).
function buildBankSheet(wb, format, items) {
  const ws = wb.addWorksheet(format.sheetName);
  ws.addRow(format.headers);
  for (const row of format.buildRows(items)) ws.addRow(row);
  ws.getRow(1).eachCell((c) => (c.style = STYLE_HEADER));
  format.columnWidths.forEach((width, i) => {
    ws.getColumn(i + 1).width = width;
  });
  return ws;
}

// ─────────────────────────── Hoja Transferencias ───────────────────────────
// items: los de banco; cycles: [{ id, label }]
function buildTransferenciasSheet(wb, items, cycles) {
  const ws = wb.addWorksheet("Transferencias");
  const cycleHeaders = cycles.map((c) => c.label || c.id);
  const headers = ["RUT", "NOMBRE", ...cycleHeaders, "TOTAL"];
  ws.addRow(headers);

  for (const it of items) {
    const cycleAmounts = cycles.map((c) =>
      it.byCycle && it.byCycle[c.id] ? Math.round(it.byCycle[c.id]) : "",
    );
    ws.addRow([
      it.rut,
      it.name,
      ...cycleAmounts,
      Math.round(Number(it.amount) || 0),
    ]);
  }

  const totalsByCycle = cycles.map((c) =>
    items.reduce((s, it) => s + (it.byCycle?.[c.id] || 0), 0),
  );
  const grand = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
  const totalsRow = ws.addRow([
    "",
    "TOTAL CICLO",
    ...totalsByCycle.map((v) => Math.round(v)),
    Math.round(grand),
  ]);

  ws.getRow(1).eachCell((c) => (c.style = STYLE_HEADER));
  // Celdas de datos: bordes y formato de moneda en las columnas numéricas.
  const totalCol = headers.length;
  for (let r = 2; r < totalsRow.number; r++) {
    const row = ws.getRow(r);
    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.style = { ...STYLE_CELL };
      if (colNum >= 3) cell.numFmt = '"$"#,##0;[Red]"$"#,##0;""';
    });
  }
  totalsRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
    cell.style = colNum === totalCol ? STYLE_GRAND_TOTAL : STYLE_BANK_TOTAL;
    if (colNum >= 3) cell.numFmt = '"$"#,##0';
  });

  ws.getColumn(1).width = 14;
  ws.getColumn(2).width = 28;
  for (let i = 3; i <= totalCol; i++) ws.getColumn(i).width = 14;
}

// ─────────────────────────── Hoja Efectivo ───────────────────────────
function buildEfectivoSheet(wb, cashItems, cycles) {
  if (cashItems.length === 0) return;
  const ws = wb.addWorksheet("Efectivo");
  const cycleHeaders = cycles.map((c) => c.label || c.id);
  const headers = ["LÍDER", "RUT", "NOMBRE", ...cycleHeaders, "TOTAL"];
  ws.addRow(headers);
  ws.getRow(1).eachCell((c) => (c.style = STYLE_HEADER));

  const totalCol = headers.length;
  const groups = groupCashByLeader(cashItems);

  let leaderIdx = 0;
  for (const g of groups) {
    const leaderStyleTotal = STYLE_GROUP_TOTAL(leaderIdx);
    const leaderStyleItem = STYLE_GROUP_ITEM(leaderIdx);

    // Primero las personas del grupo, después su subtotal.
    for (const it of g.items) {
      const cycleAmounts = cycles.map((c) =>
        it.byCycle && it.byCycle[c.id] ? Math.round(it.byCycle[c.id]) : "",
      );
      const row = ws.addRow([
        leaderIdx === 0 || g.items.indexOf(it) === 0 ? g.leader : "",
        it.rut,
        it.name,
        ...cycleAmounts,
        Math.round(Number(it.amount) || 0),
      ]);
      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        cell.style = { ...leaderStyleItem };
        if (colNum >= 4) cell.numFmt = '"$"#,##0;[Red]"$"#,##0;""';
      });
    }

    const subTotalsByCycle = cycles.map((c) =>
      g.items.reduce((s, it) => s + (it.byCycle?.[c.id] || 0), 0),
    );
    const subRow = ws.addRow([
      "",
      "",
      `Subtotal ${g.leader}`,
      ...subTotalsByCycle.map((v) => Math.round(v)),
      Math.round(g.total),
    ]);
    subRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.style = { ...leaderStyleTotal };
      if (colNum >= 4) cell.numFmt = '"$"#,##0';
    });

    // Fila vacía, sin relleno, entre grupos.
    ws.addRow([]);
    leaderIdx++;
  }

  const grandTotalsByCycle = cycles.map((c) =>
    cashItems.reduce((s, it) => s + (it.byCycle?.[c.id] || 0), 0),
  );
  const grand = cashItems.reduce((s, it) => s + (Number(it.amount) || 0), 0);
  const grandRow = ws.addRow([
    "",
    "",
    "TOTAL EFECTIVO",
    ...grandTotalsByCycle.map((v) => Math.round(v)),
    Math.round(grand),
  ]);
  grandRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
    cell.style = STYLE_GRAND_TOTAL;
    if (colNum >= 4) cell.numFmt = '"$"#,##0';
  });

  ws.getColumn(1).width = 18;
  ws.getColumn(2).width = 14;
  ws.getColumn(3).width = 28;
  for (let i = 4; i <= totalCol; i++) ws.getColumn(i).width = 14;
}

// ─────────────────────────── Hoja Resumen ───────────────────────────
// Rango "dd/mm → dd/mm", o "dd/mm" si es un solo día. Recibe strings
// "YYYY-MM-DD" (los de cycle.days). Si falta uno devuelve el otro, y "—" si
// faltan los dos.
function fmtPeriod(first, last) {
  const fmt = (d) => {
    if (!d || typeof d !== "string") return "";
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return d;
    return `${m[3]}/${m[2]}`;
  };
  const a = fmt(first);
  const b = fmt(last);
  if (a && b && a !== b) return `${a} → ${b}`;
  return a || b || "—";
}

function buildResumenSheet(wb, bankItems, cashItems, cycles) {
  const ws = wb.addWorksheet("Resumen");
  const headers = ["Concepto", ...cycles.map((c) => c.label || c.id), "TOTAL"];
  ws.addRow(headers);
  ws.getRow(1).eachCell((c) => (c.style = STYLE_HEADER));

  // Fila Período: primer y último día de cada ciclo. Solo va si al menos un
  // ciclo trae firstDay/lastDay.
  const hasAnyPeriod = cycles.some((c) => c.firstDay || c.lastDay);
  if (hasAnyPeriod) {
    const periodRow = ws.addRow([
      "Período",
      ...cycles.map((c) => fmtPeriod(c.firstDay, c.lastDay)),
      "",
    ]);
    periodRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.style = {
        font: { italic: true, color: { argb: "FF595959" } },
        fill: fill("FFF2F2F2"),
        border: BORDER_ALL,
        alignment: { horizontal: "center" },
      };
    });
  }

  const sumByCycle = (items) =>
    cycles.map((c) => items.reduce((s, it) => s + (it.byCycle?.[c.id] || 0), 0));
  const sum = (items) => items.reduce((s, it) => s + (Number(it.amount) || 0), 0);

  const bankRow = ws.addRow([
    "🏦 Transferencias",
    ...sumByCycle(bankItems).map((v) => Math.round(v)),
    Math.round(sum(bankItems)),
  ]);
  bankRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
    cell.style = STYLE_BANK_TOTAL;
    if (colNum >= 2) cell.numFmt = '"$"#,##0';
  });

  const cashRow = ws.addRow([
    "💵 Efectivo",
    ...sumByCycle(cashItems).map((v) => Math.round(v)),
    Math.round(sum(cashItems)),
  ]);
  cashRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
    cell.style = { font: { bold: true }, fill: fill("FFFFE699"), border: BORDER_ALL };
    if (colNum >= 2) cell.numFmt = '"$"#,##0';
  });

  const total = sum(bankItems) + sum(cashItems);
  const totalByCycle = cycles.map(
    (c, i) => sumByCycle(bankItems)[i] + sumByCycle(cashItems)[i],
  );
  const totalRow = ws.addRow([
    "TOTAL GENERAL",
    ...totalByCycle.map((v) => Math.round(v)),
    Math.round(total),
  ]);
  totalRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
    cell.style = STYLE_GRAND_TOTAL;
    if (colNum >= 2) cell.numFmt = '"$"#,##0';
  });

  ws.getColumn(1).width = 28;
  for (let i = 2; i <= headers.length; i++) ws.getColumn(i).width = 14;
}

// ─────────────────────────── API pública ───────────────────────────
async function writeWorkbook(wb, filename) {
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// El Excel completo: la hoja del banco en el formato `format`, Resumen,
// Transferencias y Efectivo.
export async function downloadPayrollXlsx(items, filename = "Nomina", cycles = [], format) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const { bank, cash } = splitBankAndCash(items);

  // La hoja del banco va primera: es la que ingiere el banco.
  buildBankSheet(wb, format, bank);
  buildResumenSheet(wb, bank, cash, cycles);
  buildTransferenciasSheet(wb, bank, cycles);
  buildEfectivoSheet(wb, cash, cycles);

  await writeWorkbook(wb, filename);
}

// Solo la hoja del banco: el archivo que se sube a su portal.
export async function downloadBankFileXlsx(items, filename = "Nomina", format) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const { bank } = splitBankAndCash(items);
  buildBankSheet(wb, format, bank);
  await writeWorkbook(wb, filename);
}

export function payrollSuggestedName(date = new Date()) {
  const year = date.getFullYear();
  const months = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ];
  const month = months[date.getMonth()];
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${year}${month}Semana${week}`;
}

export { bankName };
