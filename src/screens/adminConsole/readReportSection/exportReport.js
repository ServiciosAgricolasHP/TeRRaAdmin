// Las salidas del informe de lecturas: el JSON que se baja y el texto que se
// copia.

export function downloadReportJson(fileName, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// Copia el texto; sin acceso al portapapeles, lo muestra para copiarlo a mano.
// Devuelve si quedó copiado.
export async function copyReportText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    window.prompt("Copia el informe:", text);
    return false;
  }
}
