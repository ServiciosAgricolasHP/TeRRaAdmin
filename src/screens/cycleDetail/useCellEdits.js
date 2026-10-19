import { useState, useRef } from "react";
import { parseAmount } from "../../utils/formula";
import { workdayDocId, workdayMapKey, getDaySingle, parseComboKey } from "../../utils/cosechaCombos";
import { SINGLE_COMBO } from "./rows";
import { workdayHasData } from "../../utils/tratoHE";
import { getStageDayPrice, computeStageDayAmount } from "../../utils/tratoEtapas";

// Edición de las celdas de la grilla: guardar el monto o la cantidad de cada
// tipo de labor, rellenar hacia abajo (Ctrl+D), pegar (Ctrl+V) y deshacer
// (Ctrl+Z).
export function useCellEdits({ activeLabor, computeOvertimeDayAmount, cycle, dayCombosByDate, dayPrices, days, dayStagesByDate, dayTiersByDate, getCombo, gridRef, id, isHarvestLabor, isOvertimeDayLabor, isPieceworkLabor, isPieceworkStagesLabor, photoMode, qrLocked, readOnly, setCopyToast, setWorkdaysByLabor, toast, wdMap, wdWrite, workdaysByLabor, workerIdFor }) {
  "use no memo";
  // Modales de tratoHE
  const [bonusEdit, setBonusEdit] = useState(null);   // { laborId, date, workerRut }

  // Pila de deshacer: cada entrada es un lote (array) de { rut, field, oldValue }.
  // Ctrl+Z saca un lote y vuelve a escribir los valores anteriores. Una edición
  // suelta apila un lote de 1; fillDown y pegar apilan uno de N, que se deshace
  // en un solo paso.
  const undoStackRef = useRef([]);
  const isUndoingRef = useRef(false);
  const pendingBatchRef = useRef(null);
  const UNDO_LIMIT = 50;

  // Guarda el monto del día de un trabajador en labores main/supervision/extra.
  // Lo usan la grilla (onCellValueChanged), el botón del precio sugerido y el
  // modal de edición por trabajador. Con monto 0 borra el workday.
  const commitNormalAmount = async (date, workerRut, rawAmount) => {
    const laborId = activeLabor.id;
    const amount = parseAmount(rawAmount) || 0;
    const docId = workdayDocId(id, laborId, workerRut, date, SINGLE_COMBO);
    const mapKey = workdayMapKey(workerRut, date, SINGLE_COMBO);
    // Si la escritura falla, devuelve el último monto guardado; el llamador
    // pinta la celda con este valor.
    try {
      if (amount === 0) {
        if (wdMap[mapKey]) {
          await wdWrite.remove(docId);
          setWorkdaysByLabor((prev) => {
            const lab = { ...(prev[laborId] || {}) };
            delete lab[mapKey];
            return { ...prev, [laborId]: lab };
          });
        }
      } else {
        const workerId = workerIdFor(laborId, workerRut);
        await wdWrite.upsert(docId, { cycleId: id, laborId, workerRut, date, amount, workerId });
        setWorkdaysByLabor((prev) => {
          const lab = { ...(prev[laborId] || {}) };
          lab[mapKey] = { ...lab[mapKey], cycleId: id, laborId, workerRut, date, amount, workerId };
          return { ...prev, [laborId]: lab };
        });
      }
      return { amount };
    } catch (err) {
      toast.error("No se pudo guardar el cambio: " + (err.message || err));
      return { amount: wdMap[mapKey]?.amount || 0 };
    }
  };

  const upsertOvertimeDayWorkday = async (laborId, date, workerRut, patch) => {
    const labor = cycle.labors.find((l) => l.id === laborId);
    if (!labor) return { amount: 0 };
    const mapKey = workdayMapKey(workerRut, date, SINGLE_COMBO);
    const docId = workdayDocId(id, laborId, workerRut, date, SINGLE_COMBO);
    const existing = (workdaysByLabor[laborId] || {})[mapKey];
    const defaults = labor.bonusDefaults?.[workerRut] || {};
    const seed = existing
      ? { ...existing }
      : { qty: 0, overtimeHours: 0, extras: 0, hasManejo: !!defaults.manejo, hasSupervision: !!defaults.supervision };
    const merged = { ...seed, ...patch };
    const dayCfg = getDaySingle(dayPrices, laborId, date, "normal");
    const amount = computeOvertimeDayAmount(labor, dayCfg, merged);
    const wd = { cycleId: id, laborId, workerRut, date, ...merged, amount, workerId: workerIdFor(laborId, workerRut) };

    // Si falla devuelve `ok: false`: la rama tratoHE de onCellValueChanged pinta
    // qty/HE con su propio valor (`newVal`) y usa esta bandera para revertir
    // el campo.
    try {
      if (!workdayHasData(wd)) {
        if (existing) {
          await wdWrite.remove(docId);
          setWorkdaysByLabor((prev) => {
            const lab = { ...(prev[laborId] || {}) };
            delete lab[mapKey];
            return { ...prev, [laborId]: lab };
          });
        }
        return { amount: 0 };
      }
      await wdWrite.upsert(docId, wd);
      setWorkdaysByLabor((prev) => {
        const lab = { ...(prev[laborId] || {}) };
        lab[mapKey] = wd;
        return { ...prev, [laborId]: lab };
      });
      return { amount };
    } catch (err) {
      toast.error("No se pudo guardar el cambio: " + (err.message || err));
      return { amount: existing?.amount || 0, ok: false };
    }
  };

  // Guarda la cantidad de un combo (calidad×envase) de un trabajador en un día
  // de cosecha; qty 0 borra el workday. Lo usan la grilla
  // (onCellValueChanged) y el modal de edición por trabajador.
  const commitHarvestCombo = async (date, comboKey, workerRut, rawQty) => {
    const laborId = activeLabor.id;
    const { x, y } = parseComboKey(comboKey);
    const docId = workdayDocId(id, laborId, workerRut, date, comboKey);
    const mapKey = workdayMapKey(workerRut, date, comboKey);
    const qty = parseAmount(rawQty) || 0;
    const combo = getCombo(laborId, date, comboKey);
    const amount = combo.mode === "flat" ? combo.price : qty * combo.price;

    try {
      if (qty === 0) {
        if (wdMap[mapKey]) {
          await wdWrite.remove(docId);
          setWorkdaysByLabor((prev) => {
            const lab = { ...(prev[laborId] || {}) };
            delete lab[mapKey];
            return { ...prev, [laborId]: lab };
          });
        }
      } else {
        const workerId = workerIdFor(laborId, workerRut);
        await wdWrite.upsert(docId, {
          cycleId: id, laborId, workerRut, date,
          qualityX: x, containerY: y, qty, amount, workerId,
        });
        setWorkdaysByLabor((prev) => {
          const lab = { ...(prev[laborId] || {}) };
          lab[mapKey] = { ...lab[mapKey], cycleId: id, laborId, workerRut, date, qualityX: x, containerY: y, qty, amount, workerId };
          return { ...prev, [laborId]: lab };
        });
      }
      return { qty, amount };
    } catch (err) {
      toast.error("No se pudo guardar el cambio: " + (err.message || err));
      return { qty: wdMap[mapKey]?.qty || 0, amount: wdMap[mapKey]?.amount || 0 };
    }
  };

  // Guarda la cantidad de un tier de precio de un trabajador en un día de
  // trato; qty 0 borra el workday.
  const commitPieceworkTier = async (date, tierKey, workerRut, rawQty) => {
    const laborId = activeLabor.id;
    const docId = workdayDocId(id, laborId, workerRut, date, tierKey);
    const mapKey = workdayMapKey(workerRut, date, tierKey);
    const qty = parseAmount(rawQty) || 0;

    const tiers = dayTiersByDate[date] || [];
    const tier = tiers.find((t) => t.key === tierKey);
    const amount = tier && tier.mode === "flat" ? (qty > 0 ? tier.price : 0) : qty * (tier?.price || 0);

    try {
      if (qty === 0) {
        if (wdMap[mapKey]) {
          await wdWrite.remove(docId);
          setWorkdaysByLabor((prev) => {
            const lab = { ...(prev[laborId] || {}) };
            delete lab[mapKey];
            return { ...prev, [laborId]: lab };
          });
        }
      } else {
        // `tiers` (una sola clave, "0") es la copia que normalizeTratoWorkday
        // agrega al cargar; se reescribe junto con qty/amount para que
        // coincidan.
        const tiersField = { "0": { qty, amount } };
        const workerId = workerIdFor(laborId, workerRut);
        await wdWrite.upsert(docId, {
          cycleId: id, laborId, workerRut, date, qty, amount,
          tiers: tiersField, totalAmount: amount, workerId,
        });
        setWorkdaysByLabor((prev) => {
          const lab = { ...(prev[laborId] || {}) };
          lab[mapKey] = {
            ...lab[mapKey],
            cycleId: id, laborId, workerRut, date, qty, amount,
            tiers: tiersField, totalAmount: amount, workerId,
          };
          return { ...prev, [laborId]: lab };
        });
      }
      return { qty, amount };
    } catch (err) {
      toast.error("No se pudo guardar el cambio: " + (err.message || err));
      return { qty: wdMap[mapKey]?.qty || 0, amount: wdMap[mapKey]?.amount || 0 };
    }
  };

  // Guarda la cantidad de una etapa de un trabajador en un día de
  // tratoEtapas; qty 0 borra el workday.
  const commitStageQty = async (date, stageId, workerRut, rawQty) => {
    const laborId = activeLabor.id;
    const docId = workdayDocId(id, laborId, workerRut, date, stageId);
    const mapKey = workdayMapKey(workerRut, date, stageId);
    const qty = parseAmount(rawQty) || 0;
    const { price, mode } = getStageDayPrice(dayPrices, laborId, date, stageId);
    const amount = computeStageDayAmount(mode, price, qty);

    try {
      if (qty === 0) {
        if (wdMap[mapKey]) {
          await wdWrite.remove(docId);
          setWorkdaysByLabor((prev) => {
            const lab = { ...(prev[laborId] || {}) };
            delete lab[mapKey];
            return { ...prev, [laborId]: lab };
          });
        }
      } else {
        // `stageId` explícito en el doc: lo consumen el conteo (getEtapasTotals),
        // los resúmenes y la nómina sin tener que re-parsear el docId.
        const workerId = workerIdFor(laborId, workerRut);
        await wdWrite.upsert(docId, {
          cycleId: id, laborId, workerRut, date, qty, amount, stageId, workerId,
        });
        setWorkdaysByLabor((prev) => {
          const lab = { ...(prev[laborId] || {}) };
          lab[mapKey] = {
            ...lab[mapKey],
            cycleId: id, laborId, workerRut, date, qty, amount, stageId, workerId,
          };
          return { ...prev, [laborId]: lab };
        });
      }
      return { qty, amount };
    } catch (err) {
      toast.error("No se pudo guardar el cambio: " + (err.message || err));
      return { qty: wdMap[mapKey]?.qty || 0, amount: wdMap[mapKey]?.amount || 0 };
    }
  };

  // ============================================================
  // Edición de celdas
  // ============================================================

  // Campos editables por día (combo de cosecha, tier de trato, qty/HE de
  // tratoHE, monto normal). rut/name/total/__amt/__total son derivados y no
  // se escriben en lote.
  const isEditableField = (field) => {
    if (!field) return false;
    if (["rut", "name", "total"].includes(field)) return false;
    if (field.endsWith("__amt") || field.endsWith("__total")) return false;
    return true;
  };

  const dispatchCellChange = async (node, colDef, newValue) => {
    if (!node || !colDef) return;
    if (!isEditableField(colDef.field)) return;
    // Una fila de sueldo mensual solo marca asistencia: rellenar, pegar o
    // deshacer no le escriben montos.
    if (node.data?._monthly) return;
    const oldValue = node.data?.[colDef.field];
    await onCellValueChanged({
      colDef,
      data: node.data,
      newValue,
      oldValue,
      node,
    });
  };

  // Ctrl+D (rellenar hacia abajo): copia el valor de la celda con foco a la
  // misma columna de cada fila seleccionada (api.getSelectedNodes()).
  const fillDown = async (params) => {
    if (readOnly || photoMode || qrLocked) return;
    const api = gridRef.current?.api;
    if (!api) return;
    const colDef = params.colDef;
    if (!isEditableField(colDef?.field)) return;
    const sourceValue = params.data?.[colDef.field];
    if (sourceValue == null || sourceValue === "" || sourceValue === 0) {
      setCopyToast("Celda fuente vacía");
      setTimeout(() => setCopyToast(""), 1500);
      return;
    }
    const selected = api.getSelectedNodes();
    if (selected.length === 0) {
      setCopyToast("Selecciona filas con Shift+Click primero");
      setTimeout(() => setCopyToast(""), 2200);
      return;
    }
    pendingBatchRef.current = [];
    let count = 0;
    for (const node of selected) {
      if (node.id === params.node?.id) continue;
      await dispatchCellChange(node, colDef, sourceValue);
      count++;
    }
    if (pendingBatchRef.current.length) {
      undoStackRef.current.push(pendingBatchRef.current);
      if (undoStackRef.current.length > UNDO_LIMIT) undoStackRef.current.shift();
    }
    pendingBatchRef.current = null;
    setCopyToast(`✓ Copiado a ${count} fila(s)`);
    setTimeout(() => setCopyToast(""), 1500);
  };

  // Ctrl+V: reparte las líneas del portapapeles en la misma columna, desde la
  // fila con foco hacia abajo y saltando los encabezados de grupo. De un
  // copiado con varias columnas (tabs) solo se usa la primera.
  const pasteFromClipboard = async (params) => {
    if (readOnly || photoMode || qrLocked) return;
    const api = gridRef.current?.api;
    if (!api) return;
    const colDef = params.colDef;
    if (!isEditableField(colDef?.field)) return;
    let text;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      setCopyToast("No pude leer el portapapeles");
      setTimeout(() => setCopyToast(""), 2000);
      return;
    }
    if (!text) return;
    const lines = text.replace(/\r/g, "").split("\n").map((l) => l.split("\t")[0]);
    while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
    if (lines.length === 0) return;
    const startIdx = params.node?.rowIndex;
    if (startIdx == null) return;
    pendingBatchRef.current = [];
    let count = 0;
    let lineIdx = 0;
    let targetIdx = startIdx;
    while (lineIdx < lines.length) {
      const node = api.getDisplayedRowAtIndex(targetIdx);
      if (!node) break;
      if (node.data?._isHeader) {
        targetIdx++;
        continue;
      }
      await dispatchCellChange(node, colDef, lines[lineIdx]);
      lineIdx++;
      targetIdx++;
      count++;
    }
    if (pendingBatchRef.current.length) {
      undoStackRef.current.push(pendingBatchRef.current);
      if (undoStackRef.current.length > UNDO_LIMIT) undoStackRef.current.shift();
    }
    pendingBatchRef.current = null;
    setCopyToast(`✓ Pegadas ${count} celda(s)`);
    setTimeout(() => setCopyToast(""), 1500);
  };

  // Ctrl+Z: saca el último lote de la pila y vuelve a escribir los valores
  // anteriores. Mientras tanto, isUndoingRef evita que onCellValueChanged
  // apile la reversión.
  const undoLast = async () => {
    if (readOnly || photoMode) return;
    const batch = undoStackRef.current.pop();
    if (!batch || batch.length === 0) {
      setCopyToast("Nada que deshacer");
      setTimeout(() => setCopyToast(""), 1500);
      return;
    }
    const api = gridRef.current?.api;
    if (!api) return;
    isUndoingRef.current = true;
    try {
      for (let i = batch.length - 1; i >= 0; i--) {
        const { rut, field, oldValue } = batch[i];
        let target = null;
        api.forEachNode((n) => { if (n.data?.rut === rut) target = n; });
        if (!target) continue;
        await dispatchCellChange(target, { field }, oldValue);
      }
      setCopyToast(`↶ Deshecho (${batch.length} celda${batch.length === 1 ? "" : "s"})`);
      setTimeout(() => setCopyToast(""), 1500);
    } finally {
      isUndoingRef.current = false;
    }
  };

  const onCellKeyDown = async (params) => {
    const e = params.event;
    if (!e) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (!ctrl) return;
    const key = String(e.key || "").toLowerCase();
    if (key === "d") {
      e.preventDefault();
      e.stopPropagation();
      await fillDown(params);
    } else if (key === "v") {
      e.preventDefault();
      e.stopPropagation();
      await pasteFromClipboard(params);
    } else if (key === "z" && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      await undoLast();
    }
  };

  const onCellValueChanged = async (params) => {
    const field = params.colDef.field;
    if (!field || field === "total" || field === "rut" || field === "name" || field.endsWith("__amt") || field.endsWith("__total")) return;

    // Lo usan la pila de deshacer y la rama tratoHE, que revierte la celda si
    // falla el guardado.
    const oldValue = params.oldValue !== undefined ? params.oldValue : params.data?.[field];

    // Apila el valor anterior antes de escribir, salvo mientras se deshace.
    if (!isUndoingRef.current) {
      const entry = { rut: params.data?.rut, field, oldValue };
      if (pendingBatchRef.current) {
        pendingBatchRef.current.push(entry);
      } else {
        undoStackRef.current.push([entry]);
        if (undoStackRef.current.length > UNDO_LIMIT) undoStackRef.current.shift();
      }
    }

    if (isHarvestLabor) {
      const [date, ...rest] = field.split("__");
      const ck = rest.join("_");
      const workerRut = params.data.rut;
      const { qty, amount } = await commitHarvestCombo(date, ck, workerRut, params.newValue);
      params.node.setDataValue(field, qty);
      params.node.setDataValue(`${field}__amt`, amount);

      let newTotal = 0;
      for (const d of days) {
        const combos = dayCombosByDate[d] || [];
        for (const c of combos) {
          const f = `${d}__${c.key}`;
          if (f === field) newTotal += amount;
          else newTotal += Number(params.data[`${f}__amt`]) || 0;
        }
      }
      params.node.setDataValue("total", newTotal);
      return;
    }

    if (isOvertimeDayLabor) {
      const m = field.match(/^(\d{4}-\d{2}-\d{2})__(qty|he)$/);
      if (!m) return;
      const [, date, kind] = m;
      const workerRut = params.data.rut;
      const newVal = parseAmount(params.newValue) || 0;
      const patch = kind === "qty" ? { qty: newVal } : { overtimeHours: newVal };
      const result = await upsertOvertimeDayWorkday(activeLabor.id, date, workerRut, patch);
      // Esta rama pinta el campo con `newVal`, no con lo que devuelve la
      // función; si el guardado falló (`ok: false`) vuelve a `oldValue`.
      params.node.setDataValue(field, result.ok === false ? oldValue : newVal);
      params.node.setDataValue(`${date}__amt`, result.amount);
      let newTotal = 0;
      for (const d of days) {
        if (d === date) newTotal += result.amount;
        else newTotal += Number(params.data[`${d}__amt`]) || 0;
      }
      params.node.setDataValue("total", newTotal);
      return;
    }

    if (isPieceworkLabor) {
      const [date, ...rest] = field.split("__");
      const tierKey = rest.join("_"); // p. ej. "t0", "t1"
      const workerRut = params.data.rut;
      const { qty, amount } = await commitPieceworkTier(date, tierKey, workerRut, params.newValue);
      params.node.setDataValue(field, qty);
      params.node.setDataValue(`${field}__amt`, amount);

      // Recalcula el total con los datos de la fila
      let rowTotal = 0;
      for (const d of days) {
        const combos = dayTiersByDate[d] || [];
        for (const t of combos) {
          const f = `${d}__${t.key}`;
          if (f === field) rowTotal += amount;
          else rowTotal += Number(params.data[`${f}__amt`]) || 0;
        }
      }
      params.node.setDataValue("total", rowTotal);
      return;
    }

    if (isPieceworkStagesLabor) {
      const [date, ...rest] = field.split("__");
      const stageId = rest.join("_");
      const workerRut = params.data.rut;
      const { qty, amount } = await commitStageQty(date, stageId, workerRut, params.newValue);
      params.node.setDataValue(field, qty);
      params.node.setDataValue(`${field}__amt`, amount);

      let rowTotal = 0;
      for (const d of days) {
        for (const st of dayStagesByDate[d] || []) {
          const f = `${d}__${st.id}`;
          if (f === field) rowTotal += amount;
          else rowTotal += Number(params.data[`${f}__amt`]) || 0;
        }
      }
      params.node.setDataValue("total", rowTotal);
      return;
    }

    // Labor normal
    const date = field;
    const workerRut = params.data.rut;
    const { amount } = await commitNormalAmount(date, workerRut, params.newValue);
    params.node.setDataValue(date, amount);
    const total = days.reduce((acc, d) => acc + (d === date ? amount : Number(params.data[d]) || 0), 0);
    params.node.setDataValue("total", total);
  };
  return {
    bonusEdit,
    commitHarvestCombo,
    commitStageQty,
    commitNormalAmount,
    commitPieceworkTier,
    onCellKeyDown,
    onCellValueChanged,
    setBonusEdit,
    upsertOvertimeDayWorkday,
  };
}
