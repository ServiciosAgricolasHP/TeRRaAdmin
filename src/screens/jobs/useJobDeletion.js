import { useState } from "react";
import { cyclesService, subjobsService, workdaysService, jobsService } from "../../services";
import { payrollsService } from "../../services/payrollsService";
import { deleteCascade } from "../../services/workdayBatches";
import { attempt } from "../../utils/attempt";

const STAGE_LABELS = { workdays: "Borrando las jornadas…", cycles: "Borrando los ciclos…" };

// Eliminar una faena, una subfaena o un ciclo. Con subfaenas, ciclos o
// jornadas adentro, solo un admin borra en cascada, y nunca si alguna jornada
// ya está en una nómina. La cascada borra las jornadas en lotes
// (`deleteCascade`, services/workdayBatches.js), con su avance en `progress`.
export function useJobDeletion({ isAdmin, loadCycles, loadJobs, loadSubjobs, order, persistOrder, selectedId, setSelectedId, toast }) {
  const [confirm, setConfirm] = useState(null);
  const [progress, setProgress] = useState(null);
  const onProgress = (p) => setProgress({ ...p, label: STAGE_LABELS[p.stage] });
  // Segunda confirmación (cascada) dentro de doDelete: un diálogo que se
  // puede esperar con await.
  const [cascadeConfirm, setCascadeConfirm] = useState(null);
  const askCascadeConfirm = (message) =>
    new Promise((resolve) => setCascadeConfirm({ message, resolve }));

  // Cada función cierra el diálogo y vuelve sin borrar nada si algo lo
  // bloquea o si se cancela la cascada.
  const deleteJob = async () => {
    if (!confirm) return;
    // Sin caché: los bloqueos y el log de diagnóstico salen de datos frescos.
    const subjobs = await subjobsService.list({ wheres: [["faenaId", "==", confirm.item.id]] });
    const jobCycles = await cyclesService.list({ wheres: [["faenaId", "==", confirm.item.id]] });
    console.log(`[Faena delete] Faena ${confirm.item.id} (${confirm.item.name})`);
    console.log(`  Subfaenas asociadas (${subjobs.length}):`, subjobs.map((s) => ({ id: s.id, name: s.name })));
    console.log(`  Ciclos asociados (${jobCycles.length}):`, jobCycles.map((c) => ({ id: c.id, label: c.label, status: c.status, subfaenaId: c.subfaenaId })));

    const blockers = [];
    if (subjobs.length) blockers.push(`${subjobs.length} subfaena(s): ${subjobs.map((s) => s.name).join(", ")}`);
    if (jobCycles.length) blockers.push(`${jobCycles.length} ciclo(s): ${jobCycles.map((c) => c.label).join(", ")}`);

    if (blockers.length) {
      if (!isAdmin) {
        toast.error(`${blockers.join("\n")}\n\n(Pide a un admin para borrado en cascada)`, { title: "No se puede eliminar" });
        setConfirm(null);
        return;
      }
      // La cascada se bloquea si alguna jornada ya forma parte de una
      // nómina: borrarla dejaría la nómina huérfana. Primero hay que
      // eliminar esas nóminas.
      const allCycleWds = [];
      for (const c of jobCycles) {
        const wds = await workdaysService.list({ wheres: [["cycleId", "==", c.id]] });
        allCycleWds.push(...wds);
      }
      const taggedPayrollIds = [...new Set(allCycleWds.map((w) => w.payrollId).filter(Boolean))];
      if (taggedPayrollIds.length > 0) {
        const payrolls = await Promise.all(
          taggedPayrollIds.map((id) => payrollsService.getById(id).catch(() => null)),
        );
        const names = payrolls
          .filter(Boolean)
          .map((p) => `· ${p.name}${p.status === "paid" ? " (pagada)" : ""}`)
          .join("\n");
        const taggedCount = allCycleWds.filter((w) => w.payrollId).length;
        toast.error(
          `${taggedCount} jornada(s) ya forman parte de ${taggedPayrollIds.length} nómina(s):\n` +
            `${names || "(nómina sin nombre)"}\n\n` +
            `Elimina primero esas nóminas y vuelve a intentar.`,
          { title: "No se puede eliminar en cascada" },
        );
        setConfirm(null);
        return;
      }

      const ok = await askCascadeConfirm(
        `Bloqueado por:\n - ${blockers.join("\n - ")}\n\n¿Eliminar TODO en cascada (subfaenas + ciclos + producción)?\nRevisa la consola del navegador para ver los IDs.\nEsta acción no se puede deshacer.`,
      );
      if (!ok) { setConfirm(null); return; }

      // Reusa las jornadas ya leídas arriba para no volver a leerlas.
      console.log(`  Borrando ${allCycleWds.length} jornadas, ${jobCycles.length} ciclos y ${subjobs.length} subfaenas`);
      await deleteCascade({
        entity: "faena",
        entityId: confirm.item.id,
        cycles: jobCycles,
        subjobs,
        workdays: allCycleWds,
        onProgress,
      });
    }

    console.log(`  Borrando faena ${confirm.item.id}`);
    await jobsService.remove(confirm.item.id);
    persistOrder(order.filter((id) => id !== confirm.item.id));
    if (selectedId === confirm.item.id) setSelectedId(null);
    await loadJobs();
  };

  const deleteCycle = async () => {
    if (!confirm) return;
    const wds = await workdaysService.list({
      wheres: [["cycleId", "==", confirm.item.id]],
    });
    if (wds.length) {
      // Antes de proponer la cascada, bloquea si alguna jornada tiene
      // `payrollId`: borrar el ciclo dejaría los `workdayIds` de la
      // nómina apuntando a docs inexistentes, y borrarla, revertirla o
      // marcarla pagada fallaría. Primero hay que eliminar esas nóminas.
      const taggedPayrollIds = [...new Set(wds.map((w) => w.payrollId).filter(Boolean))];
      if (taggedPayrollIds.length > 0) {
        const payrolls = await Promise.all(
          taggedPayrollIds.map((id) => payrollsService.getById(id).catch(() => null)),
        );
        const names = payrolls
          .filter(Boolean)
          .map((p) => `· ${p.name}${p.status === "paid" ? " (pagada)" : ""}`)
          .join("\n");
        const taggedCount = wds.filter((w) => w.payrollId).length;
        toast.error(
          `${taggedCount} jornada(s) ya forman parte de ${taggedPayrollIds.length} nómina(s):\n` +
            `${names || "(nómina sin nombre)"}\n\n` +
            `Elimina primero esas nóminas y vuelve a intentar.`,
          { title: `No se puede eliminar el ciclo "${confirm.item.label}"` },
        );
        setConfirm(null);
        return;
      }
      if (!isAdmin) {
        toast.error(
          `El ciclo tiene ${wds.length} registro(s) de producción. (Pide a un admin para cascada)`,
          { title: "No se puede eliminar" },
        );
        setConfirm(null);
        return;
      }
      const ok = await askCascadeConfirm(
        `El ciclo "${confirm.item.label}" tiene ${wds.length} registro(s) de producción.\n\n¿Eliminar TODO en cascada (producción + ciclo)?\nEsta acción no se puede deshacer.`,
      );
      if (!ok) {
        setConfirm(null);
        return;
      }
      await deleteCascade({ entity: "cycle", entityId: confirm.item.id, cycles: [confirm.item], workdays: wds, onProgress });
      await loadCycles(confirm.item.faenaId);
      return;
    }
    await cyclesService.remove(confirm.item.id);
    await loadCycles(confirm.item.faenaId);
  };

  const deleteConfirmed = async () => {
    if (!confirm) return;
    if (confirm.kind === "job") {
      await deleteJob();
    } else if (confirm.kind === "subjob") {
      await subjobsService.remove(confirm.item.id);
      await loadSubjobs(confirm.item.faenaId);
    } else if (confirm.kind === "cycle") {
      const { error: err } = await attempt(deleteCycle);
      if (err) {
        console.error("Error eliminando ciclo:", err);
        toast.error(`Error al eliminar ciclo: ${err?.message || err}`);
      }
    }
    setConfirm(null);
  };

  const doDelete = async () => {
    if (!confirm) return;
    setConfirm((c) => ({ ...c, busy: true }));
    const { error: err } = await attempt(deleteConfirmed);
    if (err) {
      console.error("Error en eliminación:", err);
      toast.error(`${err?.message || err}\nRevisa la consola para ver el detalle.`, { title: "Error al eliminar" });
      setConfirm(null);
    }
    setConfirm((c) => (c ? { ...c, busy: false } : null));
    setProgress(null);
  };

  return {
    cascadeConfirm,
    confirm,
    doDelete,
    progress,
    setCascadeConfirm,
    setConfirm,
  };
}
