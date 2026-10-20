import { CONTACT_TYPES, DEPARTMENTS } from "../../utils/phoneBook";
import { PHONE_BOOK_HEADERS, phoneBookSheetRows } from "../../utils/phoneBookSheet";
import { localIsoDate } from "../../utils/dates";
import { downloadBlob } from "./phoneBookFiles";

// Anchos de las columnas, los mismos de la planilla de las secretarias.
const WIDTHS = [28, 18, 20, 25, 30, 28, 20, 20, 34, 42];
// Filas de más con las listas desplegables, para seguir escribiendo debajo.
const SPARE_ROWS = 100;

// Descarga la agenda (los contactos filtrados en pantalla) en el formato de la
// planilla de las secretarias: la hoja "Agenda telefónica" como Tabla de Excel,
// con las listas de tipo y departamento de la hoja oculta "Listas". Así se
// corrige en Excel y se vuelve a importar. No sigue la convención de la
// columna A vacía: es un formato de ida y vuelta, como el del banco.
export async function writePhoneBookXlsx(contacts) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Agenda telefónica", { views: [{ state: "frozen", ySplit: 1 }] });
  const rows = phoneBookSheetRows(contacts);
  ws.addTable({
    name: "AgendaTelefonica",
    ref: "A1",
    headerRow: true,
    style: { theme: "TableStyleMedium2", showRowStripes: true },
    columns: PHONE_BOOK_HEADERS.map((name) => ({ name, filterButton: true })),
    rows: rows.length ? rows : [PHONE_BOOK_HEADERS.map(() => "")],
  });
  WIDTHS.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  const lists = wb.addWorksheet("Listas", { state: "hidden" });
  lists.getCell("A1").value = "Tipo de contacto";
  lists.getCell("B1").value = "Departamento / área";
  CONTACT_TYPES.forEach((t, i) => { lists.getCell(`A${i + 2}`).value = t.label; });
  DEPARTMENTS.forEach((d, i) => { lists.getCell(`B${i + 2}`).value = d; });
  const typeRange = `Listas!$A$2:$A$${CONTACT_TYPES.length + 1}`;
  const deptRange = `Listas!$B$2:$B$${DEPARTMENTS.length + 1}`;

  // Las listas sugieren; como en la planilla original, no rechazan otro valor
  // (al importar, un tipo desconocido queda como "Otro").
  for (let r = 2; r <= Math.max(rows.length, 1) + 1 + SPARE_ROWS; r++) {
    ws.getCell(`C${r}`).dataValidation = { type: "list", allowBlank: true, formulae: [typeRange], showErrorMessage: false };
    ws.getCell(`D${r}`).dataValidation = { type: "list", allowBlank: true, formulae: [deptRange], showErrorMessage: false };
  }

  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `Agenda_telefonica_${localIsoDate()}.xlsx`,
  );
}
