import { exportCyclesOf } from "../../utils/payrollCycles";
import { downloadPayrollXlsx, downloadBankFileXlsx } from "../../utils/payroll";
import { readSnapshot } from "../../services/payrollSnapshots";
import { downloadSnapshotJson } from "./downloadSnapshotJson";

// Copia de los items con el rut vigente, para exportar. Solo para archivos que
// se leen afuera: dentro de la app los items conservan el rut guardado, que es
// la clave con que se cruzan con jornadas y anticipos.
const withCurrentRuts = (items, rutOf) =>
  (items || []).map((it) => ({ ...it, rut: rutOf(it.rut, it.workerId) }));

// Las descargas de una nómina: el Excel completo, solo la hoja del banco (en el
// formato vigente, que se relee en cada descarga) y el JSON.
export function usePayrollDownloads({ currentBankFormat, cycles, rutOf, toast }) {
  "use no memo";
  // El formato del archivo del banco se relee en cada descarga: sin leerlo no
  // se descarga.
  const bankFormatForDownload = async () => {
    try {
      return await currentBankFormat();
    } catch (err) {
      console.error(err);
      toast.error("No se pudo leer el formato del archivo del banco. Revisa la conexión e intenta de nuevo.");
      return null;
    }
  };
  const onRedownload = async (p) => {
    const format = await bankFormatForDownload();
    if (!format) return;
    const cyclesForExport = exportCyclesOf(p, cycles);
    await downloadPayrollXlsx(withCurrentRuts(p.items, rutOf), p.name || "Nomina", cyclesForExport, format);
  };
  const onDownloadBankFile = async (p) => {
    const format = await bankFormatForDownload();
    if (!format) return;
    const filename = `${p.name || "Nomina"}_${format.fileSuffix}`;
    await downloadBankFileXlsx(withCurrentRuts(p.items, rutOf), filename, format);
  };
  // Vuelve a bajar el JSON del snapshot de una nómina. Lo lee de
  // payrollSnapshots y, si no está, del campo `snapshot` embebido en la nómina.
  const onDownloadSnapshot = async (p) => {
    try {
      const snap = await readSnapshot(p);
      if (!snap) {
        toast.warning("Esta nómina no tiene JSON guardado (se creó antes de que existiera).");
        return;
      }
      downloadSnapshotJson(p.name || "Nomina", snap);
    } catch (err) {
      console.error(err);
      toast.error("No se pudo descargar el JSON.");
    }
  };
  return { onDownloadBankFile, onDownloadSnapshot, onRedownload };
}
