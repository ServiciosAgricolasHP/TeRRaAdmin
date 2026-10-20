import { useMemo, useState, useEffect } from "react";
import { payrollsService } from "../../services/payrollsService";
import { formatRutForDisplay } from "../../utils/rutUtils";
import { useToast } from "../../contexts/ToastContext";
import { matchesSearchQuery } from "../../utils/textSearch";
import { localIsoDate } from "../../utils/dates";
import { currentRutResolver } from "../../utils/workerRut";
import { fmtCurrency } from "../../utils/format";
import { WorkerDetail } from "./WorkerDetail";
import { FaenaFilterPopover } from "./FaenaFilterPopover";

// ─────────────────── Pagos anteriores (WorkersHistory) ───────────────────
// Buscador de pagos por trabajador. Carga todas las nóminas (sin tope) y
// filtra en el cliente por rango de fechas, tipo y faena. Por defecto:
// últimos 6 meses, todas las clasificaciones.

const sixMonthsAgoISO = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  return localIsoDate(d);
};

const todayISO = () => localIsoDate();

const payrollDate = (p) => {
  if (p?.createdAt?.toDate) return p.createdAt.toDate();
  if (p?.createdAt?.seconds) return new Date(p.createdAt.seconds * 1000);
  return new Date(0);
};

const payrollDateISO = (p) => {
  const d = payrollDate(p);
  return isNaN(d.getTime()) ? "" : localIsoDate(d);
};

const normRut = (r) => String(r || "").replace(/[^a-z0-9]/gi, "").toLowerCase();

export function WorkersHistory({ faenas, workers }) {
  const rutOf = useMemo(() => currentRutResolver(workers), [workers]);
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [allPayrolls, setAllPayrolls] = useState([]);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState(sixMonthsAgoISO());
  const [dateTo, setDateTo] = useState(todayISO());
  const [classification, setClassification] = useState("all"); // all|nomina|diferencia
  const [faenaFilter, setFaenaFilter] = useState(() => new Set());
  const [faenaPickerOpen, setFaenaPickerOpen] = useState(false);
  const [selectedRut, setSelectedRut] = useState(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await payrollsService.list({ order: ["createdAt", "desc"] });
        if (!cancelled) setAllPayrolls(list);
      } catch (err) {
        toast.error("No se pudieron cargar las nóminas: " + (err?.message || err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const faenaById = useMemo(() => new Map(faenas.map((f) => [f.id, f])), [faenas]);

  // 1) Filtramos payrolls por rango de fechas + clasificación.
  const filteredPayrolls = useMemo(() => {
    return allPayrolls.filter((p) => {
      const iso = payrollDateISO(p);
      if (dateFrom && iso && iso < dateFrom) return false;
      if (dateTo && iso && iso > dateTo) return false;
      if (classification !== "all" && (p.classification || "nomina") !== classification) return false;
      return true;
    });
  }, [allPayrolls, dateFrom, dateTo, classification]);

  // 2) Índice por trabajador con sus pagos. La clave es el workerId (estable
  // aunque el rut se corrija); se muestra el rut vigente de la ficha.
  const workersIndex = useMemo(() => {
    const map = new Map();
    for (const p of filteredPayrolls) {
      for (const it of (p.items || [])) {
        if (!it.rut) continue;
        const key = it.workerId || it.rut;
        if (!map.has(key)) {
          map.set(key, {
            key,
            workerId: key,
            rut: rutOf(it.rut, it.workerId),
            name: it.name || "",
            totalAmount: 0,
            totalGross: 0,
            totalAdvance: 0,
            totalBonus: 0,
            payments: [],
          });
        }
        const w = map.get(key);
        if (it.name && (!w.name || w.name === it.rut)) w.name = it.name;
        const amount = Number(it.amount) || 0;
        const gross = Number(it.grossAmount) || amount;
        const advance = Number(it.advance) || Number(it.anticiposTotal) || 0;
        const bonus = Number(it.bonus) || Number(it.bonosTotal) || 0;
        // Faenas que cubre este pago según byCycle + cycleDetails.
        const payFaenaIds = new Set();
        const payFaenaNames = new Set();
        const cds = p.cycleDetails || [];
        for (const cid of Object.keys(it.byCycle || {})) {
          if ((it.byCycle[cid] || 0) > 0) {
            const cd = cds.find((c) => c.id === cid);
            if (cd?.faenaId) payFaenaIds.add(cd.faenaId);
            if (cd?.faenaName) payFaenaNames.add(cd.faenaName);
          }
        }
        w.totalAmount += amount;
        w.totalGross += gross;
        w.totalAdvance += advance;
        w.totalBonus += bonus;
        w.payments.push({
          payrollId: p.id,
          payrollName: p.name || "(sin nombre)",
          payrollDate: payrollDate(p),
          payrollDateISO: payrollDateISO(p),
          classification: p.classification || "nomina",
          status: p.status || "pending",
          amount, gross, advance, bonus,
          // Líder de grupo congelado al momento de la nómina (item.groupLeader
          // se persiste cuando se genera). Útil para auditoría: a quién
          // estaba asignado el trabajador entonces, no quien lo lidera hoy.
          groupLeader: it.groupLeader || "",
          faenaIds: payFaenaIds,
          faenaNames: [...payFaenaNames],
          payroll: p,
        });
      }
    }
    for (const w of map.values()) {
      w.payments.sort((a, b) => b.payrollDate - a.payrollDate);
    }
    return map;
  }, [filteredPayrolls, rutOf]);

  // 3) Filtro por faena, a nivel de pago: quedan los pagos con alguna faena del filtro.
  const workersAfterFaena = useMemo(() => {
    if (faenaFilter.size === 0) return [...workersIndex.values()];
    const out = [];
    for (const w of workersIndex.values()) {
      const filtered = w.payments.filter((pay) =>
        [...pay.faenaIds].some((fid) => faenaFilter.has(fid)),
      );
      if (filtered.length === 0) continue;
      // Recalcular totales solo con los pagos filtrados por faena.
      const totals = filtered.reduce(
        (acc, pay) => ({
          totalAmount: acc.totalAmount + pay.amount,
          totalGross: acc.totalGross + pay.gross,
          totalAdvance: acc.totalAdvance + pay.advance,
          totalBonus: acc.totalBonus + pay.bonus,
        }),
        { totalAmount: 0, totalGross: 0, totalAdvance: 0, totalBonus: 0 },
      );
      out.push({ ...w, ...totals, payments: filtered });
    }
    return out;
  }, [workersIndex, faenaFilter]);

  // 4) Filtro por búsqueda (rut o nombre) y orden por total descendente. El
  // nombre usa matchesSearchQuery (cada palabra, en cualquier orden): "ana
  // soto" encuentra a "Ana María Soto".
  const filteredWorkers = useMemo(() => {
    const list = [...workersAfterFaena].sort((a, b) => b.totalAmount - a.totalAmount);
    const q = search.trim();
    if (!q) return list;
    const qNorm = normRut(q);
    return list.filter((w) =>
      normRut(w.rut).includes(qNorm) ||
      normRut(w.workerId).includes(qNorm) ||
      matchesSearchQuery(w.name, q),
    );
  }, [workersAfterFaena, search]);

  const selectedWorker = selectedRut ? filteredWorkers.find((w) => w.key === selectedRut) || workersAfterFaena.find((w) => w.key === selectedRut) : null;

  // Faenas del filtro: las que aparecen en filteredPayrolls.
  const faenasInPayrolls = useMemo(() => {
    const ids = new Set();
    for (const p of filteredPayrolls) {
      for (const cd of p.cycleDetails || []) {
        if (cd.faenaId) ids.add(cd.faenaId);
      }
    }
    return faenas.filter((f) => ids.has(f.id));
  }, [filteredPayrolls, faenas]);

  const resetFilters = () => {
    setSearch("");
    setDateFrom(sixMonthsAgoISO());
    setDateTo(todayISO());
    setClassification("all");
    setFaenaFilter(new Set());
  };

  const setRange = (months) => {
    const today = new Date();
    const from = new Date(today);
    from.setMonth(from.getMonth() - months);
    setDateFrom(localIsoDate(from));
    setDateTo(localIsoDate(today));
  };

  const handleExport = async () => {
    if (!selectedWorker) return;
    setExporting(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Pagos");
      ws.addRow(["", ""]); // fila 1 vacía
      ws.getColumn(1).width = 4;
      ws.addRow(["", `Historial de pagos — ${selectedWorker.name} (${selectedWorker.rut})`]);
      ws.getRow(2).font = { bold: true, size: 13 };
      ws.addRow(["", `Rango: ${dateFrom} → ${dateTo} · ${classification === "all" ? "Nóminas + Diferencias" : classification === "nomina" ? "Solo nóminas" : "Solo diferencias"}`]);
      ws.addRow([]);
      const header = ["", "Fecha", "Nómina", "Tipo", "Líder", "Faenas", "Bruto", "Anticipos", "Bonos", "Neto"];
      const hdrRow = ws.addRow(header);
      hdrRow.eachCell((cell, col) => {
        if (col === 1) return;
        cell.font = { bold: true };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB7DEE8" } };
        cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
      });
      for (const pay of selectedWorker.payments) {
        const r = ws.addRow([
          "",
          pay.payrollDateISO,
          pay.payrollName,
          pay.classification === "diferencia" ? "Diferencia" : "Nómina",
          pay.groupLeader || "—",
          pay.faenaNames.join(" / ") || "—",
          Math.round(pay.gross),
          Math.round(pay.advance),
          Math.round(pay.bonus),
          Math.round(pay.amount),
        ]);
        for (let c = 7; c <= 10; c++) r.getCell(c).numFmt = '"$"#,##0';
      }
      const totalRow = ws.addRow([
        "", "", "TOTAL", "", "", "",
        Math.round(selectedWorker.totalGross),
        Math.round(selectedWorker.totalAdvance),
        Math.round(selectedWorker.totalBonus),
        Math.round(selectedWorker.totalAmount),
      ]);
      totalRow.font = { bold: true };
      totalRow.eachCell((cell, col) => {
        if (col === 1) return;
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6EFCE" } };
        if (col >= 7) cell.numFmt = '"$"#,##0';
      });
      ws.getColumn(2).width = 12;
      ws.getColumn(3).width = 30;
      ws.getColumn(4).width = 12;
      ws.getColumn(5).width = 18;
      ws.getColumn(6).width = 28;
      for (let c = 7; c <= 10; c++) ws.getColumn(c).width = 14;
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safeName = (selectedWorker.name || selectedWorker.rut).replace(/[^a-z0-9_-]+/gi, "_");
      a.href = url;
      a.download = `historial_${safeName}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (err) {
      toast.error("No se pudo exportar: " + (err?.message || err));
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return <div className="flex flex-1 items-center justify-center text-[var(--color-muted)]">Cargando nóminas…</div>;
  }

  return (
    <div className="flex flex-1 flex-col gap-3 min-h-0">
      {/* Filtros */}
      <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              // Escribir una búsqueda vuelve al listado filtrado, sin pasar
              // por "Volver".
              if (selectedRut) setSelectedRut(null);
            }}
            placeholder="🔍 Buscar por RUT o nombre…"
            className="min-w-[220px] flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
          />
          <div className="flex items-center gap-1 text-xs">
            <span className="text-[var(--color-muted)]">Desde</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-1 text-xs outline-none focus:border-[var(--color-accent)]"
            />
            <span className="text-[var(--color-muted)]">→</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-1 text-xs outline-none focus:border-[var(--color-accent)]"
            />
          </div>
          <div className="inline-flex overflow-hidden rounded-md border border-[var(--color-border)] text-xs">
            {[
              { v: 3, l: "3m" }, { v: 6, l: "6m" }, { v: 12, l: "1a" }, { v: 24, l: "2a" },
            ].map((r) => (
              <button
                key={r.v}
                onClick={() => setRange(r.v)}
                className="border-l border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 first:border-l-0 hover:bg-[var(--color-accent-soft)]"
                title={`Últimos ${r.l}`}
              >
                {r.l}
              </button>
            ))}
          </div>
          <div className="inline-flex overflow-hidden rounded-md border border-[var(--color-border)] text-xs">
            {[
              { v: "all", l: "Todos" },
              { v: "nomina", l: "📋 Nóminas" },
              { v: "diferencia", l: "🏷️ Diferencias" },
            ].map((c) => (
              <button
                key={c.v}
                onClick={() => setClassification(c.v)}
                className={`border-l border-[var(--color-border)] px-2 py-1 first:border-l-0 ${
                  classification === c.v ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]" : "bg-[var(--color-surface)] hover:bg-[var(--color-accent-soft)]"
                }`}
              >
                {c.l}
              </button>
            ))}
          </div>
          <button
            onClick={resetFilters}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-danger)]"
            title="Volver a los filtros por defecto (6 meses, todas las clasif., sin faena)"
          >
            ⟲ Restablecer
          </button>
          {faenasInPayrolls.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setFaenaPickerOpen((v) => !v)}
                className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${
                  faenaFilter.size > 0
                    ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                    : "border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-accent-soft)]"
                }`}
              >
                🏭 Faena{faenaFilter.size > 0 ? ` (${faenaFilter.size})` : ""}
                <span className="text-[9px]">{faenaPickerOpen ? "▴" : "▾"}</span>
              </button>
              {faenaPickerOpen && (
                <FaenaFilterPopover
                  faenas={faenasInPayrolls}
                  faenaFilter={faenaFilter}
                  setFaenaFilter={setFaenaFilter}
                  onClose={() => setFaenaPickerOpen(false)}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Contenido principal */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {!selectedWorker ? (
          <WorkersList
            workers={filteredWorkers}
            search={search}
            onSelect={(rut) => setSelectedRut(rut)}
          />
        ) : (
          <WorkerDetail
            worker={selectedWorker}
            onBack={() => setSelectedRut(null)}
            onExport={handleExport}
            exporting={exporting}
          />
        )}
      </div>
    </div>
  );
}

function WorkersList({ workers, search, onSelect }) {
  if (workers.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-[var(--color-border)] py-8 text-center text-sm text-[var(--color-muted)]">
        {search.trim()
          ? `Ningún trabajador coincide con "${search}" en el rango seleccionado.`
          : "No hay trabajadores con pagos en este rango/filtros."}
      </div>
    );
  }
  return (
    <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
      {workers.map((w) => (
        <button
          key={w.key}
          onClick={() => onSelect(w.key)}
          className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-left text-sm transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]"
        >
          <div className="min-w-0">
            <div className="truncate font-semibold">{w.name}</div>
            <div className="font-mono text-[11px] text-[var(--color-muted)]">{formatRutForDisplay(w.rut)}</div>
            <div className="mt-0.5 text-[11px] text-[var(--color-muted)]">
              {w.payments.length} pago{w.payments.length === 1 ? "" : "s"}
            </div>
          </div>
          <div className="text-right">
            <div className="font-bold tabular-nums text-[var(--color-accent)]">
              {fmtCurrency(w.totalAmount)}
            </div>
            {(w.totalAdvance > 0 || w.totalBonus > 0) && (
              <div className="text-[10px] text-[var(--color-muted)] tabular-nums">
                {w.totalAdvance > 0 && <span className="text-amber-600 dark:text-amber-400">−{fmtCurrency(w.totalAdvance)} </span>}
                {w.totalBonus > 0 && <span className="text-emerald-600 dark:text-emerald-400">+{fmtCurrency(w.totalBonus)}</span>}
              </div>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
