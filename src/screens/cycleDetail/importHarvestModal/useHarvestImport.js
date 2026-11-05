import { useMemo, useState } from "react";
import { useCycleDetail } from "../CycleDetailContext";
import { useToast } from "../../../contexts/ToastContext";
import { importHarvest } from "../../../services/harvestImportService";
import { attempt } from "../../../utils/attempt";
import { readStoredJson, writeStoredJson } from "../../../utils/browserStorage";
import { parseHarvestFile } from "../../../utils/harvestFormats";
import {
  buildHarvestImportPlan,
  comboMapComplete,
  contractorsOf,
  fileCombosOf,
  filePeopleOf,
  fileTotalsOf,
  initialDecisions,
  matchFilePeople,
  pendingDecisions,
  rowsOfSheet,
  suggestComboMap,
} from "../../../utils/harvestImport";
import { normalizeCycle } from "../rows";

// Lo elegido para cada combo del archivo, para la próxima importación en este
// navegador.
const COMBO_MAP_KEY = "harvestImport.comboMap";

// Lo que se ve en la barra de avance en cada etapa de `importHarvest`.
const STAGE_LABELS = {
  check: "Revisando el ciclo…",
  write: "Guardando fichas y jornadas",
  cycle: "Poniendo al día el ciclo…",
  workers: "Poniendo al día la lista de trabajadores…",
};

// Importar la cosecha de la empresa en la labor activa: leer el archivo (en
// cualquiera de los formatos de `utils/harvestFormats.js`), lo que se elige
// (hoja, contratistas, combos y personas), el plan (`buildHarvestImportPlan`,
// utils/harvestImport.js) y escribirlo, con su avance. Al terminar pone al
// día la grilla sin releer.
export function useHarvestImport({ onDone }) {
  const {
    activeLabor,
    allWorkers,
    catalogs,
    cycle,
    dayPrices,
    guardedWrite,
    loadAllWorkers,
    setCycle,
    setDayPrices,
    setWorkdaysByLabor,
    workdaysByLabor,
  } = useCycleDetail();
  const toast = useToast();
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState("");
  const [sheet, setSheet] = useState("");
  const [contractors, setContractors] = useState(() => new Set());
  const [comboEdits, setComboEdits] = useState({});
  const [decisionEdits, setDecisionEdits] = useState({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);

  const loadFile = async (picked) => {
    if (!picked) return;
    const { value, error } = await attempt(async () => JSON.parse(await picked.text()));
    const parsed = error ? { error: "El archivo no es un JSON válido." } : parseHarvestFile(value);
    if (parsed.error) {
      setFile(null);
      setFileError(parsed.error);
      return;
    }
    const f = parsed.file;
    const firstSheet = f.sheets.length > 1 ? f.sheets[0].sheet : "";
    const largest = contractorsOf(rowsOfSheet(f, firstSheet))[0];
    setFile(f);
    setFileError("");
    setSheet(firstSheet);
    setContractors(new Set(largest ? [largest.name] : []));
    setComboEdits({});
    setDecisionEdits({});
  };

  const sheetRows = useMemo(() => (file ? rowsOfSheet(file, sheet) : []), [file, sheet]);
  const contractorList = useMemo(() => contractorsOf(sheetRows), [sheetRows]);
  const rows = useMemo(() => sheetRows.filter((r) => contractors.has(r.contractor)), [sheetRows, contractors]);
  const combos = useMemo(() => fileCombosOf(rows), [rows]);
  const comboMap = useMemo(() => {
    const suggested = suggestComboMap(combos, catalogs, file?.defaultMeasure, readStoredJson(COMBO_MAP_KEY, {}) || {});
    const out = {};
    for (const c of combos) out[c.key] = { ...suggested[c.key], ...(comboEdits[c.key] || {}) };
    return out;
  }, [combos, catalogs, file, comboEdits]);
  const combosReady = comboMapComplete(combos, comboMap);

  // El emparejamiento se hace una vez por hoja, con todas sus personas: marcar
  // o desmarcar un contratista solo filtra. Los días y las cantidades de cada
  // persona son los de los contratistas marcados.
  const sheetMatches = useMemo(
    () => new Map(matchFilePeople(filePeopleOf(sheetRows), allWorkers).map((m) => [m.rut, m])),
    [sheetRows, allWorkers],
  );
  const matches = useMemo(() => filePeopleOf(rows).map((p) => ({ ...sheetMatches.get(p.rut), ...p })), [rows, sheetMatches]);
  const workerById = useMemo(() => new Map(allWorkers.map((w) => [w.id, w])), [allWorkers]);
  const decisions = useMemo(() => ({ ...initialDecisions(matches), ...decisionEdits }), [matches, decisionEdits]);
  const pending = pendingDecisions(matches, decisions);

  const workdaysOfLabor = activeLabor ? workdaysByLabor[activeLabor.id] : null;
  const plan = useMemo(() => {
    if (!file || !activeLabor || !combosReady || !rows.length) return null;
    return buildHarvestImportPlan({
      rows, floors: file.floors, combos, comboMap, decisions, workers: allWorkers, cycle, labor: activeLabor,
      workdaysOfLabor: workdaysOfLabor || {}, dayPrices,
    });
  }, [file, activeLabor, combosReady, rows, combos, comboMap, decisions, allWorkers, cycle, workdaysOfLabor, dayPrices]);
  const fileTotals = useMemo(() => fileTotalsOf(rows, file?.floors, comboMap, decisions), [rows, file, comboMap, decisions]);

  const toggleContractor = (name) =>
    setContractors((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  const setCombo = (key, patch) => setComboEdits((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), ...patch } }));
  const setDecision = (rut, decision) => setDecisionEdits((prev) => ({ ...prev, [rut]: decision }));

  const run = async () => {
    if (!plan || !activeLabor) return;
    setBusy(true);
    const laborId = activeLabor.id;
    const onProgress = ({ stage, done, total }) => setProgress({ label: STAGE_LABELS[stage], done, total });
    const { value: res, error } = await attempt(() =>
      guardedWrite(() => importHarvest({ cycleId: cycle.id, laborId, plan, fileName: file.name, onProgress })),
    );
    setBusy(false);
    setProgress(null);
    if (error) {
      toast.error("No se pudo importar: " + (error.message || error));
      return;
    }
    writeStoredJson(COMBO_MAP_KEY, { ...(readStoredJson(COMBO_MAP_KEY, {}) || {}), ...comboMap });
    setWorkdaysByLabor((prev) => {
      const lab = { ...(prev[laborId] || {}) };
      for (const k of res.deleted) delete lab[k];
      for (const w of res.written) lab[w.mapKey] = w.wd;
      return { ...prev, [laborId]: lab };
    });
    setCycle((prev) => normalizeCycle({ ...prev, days: res.days, labors: res.labors }));
    setDayPrices((prev) => ({ ...prev, [laborId]: res.laborDayPrices }));
    if (plan.creates.length || plan.aliases.length) await loadAllWorkers();
    toast.success(
      `Cosecha importada: ${res.written.length} jornada${res.written.length === 1 ? "" : "s"} escrita${res.written.length === 1 ? "" : "s"}` +
        (res.deleted.length ? `, ${res.deleted.length} borrada${res.deleted.length === 1 ? "" : "s"}` : "") + ".",
    );
    onDone();
  };

  return {
    busy,
    combos,
    combosReady,
    comboMap,
    contractorList,
    contractors,
    decisions,
    file,
    fileError,
    fileTotals,
    loadFile,
    matches,
    pending,
    plan,
    progress,
    rows,
    run,
    setCombo,
    setDecision,
    setSheet,
    sheet,
    toggleContractor,
    workerById,
  };
}
