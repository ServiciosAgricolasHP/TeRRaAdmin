import { useState } from "react";
import { cloneLabors, importedDayPrices, importCandidatesOf, cycleLabelSuffix } from "../../utils/cycleCreation";
import { newId, defaultLabors, todayStr, withInitial } from "./helpers";
import { unshout } from "../../utils/textCase";
import { cyclesService } from "../../services";
import { moveWorkdaysToCycle } from "../../services/workdayBatches";
import { attempt } from "../../utils/attempt";

const MOVE_LABELS = { read: "Leyendo las jornadas…", move: "Moviendo las jornadas…" };

// Alta y edición de un ciclo, con la etiqueta "Faena/Subfaena/" fija. El alta
// puede importar desde otro ciclo abierto de la subfaena: clona labores,
// copia precios por día y mueve jornadas (`utils/cycleCreation.js`), en
// lotes y con su avance en `cycleForm.progress`.
export function useCycleForm({ cyclesByJob, jobs, loadCycles, setBusy, subjobsByJob, toast }) {
  const [cycleForm, setCycleForm] = useState(null);

  const cyclePrefix = (jobId, subjobId) => {
    const f = jobs.find((x) => x.id === jobId);
    const subjobList = subjobsByJob[jobId] || [];
    const s = subjobList.find((x) => x.id === subjobId);
    const parts = [];
    if (f?.name) parts.push(f.name);
    if (s?.name) parts.push(s.name);
    return parts.length ? parts.join("/") + "/" : "";
  };

  const submitCycle = async (e) => {
    e.preventDefault();
    const { mode, jobId, data } = cycleForm;
    if (mode === "create") {
      const subjobs = subjobsByJob[jobId] || [];
      if (!data.subfaenaId && subjobs.length > 0) {
        toast.warning("La faena tiene subfaenas. Selecciona una subfaena para el ciclo.");
        return;
      }
    }
    setBusy(true);
    const { error: err } = await attempt(async () => {
      // Labores y datos a importar desde el ciclo origen, si se pidió.
      let labors;
      let importPlan = null; // { source, picked, oldToNewLaborId }
      if (mode === "create" && data.importEnabled && data.importSourceId) {
        const source = (data.importCandidates || []).find((c) => c.id === data.importSourceId);
        const picked = (source?.labors || []).filter((l) => (data.importLaborIds || new Set()).has(l.id));
        if (picked.length === 0) {
          toast.warning("Marca al menos una labor a clonar (o desactiva la importación).");
          setBusy(false);
          return;
        }
        const cloned = cloneLabors(picked, newId);
        labors = cloned.labors;
        importPlan = { source, picked, oldToNewLaborId: cloned.oldToNewLaborId };
      } else if (mode === "create") {
        labors = defaultLabors([], {
          type: data.laborType || "main",
          withSupervision: !!data.withSupervision,
        });
      } else {
        labors = data.labors && data.labors.length ? data.labors : defaultLabors();
      }

      const prefix = cyclePrefix(jobId, data.subfaenaId);
      const suffix = (data.labelSuffix ?? data.label ?? "").trim();

      // Días: los marcados en `importDays` definen la lista del nuevo ciclo y
      // restringen qué jornadas y precios se importan.
      const importDaysSet = data.importDays || new Set();
      let nextDays = data.days || [];
      if (mode === "create" && importPlan) {
        nextDays = (importPlan.source.days || []).filter((d) => importDaysSet.has(d));
      } else if (mode === "create") {
        // El ciclo nace con la fecha de inicio como primer día, así la grilla
        // abre con una columna.
        nextDays = [data.startDate || todayStr()];
      }

      // dayPrices: si se pidió copiarlos, los de las labores y días importados.
      const nextDayPrices = mode === "create" && importPlan && data.importCopyDayPrices
        ? importedDayPrices(importPlan.source.dayPrices, importPlan.oldToNewLaborId, importDaysSet)
        : undefined;

      const payload = {
        faenaId: jobId,
        subfaenaId: data.subfaenaId || null,
        label: prefix + suffix,
        startDate: data.startDate || todayStr(),
        notes: unshout(data.notes || ""),
        status: data.status || "open",
        days: nextDays,
        labors,
        ...(nextDayPrices ? { dayPrices: nextDayPrices } : {}),
      };

      let createdCycleId = null;
      if (mode === "create") {
        const created = await cyclesService.create(payload);
        createdCycleId = created?.id || created;
      } else {
        await cyclesService.update(data.id, payload);
      }

      // Mover jornadas: las de las labores y días importados pasan al ciclo
      // nuevo. Las que están en una nómina quedan en el origen.
      if (mode === "create" && importPlan && data.importMoveWorkdays && createdCycleId) {
        const { moved, skippedPaid } = await moveWorkdaysToCycle({
          fromCycleId: importPlan.source.id,
          toCycleId: createdCycleId,
          labors: importPlan.picked.map((l) => ({ from: l.id, to: importPlan.oldToNewLaborId.get(l.id) })),
          days: importDaysSet,
          onProgress: (p) => setCycleForm((f) => (f ? { ...f, progress: { ...p, label: MOVE_LABELS[p.stage] } } : f)),
        });
        toast.success(
          skippedPaid > 0
            ? `Se movieron ${moved} jornada(s). ${skippedPaid} ya estaban en una nómina y quedaron en el ciclo origen.`
            : `Ciclo creado · se movieron ${moved} jornada(s).`,
        );
      } else {
        toast.success(mode === "create" ? "Ciclo creado" : "Ciclo actualizado");
      }

      setCycleForm(null);
      await loadCycles(jobId);
    });
    if (err) toast.error("Error al guardar el ciclo: " + (err.message || err));
    setBusy(false);
  };

  const openCreateCycle = (jobId, subjobId) => {
    if (!subjobId) {
      toast.warning("Los ciclos se crean dentro de una subfaena. Crea primero una subfaena.");
      return;
    }
    const existing = cyclesByJob[jobId] || [];
    const scope = existing.filter((c) => c.subfaenaId === subjobId);
    const openCandidates = importCandidatesOf(existing, subjobId);

    setCycleForm(withInitial({
      mode: "create",
      jobId,
      data: {
        labelSuffix: `Ciclo ${scope.length + 1}`,
        subfaenaId: subjobId,
        startDate: todayStr(),
        notes: "",
        // Las labores se arman al guardar a partir de estas dos opciones; el
        // tipo se elige en el form.
        laborType: "main",
        withSupervision: false,
        // Importar desde otro ciclo abierto: arranca apagado. Al activarlo
        // queda elegido el más reciente, con todas sus labores y días.
        importCandidates: openCandidates,
        importEnabled: false,
        importSourceId: openCandidates[0]?.id || null,
        importLaborIds: new Set((openCandidates[0]?.labors || []).map((l) => l.id)),
        importDays: new Set((openCandidates[0]?.days || [])),
        importCopyDayPrices: false,
        importMoveWorkdays: false,
      },
    }));
  };

  const openEditCycle = (cycle, jobId) => {
    const prefix = cyclePrefix(jobId, cycle.subfaenaId);
    const suffix = cycleLabelSuffix(cycle.label, prefix);
    setCycleForm(withInitial({
      mode: "edit",
      jobId,
      data: {
        id: cycle.id,
        labelSuffix: suffix,
        subfaenaId: cycle.subfaenaId || "",
        startDate: cycle.startDate || todayStr(),
        notes: cycle.notes || "",
        labors: cycle.labors || defaultLabors(),
        days: cycle.days || [],
        status: cycle.status || "open",
      },
    }));
  };
  return {
    cycleForm,
    cyclePrefix,
    openCreateCycle,
    openEditCycle,
    setCycleForm,
    submitCycle,
  };
}
