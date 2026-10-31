import { useState } from "react";
import { defaultStages, normalizeStages } from "../../utils/tratoEtapas";
import { DEFAULT_BASE_DAY, DEFAULT_BONUS_MANEJO, DEFAULT_BONUS_SUPERVISION, DEFAULT_OVERTIME_RATE } from "../../utils/tratoHE";
import { laborGroupsService, workdaysService } from "../../services";
import { toTitleName } from "../../utils/textCase";
import { newId, SINGLE_COMBO } from "./rows";
import { getDaySingle, workdayDocId } from "../../utils/cosechaCombos";

// Crear, editar y quitar labores del ciclo. Editar una de horas extras
// recalcula sus jornadas con las tarifas nuevas.
export function useLaborForm({ activeLabor, catalogs, computeOvertimeDayAmount, cycle, cycleWrite, dayPrices, id, setActiveLaborId, setCycle, setLaborGroups, setWorkdaysByLabor, toast, wdWrite, workdaysByLabor, workerIdFor }) {
  const [laborForm, setLaborForm] = useState(null);
  const [removeLabor, setRemoveLabor] = useState(null);

  // ============================================================
  // Labor
  // ============================================================

  // `initial`: cómo se abrió el formulario, para avisar si se cierra con
  // cambios sin guardar.
  const openLaborForm = (form) => setLaborForm({ ...form, initial: form.data });

  const openCreateLabor = () =>
    openLaborForm({
      mode: "create",
      data: {
        name: "", type: "extra",
        laborGroupId: "",
        newGroupName: "",
        cosechaMode: "unit",
        tratoMode: "unit",
        tratoType: catalogs.tratoTypes?.[0]?.value ?? 0,
        stages: defaultStages(),
        baseDayDefault: DEFAULT_BASE_DAY,
        bonusManejo: DEFAULT_BONUS_MANEJO,
        bonusSupervision: DEFAULT_BONUS_SUPERVISION,
        overtimeRate: DEFAULT_OVERTIME_RATE,
      },
    });

  const openEditLabor = () =>
    openLaborForm({
      mode: "edit",
      data: {
        id: activeLabor.id,
        name: activeLabor.name,
        type: activeLabor.type,
        laborGroupId: activeLabor.laborGroupId || "",
        newGroupName: "",
        cosechaMode: activeLabor.cosechaMode || "unit",
        tratoMode: activeLabor.tratoMode || "unit",
        tratoType: activeLabor.tratoType ?? (catalogs.tratoTypes?.[0]?.value ?? 0),
        stages: (activeLabor.stages && activeLabor.stages.length)
          ? activeLabor.stages.map((s) => ({ ...s }))
          : defaultStages(),
        baseDayDefault: activeLabor.baseDayDefault ?? DEFAULT_BASE_DAY,
        bonusManejo: activeLabor.bonusManejo ?? DEFAULT_BONUS_MANEJO,
        bonusSupervision: activeLabor.bonusSupervision ?? DEFAULT_BONUS_SUPERVISION,
        overtimeRate: activeLabor.overtimeRate ?? DEFAULT_OVERTIME_RATE,
      },
    });

  const submitLabor = async (e) => {
    e.preventDefault();
    if (!laborForm.data.name.trim()) return;
    // "__new__": se crea la agrupación nueva en laborGroups antes de armar la
    // labor.
    let laborGroupId = laborForm.data.laborGroupId || null;
    if (laborGroupId === "__new__") {
      if (!laborForm.data.newGroupName.trim()) {
        toast.warning("Ponle un nombre a la agrupación nueva.");
        return;
      }
      const created = await laborGroupsService.create({
        subfaenaId: cycle.subfaenaId,
        name: toTitleName(laborForm.data.newGroupName),
        active: true,
      });
      laborGroupId = created.id;
      setLaborGroups((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    }
    const buildLabor = (existing = {}) => {
      const base = {
        ...existing,
        name: toTitleName(laborForm.data.name),
        type: laborForm.data.type,
        laborGroupId: laborGroupId || null,
      };
      if (laborForm.data.type === "cosecha") {
        base.cosechaMode = laborForm.data.cosechaMode;
      }
      if (laborForm.data.type === "trato") {
        base.tratoMode = laborForm.data.tratoMode;
        base.tratoType = Number(laborForm.data.tratoType);
      }
      if (laborForm.data.type === "tratoEtapas") {
        base.stages = normalizeStages(laborForm.data.stages);
      }
      if (laborForm.data.type === "tratoHE") {
        base.baseDayDefault = Number(laborForm.data.baseDayDefault) || DEFAULT_BASE_DAY;
        base.bonusManejo = Number(laborForm.data.bonusManejo) || DEFAULT_BONUS_MANEJO;
        base.bonusSupervision = Number(laborForm.data.bonusSupervision) || DEFAULT_BONUS_SUPERVISION;
        base.overtimeRate = Number(laborForm.data.overtimeRate) || DEFAULT_OVERTIME_RATE;
      }
      if (["main", "supervision", "extra"].includes(laborForm.data.type)) {
        base.baseDayDefault = Number(laborForm.data.baseDayDefault) || DEFAULT_BASE_DAY;
      }
      return base;
    };
    if (laborForm.mode === "create") {
      const labor = { id: newId(), ...buildLabor(), workers: [] };
      const nextLabors = [...cycle.labors, labor];
      await cycleWrite({ labors: nextLabors });
      setCycle((c) => ({ ...c, labors: nextLabors }));
      setActiveLaborId(labor.id);
    } else {
      const nextLabors = cycle.labors.map((l) =>
        l.id === laborForm.data.id ? buildLabor(l) : l,
      );
      await cycleWrite({ labors: nextLabors });
      setCycle((c) => ({ ...c, labors: nextLabors }));
      // En tratoHE recalcula los workdays con las tarifas nuevas.
      if (laborForm.data.type === "tratoHE") {
        // Calcula con `nextLabors`: el estado `cycle` todavía tiene las
        // tarifas anteriores.
        const updatedLabor = nextLabors.find((l) => l.id === laborForm.data.id);
        const wdMapForLabor = workdaysByLabor[updatedLabor.id] || {};
        const updates = {};
        for (const k in wdMapForLabor) {
          const wd = wdMapForLabor[k];
          const dayCfg = getDaySingle(dayPrices, updatedLabor.id, wd.date, "normal");
          const amount = computeOvertimeDayAmount(updatedLabor, dayCfg, wd);
          if (amount === wd.amount) continue;
          const docId = workdayDocId(id, updatedLabor.id, wd.workerRut, wd.date, SINGLE_COMBO);
          const next = { ...wd, amount, workerId: workerIdFor(updatedLabor.id, wd.workerRut) };
          await wdWrite.upsert(docId, next);
          updates[k] = next;
        }
        if (Object.keys(updates).length > 0) {
          setWorkdaysByLabor((prev) => ({
            ...prev,
            [updatedLabor.id]: { ...(prev[updatedLabor.id] || {}), ...updates },
          }));
        }
      }
      // tratoEtapas: el precio es por día (no de la labor), así que cambiar
      // las etapas (nombre/counts) no recalcula montos de workdays.
    }
    setLaborForm(null);
  };

  const askRemoveLabor = () => setRemoveLabor(activeLabor);
  const confirmRemoveLabor = async () => {
    if (!removeLabor) return;
    const wds = await workdaysService.list({
      wheres: [["cycleId", "==", id], ["laborId", "==", removeLabor.id]], take: 1,
    });
    if (wds.length) {
      toast.warning("No se puede quitar: la labor tiene producción registrada.");
      setRemoveLabor(null);
      return;
    }
    if (cycle.labors.length === 1) {
      toast.warning("Debe existir al menos una labor.");
      setRemoveLabor(null);
      return;
    }
    const nextLabors = cycle.labors.filter((l) => l.id !== removeLabor.id);
    await cycleWrite({ labors: nextLabors });
    setCycle((c) => ({ ...c, labors: nextLabors }));
    setActiveLaborId(nextLabors[0]?.id || null);
    setRemoveLabor(null);
  };
  return {
    askRemoveLabor,
    confirmRemoveLabor,
    laborForm,
    openCreateLabor,
    openEditLabor,
    removeLabor,
    setLaborForm,
    setRemoveLabor,
    submitLabor,
  };
}
