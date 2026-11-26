// Los adjuntos de un documento (un vencimiento, una nómina, un resumen de
// transporte): el archivo en Cloud Storage, en `{folder}/{id}/{adjunto}-{nombre}`,
// y su ficha en el campo `attachments` del documento. Cada colección arma su
// `target` en su servicio: `{ folder, save(id, attachments) }`, donde `save`
// escribe la lista con las reglas de esa colección.
import { auth } from "../firebase";
import { attachmentFileName, attachmentPath } from "../utils/attachments";
import { signerName } from "./signer";
import { deleteFile, uploadFile } from "./storageFiles";

const newAttachmentId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// Sube los archivos ya preparados (`{ blob, name, contentType }`: una foto ya
// achicada) y los suma a `attachments` de `owner` en una sola escritura. `extra`
// va en la ficha de cada uno (el abono que respalda, por ejemplo). Si algo
// falla, se borran los que alcanzaron a subir.
export async function addAttachments({ folder, save }, owner, files, { onProgress, extra } = {}) {
  const uploaded = [];
  try {
    for (const f of files) {
      const id = newAttachmentId();
      const name = attachmentFileName(f.name, f.contentType);
      const path = attachmentPath(folder, owner.id, id, name);
      await uploadFile(path, f.blob, f.contentType, name);
      uploaded.push({
        ...extra,
        id,
        name,
        path,
        contentType: f.contentType,
        size: f.blob.size,
        uploadedAt: new Date().toISOString(),
        uploadedBy: auth.currentUser?.uid || null,
        uploadedByName: signerName(),
      });
      onProgress?.(uploaded.length);
    }
    await save(owner.id, [...(owner.attachments || []), ...uploaded]);
  } catch (err) {
    await Promise.all(uploaded.map((a) => deleteFile(a.path).catch(() => {})));
    throw err;
  }
  return uploaded;
}

export async function removeAttachment({ save }, owner, attachment) {
  await deleteFile(attachment.path);
  return save(owner.id, (owner.attachments || []).filter((a) => a.id !== attachment.id));
}

// Borra los archivos de un documento que se va a eliminar. Va antes de
// eliminarlo: si Storage falla, el documento queda como estaba y no deja
// archivos sueltos.
export async function deleteAttachmentFiles(owner) {
  await Promise.all((owner?.attachments || []).map((a) => deleteFile(a.path)));
}
