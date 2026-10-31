import { useState } from "react";
import { installmentCandidatesOf, withoutInstallments, payrollItemOf, payrollTotalsOf } from "../../utils/payrollPreview";
import { isCashBank } from "../../utils/banks";
import { validateAccountNumber, payrollSuggestedName } from "../../utils/payroll";
import { newPayrollCycleDetails } from "../../utils/payrollItem";
import { snapshotCycleOf, snapshotWorkdayOf, snapshotAdvanceOf, saveSnapshot } from "../../services/payrollSnapshots";
import { payrollsService, tagWorkdaysWithPayroll } from "../../services/payrollsService";
import { applyAdvancesToPayroll } from "../../services/advancesService";
import { attempt } from "../../utils/attempt";

// Guardar la nómina de la vista previa: confirma las cuotas y las cuentas con
// problemas, crea la nómina con su JSON, etiqueta las jornadas y aplica los
// anticipos y bonos.
export function useGeneratePayroll({
  bankFormat,
  chosenCycles,
  cycles,
  jobs,
  load,
  payrollClassification,
  payrollName,
  previewAdvancesRef,
  previewItems,
  previewWorkdaysRef,
  resetPreview,
  resetSelection,
  setBusy,
  setProgress,
  setTab,
  subjobs,
  toast,
}) {
  // Confirmación genérica para flujos async que esperan la respuesta del
  // usuario a mitad de camino (ej. generateAndSave): `askConfirm` devuelve una
  // promesa que resuelve el diálogo.
  const [confirmState, setConfirmState] = useState(null);
  const askConfirm = (message, opts = {}) =>
    new Promise((resolve) => setConfirmState({ message, resolve, ...opts }));
  // Mismo patrón que askConfirm, pero para el checklist de cuotas de
  // InstallmentConfirmModal — resuelve con la lista de advanceIds que el
  // admin destildó, o null si canceló.
  const [installmentConfirmState, setInstallmentConfirmState] = useState(null);
  // Si hay anticipos-con-plan entre `items`, pausa y espera que el admin
  // confirme cuáles se aplican esta corrida; si no hay ninguno, sigue de
  // largo. Devuelve `items` (ajustado) o `null` si el admin canceló.
  const confirmInstallments = async (items) => {
    const candidates = installmentCandidatesOf(items, previewAdvancesRef.current);
    if (candidates.length === 0) return items;

    const excludedIds = await new Promise((resolve) => setInstallmentConfirmState({ candidates, resolve }));
    setInstallmentConfirmState(null);
    if (excludedIds === null) return null;
    if (excludedIds.length === 0) return items;

    return withoutInstallments(items, excludedIds);
  };

  const generateAndSave = async () => {
    // También entran los items en $0 con anticipo aplicado (el anticipo cubrió
    // todo el bruto), para que sus jornadas se etiqueten y sus anticipos queden
    // aplicados. El XLSX del banco filtra los de $0.
    const rawItems = previewItems.filter(
      (p) => p.include && (Number(p.amount) > 0 || Number(p.advance) > 0),
    );
    if (rawItems.length === 0) {
      toast.warning("No hay trabajadores seleccionados con monto > 0 ni anticipos por aplicar.");
      return;
    }
    // Cuotas: si hay anticipos con plan entre los incluidos, espera que el
    // admin confirme cuáles se aplican. Va antes de validar cuentas porque
    // excluir una cuota cambia el neto de un trabajador, y con eso si entra a
    // payableItems.
    const items = await confirmInstallments(rawItems);
    if (!items) return; // el admin canceló en el modal de cuotas
    // Las cuentas se validan solo para quienes reciben pago (amount > 0): los
    // de neto cero no van al banco.
    const payableItems = items.filter((p) => Number(p.amount) > 0);
    const missing = payableItems.filter((p) => !isCashBank(p.bankCode) && (!p.accountNumber || !p.bankCode));
    if (missing.length > 0) {
      const proceed = await askConfirm(
        `${missing.length} trabajador(es) bancarizados tienen datos incompletos. ¿Generar de todos modos?`,
      );
      if (!proceed) return;
    }
    const suspicious = payableItems
      .map((p) => ({ p, issue: validateAccountNumber(p.accountNumber, p.bankCode) }))
      .filter((x) => x.issue);
    if (suspicious.length > 0) {
      const sample = suspicious.slice(0, 5).map((x) => `• ${x.p.name}: ${x.issue}`).join("\n");
      const proceed = await askConfirm(
        `${suspicious.length} cuenta(s) sospechosa(s):\n${sample}${suspicious.length > 5 ? "\n…" : ""}\n\n¿Generar de todos modos?`,
      );
      if (!proceed) return;
    }
    setBusy(true);
    setProgress({ step: "Armando datos de la nómina...", detail: "", percent: 2 });
    const { error: err } = await attempt(async () => {
      // Los ciclos de la nómina y qué labores abarca cada uno, para que
      // Recalcular no traiga después lo que quedó afuera: los elegidos con
      // alguna labor, y con `laborIds: []` los que traen las personas sueltas.
      // El ciclo de una persona entra solo si ella quedó incluida.
      const includedWorkdayIds = new Set(items.flatMap((p) => p.workdayIds || []));
      const cycleDetails = newPayrollCycleDetails({
        cycles,
        chosen: chosenCycles,
        workdays: (previewWorkdaysRef.current || []).filter((wd) => includedWorkdayIds.has(wd.id)),
        faenas: jobs,
        subfaenas: subjobs,
      });
      const cycleIds = cycleDetails.map((c) => c.id);
      const cycleLabels = cycleDetails.map((c) => c.label);
      const payrollCycleIds = new Set(cycleIds);

      const cleanItems = items.map((p) => payrollItemOf(p, payrollCycleIds));

      const allWorkdayIds = cleanItems.flatMap((p) => p.workdayIds);
      const allAdvanceIds = cleanItems.flatMap((p) => p.advanceIds || []);
      const allApplications = cleanItems.flatMap((p) => p.advanceApplications || []);
      const totals = payrollTotalsOf(cleanItems);
      const finalName = payrollName || payrollSuggestedName();

      // Snapshot estático: todo lo necesario para volver a mostrar la nómina
      // sin más lecturas ni depender de datos que pueden cambiar (detalle de
      // jornadas, origen de los anticipos y configuración de las labores).
      const wdIdSet = new Set(allWorkdayIds);
      const advIdSet = new Set(allAdvanceIds);
      const snapshot = {
        version: 1,
        generatedAt: new Date().toISOString(),
        payroll: {
          name: finalName,
          format: bankFormat.id,
          classification: payrollClassification || "nomina",
          status: "pending",
          total: totals.total, bankTotal: totals.bankTotal, cashTotal: totals.cashTotal,
          workerCount: totals.workerCount,
          bankCount: totals.bankCount,
          cashCount: totals.cashCount,
          advanceTotal: totals.advanceTotal,
          bonusTotal: totals.bonusTotal,
        },
        cycles: cycleDetails.map((cd) => snapshotCycleOf(cd, cycles.find((c) => c.id === cd.id))),
        workers: cleanItems,
        workdays: (previewWorkdaysRef.current || [])
          .filter((wd) => wdIdSet.has(wd.id))
          .map(snapshotWorkdayOf),
        advances: (previewAdvancesRef.current || [])
          .filter((adv) => advIdSet.has(adv.id))
          .map(snapshotAdvanceOf),
      };

      setProgress({ step: "Creando registro de la nómina...", detail: "", percent: 5 });
      const created = await payrollsService.create({
        name: finalName,
        format: bankFormat.id,
        classification: payrollClassification || "nomina",
        status: "pending",
        cycleIds,
        cycleLabels,
        cycleDetails,
        items: cleanItems,
        total: totals.total,
        bankTotal: totals.bankTotal,
        cashTotal: totals.cashTotal,
        workerCount: totals.workerCount,
        bankCount: totals.bankCount,
        cashCount: totals.cashCount,
        workdayIds: allWorkdayIds,
        advanceIds: allAdvanceIds,
        advanceTotal: totals.advanceTotal,
        hasSnapshot: true,
      });

      // Snapshot completo para guardar en `payrollSnapshots` (1:1 con payroll).
      // El JSON se baja desde el menú de descargas del detalle.
      const fullSnapshot = { ...snapshot, payrollId: created.id };

      // Los tres pasos siguientes solo necesitan `created.id` y corren en paralelo:
      //   • subir el snapshot (1 escritura, hasta 1 MB)       ~15% del progreso
      //   • etiquetar jornadas (N updates, avance por chunk)  ~65%
      //   • aplicar anticipos (get M + batch update)          ~10%
      // El avance de las jornadas viene del callback; los otros dos solo
      // marcan iniciado o terminado.
      const W_SNAPSHOT = 15, W_TAG = 65, W_ADV = 10;
      let snapshotDone = false, advancesDone = false;
      let tagDone = 0, tagTotal = Math.max(1, allWorkdayIds.length);
      const recompute = () => {
        const pct =
          10 + // base por crear doc
          (snapshotDone ? W_SNAPSHOT : 0) +
          W_TAG * (tagDone / tagTotal) +
          (advancesDone ? W_ADV : 0);
        const detailParts = [];
        if (allWorkdayIds.length > 0) detailParts.push(`Jornadas ${tagDone}/${tagTotal}`);
        if (allApplications.length > 0) detailParts.push(`Anticipos ${advancesDone ? "✓" : "…"}`);
        detailParts.push(`JSON ${snapshotDone ? "✓" : "…"}`);
        setProgress({
          step: "Guardando y aplicando descuentos en paralelo...",
          detail: detailParts.join(" · "),
          percent: pct,
        });
      };
      recompute();

      const pSnapshot = (async () => {
        await saveSnapshot(created.id, fullSnapshot);
        snapshotDone = true;
        recompute();
      })();

      const pTag = (async () => {
        await tagWorkdaysWithPayroll(allWorkdayIds, created.id, (done, total) => {
          tagDone = done;
          tagTotal = Math.max(1, total);
          recompute();
        });
      })();

      const pAdv = (async () => {
        await applyAdvancesToPayroll(allApplications, created.id);
        advancesDone = true;
        recompute();
      })();

      await Promise.all([pSnapshot, pTag, pAdv]);

      setProgress({ step: "Actualizando lista...", detail: "", percent: 95 });
      // Limpia el armado y pasa al historial.
      resetSelection();
      resetPreview();
      setTab("history");
      await load();
      setProgress({ step: "Listo ✓", detail: "", percent: 100 });
    });
    setBusy(false);
    // Pequeño delay para que el "Listo ✓" sea visible un instante.
    setTimeout(() => setProgress(null), 400);
    if (err) throw err;
  };
  return {
    confirmState,
    generateAndSave,
    installmentConfirmState,
    setConfirmState,
    setInstallmentConfirmState,
  };
}
