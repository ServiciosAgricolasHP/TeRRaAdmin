import { useState } from "react";
import { getDayCombos, parseComboKey, workdayMapKey, workdayDocId, normalizeDayPricesEntry, comboKey as makeComboKey, getDaySingle } from "../../utils/cosechaCombos";
import { computeStageDayAmount } from "../../utils/tratoEtapas";
import { DEFAULT_BONUS_MANEJO, DEFAULT_BONUS_SUPERVISION, DEFAULT_OVERTIME_RATE, DEFAULT_BASE_DAY, calcTratoHEAmount } from "../../utils/tratoHE";
import { SINGLE_COMBO } from "./rows";
import { parseAmount } from "../../utils/formula";

// Precios por día de las labores del ciclo: combos de cosecha, tiers de trato,
// etapas, el precio sugerido de las labores al día y la configuración de las
// de horas extras. Cambiar un precio recalcula las jornadas que lo usan.
export function useDayPrices({ activeLabor, cycle, cycleWrite, dayCombosByDate, dayPrices, defaultMode, id, isHarvestLabor, setCycle, setDayPrices, setWorkdaysByLabor, toast, wdWrite, workdaysByLabor }) {
  const [localPriceInputs, setLocalPriceInputs] = useState({});

  const [addComboFor, setAddComboFor] = useState(null);
  const [removeCombo, setRemoveCombo] = useState(null);

  const [dayModeEdit, setDayModeEdit] = useState(null); // { laborId, date }

  // ============================================================
  // Combos y precio único por día
  // ============================================================

  const getCombo = (laborId, date, ck) => {
    const combos = laborId === activeLabor?.id && isHarvestLabor
      ? (dayCombosByDate[date] || [])
      : getDayCombos(dayPrices, laborId, date, defaultMode);
    return combos.find((c) => c.key === ck) || { key: ck, x: 0, y: 0, price: 0, mode: defaultMode };
  };

  const recalcDayCombo = async (laborId, date, ck, price, mode, isPiecework) => {
    const labor = cycle.labors.find((l) => l.id === laborId);
    if (!labor || (labor.type !== "cosecha" && labor.type !== "trato")) return;
    const wdMapForLabor = workdaysByLabor[laborId] || {};
    const { x, y } = parseComboKey(ck);
    const updates = {};
    for (const w of labor.workers) {
      const mapKey = workdayMapKey(w.rut, date, ck);
      const wd = wdMapForLabor[mapKey];
      if (!wd) continue;
      const qty = Number(wd.qty) || 0;
      if (qty === 0) continue;
      const amount = mode === "flat" ? price : qty * price;
      // Se escribe en el documento cargado, aunque su id no lleve el sufijo
      // del tier o del combo (jornadas de trato con id de 4 segmentos).
      const docId = wd.id || workdayDocId(id, laborId, w.rut, date, ck);
      // En trato también se reescriben `tiers["0"]` y `totalAmount`, la copia
      // del monto que guarda el workday (igual que commitPieceworkTier).
      const patch = isPiecework
        ? { ...wd, amount, tiers: { "0": { qty, amount } }, totalAmount: amount, workerId: w.id || w.rut }
        : { ...wd, qualityX: x, containerY: y, amount, workerId: w.id || w.rut };
      await wdWrite.upsert(docId, patch);
      updates[mapKey] = patch;
    }
    if (Object.keys(updates).length > 0) {
      setWorkdaysByLabor((prev) => ({
        ...prev,
        [laborId]: { ...(prev[laborId] || {}), ...updates },
      }));
    }
  };

  const persistComboConfig = async (laborId, date, ck, patch, isPiecework = false) => {
    const dayEntry = normalizeDayPricesEntry(dayPrices[laborId]?.[date]);
    const current = dayEntry[ck] || { price: 0, mode: defaultMode };
    const merged = { ...current, ...patch };
    const nextDay = { ...dayEntry, [ck]: merged };
    const next = { ...dayPrices, [laborId]: { ...(dayPrices[laborId] || {}), [date]: nextDay } };
    setDayPrices(next);
    await cycleWrite({ dayPrices: next });
    await recalcDayCombo(laborId, date, ck, merged.price, merged.mode, isPiecework);
  };

  // tratoEtapas: recalcula el amount de los workdays de una etapa en un día
  // cuando cambia su precio o modo. Cada workday guarda su propio amount, que
  // es el que leen el resumen y la nómina.
  const recalcDayStage = async (laborId, date, stageId, price, mode) => {
    const labor = cycle.labors.find((l) => l.id === laborId);
    if (!labor || labor.type !== "tratoEtapas") return;
    const wdMapForLabor = workdaysByLabor[laborId] || {};
    const updates = {};
    for (const w of labor.workers) {
      const mapKey = workdayMapKey(w.rut, date, stageId);
      const wd = wdMapForLabor[mapKey];
      if (!wd) continue;
      const qty = Number(wd.qty) || 0;
      if (qty === 0) continue;
      const amount = computeStageDayAmount(mode, price, qty);
      if (amount === wd.amount) continue;
      const docId = workdayDocId(id, laborId, w.rut, date, stageId);
      const patch = { ...wd, amount, workerId: w.id || w.rut };
      await wdWrite.upsert(docId, patch);
      updates[mapKey] = patch;
    }
    if (Object.keys(updates).length > 0) {
      setWorkdaysByLabor((prev) => ({
        ...prev,
        [laborId]: { ...(prev[laborId] || {}), ...updates },
      }));
    }
  };

  // Persiste el precio/modo de una etapa en un día (dayPrices[lab][date][stageId])
  // y recalcula los workdays afectados.
  const persistStagePrice = async (laborId, date, stageId, patch) => {
    const dayEntry = dayPrices[laborId]?.[date] || {};
    const current = dayEntry[stageId] || { price: 0, mode: "unit" };
    const merged = { ...current, ...patch };
    const nextDay = { ...dayEntry, [stageId]: merged };
    const next = { ...dayPrices, [laborId]: { ...(dayPrices[laborId] || {}), [date]: nextDay } };
    setDayPrices(next);
    await cycleWrite({ dayPrices: next });
    await recalcDayStage(laborId, date, stageId, merged.price, merged.mode);
  };

  const addComboToDay = async (laborId, date, x, y) => {
    const ck = makeComboKey(x, y);
    const dayEntry = normalizeDayPricesEntry(dayPrices[laborId]?.[date]);
    if (dayEntry[ck]) return;
    const nextDay = { ...dayEntry, [ck]: { price: 0, mode: defaultMode } };
    const next = { ...dayPrices, [laborId]: { ...(dayPrices[laborId] || {}), [date]: nextDay } };
    setDayPrices(next);
    await cycleWrite({ dayPrices: next });
  };

  // ============================================================
  // Helpers de tratoHE
  // ============================================================

  const overtimeDayRates = (labor) => ({
    bonusManejo: labor?.bonusManejo ?? DEFAULT_BONUS_MANEJO,
    bonusSupervision: labor?.bonusSupervision ?? DEFAULT_BONUS_SUPERVISION,
    overtimeRate: labor?.overtimeRate ?? DEFAULT_OVERTIME_RATE,
    baseDayDefault: labor?.baseDayDefault ?? DEFAULT_BASE_DAY,
  });

  const effectiveDayPrice = (labor, dayCfg) =>
    Number(dayCfg?.price) || Number(labor?.baseDayDefault) || DEFAULT_BASE_DAY;

  // Labores main/supervision/extra: guarda el precio sugerido del día (uno por
  // día, no por trabajador). No recalcula los workdays existentes: solo cambia
  // el sugerido que muestran las celdas vacías.
  const persistNormalDayPrice = async (laborId, date, price) => {
    const dayEntry = normalizeDayPricesEntry(dayPrices[laborId]?.[date]);
    const current = dayEntry["0_0"] || { price: 0, mode: "normal" };
    const merged = { ...current, price: Number(price) || 0 };
    const nextDay = { ...dayEntry, "0_0": merged };
    const next = { ...dayPrices, [laborId]: { ...(dayPrices[laborId] || {}), [date]: nextDay } };
    setDayPrices(next);
    await cycleWrite({ dayPrices: next });
  };

  const computeOvertimeDayAmount = (labor, dayCfg, wd) =>
    calcTratoHEAmount({
      qty: wd.qty,
      overtimeHours: wd.overtimeHours,
      hasManejo: wd.hasManejo,
      hasSupervision: wd.hasSupervision,
      extras: wd.extras,
      dayPrice: effectiveDayPrice(labor, dayCfg),
      dayMode: dayCfg?.mode || "normal",
      ...overtimeDayRates(labor),
    });

  const recalcOvertimeDay = async (laborId, date) => {
    const labor = cycle.labors.find((l) => l.id === laborId);
    if (!labor || labor.type !== "tratoHE") return;
    const dayCfg = getDaySingle(dayPrices, laborId, date, "normal");
    const wdMapForLabor = workdaysByLabor[laborId] || {};
    const updates = {};
    for (const w of labor.workers) {
      const mapKey = workdayMapKey(w.rut, date, SINGLE_COMBO);
      const wd = wdMapForLabor[mapKey];
      if (!wd) continue;
      const amount = computeOvertimeDayAmount(labor, dayCfg, wd);
      if (amount === wd.amount) continue;
      const docId = workdayDocId(id, laborId, w.rut, date, SINGLE_COMBO);
      const next = { ...wd, amount, workerId: w.id || w.rut };
      await wdWrite.upsert(docId, next);
      updates[mapKey] = next;
    }
    if (Object.keys(updates).length > 0) {
      setWorkdaysByLabor((prev) => ({
        ...prev,
        [laborId]: { ...(prev[laborId] || {}), ...updates },
      }));
    }
  };

  const persistOvertimeDayConfig = async (laborId, date, patch) => {
    const dayEntry = normalizeDayPricesEntry(dayPrices[laborId]?.[date]);
    const current = dayEntry["0_0"] || {
      price: cycle.labors.find((l) => l.id === laborId)?.baseDayDefault ?? DEFAULT_BASE_DAY,
      mode: "normal",
      isHoliday: false,
    };
    const merged = { ...current, ...patch };
    const nextDay = { ...dayEntry, "0_0": merged };
    const next = { ...dayPrices, [laborId]: { ...(dayPrices[laborId] || {}), [date]: nextDay } };
    setDayPrices(next);
    await cycleWrite({ dayPrices: next });
    await recalcOvertimeDay(laborId, date);
  };

  const persistOvertimeBonusDefaults = async (laborId, defaults) => {
    const nextLabors = cycle.labors.map((l) =>
      l.id === laborId ? { ...l, bonusDefaults: defaults } : l,
    );
    await cycleWrite({ labors: nextLabors });
    setCycle((c) => ({ ...c, labors: nextLabors }));
  };

  const removeComboFromDay = async (laborId, date, ck) => {
    const wdMapForLabor = workdaysByLabor[laborId] || {};
    for (const k in wdMapForLabor) {
      if (k.endsWith(`__${ck}`) && k.includes(`__${date}__`)) {
        if (Number(wdMapForLabor[k].qty) > 0) {
          toast.warning("No se puede quitar: hay producción registrada en este combo.");
          return false;
        }
      }
    }
    const dayEntry = normalizeDayPricesEntry(dayPrices[laborId]?.[date]);
    delete dayEntry[ck];
    const next = { ...dayPrices, [laborId]: { ...(dayPrices[laborId] || {}), [date]: dayEntry } };
    setDayPrices(next);
    await cycleWrite({ dayPrices: next });
    return true;
  };

  const inputKey = (laborId, date, ck) => `${laborId}__${date}__${ck}`;

  const handlePriceBlur = (laborId, date, ck, isPiecework = false) => {
    const k = inputKey(laborId, date, ck);
    const raw = localPriceInputs[k];
    if (raw === undefined) return;
    const price = parseAmount(String(raw)) || 0;
    setLocalPriceInputs((prev) => { const n = { ...prev }; delete n[k]; return n; });
    // Los tiers (t0, t1…) pasan por persistComboConfig, que recalcula los workdays existentes.
    if (isPiecework && typeof ck === "string" && ck.startsWith("t")) {
      const entry = dayPrices?.[laborId]?.[date];
      const cur = entry?.[ck];
      if (!cur || price !== Number(cur.price)) {
        persistComboConfig(laborId, date, ck, { price }, true);
      }
      return;
    }
    const cur = isPiecework
      ? getDaySingle(dayPrices, laborId, date, defaultMode)
      : getCombo(laborId, date, ck);
    if (price !== cur.price) {
      persistComboConfig(laborId, date, ck, { price }, isPiecework);
    }
  };

  const getPriceInputValue = (laborId, date, ck, isPiecework = false) => {
    const k = inputKey(laborId, date, ck);
    if (k in localPriceInputs) return localPriceInputs[k];
    // Tiers (t0, t1…)
    if (isPiecework && typeof ck === "string" && ck.startsWith("t")) {
      const entry = dayPrices?.[laborId]?.[date];
      const tier = entry?.[ck];
      return tier?.price || "";
    }
    const cur = isPiecework
      ? getDaySingle(dayPrices, laborId, date, defaultMode)
      : getCombo(laborId, date, ck);
    return cur.price || "";
  };
  return {
    addComboFor,
    addComboToDay,
    computeOvertimeDayAmount,
    dayModeEdit,
    effectiveDayPrice,
    getCombo,
    getPriceInputValue,
    handlePriceBlur,
    inputKey,
    localPriceInputs,
    persistComboConfig,
    persistNormalDayPrice,
    persistStagePrice,
    persistOvertimeBonusDefaults,
    persistOvertimeDayConfig,
    removeCombo,
    removeComboFromDay,
    setAddComboFor,
    setDayModeEdit,
    setLocalPriceInputs,
    setRemoveCombo,
  };
}
