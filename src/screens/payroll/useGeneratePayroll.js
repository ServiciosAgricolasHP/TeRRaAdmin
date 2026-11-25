import { useState } from "react";
import { installmentCandidatesOf, withoutInstallments } from "../../utils/payrollPreview";
import { isCashBank } from "../../utils/banks";
import { validateAccountNumber, payrollSuggestedName } from "../../utils/payroll";
import { newPayrollDocs } from "../../utils/newPayroll";
import { saveSnapshot } from "../../services/payrollSnapshots";
import { payrollsService, tagWorkdaysWithPayroll } from "../../services/payrollsService";
import { applyAdvancesToPayroll } from "../../services/advancesService";
import { attempt } from "../../utils/attempt";
import { errorText } from "../../utils/errorText";
import { reviewedChecksFor } from "../../utils/payrollChecks/payrollChecks";

const NO_REVIEWS = [];

// Guardar la nómina de la vista previa: confirma las cuotas y las cuentas con
// problemas, crea la nómina con su JSON, etiqueta las jornadas y aplica los
// anticipos y bonos. `checks` es la revisión de la vista previa: lo marcado
// revisado se guarda con la nómina.
export function useGeneratePayroll({
  bankFormat,
  checks,
  chosenCycles,
  jobs,
  load,
  payrollClassification,
  payrollName,
  previewAdvancesRef,
  previewCycleDocsRef,
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
    // Entran todos los incluidos, también los de $0 (un anticipo que cubrió
    // todo el bruto, o un sueldo mensual con solo días de asistencia), para que
    // sus jornadas queden pagadas y sus anticipos aplicados. El archivo del
    // banco filtra los de $0.
    const rawItems = previewItems.filter((p) => p.include);
    if (rawItems.length === 0) {
      toast.warning("No hay trabajadores seleccionados.");
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
    // La nómina ya creada, si se alcanzó a crear: una falla después de eso no
    // deja volver a apretar Guardar, que crearía otra.
    let createdId = null;
    let snapshotSaved = true;
    const { error: err } = await attempt(async () => {
      const finalName = payrollName || payrollSuggestedName();
      const { payroll, snapshot, workdayIds: allWorkdayIds, applications: allApplications } = newPayrollDocs({
        items,
        cycles: previewCycleDocsRef.current || [],
        chosenCycles,
        workdays: previewWorkdaysRef.current || [],
        advances: previewAdvancesRef.current || [],
        jobs,
        subjobs,
        name: finalName,
        bankFormatId: bankFormat.id,
        classification: payrollClassification,
        reviewedChecks: reviewedChecksFor(checks.reviewed, checks.alerts),
        generatedAt: new Date().toISOString(),
      });

      setProgress({ step: "Creando registro de la nómina...", detail: "", percent: 5 });
      const created = await payrollsService.create(payroll);
      createdId = created.id;

      // Snapshot completo para guardar en `payrollSnapshots` (1:1 con payroll).
      // El JSON se baja desde el menú de descargas del detalle.
      const fullSnapshot = { ...snapshot, payrollId: created.id };

      // Los tres pasos siguientes solo necesitan `created.id` y corren en paralelo:
      //   • subir el JSON (cabecera y partes, en un lote)     ~15% del progreso
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
        snapshotSaved = await saveSnapshot(created.id, fullSnapshot);
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
      checks.resetReviewed(NO_REVIEWS);
      setTab("history");
      await load();
      setProgress({ step: "Listo ✓", detail: "", percent: 100 });
    });
    setBusy(false);
    // Pequeño delay para que el "Listo ✓" sea visible un instante.
    setTimeout(() => setProgress(null), err ? 0 : 400);
    if (!err && !snapshotSaved) {
      toast.error("La nómina se generó, pero no se guardó su JSON: el detalle, la descarga y el portal no tendrán sus jornadas. Elimínala desde el historial y vuelve a generarla.", {
        title: "Nómina sin JSON",
        duration: 0,
      });
    }
    if (!err) return;
    console.error("[nómina] no se pudo generar:", err);
    if (!createdId) {
      // No se escribió nada: la vista previa sigue y se puede volver a intentar.
      toast.error(`No se pudo guardar la nómina: ${errorText(err)}`);
      return;
    }
    // La nómina quedó creada, pero sin terminar de etiquetar las jornadas o
    // aplicar los anticipos. Eliminarla devuelve todo atrás; la vista previa se
    // cierra para que no se cree una segunda.
    resetSelection();
    resetPreview();
    checks.resetReviewed(NO_REVIEWS);
    setTab("history");
    await attempt(() => load());
    toast.error(
      `La nómina se creó, pero no se terminó de guardar (${errorText(err)}). Elimínala desde el historial y vuelve a generarla.`,
      { title: "Nómina a medias", duration: 0 },
    );
  };
  return {
    confirmState,
    generateAndSave,
    installmentConfirmState,
    setConfirmState,
    setInstallmentConfirmState,
  };
}
