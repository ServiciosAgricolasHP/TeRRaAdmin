import Modal from "../../components/Modal";
import { parseAmount } from "../../utils/formula";
import TextField from "../../components/TextField";
import { useCycleDetail } from "./CycleDetailContext";

// Precio nuevo (tier) de un día en una labor a trato.
export function AddPriceModal() {
  "use no memo";
  const {
    addPriceBusy,
    addPriceModal,
    persistComboConfig,
    setAddPriceBusy,
    setAddPriceModal,
  } = useCycleDetail();
  return (
    <Modal
      open={!!addPriceModal}
      onClose={() => !addPriceBusy && setAddPriceModal(null)}
      title={addPriceModal ? `Nuevo precio · ${addPriceModal.date}` : "Nuevo precio"}
      size="sm"
      footer={(
        <>
          <button
            type="button"
            onClick={() => setAddPriceModal(null)}
            disabled={addPriceBusy}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={async () => {
              if (!addPriceModal) return;
              const price = parseAmount(addPriceModal.value) || 0;
              if (price === 0) return;
              setAddPriceBusy(true);
              try {
                await persistComboConfig(
                  addPriceModal.laborId,
                  addPriceModal.date,
                  addPriceModal.nextKey,
                  { price, mode: addPriceModal.defaultMode },
                  true,
                );
                setAddPriceModal(null);
              } finally {
                setAddPriceBusy(false);
              }
            }}
            disabled={addPriceBusy || !(parseAmount(addPriceModal?.value) > 0)}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
          >
            {addPriceBusy ? "..." : "Agregar"}
          </button>
        </>
      )}
    >
      {addPriceModal && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const price = parseAmount(addPriceModal.value) || 0;
            if (price === 0 || addPriceBusy) return;
            (async () => {
              setAddPriceBusy(true);
              try {
                await persistComboConfig(
                  addPriceModal.laborId,
                  addPriceModal.date,
                  addPriceModal.nextKey,
                  { price, mode: addPriceModal.defaultMode },
                  true,
                );
                setAddPriceModal(null);
              } finally {
                setAddPriceBusy(false);
              }
            })();
          }}
          className="space-y-2"
        >
          <TextField
            label="Precio"
            required
            autoFocus
            placeholder="Ej: 1500"
            value={addPriceModal.value}
            onChange={(v) => setAddPriceModal((s) => (s ? { ...s, value: v } : s))}
          />
          <p className="text-[11px] text-[var(--color-muted)]">
            Se agrega como un nuevo tramo de precio para este día. Modo por defecto: {addPriceModal.defaultMode === "flat" ? "pago al día" : "por unidad"}.
          </p>
        </form>
      )}
    </Modal>
  );
}
