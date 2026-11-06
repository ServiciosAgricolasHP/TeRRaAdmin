import { useState } from "react";
import { setPaymentStatusMany } from "../../services/dtePaymentStatus";
import { pendingDocsOf, pinKeyOf } from "../../utils/receivables";
import { errorText } from "../../utils/errorText";
import { attempt } from "../../utils/attempt";

const NO_PINS = new Map();
const NO_IDS = new Set();

// Los cambios de estado de la pestaña Pendientes: el de una factura, desde el
// selector de su fila, y el de varias de una vez (con confirmación). Cada fila
// que se cambia queda fijada (`pinned`, para `receivablesView`), así sigue a
// la vista con su estado nuevo hasta salir de la pestaña y se puede volver a
// cambiar ahí mismo. `setPaymentStatus` es el de `useDocUpdates`: devuelve si
// se guardó.
export function useReceivableActions({ setDocs, setPaymentStatus, toast }) {
  const [pinned, setPinned] = useState(NO_PINS);
  const [busyIds, setBusyIds] = useState(NO_IDS);
  // { rows, status, message } de "✓ … pagado" mientras se confirma.
  const [confirmBulk, setConfirmBulk] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  // Fija las filas con lo que debían; una que ya estaba fijada conserva lo de
  // la primera vez.
  const pin = (rows) =>
    setPinned((prev) => {
      const next = new Map(prev);
      for (const r of rows) {
        const key = pinKeyOf(r.doc.id, r.category);
        if (!next.has(key)) next.set(key, { category: r.category, pending: r.pending });
      }
      return next;
    });
  const unpin = (keys) =>
    setPinned((prev) => {
      const next = new Map(prev);
      for (const key of keys) next.delete(key);
      return next;
    });
  const setBusy = (id, on) =>
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  // Cambia el estado de una fila: la fija antes, para que no desaparezca al
  // cambiar, y la suelta si no se guardó y no estaba fijada.
  const markStatus = async (row, status) => {
    const id = row.doc.id;
    const key = pinKeyOf(id, row.category);
    const wasPinned = pinned.has(key);
    pin([row]);
    setBusy(id, true);
    const ok = await setPaymentStatus(row.doc, status);
    setBusy(id, false);
    if (!ok && !wasPinned) unpin([key]);
  };

  // "✓ … pagado" de un mes o de un cliente: pide confirmar con `message`.
  const askBulk = (rows, status, message) => {
    const pendingRows = (rows || []).filter((r) => !r.resolved);
    if (pendingRows.length === 0) return;
    setConfirmBulk({ rows: pendingRows, status, message });
  };
  const cancelBulk = () => setConfirmBulk(null);
  const confirmBulkAction = async () => {
    const c = confirmBulk;
    if (!c) return;
    const newKeys = c.rows.map((r) => pinKeyOf(r.doc.id, r.category)).filter((key) => !pinned.has(key));
    setBulkBusy(true);
    pin(c.rows);
    const targets = pendingDocsOf(c.rows);
    const { error: err } = await attempt(() => setPaymentStatusMany(targets, c.status));
    if (err) {
      unpin(newKeys);
      toast.error(`No se pudieron marcar las facturas: ${errorText(err)}`);
    } else {
      const ids = new Set(targets.map((d) => d.id));
      setDocs((prev) => prev.map((d) => (ids.has(d.id) ? { ...d, paymentStatus: c.status } : d)));
    }
    setBulkBusy(false);
    setConfirmBulk(null);
  };

  return { askBulk, bulkBusy, busyIds, cancelBulk, confirmBulk, confirmBulkAction, markStatus, pinned };
}
