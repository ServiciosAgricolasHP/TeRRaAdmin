// Prepara los archivos elegidos, pegados o arrastrados antes de subirlos: deja
// fuera lo que no se adjunta, con su motivo, achica las fotos y revisa que
// queden bajo el máximo. No lanza: cada archivo sale listo o con su motivo.
import { ATTACHMENT_MAX_BYTES, attachmentKind, attachmentRejection, fileSizeLabel } from "./attachments";
import { shrinkImage } from "./imageShrink";

export async function prepareAttachments(files) {
  const ready = [];
  const rejected = [];
  for (const file of files) {
    const why = attachmentRejection(file);
    if (why) {
      rejected.push(why);
    } else if (attachmentKind(file) === "pdf") {
      ready.push({ blob: file, name: file.name, contentType: "application/pdf" });
    } else {
      const shrunk = await shrinkImage(file).catch((err) => ({ error: err }));
      if (shrunk.error) rejected.push(shrunk.error.message);
      else if (shrunk.blob.size > ATTACHMENT_MAX_BYTES) {
        rejected.push(`${file.name}: pesa ${fileSizeLabel(shrunk.blob.size)} y el máximo es ${fileSizeLabel(ATTACHMENT_MAX_BYTES)}.`);
      } else ready.push({ blob: shrunk.blob, name: file.name, contentType: shrunk.contentType });
    }
  }
  return { ready, rejected };
}

// Las imágenes que hay en el portapapeles, para el botón 📋 Pegar imagen (en
// el teléfono no hay Ctrl+V). El navegador pide permiso la primera vez; sin
// esa función (Firefox) devuelve una lista vacía.
export async function readClipboardImages() {
  if (!navigator.clipboard?.read) return [];
  const items = await navigator.clipboard.read();
  const files = [];
  for (const item of items) {
    const type = item.types.find((t) => t.startsWith("image/"));
    if (type) files.push(new File([await item.getType(type)], "image.png", { type }));
  }
  return files;
}
