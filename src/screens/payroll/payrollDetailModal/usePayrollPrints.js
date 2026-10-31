import { useState } from "react";
import { printCashReceipts, printPaymentDetails } from "../printReceipts";
import { attempt } from "../../../utils/attempt";

// Las impresiones del detalle: comprobantes de efectivo, detalle de pago y el
// detalle de un solo grupo, con su estado de carga.
export function usePayrollPrints({ allGroups, cashGroups, catalogs, cyclesApart, cycleTitleOverrides, detailSummaries, getPayrollData, payroll, rutOf, subfaenaSummary, toast }) {
  const [printingGroupLeader, setPrintingGroupLeader] = useState(null);

  const [printing, setPrinting] = useState(false);
  const [printingDetail, setPrintingDetail] = useState(false);

  const handlePrint = async () => {
    setPrinting(true);
    const { error: err } = await attempt(async () => printCashReceipts(payroll, cashGroups, cycleTitleOverrides, catalogs, await getPayrollData(), rutOf));
    if (err) toast.error(err?.message || "Error al imprimir");
    setPrinting(false);
  };

  const handlePrintDetail = async () => {
    setPrintingDetail(true);
    const { error: err } = await attempt(async () => printPaymentDetails(payroll, allGroups, cycleTitleOverrides, detailSummaries, catalogs, subfaenaSummary, await getPayrollData(), rutOf, { cyclesApart }));
    if (err) toast.error(err?.message || "Error al imprimir");
    setPrintingDetail(false);
  };

  // Imprime el detalle de pago de un solo grupo (un líder). `key` distingue
  // banco y efectivo del mismo líder en el estado de carga (ej. CHILENOS puede
  // tener gente en los dos).
  const handlePrintGroupDetail = async (group, key) => {
    const loadingKey = key || group.leader;
    setPrintingGroupLeader(loadingKey);
    const { error: err } = await attempt(async () => printPaymentDetails(payroll, [group], cycleTitleOverrides, [], catalogs, null, await getPayrollData(), rutOf, { cyclesApart }));
    if (err) toast.error(err?.message || "Error al imprimir grupo");
    setPrintingGroupLeader(null);
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
