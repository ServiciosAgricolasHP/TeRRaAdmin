// Achica una foto en el navegador antes de subirla: el lado más largo a
// `IMAGE_MAX_SIDE` y JPEG, sobre fondo blanco para que una captura con
// transparencia no quede negra. Una foto de teléfono de 3–5 MB queda en unos
// cientos de KB. Si la imagen ya es más liviana que el resultado (una captura
// chica), se sube tal cual. Una imagen que el navegador no sabe leer (un HEIC
// fuera de Safari) no se achica: lanza un error con el motivo.
import { IMAGE_MAX_SIDE, shrinkSize } from "./attachments";

const QUALITY = 0.85;

async function decode(file) {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file, { imageOrientation: "from-image" });
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode().finally(() => URL.revokeObjectURL(url));
  return img;
}

const toBlob = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));

export async function shrinkImage(file, maxSide = IMAGE_MAX_SIDE) {
  const image = await decode(file).catch(() => null);
  if (!image) throw new Error(`${file.name || "La imagen"}: el navegador no pudo leerla. Prueba con una captura de pantalla o con otra foto.`);
  const { width, height } = shrinkSize(image.width, image.height, maxSide);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  const fitsAsIs = image.width <= maxSide && image.height <= maxSide && file.type !== "image/heic" && file.type !== "image/heif";
  image.close?.();
  const blob = await toBlob(canvas);
  if (!blob || (fitsAsIs && file.size <= blob.size)) return { blob: file, contentType: file.type || "image/jpeg" };
  return { blob, contentType: "image/jpeg" };
}
