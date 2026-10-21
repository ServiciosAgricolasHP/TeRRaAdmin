import { useState } from "react";
import ConfirmDialog from "../../components/ConfirmDialog";
import Modal, { ModalCloseButton } from "../../components/Modal";
import { contributionListsService } from "../../services/contributionListsService";
import { localIsoDate } from "../../utils/dates";
import { contributionTotals, monthTitle } from "../../utils/contributionLists";
import ContributionItemsTable from "./ContributionItemsTable";
import { writeContributionListXlsx } from "./writeContributionListXlsx";

const fmt = (iso) => (iso ? iso.split("-").reverse().join("-") : "");

// Una lista de imposiciones guardada: se baja en Excel, se marca enviada al
// contador (con la fecha del día) o se desmarca, y, si no se envió, se
// elimina.
export default function ContributionListModal({ list, onClose, onChanged }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const totals = contributionTotals(list.items || []);
  const sent = !!list.sentAt;

  const run = async (kind, fn) => {
    setBusy(kind);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message || String(e));
    }
    setBusy("");
  };
  const toggleSent = () =>
    run("sent", async () => {
      const sentAt = sent ? "" : localIsoDate();
      await contributionListsService.update(list.id, { sentAt });
      onChanged();
    });
  const download = () => run("xlsx", () => writeContributionListXlsx(list));
  const remove = () =>
    run("delete", async () => {
      await contributionListsService.remove(list.id);
      onChanged();
    });

  const btn = "min-h-9 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-surface-2)] disabled:opacity-50";

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title={`Imposiciones ${monthTitle(list.month)} · ${list.employerName || ""}`}
      size="xl"
      footer={
        <>
          {!sent && (
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
          <button type="button" onClick={toggleSent} disabled={!!busy} className="min-h-9 rounded-md bg-[var(--color-accent)] px-4 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] disabled:opacity-60">
            {sent ? "Marcar no enviada" : "Marcar enviada al contador"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-[var(--color-surface-2)] px-3 py-2 text-sm">
          <span><b>{totals.people}</b> persona{totals.people === 1 ? "" : "s"} · {totals.days} días</span>
          {totals.settlements > 0 && <span className="text-[var(--color-warning)]">{totals.settlements} con finiquito</span>}
          <span className="ml-auto">{sent ? <span className="text-[var(--color-success)]">Enviada el {fmt(list.sentAt)}</span> : "Sin enviar"}</span>
        </div>
        <ContributionItemsTable items={list.items || []} />
        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title="Eliminar lista"
        message={`¿Eliminar la lista de imposiciones de ${list.employerName || ""} de ${monthTitle(list.month)}? No se ha enviado al contador.`}
        confirmLabel="Eliminar"
        danger
        busy={busy === "delete"}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={remove}
      />
    </Modal>
  );
}
