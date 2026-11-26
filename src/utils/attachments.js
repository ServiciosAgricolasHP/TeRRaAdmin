// Adjuntos de Cheques y pagos: qué archivos se aceptan, cómo se achica una
// foto, el nombre y la ruta en Cloud Storage, y los archivos de un pegado o
// de un arrastre. Solo cálculo: la subida está en `services/storageFiles.js`
// y el achicado en el navegador, en `utils/imageShrink.js`.

export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
// El lado más largo de una foto achicada: se lee bien un comprobante o una
// boleta, y queda en unos cientos de KB.
export const IMAGE_MAX_SIDE = 1600;

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif", "image/bmp"]);
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|heic|heif|bmp)$/i;
const OFFICE_EXT = /\.(docx?|xlsx?|pptx?|odt|ods|rtf)$/i;
const OFFICE_TYPE = /(msword|ms-excel|ms-powerpoint|officedocument|opendocument|rtf)/i;

// "image", "pdf" o null si no se adjunta. El tipo de un archivo pegado o de un
// teléfono a veces viene vacío: entonces decide la extensión.
export function attachmentKind(file) {
  const type = String(file?.type || "").toLowerCase();
  const name = String(file?.name || "");
  if (IMAGE_TYPES.has(type) || (!type && IMAGE_EXT.test(name))) return "image";
  if (type === "application/pdf" || (!type && /\.pdf$/i.test(name))) return "pdf";
  return null;
}

// Por qué no se adjunta un archivo, o "" si se adjunta. El tamaño de una foto
// se revisa después de achicarla.
export function attachmentRejection(file) {
  const kind = attachmentKind(file);
  const name = String(file?.name || "El archivo");
  if (!kind) {
    if (OFFICE_EXT.test(name) || OFFICE_TYPE.test(String(file?.type || ""))) {
      return `${name}: Word, Excel y similares no se adjuntan. Guárdalo como PDF ("Guardar como PDF", o compartir como PDF desde el teléfono) y adjunta ese archivo.`;
    }
    return `${name}: solo se adjuntan fotos, imágenes y PDF.`;
  }
  if (kind === "pdf" && Number(file.size) > ATTACHMENT_MAX_BYTES) {
    return `${name}: pesa ${fileSizeLabel(file.size)} y el máximo es ${fileSizeLabel(ATTACHMENT_MAX_BYTES)}.`;
  }
  return "";
}

// El tamaño de una foto achicada: el lado más largo queda en `maxSide`, sin
// agrandar las que ya son más chicas.
export function shrinkSize(width, height, maxSide = IMAGE_MAX_SIDE) {
  const w = Math.max(1, Math.round(Number(width) || 0));
  const h = Math.max(1, Math.round(Number(height) || 0));
  const scale = Math.min(1, maxSide / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

const EXT_BY_TYPE = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "application/pdf": "pdf" };

// El nombre con que se guarda: sin barras ni caracteres que una ruta no
// acepta, hasta 80 caracteres y con la extensión del tipo final (una foto
// achicada pasa a .jpg). Una imagen pegada llega como "image.png" y se guarda
// como "imagen-pegada".
export function attachmentFileName(name, contentType) {
  const raw = String(name || "").trim();
  const dot = raw.lastIndexOf(".");
  let base = dot > 0 ? raw.slice(0, dot) : raw;
  if (!base || /^image$/i.test(base)) base = "imagen-pegada";
  base = Array.from(base)
    .map((ch) => (ch.charCodeAt(0) < 32 ? " " : ch))
    .join("")
    .replace(/[\\/#?[\]*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
    .trim();
  const ext = EXT_BY_TYPE[contentType] || (dot > 0 ? raw.slice(dot + 1).toLowerCase() : "");
  return ext ? `${base || "archivo"}.${ext}` : base || "archivo";
}

// La ruta en Cloud Storage: una carpeta por vencimiento, y el id del adjunto
// delante del nombre para que dos archivos con el mismo nombre no choquen.
export const attachmentPath = (commitmentId, attachmentId, fileName) => `commitments/${commitmentId}/${attachmentId}-${fileName}`;

// "850 KB" o "1,2 MB".
export function fileSizeLabel(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

// Los archivos de un pegado o de un arrastre (`clipboardData`, `dataTransfer`).
// Una imagen copiada de WhatsApp o de una captura llega como un archivo en
// `items`; algunos navegadores la repiten en `files`, y se toma una sola vez.
export function transferFiles(transfer) {
  if (!transfer) return [];
  const fromItems = Array.from(transfer.items || [])
    .filter((it) => it.kind === "file")
    .map((it) => it.getAsFile())
    .filter(Boolean);
  if (fromItems.length) return fromItems;
  return Array.from(transfer.files || []);
}
