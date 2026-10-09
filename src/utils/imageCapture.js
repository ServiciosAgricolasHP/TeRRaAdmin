import { toBlob, toPng } from "html-to-image";

// Captura un nodo a PNG (Blob o dataUrl) completo, sin que lo corte el scroll
// horizontal del contenedor visible (una tabla más ancha que la pantalla).
//
// Clona el nodo en un contenedor fuera de pantalla (position: fixed a
// -99999px), quita el overflow de todos los descendientes para que las tablas
// tomen su ancho natural, captura el clon y retira el contenedor. El nodo
// original no se toca, así que la pantalla no parpadea.
//
// Las options pasan a html-to-image (backgroundColor, pixelRatio, cacheBust…).
// Por defecto: fondo blanco y pixelRatio 2.

// Atributo de los controles que no van en una exportación (botones de filtrar,
// toggles, cualquier cosa que solo sirve en pantalla). Se pone en el JSX
// —también en la celda de encabezado de su columna, o la tabla queda
// corrida— y esos nodos se sacan del clon antes de medir.
export const EXPORT_HIDE_ATTR = "data-export-hide";

// Clon ya limpio de esos controles. Lo usa la captura y también la impresión,
// que arma su HTML con `outerHTML`.
export function cloneForExport(node) {
  const clone = node.cloneNode(true);
  clone.querySelectorAll(`[${EXPORT_HIDE_ATTR}]`).forEach((el) => el.remove());
  return clone;
}

async function _captureExpanded(node, captureFn, options = {}) {
  if (!node) throw new Error("captureFullWidth: node vacío");
  const clone = cloneForExport(node);
  const wrapper = document.createElement("div");
  wrapper.style.cssText =
    "position: fixed; left: -99999px; top: 0; pointer-events: none; background: #ffffff; z-index: -1;";
  // Fondo explícito: el nodo original puede heredar el de un padre oscuro.
  clone.style.background = options.backgroundColor || "#ffffff";
  clone.style.maxWidth = "none";
  clone.style.width = "max-content";
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);
  try {
    // Todos los descendientes: overflow visible + sin max-width. Cubre divs
    // con overflow-x-auto, tablas dentro de contenedores estrechos, etc.
    const all = clone.querySelectorAll("*");
    all.forEach((el) => {
      el.style.overflow = "visible";
      el.style.overflowX = "visible";
      el.style.overflowY = "visible";
      el.style.maxWidth = "none";
    });
    // Un frame para que el reflow del clon se aplique antes de medir.
    await new Promise((r) => requestAnimationFrame(r));
    const w = clone.scrollWidth;
    const h = clone.scrollHeight;
    return await captureFn(clone, {
      backgroundColor: "#ffffff",
      pixelRatio: 2,
      ...options,
      width: w,
      height: h,
    });
  } finally {
    if (wrapper.parentNode) document.body.removeChild(wrapper);
  }
}

// Variante que devuelve un Blob, para navigator.clipboard.write().
export function captureFullWidthBlob(node, options) {
  return _captureExpanded(node, toBlob, options);
}

// Variante que devuelve un dataUrl, para descargar como archivo con
// link.href = dataUrl + link.click().
export function captureFullWidthDataUrl(node, options) {
  return _captureExpanded(node, toPng, options);
}
