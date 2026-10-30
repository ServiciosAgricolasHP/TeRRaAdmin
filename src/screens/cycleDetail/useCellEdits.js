import { useState, useRef } from "react";
import { parseAmount } from "../../utils/formula";
import { workdayDocId, workdayMapKey, getDaySingle, parseComboKey } from "../../utils/cosechaCombos";
import { SINGLE_COMBO } from "./rows";
import { workdayHasData } from "../../utils/tratoHE";
import { getStageDayPrice, computeStageDayAmount } from "../../utils/tratoEtapas";
import { clipboardColumn, copiedValue, pastedAmount, pasteWrites } from "../../utils/gridClipboard";
import { formatRutForDisplay } from "../../utils/rutUtils";

// Edición de las celdas de la grilla: guardar el monto o la cantidad de cada
// tipo de labor, y los atajos como en Excel: copiar (Ctrl+C), pegar (Ctrl+V),
// borrar las celdas elegidas (Supr) y deshacer (Ctrl+Z). Las celdas elegidas
// salen de useCellRange (`range`).
export function useCellEdits({ activeLabor, computeOvertimeDayAmount, cycle, dayCombosByDate, dayPrices, days, dayStagesByDate, dayTiersByDate, getCombo, gridRef, id, isHarvestLabor, isOvertimeDayLabor, isPieceworkLabor, isPieceworkStagesLabor, qrLocked, range, readOnly, setCopyToast, setWorkdaysByLabor, toast, wdMap, wdWrite, workdaysByLabor, workerIdFor }) {
  "use no memo";
  // Modales de tratoHE
  const [bonusEdit, setBonusEdit] = useState(null);   // { laborId, date, workerRut }

  // Pila de deshacer: cada entrada es un lote (array) de
  // { rut, field, oldValue, laborId }. Ctrl+Z saca un lote y vuelve a escribir
  // los valores anteriores. Una edición suelta apila un lote de 1; pegar y
  // borrar varias celdas apilan uno de N, que se deshace en un solo paso.
  const undoStackRef = useRef([]);
  const isUndoingRef = useRef(false);
  const pendingBatchRef = useRef(null);
  const UNDO_LIMIT = 50;
  // Un pegado, un borrado o un deshacer en curso: otro espera a que termine.
  const busyRef = useRef(false);
  // Valores que la pantalla le pone a una celda editable después de guardarla
  // (`showValue`), por fila y columna. La grilla avisa ese cambio con su evento
  // de celda modificada un instante después, y ese aviso no se vuelve a guardar.
  const echoesRef = useRef(new Map());
  const toastTimerRef = useRef(null);

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
    const mapKey = workdayMapKey(workerRut, date, comboKey);
    const docId = wdMap[mapKey]?.id || workdayDocId(id, laborId, workerRut, date, comboKey);
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
    const mapKey = workdayMapKey(workerRut, date, tierKey);
    // Una jornada ya cargada se escribe en su propio documento: las de trato
    // con id de 4 segmentos no llevan el sufijo del tier.
    const docId = wdMap[mapKey]?.id || workdayDocId(id, laborId, workerRut, date, tierKey);
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

  // El aviso de los atajos: cada uno reemplaza al anterior y se borra solo,
  // sin que el plazo del anterior lo corte.
  const showToast = (message) => {
    clearTimeout(toastTimerRef.current);
    setCopyToast(message);
  };
  const flash = (message, ms = 1500) => {
    showToast(message);
    toastTimerRef.current = setTimeout(() => setCopyToast(""), ms);
  };
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  // Pinta en la celda el valor que quedó guardado. Si cambia lo que la celda
  // tenía, la grilla lo avisa como una edición, y ese aviso se reconoce y se
  // descarta en onCellValueChanged (`echoesRef`).
  const showValue = (node, field, value) => {
    const key = `${node.id}|${field}`;
    echoesRef.current.set(key, value);
    if (!node.setDataValue(field, value)) echoesRef.current.delete(key);
  };

  const pushUndo = (batch) => {
    if (!batch?.length) return;
    undoStackRef.current.push(batch);
    if (undoStackRef.current.length > UNDO_LIMIT) undoStackRef.current.shift();
  };

  // Por qué no se puede pegar ni borrar en una columna; vacío si se puede. Se
  // escribe en las columnas editables de la grilla aunque la celda vacía de un
  // monto no se abra para editar (ahí el clic usa el precio sugerido).
  const writeBlockedReason = (colDef) => {
    if (readOnly) return "Ciclo cerrado: solo lectura";
    if (qrLocked) return "Labor sincronizada por QR: la producción no se escribe a mano";
    if (colDef?.editable !== true && typeof colDef?.editable !== "function") return "Esta columna no se edita";
    return "";
  };

  // Escribe un valor en una celda como si se hubiera editado a mano. Una fila
  // de sueldo mensual solo marca asistencia y un encabezado de grupo no es una
  // persona: no reciben montos. Devuelve si había algo que cambiar.
  const writeCell = async (node, field, value) => {
    if (!node?.data || node.data._monthly || node.data._isHeader) return false;
    const oldValue = node.data[field];
    if (parseAmount(value) === (Number(oldValue) || 0)) return false;
    await onCellValueChanged({ colDef: { field }, data: node.data, newValue: value, oldValue, node });
    return true;
  };

  // Escribe varias celdas de una columna, de a una, y las apila como un solo
  // paso para Ctrl+Z. Devuelve cuántas cambiaron.
  const writeCells = async (field, writes, verb) => {
    pendingBatchRef.current = [];
    let count = 0;
    try {
      for (const [i, { node, value }] of writes.entries()) {
        if (writes.length > 3) showToast(`${verb} ${i + 1} de ${writes.length}…`);
        if (await writeCell(node, field, value)) count++;
      }
    } finally {
      pushUndo(pendingBatchRef.current);
      pendingBatchRef.current = null;
    }
    return count;
  };

  // Lo que se copia de una celda: el RUT vigente con puntos y guion, o el
  // valor de la fila.
  const copiedCell = (node, field) => {
    if (field === "rut") {
      return node.data?._isTemp ? "" : formatRutForDisplay(node.data?._displayRut || node.data?.rut);
    }
    return copiedValue(node.data?.[field]);
  };

  // Ctrl+C: las celdas elegidas, una por línea, o la celda con foco. Si se
  // marcó texto con el mouse, lo copia el navegador.
  const copyCells = async (params) => {
    const sel = range.selection();
    if (!sel && window.getSelection?.()?.toString()) return;
    const field = sel ? sel.field : params.colDef?.field;
    const nodes = (sel ? sel.nodes : [params.node]).filter((n) => n?.data && !n.data._isHeader);
    if (!field || !nodes.length) return;
    try {
      await navigator.clipboard.writeText(nodes.map((n) => copiedCell(n, field)).join("\n"));
      flash(`✓ ${plural(nodes.length, "celda copiada", "celdas copiadas")}`);
    } catch {
      flash("No se pudo copiar al portapapeles", 2000);
    }
  };

  // Ctrl+V: con varias celdas elegidas y un solo valor copiado, el valor va en
  // todas. Si no, las líneas copiadas bajan por la columna desde la primera
  // celda elegida o desde la celda con foco (pasteWrites).
  const pasteCells = async (params) => {
    const api = gridRef.current?.api;
    const sel = range.selection();
    const field = sel ? sel.field : params.colDef?.field;
    const start = sel ? sel.top : params.node?.rowIndex;
    if (!api || !field || start == null) return;
    const blocked = writeBlockedReason(api.getColumnDef(field));
    if (blocked) {
      flash(blocked, 2200);
      return;
    }
    let text;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      flash("No se pudo leer el portapapeles", 2000);
      return;
    }
    const lines = clipboardColumn(text);
    if (!lines.length) return;
    const fill = !!sel && lines.length === 1;
    const nodes = [];
    if (fill) nodes.push(...sel.nodes);
    else for (let i = start; i < api.getDisplayedRowCount(); i++) nodes.push(api.getDisplayedRowAtIndex(i));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const rows = nodes.map((n) => ({ id: n.id, header: !!n.data?._isHeader, skip: !!n.data?._monthly }));
    const writes = pasteWrites(lines, rows, { fill }).map((w) => ({ node: byId.get(w.id), value: pastedAmount(w.value) }));
    const count = await writeCells(field, writes, "Pegando");
    flash(count ? `✓ ${plural(count, "celda pegada", "celdas pegadas")}` : "Sin cambios");
  };

  // Supr o Retroceso con varias celdas elegidas: las deja en cero.
  const clearCells = async () => {
    const api = gridRef.current?.api;
    const sel = range.selection();
    if (!api || !sel) return;
    const blocked = writeBlockedReason(api.getColumnDef(sel.field));
    if (blocked) {
      flash(blocked, 2200);
      return;
    }
    const count = await writeCells(sel.field, sel.nodes.map((node) => ({ node, value: 0 })), "Borrando");
    flash(count ? `✓ ${plural(count, "celda borrada", "celdas borradas")}` : "Sin cambios");
  };

  // Ctrl+Z: saca el último lote de la pila y vuelve a escribir los valores
  // anteriores, si es de la labor que se está viendo. Mientras tanto,
  // isUndoingRef evita que onCellValueChanged apile la reversión.
  const undoLast = async () => {
    if (readOnly) return;
    const stack = undoStackRef.current;
    const batch = stack[stack.length - 1];
    if (!batch) {
      flash("Nada que deshacer");
      return;
    }
    if (batch[0].laborId !== activeLabor?.id) {
      flash("Lo último que se cambió es de otra labor: vuelve a ella para deshacerlo", 2600);
      return;
    }
    const api = gridRef.current?.api;
    if (!api) return;
    stack.pop();
    isUndoingRef.current = true;
    try {
      for (let i = batch.length - 1; i >= 0; i--) {
        const { rut, field, oldValue } = batch[i];
        await writeCell(api.getRowNode(rut), field, oldValue);
      }
      flash(`↶ Deshecho (${plural(batch.length, "celda", "celdas")})`);
    } finally {
      isUndoingRef.current = false;
    }
  };

  // Los atajos de la grilla. Mientras se escribe en una celda, las teclas son
  // del texto. La grilla avisa la tecla un instante después de procesarla: lo
  // que ella misma no debe hacer se apaga antes, en `suppressKeyboardEvent`
  // (useCellRange).
  const onCellKeyDown = async (params) => {
    const e = params.event;
    const api = gridRef.current?.api;
    if (!e || !api || api.getEditingCells().length) return;
    range.onKey(params);
    const ctrl = e.ctrlKey || e.metaKey;
    const key = String(e.key || "").toLowerCase();
    if (ctrl && key === "c") {
      await copyCells(params);
      return;
    }
    let action = null;
    if (ctrl && key === "v") action = () => pasteCells(params);
    else if (ctrl && key === "z" && !e.shiftKey) action = undoLast;
    else if (!ctrl && (e.key === "Delete" || e.key === "Backspace") && range.selection()) action = clearCells;
    if (!action) return;
    if (busyRef.current) {
      flash("Espera a que termine el cambio anterior", 1800);
      return;
    }
    busyRef.current = true;
    try {
      await action();
    } finally {
      busyRef.current = false;
    }
  };

  const onCellValueChanged = async (params) => {
    const field = params.colDef.field;
    if (!field || field === "total" || field === "rut" || field === "name" || field.endsWith("__amt") || field.endsWith("__total")) return;

    // El aviso de la grilla por un valor que puso showValue: ya está guardado.
    if (params.type === "cellValueChanged") {
      const key = `${params.node?.id}|${field}`;
      if (echoesRef.current.has(key) && echoesRef.current.get(key) === params.newValue) {
        echoesRef.current.delete(key);
        return;
      }
    }

    // Lo usan la pila de deshacer y la rama tratoHE, que revierte la celda si
    // falla el guardado.
    const oldValue = params.oldValue !== undefined ? params.oldValue : params.data?.[field];

    // Apila el valor anterior antes de escribir, salvo mientras se deshace.
    if (!isUndoingRef.current) {
      const entry = { rut: params.data?.rut, field, oldValue, laborId: activeLabor?.id };
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
      showValue(params.node, field, qty);
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
      showValue(params.node, field, result.ok === false ? oldValue : newVal);
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
      showValue(params.node, field, qty);
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
      showValue(params.node, field, qty);
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
    showValue(params.node, date, amount);
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
