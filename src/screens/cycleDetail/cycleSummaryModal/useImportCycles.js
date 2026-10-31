import { useState, useMemo } from "react";
import { cyclesService, workdaysService } from "../../../services";
import { workdayComboKeyOf, workdayMapKey, getDaySingle } from "../../../utils/cosechaCombos";
import { buildDailyRows } from "../../../utils/cycleSummary";
import { isRedDay } from "../../../utils/tratoHE";
import { saveJSON, chargeStorageKey } from "./summaryStorage";
import { attempt } from "../../../utils/attempt";

// Importar labores de ciclos anteriores de la misma subfaena al modo cobrar,
// en dos pasos (los ciclos y después sus labores), y quitar una importada.
export function useImportCycles({ charge, cycle, setBusy, setCharge, toast }) {
  // Modal de importar ciclos anteriores (modo cobrar): ciclos disponibles y
  // selección.
  const [importOpen, setImportOpen] = useState(false);
  const [availableCycles, setAvailableCycles] = useState([]);
  const [selectedImportIds, setSelectedImportIds] = useState(new Set());
  // Paso 2 de la importación: labores de los ciclos elegidos, para elegir cuáles
  // traer y su labor destino. null = cerrado.
  const [importPlan, setImportPlan] = useState(null);

  // ============================================================
  // Importar ciclos anteriores (modo cobrar)
  // ============================================================
  // Labores ya importadas (ciclo + labor de origen): las de
  // `cobrar.importedLabors` y las filas extra que traen `sourceCycleId`. Una
  // fila extra con ciclo y sin labor de origen cuenta todas las labores de ese
  // ciclo como importadas, para no duplicarlas. El paso de labores las muestra
  // deshabilitadas.
  const importedSources = useMemo(() => {
    const set = new Set();
    for (const imp of charge.importedLabors || []) {
      set.add(`${imp.sourceCycleId}|${imp.sourceLaborId}`);
    }
    for (const laborCfg of Object.values(charge.labors || {})) {
      for (const er of laborCfg?.extraRows || []) {
        if (er.sourceCycleId) set.add(`${er.sourceCycleId}|${er.sourceLaborId || "*"}`);
      }
    }
    return set;
  }, [charge.labors, charge.importedLabors]);
  const isLaborImported = (cycleId, laborId) =>
    importedSources.has(`${cycleId}|${laborId}`) || importedSources.has(`${cycleId}|*`);
  const importedCycleIds = useMemo(
    () => new Set([...importedSources].map((k) => k.split("|")[0])),
    [importedSources],
  );

  // Lista los ciclos de la misma faena y subfaena, salvo el actual, en
  // cualquier estado (también se pueden sumar ciclos abiertos), con caché.
  const openImportModal = async () => {
    setImportOpen(true);
    setSelectedImportIds(new Set());
    if (!cycle?.faenaId || !cycle?.subfaenaId) {
      setAvailableCycles([]);
      return;
    }
    const { error: err } = await attempt(async () => {
      const list = await cyclesService.list({
        wheres: [
          ["faenaId", "==", cycle.faenaId],
          ["subfaenaId", "==", cycle.subfaenaId],
        ],
        cache: true,
        ttl: 5 * 60 * 1000,
      });
      const filtered = list
        .filter((c) => c.id !== cycle.id)
        .sort((a, b) => String(b.createdAt || b.id).localeCompare(String(a.createdAt || a.id)));
      setAvailableCycles(filtered);
    });
    if (err) {
      toast.error("Error cargando ciclos: " + (err.message || err));
      setAvailableCycles([]);
    }
  };

  // Paso 1 → 2: lee las jornadas de cada ciclo elegido y arma la lista de sus
  // labores con días (`importPlan`), para elegir cuáles traer.
  const prepareImport = async () => {
    const ids = [...selectedImportIds];
    if (ids.length === 0) {
      setImportOpen(false);
      return;
    }
    setBusy("import");
    const { error: err } = await attempt(async () => {
      const sourceCycles = await Promise.all(ids.map((id) => cyclesService.getById(id)));
      const allWds = await Promise.all(
        ids.map((id) => workdaysService.list({ wheres: [["cycleId", "==", id]] })),
      );

      const candidates = [];
      for (let i = 0; i < sourceCycles.length; i++) {
        const sCycle = sourceCycles[i];
        if (!sCycle?.labors) continue;
        const laborById = new Map(sCycle.labors.map((l) => [l.id, l]));

        // Mismas claves que la grilla del ciclo (workdayMapKey), que es lo que
        // buildDailyRows lee para separar los tiers de trato y las etapas.
        const wdsBy = new Map();
        for (const wd of allWds[i] || []) {
          if (!wd?.laborId) continue;
          if (!wdsBy.has(wd.laborId)) wdsBy.set(wd.laborId, {});
          const ck = workdayComboKeyOf(wd, laborById.get(wd.laborId)?.type);
          wdsBy.get(wd.laborId)[workdayMapKey(wd.workerRut, wd.date, ck)] = wd;
        }

        for (const sLabor of sCycle.labors) {
          const sDayPrices = sCycle.dayPrices || {};
          const { rows, containers } = buildDailyRows(sLabor, wdsBy.get(sLabor.id) || {}, sDayPrices);
          if (rows.length === 0) continue;
          // Días en rojo de tratoHE con los feriados del ciclo de origen, que
          // este resumen no tiene cargados.
          const redDates = sLabor.type === "tratoHE"
            ? [...new Set(rows
              .filter((r) => r.date && isRedDay(r.date, getDaySingle(sDayPrices, sLabor.id, r.date, "normal")))
              .map((r) => r.date))]
            : [];
          candidates.push({
            key: `${sCycle.id}|${sLabor.id}`,
            cycleId: sCycle.id,
            cycleLabel: sCycle.label || sCycle.id,
            labor: sLabor,
            already: isLaborImported(sCycle.id, sLabor.id),
            // Sin los Set de trabajadores: la copia se guarda en Firestore.
            rows: rows.map((row) => {
              const r = { ...row };
              delete r.workersSet;
              delete r.pisoWorkersSet;
              return r;
            }),
            containers: [...(containers || [])],
            redDates,
          });
        }
      }

      if (candidates.length === 0) {
        toast.warning("Los ciclos elegidos no tienen jornadas cargadas: no hay nada que importar.");
        return;
      }
      setImportOpen(false);
      setImportPlan({ candidates });
    });
    if (err) toast.error("Error importando: " + (err.message || err));
    setBusy("");
  };

  // Paso 2: cada labor elegida entra al resumen como labor propia
  // (`cobrar.importedLabors`), con su tipo de tabla y sumando al total. Se
  // guarda una copia de la definición —sin trabajadores— y de sus filas
  // diarias. `keys` = claves de los candidatos elegidos.
  const applyImport = (keys) => {
    const picked = new Set(keys);
    const newLabors = [];
    for (const c of importPlan?.candidates || []) {
      if (!picked.has(c.key) || c.already) continue;
      const id = `imp_${(typeof crypto !== "undefined" && crypto.randomUUID)
        ? crypto.randomUUID()
        : `${Date.now()}${Math.random()}`}`;
      const { workers: _workers, bonusDefaults: _bonus, ...laborDef } = c.labor;
      // El nombre lleva el ciclo de origen (su último tramo) para distinguirla
      // de una labor del ciclo actual con el mismo nombre. Se cambia en
      // "Personalizar títulos".
      const shortCycle = String(c.cycleLabel).split("/").filter(Boolean).pop() || c.cycleLabel;
      newLabors.push({
        id,
        sourceCycleId: c.cycleId,
        sourceCycleLabel: c.cycleLabel,
        sourceLaborId: c.labor.id,
        labor: { ...laborDef, id, name: `${c.labor.name} (${shortCycle})` },
        rows: c.rows,
        containers: c.containers,
        redDates: c.redDates,
      });
    }
    setImportPlan(null);
    if (newLabors.length === 0) return;
    setCharge((prev) => {
      const next = { ...prev, importedLabors: [...(prev.importedLabors || []), ...newLabors] };
      saveJSON(chargeStorageKey(cycle?.id), next);
      return next;
    });
    const days = newLabors.reduce((s, l) => s + l.rows.length, 0);
    toast.success(
      `${newLabors.length} labor${newLabors.length === 1 ? "" : "es"} importada${newLabors.length === 1 ? "" : "s"} ` +
      `(${days} día${days === 1 ? "" : "s"}). Se suman al total a facturar.`,
    );
  };

  // Quita una labor importada del resumen, con sus tarifas y ajustes. Las
  // labores que estaban juntas con ella vuelven a su tabla propia.
  const removeImportedLabor = (id) => {
    setCharge((prev) => {
      const labors = {};
      for (const [k, v] of Object.entries(prev.labors || {})) {
        if (k === id) continue;
        labors[k] = v?.mergeInto === id ? { ...v, mergeInto: null } : v;
      }
      const next = {
        ...prev,
        labors,
        importedLabors: (prev.importedLabors || []).filter((l) => l.id !== id),
      };
      saveJSON(chargeStorageKey(cycle?.id), next);
      return next;
    });
  };

  const toggleImportCycle = (id) => {
    setSelectedImportIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  return {
    applyImport,
    availableCycles,
    importedCycleIds,
    importOpen,
    importPlan,
    openImportModal,
    prepareImport,
    removeImportedLabor,
    selectedImportIds,
    setImportOpen,
    setImportPlan,
    toggleImportCycle,
  };
}
