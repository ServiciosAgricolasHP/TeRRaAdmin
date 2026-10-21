import { useState } from "react";
import { useToast } from "../../contexts/ToastContext";
import { priceBookService, priceBookConfigService } from "../../services";
import Modal, { ModalCloseButton } from "../../components/Modal";
import { hasChanges } from "../../utils/formChanges";
import Select from "../../components/Select";
import TextField from "../../components/TextField";
import { toTitleName, unshout } from "../../utils/textCase";
import { DATALIST_ID } from "./helpers";

const emptyPriceLine = () => ({
  unit: "", label: "", payPrice: "", chargePrice: "",
  hasOvertime: false, overtimePayPrice: "", overtimeChargePrice: "",
});
// La unidad es texto libre: se compara sin mayúsculas ni espacios en los
// bordes, y cualquier otra variante no muestra el toggle de horas extra.
const isJornadaUnit = (unit) => (unit || "").trim().toLowerCase() === "jornada";

function Section({ title, children }) {
  return (
    <div className="space-y-3 rounded-md border border-[var(--color-border)] p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">{title}</div>
      {children}
    </div>
  );
}

export default function EntryFormModal({ initial, faenas, hiddenFaenaIds, units, onClose, onSaved }) {
  const toast = useToast();
  const isEdit = !!initial.id;
  const [mode, setMode] = useState(initial.faenaId || !initial.id ? "real" : "dummy");
  const [faenaId, setFaenaId] = useState(initial.faenaId || "");
  const [faenaLabel, setFaenaLabel] = useState(initial.faenaId ? "" : initial.faenaLabel || "");
  const [labor, setLabor] = useState(initial.labor || "");
  const [priceLines, setPriceLines] = useState(
    initial.prices?.length ? initial.prices.map((p) => ({ ...p })) : [emptyPriceLine()]
  );
  const [transportIncluded, setTransportIncluded] = useState(initial.id ? !!initial.transportIncluded : true);
  const [transportWhere, setTransportWhere] = useState(initial.transportWhere || "");
  const [transportCost, setTransportCost] = useState(initial.transportCost ?? "");
  const [dateFrom, setDateFrom] = useState(initial.dateFrom || new Date().toLocaleDateString("sv-SE"));
  const [dateTo, setDateTo] = useState(initial.dateTo || "");
  const [periodNote, setPeriodNote] = useState(initial.periodNote || "");
  const [notes, setNotes] = useState(initial.notes || "");
  const [busy, setBusy] = useState(false);
  const values = { faenaId, faenaLabel, labor, priceLines, transportIncluded, transportWhere, transportCost, dateFrom, dateTo, periodNote, notes };
  const [baseline] = useState(values);
  const dirty = !busy && hasChanges(baseline, values);

  const visibleFaenas = faenas.filter((f) => !hiddenFaenaIds.has(f.id));

  const updateLine = (i, patch) => {
    setPriceLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };
  const addLine = () => setPriceLines((prev) => [...prev, emptyPriceLine()]);
  const removeLine = (i) => setPriceLines((prev) => prev.filter((_, idx) => idx !== i));

  const submit = async () => {
    const isReal = mode === "real";
    if (isReal && !faenaId) { toast.error("Elige una faena"); return; }
    if (!isReal && !faenaLabel.trim()) { toast.error("Escribe el nombre de la faena"); return; }
    if (!labor.trim()) { toast.error("La labor es obligatoria"); return; }

    const cleanLines = priceLines.map((l) => ({
      unit: l.unit.trim(),
      label: l.label.trim() || null,
      payPrice: Number(l.payPrice),
      chargePrice: Number(l.chargePrice),
      hasOvertime: isJornadaUnit(l.unit) && !!l.hasOvertime,
      overtimePayPrice: isJornadaUnit(l.unit) && l.hasOvertime ? Number(l.overtimePayPrice) : null,
      overtimeChargePrice: isJornadaUnit(l.unit) && l.hasOvertime ? Number(l.overtimeChargePrice) : null,
    }));
    for (const l of cleanLines) {
      if (!l.unit) { toast.error("Cada línea de precio necesita una unidad"); return; }
      if (!l.payPrice || l.payPrice <= 0) { toast.error(`Precio pagado inválido para "${l.unit}"`); return; }
      if (!l.chargePrice || l.chargePrice <= 0) { toast.error(`Precio cobrado inválido para "${l.unit}"`); return; }
      if (l.hasOvertime) {
        if (!l.overtimePayPrice || l.overtimePayPrice <= 0) { toast.error(`Indica cuánto se pagó de hora extra para "${l.unit}"`); return; }
        if (!l.overtimeChargePrice || l.overtimeChargePrice <= 0) { toast.error(`Indica cuánto se cobró de hora extra para "${l.unit}"`); return; }
      }
    }
    if (!dateFrom) { toast.error("La fecha de inicio es obligatoria"); return; }
    if (dateTo && dateTo < dateFrom) { toast.error("La fecha de fin no puede ser anterior a la de inicio"); return; }
    if (!transportIncluded) {
      if (!transportWhere.trim()) { toast.error("Indica dónde se cobró el transporte"); return; }
      if (!Number(transportCost) || Number(transportCost) <= 0) { toast.error("Indica cuánto se cobró el transporte"); return; }
    }

    const resolvedFaenaLabel = isReal ? faenas.find((f) => f.id === faenaId)?.name || "" : faenaLabel.trim();

    setBusy(true);
    try {
      // Suma al catálogo propio del libro cualquier unidad nueva que se haya escrito.
      const newUnits = cleanLines
        .map((l) => l.unit)
        .filter((u) => !units.some((existing) => existing.toLowerCase() === u.toLowerCase()));
      if (newUnits.length) {
        const dedup = [...new Set([...units, ...newUnits])];
        await priceBookConfigService.upsert("main", { units: dedup });
      }

      const payload = {
        faenaId: isReal ? faenaId : null,
        // Nombres y lugar como título, notas sin gritar (utils/textCase.js).
        faenaLabel: toTitleName(resolvedFaenaLabel),
        labor: toTitleName(labor),
        prices: cleanLines,
        transportIncluded,
        transportWhere: transportIncluded ? null : toTitleName(transportWhere),
        transportCost: transportIncluded ? null : Number(transportCost),
        dateFrom,
        dateTo: dateTo || null,
        periodNote: unshout(periodNote.trim()) || null,
        notes: unshout(notes.trim()) || null,
      };
      if (isEdit) await priceBookService.update(initial.id, payload);
      else await priceBookService.create(payload);
      toast.success(isEdit ? "Entrada actualizada" : "Entrada agregada");
      onSaved();
    } catch (err) {
      toast.error("No se pudo guardar: " + err.message);
    } finally {
      setBusy(false);
    }
  };

  const inputCls = "w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";

  return (
    <Modal
      open
      onClose={onClose}
      dirty={dirty}
      title={isEdit ? "Editar entrada" : "Nueva entrada"}
      size="lg"
      footer={
        <>
          <ModalCloseButton className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm">
            Cancelar
          </ModalCloseButton>
          <button
            type="submit"
            form="pricebook-entry-form"
            disabled={busy}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
          >
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </>
      }
    >
      {/* `id` + el atributo `form` del botón "Guardar" (en el footer, que
          Modal.jsx renderiza como hermano de este div, no como hijo) es lo
          que hace que Enter en un input de acá dispare el submit. */}
      <form id="pricebook-entry-form" onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-4">
        <Section title="Faena">
          <div className="flex gap-2 text-sm">
            <button
              type="button"
              onClick={() => setMode("real")}
              className={`flex-1 rounded-md border px-3 py-1.5 ${mode === "real" ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] font-medium text-[var(--color-accent)]" : "border-[var(--color-border)]"}`}
            >
              Faena existente
            </button>
            <button
              type="button"
              onClick={() => setMode("dummy")}
              className={`flex-1 rounded-md border px-3 py-1.5 ${mode === "dummy" ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] font-medium text-[var(--color-accent)]" : "border-[var(--color-border)]"}`}
            >
              Faena histórica (sin registro)
            </button>
          </div>
          {mode === "real" ? (
            <Select
              label="Faena"
              required
              value={faenaId}
              onChange={setFaenaId}
              options={visibleFaenas.map((f) => ({ value: f.id, label: f.name }))}
            />
          ) : (
            <TextField label="Nombre de la faena" required value={faenaLabel} onChange={setFaenaLabel} placeholder="Ej. Fundo Los Alerces — 2022" />
          )}
          <TextField label="Labor" required value={labor} onChange={setLabor} placeholder="Ej. Cosecha, Poda, Raleo…" />
        </Section>

        <Section title="Precios">
          <div className="space-y-3">
            {priceLines.map((line, i) => (
              <div key={i} className="space-y-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex w-full flex-wrap gap-2 sm:flex-nowrap">
                    <div className="w-full sm:flex-1">
                      <span className="mb-1 block text-sm text-[var(--color-muted)]">
                        Unidad <span className="text-[var(--color-danger)]">*</span>
                      </span>
                      <input
                        type="text"
                        list={DATALIST_ID}
                        value={line.unit}
                        onChange={(e) => updateLine(i, { unit: e.target.value })}
                        placeholder="Ej. Kilo, Saco, Metro…"
                        className={inputCls}
                      />
                    </div>
                    <div className="w-full sm:flex-1">
                      <TextField
                        label="Detalle (opcional)"
                        value={line.label}
                        onChange={(v) => updateLine(i, { label: v })}
                        placeholder="Ej. Primera pasada, Calidad exportación…"
                      />
                    </div>
                  </div>
                  {priceLines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLine(i)}
                      title="Quitar esta línea"
                      className="mt-6 shrink-0 rounded-md border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger-soft,rgba(220,38,38,0.12))]"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 sm:flex-nowrap">
                  <div className="w-full sm:flex-1">
                    <TextField label="Pagado" type="number" required value={line.payPrice} onChange={(v) => updateLine(i, { payPrice: v })} placeholder="0" />
                  </div>
                  <div className="w-full sm:flex-1">
                    <TextField label="Cobrado" type="number" required value={line.chargePrice} onChange={(v) => updateLine(i, { chargePrice: v })} placeholder="0" />
                  </div>
                </div>

                {isJornadaUnit(line.unit) && (
                  <div className="space-y-2 border-t border-[var(--color-border)] pt-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={!!line.hasOvertime}
                        onChange={(e) => updateLine(i, { hasOvertime: e.target.checked })}
                      />
                      ¿Hubo horas extras?
                    </label>
                    {line.hasOvertime && (
                      <div className="flex flex-wrap gap-2 sm:flex-nowrap">
                        <div className="w-full sm:flex-1">
                          <TextField
                            label="HE — Pagado"
                            type="number"
                            required
                            value={line.overtimePayPrice}
                            onChange={(v) => updateLine(i, { overtimePayPrice: v })}
                            placeholder="0"
                          />
                        </div>
                        <div className="w-full sm:flex-1">
                          <TextField
                            label="HE — Cobrado"
                            type="number"
                            required
                            value={line.overtimeChargePrice}
                            onChange={(v) => updateLine(i, { overtimeChargePrice: v })}
                            placeholder="0"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addLine}
            className="text-sm text-[var(--color-accent)] hover:underline"
          >
            + Agregar otra unidad de pago
          </button>
          <p className="text-xs text-[var(--color-muted)]">
            Si la faena se cosechó/pagó con más de una unidad (ej. parte por kilo, parte por saco), agrega una línea por cada una.
          </p>
        </Section>

        <Section title="Transporte">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={transportIncluded} onChange={(e) => setTransportIncluded(e.target.checked)} />
            Transporte incluido en el precio
          </label>
          {!transportIncluded && (
            <div className="flex flex-wrap gap-2 sm:flex-nowrap">
              <div className="w-full sm:flex-1">
                <TextField label="¿Dónde? (ruta / proveedor)" required value={transportWhere} onChange={setTransportWhere} placeholder="Ej. Fundo X → Planta Y" />
              </div>
              <div className="w-full sm:flex-1">
                <TextField label="¿Cuánto se cobró?" type="number" required value={transportCost} onChange={setTransportCost} placeholder="0" />
              </div>
            </div>
          )}
        </Section>

        <Section title="Vigencia">
          <div className="flex flex-wrap gap-2 sm:flex-nowrap">
            <label className="block w-full sm:flex-1">
              <span className="mb-1 block text-sm text-[var(--color-muted)]">
                Desde <span className="text-[var(--color-danger)]">*</span>
              </span>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputCls} />
            </label>
            <label className="block w-full sm:flex-1">
              <span className="mb-1 block text-sm text-[var(--color-muted)]">Hasta (vacío = vigente)</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputCls} />
            </label>
          </div>
          <TextField label="Período (opcional)" value={periodNote} onChange={setPeriodNote} placeholder="Ej. Temporada 2025-2026" />
        </Section>

        <label className="block">
          <span className="mb-1 block text-sm text-[var(--color-muted)]">Notas (opcional)</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls} />
        </label>
      </form>
    </Modal>
  );
}
