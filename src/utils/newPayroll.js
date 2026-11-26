// La nómina nueva y su JSON, como los guarda "Guardar nómina", armados desde
// la vista previa: las filas incluidas (`items`), los ciclos, las jornadas y
// los anticipos que leyó, y lo elegido.
import { MAX_DOC_BYTES, docSize, sizeStatus } from "./docSizes";
import { payrollItemOf, payrollTotalsOf, skippedAdvancesOf } from "./payrollPreview";
import { newPayrollCycleDetails } from "./payrollItem";
import { snapshotAdvanceOf, snapshotCycleOf, snapshotWorkdayOf } from "./snapshotShapes";

// `payroll` es el documento de la nómina y `snapshot`, su JSON, sin
// `payrollId`. `workdayIds` son las jornadas que etiqueta y `applications`,
// los anticipos y bonos que aplica.
export function newPayrollDocs({
  items,
  cycles = [],
  chosenCycles,
  workdays = [],
  advances = [],
  jobs = [],
  subjobs = [],
  name,
  bankFormatId,
  classification,
  reviewedChecks = [],
  generatedAt,
}) {
  // Los ciclos de la nómina y qué labores abarca cada uno, para que
  // Recalcular no traiga después lo que quedó afuera: los elegidos con
  // alguna labor, y con `laborIds: []` los que traen las personas sueltas.
  // El ciclo de una persona entra solo si ella quedó incluida. Los ciclos
  // son los de la vista previa, ya con las labores de sus jornadas.
  const includedWorkdayIds = new Set(items.flatMap((p) => p.workdayIds || []));
  const cycleDetails = newPayrollCycleDetails({
    cycles,
    chosen: chosenCycles,
    workdays: workdays.filter((wd) => includedWorkdayIds.has(wd.id)),
    faenas: jobs,
    subfaenas: subjobs,
  });
  const cycleIds = cycleDetails.map((c) => c.id);
  const cycleLabels = cycleDetails.map((c) => c.label);
  const payrollCycleIds = new Set(cycleIds);

  const cleanItems = items.map((p) => payrollItemOf(p, payrollCycleIds));
  const skippedAdvanceIds = skippedAdvancesOf(items);

  const allWorkdayIds = cleanItems.flatMap((p) => p.workdayIds);
  const allAdvanceIds = cleanItems.flatMap((p) => p.advanceIds || []);
  const allApplications = cleanItems.flatMap((p) => p.advanceApplications || []);
  const totals = payrollTotalsOf(cleanItems);

  // Snapshot estático: todo lo necesario para volver a mostrar la nómina
  // sin más lecturas ni depender de datos que pueden cambiar (detalle de
  // jornadas, origen de los anticipos y configuración de las labores).
  const wdIdSet = new Set(allWorkdayIds);
  const advIdSet = new Set(allAdvanceIds);
  const snapshot = {
    version: 1,
    generatedAt,
    payroll: {
      name,
      format: bankFormatId,
      classification: classification || "nomina",
      status: "pending",
      total: totals.total, bankTotal: totals.bankTotal, cashTotal: totals.cashTotal,
      workerCount: totals.workerCount,
      bankCount: totals.bankCount,
      cashCount: totals.cashCount,
      advanceTotal: totals.advanceTotal,
      bonusTotal: totals.bonusTotal,
    },
    cycles: cycleDetails.map((cd) => snapshotCycleOf(cd, cycles.find((c) => c.id === cd.id))),
    workers: cleanItems,
    workdays: workdays.filter((wd) => wdIdSet.has(wd.id)).map(snapshotWorkdayOf),
    advances: advances.filter((adv) => advIdSet.has(adv.id)).map(snapshotAdvanceOf),
  };

  const payroll = {
    name,
    format: bankFormatId,
    classification: classification || "nomina",
    status: "pending",
    cycleIds,
    cycleLabels,
    cycleDetails,
    items: cleanItems,
    total: totals.total,
    bankTotal: totals.bankTotal,
    cashTotal: totals.cashTotal,
    workerCount: totals.workerCount,
    bankCount: totals.bankCount,
    cashCount: totals.cashCount,
    advanceIds: allAdvanceIds,
    advanceTotal: totals.advanceTotal,
    hasSnapshot: true,
    ...(reviewedChecks.length ? { reviewedChecks } : {}),
    ...(skippedAdvanceIds.length ? { skippedAdvanceIds } : {}),
  };

  return { payroll, snapshot, workdayIds: allWorkdayIds, applications: allApplications };
}

// Lo que agrega cada escritura: quién y cuándo (`firestoreBase`,
// `payrollsService`). Un id de Firestore tiene 20 caracteres y uno de cuenta, 28.
const SAMPLE_ID = "x".repeat(20);
const STAMPS = {
  createdAt: new Date(0),
  createdBy: "x".repeat(28),
  updatedAt: new Date(0),
  updatedBy: "x".repeat(28),
  updatedByName: "x".repeat(40),
};

// Lo que pesarían la nómina y la cabecera de su JSON (`newPayrollDocs`)
// contra el límite de un documento de Firestore. Las jornadas del JSON van en
// partes aparte (`utils/snapshotParts.js`) y no cuentan. `bytes` es el más
// pesado de los dos, `share` su parte del límite y `status`, su `sizeStatus`.
export function newPayrollWeight({ payroll, snapshot }) {
  const payrollBytes = docSize(`payrolls/${SAMPLE_ID}`, { ...payroll, ...STAMPS });
  const { workdays: _parted, ...header } = snapshot;
  const jsonBytes = docSize(`payrollSnapshots/${SAMPLE_ID}`, { ...header, payrollId: SAMPLE_ID, workdayParts: 0, ...STAMPS });
  const bytes = Math.max(payrollBytes, jsonBytes);
  return { payroll: payrollBytes, json: jsonBytes, bytes, share: bytes / MAX_DOC_BYTES, status: sizeStatus(bytes) };
}
