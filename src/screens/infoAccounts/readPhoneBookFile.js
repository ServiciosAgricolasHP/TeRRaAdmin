import { decodeCsvBytes, parseCsv, mapContactsCsv } from "../../utils/contactsCsv";
import { parseVcards } from "../../utils/vcard";
import { mapSheetRows, fixAbsoluteRelTargets } from "../../utils/phoneBookSheet";

// Lee un archivo para la agenda telefónica según su extensión y devuelve
// `{ source, rows, detail }`: el formato, las filas para `planPhoneBookImport`
// y un texto para mostrar (la hoja leída, por ejemplo). Lanza un error con un
// mensaje para la pantalla si no lo reconoce.
export async function readPhoneBookFile(file) {
  const name = file.name;
  const ext = name.toLowerCase().split(".").pop();
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (ext === "xlsx") return readSheet(bytes, name);
  if (ext === "csv") {
    const { format, rows } = mapContactsCsv(parseCsv(decodeCsvBytes(bytes)), { file: name });
    if (!format) throw new Error("No parece un archivo de contactos: no trae columnas de teléfono ni de correo.");
    return { source: format, rows, detail: "" };
  }
  if (ext === "vcf" || ext === "vcard") {
    const rows = parseVcards(decodeCsvBytes(bytes), { file: name });
    if (!rows.length) throw new Error("El archivo no trae contactos (BEGIN:VCARD).");
    return { source: "vcard", rows, detail: "" };
  }
  throw new Error("Formato no reconocido. Usa la planilla (.xlsx), un CSV de Google u Outlook, o un archivo .vcf.");
}

// La planilla. Antes de abrirla con ExcelJS se corrigen sus relaciones
// internas: una planilla armada fuera de Excel puede traer rutas absolutas
// ("/xl/tables/table1.xml") que ExcelJS no sabe abrir. Se usa la hoja
// "Agenda telefónica" o la primera que tenga columnas de nombre y teléfono o
// correo.
async function readSheet(bytes, name) {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(bytes);
  for (const path of Object.keys(zip.files).filter((p) => p.endsWith(".rels"))) {
    const xml = await zip.file(path).async("string");
    const fixed = fixAbsoluteRelTargets(path, xml);
    if (fixed !== xml) zip.file(path, fixed);
  }
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await zip.generateAsync({ type: "arraybuffer" }));
  const sheets = [...wb.worksheets].sort((a, b) => Number(b.name === "Agenda telefónica") - Number(a.name === "Agenda telefónica"));
  for (const ws of sheets) {
    if (ws.state && ws.state !== "visible") continue;
    const rows = [];
    for (let r = 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const cells = [];
      for (let c = 1; c <= ws.columnCount; c++) cells.push(row.getCell(c).text ?? "");
      rows.push(cells);
    }
    const mapped = mapSheetRows(rows, { file: name });
    if (mapped.headerFound) return { source: "sheet", rows: mapped.rows, detail: `hoja «${ws.name}»` };
  }
  throw new Error("No se encontró una hoja con columnas de nombre y de teléfono o correo.");
}
