// Descarga el snapshot como archivo JSON. En el nombre, cada tramo de
// caracteres que no sean letra, número, "_" o "-" pasa a "_".
export function downloadSnapshotJson(payrollName, snapshot) {
  try {
    const json = JSON.stringify(snapshot, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeName = String(payrollName || "Nomina").replace(/[^a-z0-9_-]+/gi, "_");
    a.href = url;
    a.download = `${safeName}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  } catch (err) {
    console.warn("No se pudo descargar el JSON del snapshot:", err);
  }
}
