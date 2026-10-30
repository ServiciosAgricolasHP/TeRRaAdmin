import { mapExcelRow } from "../../utils/commitments";

// Lee la planilla "Control de Cheques" (o su primera hoja): una fila por
// cheque, sin el encabezado, con su número de línea.
export async function readChequesFile(file, companies) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.getWorksheet("Control de Cheques") || wb.worksheets[0];
  const out = [];
  ws.eachRow((row, i) => {
    if (i === 1) return;
    const mapped = mapExcelRow(row.values.slice(1), { companies });
    if (mapped) out.push({ line: i, ...mapped });
  });
  return out;
}
