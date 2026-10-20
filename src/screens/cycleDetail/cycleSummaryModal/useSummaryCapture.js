import { useState, useEffect } from "react";
import { captureFullWidthDataUrl, captureFullWidthBlob } from "../../../utils/imageCapture";

// Copiar la imagen, descargar el PNG e imprimir el resumen. En el modo cobrar
// en edición piden bloquearlo antes, para que la captura no salga con los
// campos de edición ni la marca de agua.
export function useSummaryCapture({ cycle, editMode, mode, printRef, setBusy, titles, toast }) {
  "use no memo";
  // Captura pedida mientras el resumen estaba en edición. `captureAsk` abre el
  // diálogo de confirmación; `pendingCapture` es la acción que corre después
  // de bloquear (ver el efecto más abajo — hay que esperar el repintado).
  const [captureAsk, setCaptureAsk] = useState(null);
  const [pendingCapture, setPendingCapture] = useState(null);

  // ============================================================
  // Imagen e impresión
  // ============================================================
  const filename = `resumen_${mode}_${(cycle?.label || "ciclo").replace(/[/\s]+/g, "_")}.png`;
  // Captura con `scrollWidth`/`scrollHeight`: con tablas anchas, el
  // `offsetWidth` que usaría html-to-image queda cortado al ancho visible del
  // contenedor con scroll.
  const fullCaptureOpts = () => ({
    backgroundColor: "#ffffff",
    pixelRatio: 2,
    width: printRef.current?.scrollWidth || undefined,
    height: printRef.current?.scrollHeight || undefined,
  });
  const runDownload = async () => {
    if (!printRef.current) return;
    setBusy("download");
    try {
      const dataUrl = await captureFullWidthDataUrl(printRef.current, fullCaptureOpts());
      const link = document.createElement("a");
      link.download = filename;
      link.href = dataUrl;
      link.click();
    } finally { setBusy(""); }
  };
  const runCopy = async () => {
    if (!printRef.current) return;
    setBusy("copy");
    try {
      const blob = await captureFullWidthBlob(printRef.current, fullCaptureOpts());
      if (!blob) throw new Error("No se pudo generar la imagen");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast.success("Imagen copiada al portapapeles");
    } catch (err) {
      toast.error("Error: " + (err.message || err));
    } finally { setBusy(""); }
  };

  const runPrint = () => {
    if (!printRef.current) return;
    const html = printRef.current.outerHTML;
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) {
      toast.warning("Permite las ventanas emergentes para imprimir.");
      return;
    }
    win.document.write(`<!DOCTYPE html><html><head><title>${titles.main} — ${cycle?.label || ""}</title>
      <style>
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        body { font-family: ui-sans-serif, system-ui, sans-serif; padding: 20px; color: #000; margin: 0; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #888; padding: 6px 8px; font-size: 12px; }
        /* Repetir el encabezado de la tabla en cada hoja nueva cuando la
           tabla excede la página (Chrome/Firefox). */
        thead { display: table-header-group; }
        tfoot { display: table-row-group; }
        tr { page-break-inside: avoid; }
        @media print { @page { size: landscape; margin: 10mm; } }
      </style>
    </head><body>${html}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 350);
  };

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
    if (kind === "copy") return runCopy();
    if (kind === "download") return runDownload();
    return runPrint();
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
  useEffect(() => {
    if (!pendingCapture || editMode) return;
    let cancelled = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(async () => {
        if (cancelled) return;
        try {
          await runCapture(pendingCapture);
        } finally {
          setPendingCapture(null);
        }
      });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCapture, editMode]);
  return {
    CAPTURE_LABELS,
    captureAsk,
    captureLocked,
    lockedHint,
    requestCapture,
    setCaptureAsk,
    setPendingCapture,
  };
}
