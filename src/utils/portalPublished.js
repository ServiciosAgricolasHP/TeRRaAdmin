// Las nóminas publicadas en el portal de trabajadores, de `portalMeta/current`
// (lo escriben las funciones de `functions/portal.js`): la lista `payrolls`,
// de la más nueva a la más vieja, o, con la forma de una sola nómina
// (`payrollId` en la cabecera), esa.
export function publishedPayrollsOf(meta) {
  if (!meta) return [];
  if (Array.isArray(meta.payrolls)) return meta.payrolls.filter((p) => p?.payrollId);
  if (!meta.payrollId) return [];
  return [
    {
      payrollId: meta.payrollId,
      name: meta.payroll?.name || "",
      status: meta.payroll?.status || "pending",
      generatedAt: meta.generatedAt || null,
      workerCount: Number(meta.workerCount) || 0,
      publishedAt: meta.publishedAt || null,
    },
  ];
}
