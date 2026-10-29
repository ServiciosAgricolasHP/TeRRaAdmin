import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { useToast } from "../contexts/ToastContext";
import { jobsService, priceBookService, priceBookConfigService } from "../services";
import ConfirmDialog from "../components/ConfirmDialog";
import ScreenLoader from "../components/ScreenLoader";
import { fmtCurrency } from "../utils/format";
import HiddenFaenasModal from "./priceBook/HiddenFaenasModal";
import EntryFormModal from "./priceBook/EntryFormModal";
import { DATALIST_ID, fmtRange } from "./priceBook/helpers";
import { writePriceBookXlsx } from "./priceBook/writePriceBookXlsx";

// Registro contable de precios por faena y labor, independiente de las
// faenas, ciclos y labores reales: acepta faenas "dummy" (solo un nombre, sin
// doc) para temporadas que no están en el sistema. Las unidades son un
// catálogo propio del libro, que crece solo al escribir unidades nuevas en el
// <datalist>. Una entrada puede tener varias líneas de precio (p. ej. parte
// por kilo y parte por metro en el mismo período).

const DEFAULT_UNITS = ["Kilo", "Metro", "Jornada", "Hora", "Trato", "Bandeja", "Capacho"];

const groupKeyOf = (entry) => entry.faenaId || `dummy:${entry.faenaLabel}`;

export default function PriceBook() {
  const toast = useToast();
  const [faenas, setFaenas] = useState([]);
  const [entries, setEntries] = useState([]);
  const [hiddenFaenaIds, setHiddenFaenaIds] = useState(new Set());
  const [units, setUnits] = useState(DEFAULT_UNITS);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(new Set());
  const [formEntry, setFormEntry] = useState(null); // null | {} (nueva) | entry existente
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [hiddenModalOpen, setHiddenModalOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const [fa, en, cfg] = await Promise.all([
        jobsService.list({ order: ["name", "asc"], cache: true }),
        priceBookService.list({ order: ["dateFrom", "desc"] }),
        priceBookConfigService.getById("main"),
      ]);
      setFaenas(fa);
      setEntries(en);
      setHiddenFaenaIds(new Set(cfg?.hiddenFaenaIds || []));
      setUnits(cfg?.units?.length ? cfg.units : DEFAULT_UNITS);
    } catch (err) {
      toast.error("No se pudo cargar el libro de precios: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Carga al montar; `useEffectEvent` lee la versión actual de la función sin
  // volver a correr el efecto cuando cambia.
  const loadOnMount = useEffectEvent(() => reload());
  useEffect(() => { loadOnMount(); }, []);

  const faenaById = useMemo(() => new Map(faenas.map((f) => [f.id, f])), [faenas]);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const map = new Map();
    for (const e of entries) {
      const key = groupKeyOf(e);
      if (!map.has(key)) {
        map.set(key, {
          key,
          faenaId: e.faenaId || null,
          faenaLabel: e.faenaId ? faenaById.get(e.faenaId)?.name || e.faenaLabel : e.faenaLabel,
          isDummy: !e.faenaId,
          entries: [],
        });
      }
      map.get(key).entries.push(e);
    }
    let list = [...map.values()];
    if (q) {
      list = list
        .map((g) => ({
          ...g,
          entries: g.faenaLabel?.toLowerCase().includes(q)
            ? g.entries
            : g.entries.filter((e) => e.labor?.toLowerCase().includes(q)),
        }))
        .filter((g) => g.entries.length > 0);
    }
    list.forEach((g) => g.entries.sort((a, b) => (b.dateFrom || "").localeCompare(a.dateFrom || "")));
    list.sort((a, b) => (b.entries[0]?.dateFrom || "").localeCompare(a.entries[0]?.dateFrom || ""));
    return list;
  }, [entries, search, faenaById]);

  const toggleExpanded = (key) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleteBusy(true);
    try {
      await priceBookService.remove(confirmDelete.id);
      setConfirmDelete(null);
      toast.success("Entrada eliminada");
      await reload();
    } catch (err) {
      toast.error("No se pudo eliminar: " + (err.message || err));
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await writePriceBookXlsx(groups);
    } catch (err) {
      toast.error("No se pudo exportar: " + err.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <datalist id={DATALIST_ID}>
        {units.map((u) => <option key={u} value={u} />)}
      </datalist>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">📖 Libro de Precios</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Registro contable de precios por faena y labor — incluye faenas antiguas que no están en el sistema.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setHiddenModalOpen(true)}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)]"
          >
            ⚙ Faenas visibles
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || entries.length === 0}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {exporting ? "Exportando…" : "⬇ Exportar Excel"}
          </button>
          <button
            onClick={() => setFormEntry({})}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]"
          >
            + Agregar entrada
          </button>
        </div>
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar por faena o labor…"
        className="w-full max-w-sm rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
      />

      {loading ? (
        <ScreenLoader />
      ) : groups.length === 0 ? (
        <p className="rounded-md border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-muted)]">
          {entries.length === 0 ? "No hay entradas todavía." : "No hay resultados para esa búsqueda."}
        </p>
      ) : (
        <div className="space-y-2">
          {groups.map((g) => {
            const isOpen = expanded.has(g.key);
            return (
              <div key={g.key} className="rounded-md border border-[var(--color-border)]">
                <button
                  onClick={() => toggleExpanded(g.key)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-[var(--color-surface-2)]"
                >
                  <span className="flex items-center gap-2 font-medium">
                    <span>{isOpen ? "▾" : "▸"}</span>
                    <span>{g.faenaLabel || "(sin nombre)"}</span>
                    {g.isDummy && (
                      <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[10px] uppercase text-[var(--color-muted)]">
                        histórica
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-[var(--color-muted)]">{g.entries.length} entrada(s)</span>
                </button>
                {isOpen && (
                  <div className="overflow-x-auto border-t border-[var(--color-border)]">
                    <table className="w-full min-w-[760px] table-fixed text-sm">
                      <colgroup>
                        <col className="w-[15%]" />
                        <col className="w-[32%]" />
                        <col className="w-[25%]" />
                        <col className="w-[16%]" />
                        <col className="w-[12%]" />
                      </colgroup>
                      <thead className="bg-[var(--color-surface-2)] text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
                        <tr>
                          <th className="px-3 py-2">Labor</th>
                          <th className="px-3 py-2">Precios</th>
                          <th className="px-3 py-2">Transporte</th>
                          <th className="px-3 py-2">Período</th>
                          <th className="px-3 py-2 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--color-border)]">
                        {g.entries.map((e) => (
                          <tr key={e.id}>
                            <td className="px-3 py-2 align-top">{e.labor}</td>
                            <td className="px-3 py-2 align-top break-words">
                              <div className="space-y-1">
                                {(e.prices || []).map((p, i) => {
                                  const margin = (Number(p.chargePrice) || 0) - (Number(p.payPrice) || 0);
                                  const heMargin = (Number(p.overtimeChargePrice) || 0) - (Number(p.overtimePayPrice) || 0);
                                  return (
                                    <div key={i}>
                                      <div>
                                        <span className="font-medium">{p.unit}{p.label ? ` (${p.label})` : ""}:</span>{" "}
                                        <span className="tabular-nums">{fmtCurrency(p.payPrice)} pagado</span>
                                        {" / "}
                                        <span className="tabular-nums">{fmtCurrency(p.chargePrice)} cobrado</span>{" "}
                                        <span className={`tabular-nums ${margin < 0 ? "text-[var(--color-danger)]" : "text-[var(--color-success,#16a34a)]"}`}>
                                          ({fmtCurrency(margin)})
                                        </span>
                                      </div>
                                      {p.hasOvertime && (
                                        <div className="pl-3 text-xs text-[var(--color-muted)]">
                                          ⏱ Horas extra: <span className="tabular-nums">{fmtCurrency(p.overtimePayPrice)} pagado</span>
                                          {" / "}
                                          <span className="tabular-nums">{fmtCurrency(p.overtimeChargePrice)} cobrado</span>{" "}
                                          <span className={`tabular-nums ${heMargin < 0 ? "text-[var(--color-danger)]" : "text-[var(--color-success,#16a34a)]"}`}>
                                            ({fmtCurrency(heMargin)})
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </td>
                            <td className="px-3 py-2 align-top break-words">
                              {e.transportIncluded ? (
                                "Transporte incluido"
                              ) : (
                                <span title={e.transportWhere || ""}>
                                  No incluido — {e.transportWhere || "sin especificar"} ({fmtCurrency(e.transportCost)})
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 align-top text-[var(--color-muted)]">
                              {fmtRange(e.dateFrom, e.dateTo)}
                              {e.periodNote && <div className="text-xs">{e.periodNote}</div>}
                            </td>
                            <td className="px-3 py-2 align-top">
                              <div className="flex justify-end gap-1.5">
                                <button
                                  onClick={() => setFormEntry(e)}
                                  className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)]"
                                >
                                  Editar
                                </button>
                                <button
                                  onClick={() => setConfirmDelete(e)}
                                  className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger-soft,rgba(220,38,38,0.12))]"
                                >
                                  ✕
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {formEntry && (
        <EntryFormModal
          initial={formEntry}
          faenas={faenas}
          hiddenFaenaIds={hiddenFaenaIds}
          units={units}
          onClose={() => setFormEntry(null)}
          onSaved={() => { setFormEntry(null); reload(); }}
        />
      )}

      {hiddenModalOpen && (
        <HiddenFaenasModal
          faenas={faenas}
          hiddenFaenaIds={hiddenFaenaIds}
          onClose={() => setHiddenModalOpen(false)}
          onSaved={() => { setHiddenModalOpen(false); reload(); }}
        />
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="Eliminar entrada"
        message={confirmDelete ? `¿Eliminar el precio de "${confirmDelete.labor}" del período ${fmtRange(confirmDelete.dateFrom, confirmDelete.dateTo)}?` : ""}
        confirmLabel="Eliminar"
        danger
        busy={deleteBusy}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
