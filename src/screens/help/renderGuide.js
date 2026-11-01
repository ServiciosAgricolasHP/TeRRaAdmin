import { Marked } from "marked";
import imageSizes from "./imageSizes.json";

// El Markdown de una guía a HTML. Las imágenes de `help/` salen de `public/`,
// con su ancho y alto (los anota el generador de capturas) para que la página
// no salte al cargarlas, y se bajan solo cuando se acercan a la vista.

const escapeHtml = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const marked = new Marked({
  renderer: {
    image({ href, text }) {
      const src = href.startsWith("help/") ? `${import.meta.env.BASE_URL}${href}` : href;
      const size = imageSizes[href];
      const dims = size ? ` width="${size[0]}" height="${size[1]}"` : "";
      return `<img src="${escapeHtml(src)}" alt="${escapeHtml(text)}"${dims} loading="lazy" decoding="async">`;
    },
  },
});

export const renderGuideMarkdown = (markdown) => marked.parse(markdown || "");
