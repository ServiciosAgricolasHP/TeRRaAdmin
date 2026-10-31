import { useState, useEffect, useEffectEvent } from "react";
import { useCaptureActions } from "../../../hooks/useCaptureActions";
import { PRINT_GRID_CSS } from "../../../utils/printWindow";
import { attempt } from "../../../utils/attempt";

// Copiar la imagen, descargar el PNG e imprimir el resumen. En el modo cobrar
// en edición piden bloquearlo antes, para que la captura no salga con los
// campos de edición ni la marca de agua.
export function useSummaryCapture({ cycle, editMode, mode, printRef, titles }) {
  // Captura pedida mientras el resumen estaba en edición. `captureAsk` abre el
  // diálogo de confirmación; `pendingCapture` es la acción que corre después
  // de bloquear (ver el efecto más abajo — hay que esperar el repintado).
  const [captureAsk, setCaptureAsk] = useState(null);
  const [pendingCapture, setPendingCapture] = useState(null);
  const { busy: captureBusy, copy, download, print } = useCaptureActions();

  const filename = `resumen_${mode}_${(cycle?.label || "ciclo").replace(/[/\s]+/g, "_")}.png`;

  // Copiar / PNG / Imprimir rasterizan o imprimen el nodo `printRef` tal como
  // está, así que en modo edición saldrían con los inputs, los botones +/✕ y
  // la marca de agua. El Excel no pasa por acá: se arma desde los datos, sale
  // limpio esté como esté la pantalla.
  const CAPTURE_LABELS = {
    copy: { verb: "copiar la imagen", confirm: "Bloquear y copiar" },
    download: { verb: "descargar el PNG", confirm: "Bloquear y descargar" },
    print: { verb: "imprimir", confirm: "Bloquear e imprimir" },
  };
  const runCapture = (kind) => {
    if (kind === "copy") return copy(printRef.current);
    if (kind === "download") return download(printRef.current, filename);
    return print(printRef.current, { title: `${titles.main} — ${cycle?.label || ""}`, margin: "10mm", css: PRINT_GRID_CSS });
  };

  const captureLocked = mode === "charge" && editMode;
  const lockedHint = "El resumen está en modo edición — se va a pedir bloquearlo antes de generar la imagen.";
  const requestCapture = (kind) => {
    if (captureLocked) {
      setCaptureAsk(kind);
      return;
    }
    runCapture(kind);
  };

  // Tras "Bloquear y …", espera dos requestAnimationFrame antes de capturar:
  // el DOM tiene que reflejar el modo bloqueado.
  const capturePending = useEffectEvent((kind) => runCapture(kind));
  useEffect(() => {
    if (!pendingCapture || editMode) return;
    let cancelled = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(async () => {
        if (cancelled) return;
        const { error: err } = await attempt(() => capturePending(pendingCapture));
        setPendingCapture(null);
        if (err) throw err;
      });
    });
    return () => { cancelled = true; };
  }, [pendingCapture, editMode]);
  return {
    CAPTURE_LABELS,
    captureAsk,
    captureBusy,
    captureLocked,
    lockedHint,
    requestCapture,
    setCaptureAsk,
    setPendingCapture,
  };
}
