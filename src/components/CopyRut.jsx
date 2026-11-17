import { useToast } from "../contexts/ToastContext";
import { attempt } from "../utils/attempt";
import { formatRutForDisplay, normalizeRut } from "../utils/rutUtils";

// Un RUT que se copia con un clic: se muestra con puntos y se copia sin ellos,
// con guion, con el aviso de lo copiado. Seleccionarlo a mano y copiarlo
// también lo deja sin puntos. El doble clic queda libre para abrir la ficha
// (`onDoubleClick`, o el de la celda de la grilla), sin copiar dos veces, y
// Shift, Ctrl o Cmd + clic no copian, para no pisar la selección de celdas de
// una grilla. `label` nombra lo que se copia en el aviso ("RUT de pago");
// `icon` suma un 📋 al lado; `editHint` dice en el `title` que el doble clic
// edita, cuando lo maneja la grilla.
export function CopyRut({ rut, label = "RUT", icon = false, className = "", onDoubleClick = null, editHint = false }) {
  const toast = useToast();
  const value = normalizeRut(rut);
  const shown = formatRutForDisplay(rut);
  if (!value) return shown || null;

  // El clic no llega a la fila ni al encabezado que lo contiene (abrir o
  // plegar un grupo).
  const copy = async (e) => {
    e.stopPropagation();
    if (e.detail > 1 || e.shiftKey || e.ctrlKey || e.metaKey) return;
    const { error } = await attempt(() => navigator.clipboard.writeText(value));
    if (error) toast.error(`No se pudo copiar el ${label}`);
    else toast.success(`${label} ${value} copiado`);
  };
  const copySelection = (e) => {
    if (window.getSelection()?.toString().trim() !== shown) return;
    e.clipboardData.setData("text/plain", value);
    e.preventDefault();
  };
  const hint = onDoubleClick || editHint ? `Clic: copiar ${value} · Doble clic: editar` : `Copiar ${value}`;

  return (
    <button
      type="button"
      onClick={copy}
      onDoubleClick={onDoubleClick || undefined}
      onCopy={copySelection}
      title={hint}
      className={`inline-flex items-center gap-1 rounded text-left hover:text-[var(--color-accent)] hover:underline ${className}`}
    >
      {shown}
      {icon && <span aria-hidden="true">📋</span>}
    </button>
  );
}
