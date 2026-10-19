import ConfirmDialog from "../../components/ConfirmDialog";
import { fmtCurrency } from "../../utils/format";
import { useCycleDetail } from "./CycleDetailContext";

// Confirmaciones de la grilla del ciclo: quitar el piso del día o asignarlo
// a todos, quitar a una persona, una labor, un día o un combo, y cerrar o
// reabrir el ciclo.
export function CycleConfirmDialogs() {
  "use no memo";
  const {
    activeLabor,
    applyPisoToAll,
    closeBusy,
    closeFlow,
    confirmRemoveDay,
    confirmRemoveLabor,
    confirmRemoveWorker,
    confirmReopen,
    cycle,
    doRemoveDay,
    doReopenCycle,
    handleCloseCycle,
    pisoBulk,
    pisoBulkBusy,
    pisoRemove,
    pisoRemoveBusy,
    removeBusy,
    removeCombo,
    removeComboFromDay,
    removeDayPiso,
    removeLabor,
    removeWorker,
    setCloseFlow,
    setConfirmRemoveDay,
    setConfirmReopen,
    setPisoBulk,
    setPisoRemove,
    setRemoveCombo,
    setRemoveLabor,
    setRemoveWorker,
  } = useCycleDetail();
  return (
    <>
      <ConfirmDialog
        open={!!pisoRemove}
        title="Quitar el piso del día"
        message={
          pisoRemove
            ? [
                pisoRemove.libres.length
                  ? `Se quitará el piso del ${pisoRemove.date} y se eliminará el bono de ` +
                    `${pisoRemove.libres.length} trabajador${pisoRemove.libres.length === 1 ? "" : "es"} ` +
                    `(${fmtCurrency(pisoRemove.libres.reduce((a, w) => a + (Number(w.amount) || 0), 0))}).`
                  : `Se quitará el piso del ${pisoRemove.date}.`,
                pisoRemove.liquidados.length
                  ? `${pisoRemove.liquidados.length} bono${pisoRemove.liquidados.length === 1 ? " ya está" : "s ya están"} ` +
                    "en una nómina y se mantienen: hay que eliminar o editar esa nómina para tocarlos."
                  : "",
              ]
                .filter(Boolean)
                .join(" ")
            : ""
        }
        confirmLabel="Quitar piso"
        danger busy={pisoRemoveBusy}
        onCancel={() => !pisoRemoveBusy && setPisoRemove(null)}
        onConfirm={removeDayPiso}
      />

      <ConfirmDialog
        open={!!pisoBulk}
        title="Asignar piso a todos"
        message={
          pisoBulk
            ? `Se le asignará el piso de ${fmtCurrency(pisoBulk.amount)} a ${pisoBulk.ruts.length} ` +
              `trabajador${pisoBulk.ruts.length === 1 ? "" : "es"} con producción del ${pisoBulk.date} ` +
              `que todavía no lo tienen. Total: ${fmtCurrency(pisoBulk.amount * pisoBulk.ruts.length)}. ` +
              "Los que ya tienen piso quedan como están, y después se puede quitar uno por uno desde la columna 🪙."
            : ""
        }
        confirmLabel="Asignar piso"
        busy={pisoBulkBusy}
        onCancel={() => !pisoBulkBusy && setPisoBulk(null)}
        onConfirm={applyPisoToAll}
      />

      <ConfirmDialog
        open={!!removeWorker}
        title="Quitar trabajador"
        message={
          removeWorker
            ? removeWorker.isTemp
              ? `¿Eliminar al trabajador temporal "${removeWorker.name}"? Se borrará junto con toda la producción cargada en este ciclo.`
              : `¿Quitar a ${removeWorker.name} de "${activeLabor?.name}"?`
            : ""
        }
        confirmLabel="Quitar"
        danger busy={removeBusy}
        onCancel={() => !removeBusy && setRemoveWorker(null)}
        onConfirm={confirmRemoveWorker}
      />

      <ConfirmDialog
        open={!!removeLabor}
        title="Quitar labor"
        message={removeLabor ? `¿Quitar la labor "${removeLabor.name}"? Solo si no tiene producción.` : ""}
        confirmLabel="Quitar"
        danger
        onCancel={() => setRemoveLabor(null)}
        onConfirm={confirmRemoveLabor}
      />

      <ConfirmDialog
        open={closeFlow}
        title="Cerrar ciclo"
        message={`¿Cerrar "${cycle.label}"? No se podrá editar a menos que seas admin.`}
        confirmLabel="Cerrar ciclo"
        danger busy={closeBusy}
        onCancel={() => !closeBusy && setCloseFlow(false)}
        onConfirm={handleCloseCycle}
      />

      <ConfirmDialog
        open={!!confirmRemoveDay}
        title="Quitar día"
        message={confirmRemoveDay ? `¿Quitar la columna ${confirmRemoveDay}?` : ""}
        confirmLabel="Quitar"
        danger
        onCancel={() => setConfirmRemoveDay(null)}
        onConfirm={() => {
          const d = confirmRemoveDay;
          setConfirmRemoveDay(null);
          doRemoveDay(d);
        }}
      />

      <ConfirmDialog
        open={confirmReopen}
        title="Reabrir ciclo"
        message="¿Reabrir el ciclo?"
        confirmLabel="Reabrir"
        onCancel={() => setConfirmReopen(false)}
        onConfirm={() => { setConfirmReopen(false); doReopenCycle(); }}
      />

      <ConfirmDialog
        open={!!removeCombo}
        title="Quitar tipo de cosecha"
        message={removeCombo ? `¿Quitar "${removeCombo.label}" del día ${removeCombo.date}?` : ""}
        confirmLabel="Quitar"
        danger
        onCancel={() => setRemoveCombo(null)}
        onConfirm={async () => {
          if (!removeCombo) return;
          await removeComboFromDay(removeCombo.laborId, removeCombo.date, removeCombo.comboKey);
          setRemoveCombo(null);
        }}
      />
    </>
  );
}
