import { useState } from "react";
import ConfirmDialog from "../../components/ConfirmDialog";
import Modal, { ModalCloseButton } from "../../components/Modal";
import { feeListsService } from "../../services/feeListsService";
import { hasChanges } from "../../utils/formChanges";
import { localIsoDate } from "../../utils/dates";
import { feeItemKey, feeListTotals } from "../../utils/feeLists";
import { fmtCurrency } from "../../utils/format";
import FeeItemsTable from "./FeeItemsTable";
import { writeFeeListXlsx } from "./writeFeeListXlsx";

const fmt = (iso) => (iso ? iso.split("-").reverse().join("-") : "");
const pct = (rate) => `${(Number(rate) * 100).toLocaleString("es-CL", { maximumFractionDigits: 2 })}%`;

// Una lista de honorarios guardada: se marca cada boleta emitida con su folio
// (la fecha es la del día en que se marca), se baja en Excel y, si no tiene
// boletas emitidas, se elimina.
export default function FeeListModal({ list, onClose, onChanged }) {
  const [initial] = useState(() => list.items || []);
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const totals = feeListTotals(items);
  const dirty = hasChanges({ items: initial }, { items });
  const today = localIsoDate();

  const change = (key, patch) =>
    setItems((list) =>
      list.map((it) => {
        if (feeItemKey(it) !== key) return it;
        const next = { ...it, ...patch };
        next.issuedAt = next.issued ? it.issuedAt || today : "";
        return next;
      }),
    );

  const save = async () => {
    setBusy("save");
    setError("");
    try {
      await feeListsService.update(list.id, { items, totals: feeListTotals(items) });
      onChanged();
    } catch (e) {
      setError(e.message || "No se pudo guardar.");
      setBusy("");
    }
  };

  const download = async () => {
    setBusy("xlsx");
    try {
      await writeFeeListXlsx({ ...list, items });
    } catch (e) {
      setError(e.message || "No se pudo generar el Excel.");
    }
    setBusy("");
  };

  const remove = async () => {
    setBusy("delete");
    try {
      await feeListsService.remove(list.id);
      onChanged();
    } catch (e) {
      setError(e.message || "No se pudo eliminar.");
      setBusy("");
    }
  };

  const btn = "min-h-9 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-surface-2)] disabled:opacity-50";

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title={`Honorarios · ${list.employerName || ""}`}
      size="xl"
      dirty={dirty && !busy}
      footer={
        <>
          {totals.issued === 0 && (
            <button type="button" onClick={() => setConfirmDelete(true)} disabled={!!busy} className={`${btn} mr-auto text-[var(--color-danger)]`}>
              🗑 Eliminar lista
            </button>
          )}
          <button type="button" onClick={download} disabled={!!busy} className={btn}>
            📊 Excel
          </button>
          <ModalCloseButton disabled={!!busy} className={btn}>
            Cerrar
          </ModalCloseButton>
          <button type="button" onClick={save} disabled={!!busy || !dirty} className="min-h-9 rounded-md bg-[var(--color-accent)] px-4 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] disabled:opacity-60">
            {busy === "save" ? "Guardando…" : "Guardar"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-[var(--color-surface-2)] px-3 py-2 text-sm">
          <span>Del {fmt(list.from)} al {fmt(list.to)}</span>
          <span>{fmtCurrency(list.dailyNet)} líquido por día · retención {pct(list.withholdingRate)}</span>
          <span>Bruto <b>{fmtCurrency(totals.gross)}</b> · líquido <b>{fmtCurrency(totals.net)}</b></span>
          <span className="ml-auto">
            Boletas emitidas <b>{totals.issued}</b> de {totals.count}
          </span>
        </div>
        <FeeItemsTable items={items} mode="saved" onChange={change} />
        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title="Eliminar lista"
        message={`¿Eliminar la lista de honorarios de ${list.employerName || ""} del ${fmt(list.from)} al ${fmt(list.to)}? No tiene boletas emitidas.`}
        confirmLabel="Eliminar"
        danger
        busy={busy === "delete"}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={remove}
      />
    </Modal>
  );
}
