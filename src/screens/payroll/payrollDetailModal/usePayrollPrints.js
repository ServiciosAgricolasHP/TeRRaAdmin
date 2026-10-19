import { useState } from "react";
import { printCashReceipts, printPaymentDetails } from "../printReceipts";

// Las impresiones del detalle: comprobantes de efectivo, detalle de pago y el
// detalle de un solo grupo, con su estado de carga.
export function usePayrollPrints({ allGroups, cashGroups, catalogs, cycleTitleOverrides, detailSummaries, getPayrollData, payroll, rutOf, subfaenaSummary, toast }) {
  "use no memo";
  const [printingGroupLeader, setPrintingGroupLeader] = useState(null);

  const [printing, setPrinting] = useState(false);
  const [printingDetail, setPrintingDetail] = useState(false);

  const handlePrint = async () => {
    setPrinting(true);
    try {
      await printCashReceipts(payroll, cashGroups, cycleTitleOverrides, catalogs, await getPayrollData(), rutOf);
    } catch (err) {
      toast.error(err?.message || "Error al imprimir");
    } finally {
      setPrinting(false);
    }
  };

  const handlePrintDetail = async () => {
    setPrintingDetail(true);
    try {
      await printPaymentDetails(payroll, allGroups, cycleTitleOverrides, detailSummaries, catalogs, subfaenaSummary, await getPayrollData(), rutOf);
    } catch (err) {
      toast.error(err?.message || "Error al imprimir");
    } finally {
      setPrintingDetail(false);
    }
  };

  // Imprime el detalle de pago de un solo grupo (un líder). `key` distingue
  // banco y efectivo del mismo líder en el estado de carga (ej. CHILENOS puede
  // tener gente en los dos).
  const handlePrintGroupDetail = async (group, key) => {
    const loadingKey = key || group.leader;
    setPrintingGroupLeader(loadingKey);
    try {
      await printPaymentDetails(payroll, [group], cycleTitleOverrides, [], catalogs, null, await getPayrollData(), rutOf);
    } catch (err) {
      toast.error(err?.message || "Error al imprimir grupo");
    } finally {
      setPrintingGroupLeader(null);
    }
  };
  return {
    handlePrint,
    handlePrintDetail,
    handlePrintGroupDetail,
    printing,
    printingDetail,
    printingGroupLeader,
  };
}
