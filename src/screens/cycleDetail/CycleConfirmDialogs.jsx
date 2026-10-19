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
    applyFloorToAll,
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
    floorBulk,
    floorBulkBusy,
    floorRemove,
    floorRemoveBusy,
    removeBusy,
    removeCombo,
    removeComboFromDay,
    removeDayFloor,
    removeLabor,
    removeWorker,
    setCloseFlow,
    setConfirmRemoveDay,
    setConfirmReopen,
    setFloorBulk,
    setFloorRemove,
    setRemoveCombo,
    setRemoveLabor,
    setRemoveWorker,
  } = useCycleDetail();
  return (
    <>
      <ConfirmDialog
        open={!!floorRemove}
        title="Quitar el piso del día"
        message={
          floorRemove
            ? [
                floorRemove.libres.length
                  ? `Se quitará el piso del ${floorRemove.date} y se eliminará el bono de ` +
                    `${floorRemove.libres.length} trabajador${floorRemove.libres.length === 1 ? "" : "es"} ` +
                    `(${fmtCurrency(floorRemove.libres.reduce((a, w) => a + (Number(w.amount) || 0), 0))}).`
                  : `Se quitará el piso del ${floorRemove.date}.`,
                floorRemove.liquidados.length
                  ? `${floorRemove.liquidados.length} bono${floorRemove.liquidados.length === 1 ? " ya está" : "s ya están"} ` +
                    "en una nómina y se mantienen: hay que eliminar o editar esa nómina para tocarlos."
                  : "",
              ]
                .filter(Boolean)
                .join(" ")
            : ""
        }
        confirmLabel="Quitar piso"
        danger busy={floorRemoveBusy}
        onCancel={() => !floorRemoveBusy && setFloorRemove(null)}
        onConfirm={removeDayFloor}
      />

      <ConfirmDialog
        open={!!floorBulk}
        title="Asignar piso a todos"
        message={
          floorBulk
            ? `Se le asignará el piso de ${fmtCurrency(floorBulk.amount)} a ${floorBulk.ruts.length} ` +
              `trabajador${floorBulk.ruts.length === 1 ? "" : "es"} con producción del ${floorBulk.date} ` +
              `que todavía no lo tienen. Total: ${fmtCurrency(floorBulk.amount * floorBulk.ruts.length)}. ` +
              "Los que ya tienen piso quedan como están, y después se puede quitar uno por uno desde la columna 🪙."
            : ""
        }
        confirmLabel="Asignar piso"
        busy={floorBulkBusy}
        onCancel={() => !floorBulkBusy && setFloorBulk(null)}
        onConfirm={applyFloorToAll}
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
