import { useState } from "react";
import { captureFullWidthDataUrl, captureFullWidthBlob } from "../../utils/imageCapture";
import { localIsoDate } from "../../utils/dates";

const todayStr = () => localIsoDate();

// Salidas del modo foto: descargar el PNG de la grilla, copiarlo como imagen
// o imprimirlo.
export function usePhotoExport({ activeLabor, cycle, photoRef, showToast, toast }) {
  "use no memo";
  const [exporting, setExporting] = useState(false);
  const exportPng = async () => {
    if (!photoRef.current) return;
    setExporting(true);
    try {
      const bg = getComputedStyle(document.body).backgroundColor || "#ffffff";
      const dataUrl = await captureFullWidthDataUrl(photoRef.current, { backgroundColor: bg, pixelRatio: 2, cacheBust: true });
      const link = document.createElement("a");
      link.download = `${cycle.label}_${activeLabor?.name || "labor"}_${todayStr()}.png`.replace(/\s+/g, "_");
      link.href = dataUrl;
      link.click();
      showToast("PNG descargado");
    } catch (err) {
      console.error(err);
      showToast("No se pudo generar el PNG");
    } finally {
      setExporting(false);
    }
  };
  const copyImage = async () => {
    if (!photoRef.current) return;
    setExporting(true);
    try {
      const bg = getComputedStyle(document.body).backgroundColor || "#ffffff";
      const blob = await captureFullWidthBlob(photoRef.current, { backgroundColor: bg, pixelRatio: 2, cacheBust: true });
      if (!blob) throw new Error("No se pudo generar la imagen");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      showToast("Imagen copiada");
    } catch (err) {
      console.error(err);
      showToast("No se pudo copiar la imagen");
    } finally {
      setExporting(false);
    }
  };
  const printPhoto = async () => {
    if (!photoRef.current) return;
    setExporting(true);
    try {
      const bg = getComputedStyle(document.body).backgroundColor || "#ffffff";
      const dataUrl = await captureFullWidthDataUrl(photoRef.current, { backgroundColor: bg, pixelRatio: 2, cacheBust: true });
      const win = window.open("", "_blank", "width=1100,height=800");
      if (!win) {
        toast.warning("Permite las ventanas emergentes para imprimir.");
        return;
      }
      win.document.write(`<!DOCTYPE html><html><head><title>${cycle.label} · ${activeLabor?.name || ""}</title>
        <style>
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
          body { margin: 0; padding: 16px; background: #fff; }
          img { max-width: 100%; height: auto; display: block; }
          @media print { @page { size: landscape; margin: 8mm; } body { padding: 0; } }
        </style>
      </head><body><img src="${dataUrl}" /></body></html>`);
      win.document.close();
      win.focus();
      setTimeout(() => { win.print(); }, 300);
    } catch (err) {
      console.error(err);
      showToast("No se pudo imprimir");
    } finally {
      setExporting(false);
    }
  };
  return { copyImage, exporting, exportPng, printPhoto };
}
