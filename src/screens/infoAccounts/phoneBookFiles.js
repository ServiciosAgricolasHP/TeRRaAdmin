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

// El teléfono no dejó compartir la tarjeta .vcf: no se vuelve a intentar.
const VCARD_BLOCKED_KEY = "infoAccounts.vcardShareBlocked";

const vcardShareBlocked = () => {
  try { return localStorage.getItem(VCARD_BLOCKED_KEY) === "1"; } catch { return false; }
};
const markVcardShareBlocked = () => {
  try { localStorage.setItem(VCARD_BLOCKED_KEY, "1"); } catch { /* noop */ }
};

const isTouchDevice = () => !!window.matchMedia?.("(pointer: coarse)").matches;

// Si hay menú de compartir del teléfono. En un computador 📤 no se muestra:
// copiar el contacto ya es tocar su nombre.
export const canShareContacts = () => typeof navigator !== "undefined" && !!navigator.share && isTouchDevice();

// Comparte un contacto. Devuelve cómo lo hizo:
// - "copied": sin menú de compartir, copia el texto (la pantalla solo muestra
//   📤 cuando lo hay, ver `canShareContacts`).
// - "file": en el teléfono, la tarjeta .vcf por el menú de compartir, y
//   WhatsApp la muestra como contacto. Funciona en iPhone.
// - "fileBlocked": el teléfono dice que acepta la tarjeta pero la rechaza al
//   compartir (Chrome en Android responde "Permission denied"). Ese intento
//   gasta el toque, así que el menú no se puede volver a abrir con el texto:
//   se copia el texto y el equipo queda marcado para no intentarlo más.
// - "text": el texto por el menú de compartir.
// - "cancelled": se cerró el menú sin elegir nada.
export async function shareContact(contact) {
  const title = displayName(contact);
  const text = phoneContactText(contact);
  const copy = () => navigator.clipboard.writeText(text);
  if (!isTouchDevice() || !navigator.share) {
    await copy();
    return "copied";
  }
  const file = vcardFile(contact);
  if (!vcardShareBlocked() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return "file";
    } catch (err) {
      if (err?.name === "AbortError") return "cancelled";
      markVcardShareBlocked();
      await copy();
      return "fileBlocked";
    }
  }
  try {
    await navigator.share({ title, text });
    return "text";
  } catch (err) {
    if (err?.name === "AbortError") return "cancelled";
    await copy();
    return "copied";
  }
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
