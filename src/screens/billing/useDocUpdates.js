import { PAYMENT_STATUSES } from "./docs";
import { dteDocumentsService } from "../../services";
import { serverTimestamp } from "firebase/firestore";
import { auth } from "../../firebase";
import { unshout } from "../../utils/textCase";
import { errorText } from "../../utils/errorText";

// Escrituras sobre un documento: estado de pago, notas, centro de costo y
// pagos. Cada una actualiza la lista y el detalle abierto en su lugar, sin
// releer.
export function useDocUpdates({ setDetailDoc, setDocs, toast }) {
  // --- Marcar estado de pago de una factura ---
  // Fija el estado directamente; la UI lo ofrece como un `<select>` por fila.
  // Devuelve si quedó guardado.
  const setPaymentStatus = async (dteDoc, newStatus) => {
    if (!PAYMENT_STATUSES[newStatus]) return false;
    if ((dteDoc.paymentStatus || "unpaid") === newStatus) return true;
    try {
      await dteDocumentsService.update(dteDoc.id, {
        paymentStatus: newStatus,
        paymentStatusSetAt: serverTimestamp(),
        paymentStatusSetBy: auth.currentUser?.uid || null,
      });
      setDocs((prev) => prev.map((d) => (d.id === dteDoc.id ? { ...d, paymentStatus: newStatus } : d)));
      setDetailDoc((cur) => (cur?.id === dteDoc.id ? { ...cur, paymentStatus: newStatus } : cur));
      return true;
    } catch (err) {
      toast.error(`Error al cambiar estado: ${errorText(err)}`);
      return false;
    }
  };

  // Guarda notas o detalle libre de un DTE: la glosa que el SII no incluye en
  // el CSV o apuntes de seguimiento interno.
  const saveDocNotes = async (dteDoc, rawNotes) => {
    const notes = unshout(rawNotes);
    try {
      await dteDocumentsService.update(dteDoc.id, { notes });
      setDocs((prev) => prev.map((d) => (d.id === dteDoc.id ? { ...d, notes } : d)));
      setDetailDoc((cur) => (cur?.id === dteDoc.id ? { ...cur, notes } : cur));
    } catch (err) {
      toast.error(`Error al guardar notas: ${errorText(err)}`);
    }
  };

  // Asigna (o quita) el centro de costo ficticio manual de un documento.
  // Los combustibles se agrupan solos; este campo es para las demás
  // categorías, que el usuario define a mano.
  const saveDocCostCenter = async (dteDoc, costCenterId) => {
    const next = costCenterId || null;
    try {
      await dteDocumentsService.update(dteDoc.id, { costCenterId: next });
      setDocs((prev) => prev.map((d) => (d.id === dteDoc.id ? { ...d, costCenterId: next } : d)));
      setDetailDoc((cur) => (cur?.id === dteDoc.id ? { ...cur, costCenterId: next } : cur));
    } catch (err) {
      toast.error(`Error al asignar centro de costo: ${errorText(err)}`);
    }
  };

  // Guarda el array completo de pagos junto con `amountPaid` denormalizado
  // (su suma), que el orden por saldo y los pendientes leen sin recorrer el
  // array.
  const saveDocPayments = async (dteDoc, payments) => {
    const amountPaid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    try {
      await dteDocumentsService.update(dteDoc.id, { payments, amountPaid });
      setDocs((prev) => prev.map((d) => (d.id === dteDoc.id ? { ...d, payments, amountPaid } : d)));
      setDetailDoc((cur) => (cur?.id === dteDoc.id ? { ...cur, payments, amountPaid } : cur));
    } catch (err) {
      toast.error(`Error al guardar pagos: ${errorText(err)}`);
    }
  };
  return { saveDocCostCenter, saveDocNotes, saveDocPayments, setPaymentStatus };
}
