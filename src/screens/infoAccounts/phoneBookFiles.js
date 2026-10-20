import { buildVcards } from "../../utils/vcard";
import { displayName, phoneContactText } from "../../utils/phoneBook";
import { localIsoDate } from "../../utils/dates";

// Compartir y descargar contactos de la agenda como tarjeta de contacto
// (.vcf) o como texto.

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const safeFileName = (name) => name.replace(/[\\/:*?"<>|]+/g, "").trim().replace(/\s+/g, "_") || "contacto";

const vcardFile = (contact) =>
  new File([buildVcards([contact])], `${safeFileName(displayName(contact))}.vcf`, { type: "text/vcard" });

// Comparte un contacto con el menú del teléfono (WhatsApp, correo…). Si el
// navegador deja compartir archivos de contacto (iPhone, sí; Chrome en
// Android, no), va la tarjeta .vcf y WhatsApp la muestra como contacto; si
// no, va el texto. Sin menú de compartir (un computador sin él), se copia el
// texto. Devuelve "file", "text", "copied" o "cancelled".
export async function shareContact(contact) {
  const text = phoneContactText(contact);
  const file = vcardFile(contact);
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: displayName(contact) });
      return "file";
    }
    if (navigator.share) {
      await navigator.share({ title: displayName(contact), text });
      return "text";
    }
  } catch (err) {
    if (err?.name === "AbortError") return "cancelled";
    throw err;
  }
  await navigator.clipboard.writeText(text);
  return "copied";
}

// La tarjeta .vcf de un contacto. En el teléfono, abrirla lo guarda en los
// contactos, y desde ahí se comparte por WhatsApp como contacto.
export function downloadContactVcard(contact) {
  const file = vcardFile(contact);
  downloadBlob(file, file.name);
}

// Los contactos (los filtrados en pantalla) en un solo .vcf, para cargarlos
// en un teléfono o en el correo.
export function downloadPhoneBookVcf(contacts) {
  const blob = new Blob([buildVcards(contacts)], { type: "text/vcard" });
  downloadBlob(blob, `Agenda_telefonica_${localIsoDate()}.vcf`);
}
