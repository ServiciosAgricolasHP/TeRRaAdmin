import { useEffect, useState } from "react";
import { listPhoneContacts, phoneContactsService } from "../../services/phoneContactsService";
import { cleanIncoming, phoneContactFields, fixNameCase } from "../../utils/phoneBook";
import { attempt } from "../../utils/attempt";

// La agenda telefónica cargada, con sus altas, ediciones y borrados. Las
// escrituras actualizan la lista en pantalla y la copia del navegador sin
// releer la agenda.
export function usePhoneBook() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    listPhoneContacts()
      .then((list) => { if (!cancelled) setContacts(list); })
      .catch((err) => { if (!cancelled) setLoadError(err.message || String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Vuelve a leer la agenda entera, sin la copia del navegador.
  const reload = async () => {
    phoneContactsService.invalidate();
    setLoading(true);
    const { value, error: err } = await attempt(() => listPhoneContacts());
    if (err) setLoadError(err.message || String(err));
    else {
      setContacts(value);
      setLoadError("");
    }
    setLoading(false);
  };

  // Guarda lo que se editó a mano: los números normalizados, los correos en
  // minúsculas y el nombre corregido como en la importación. Un contacto
  // nuevo queda con origen "A mano"; uno existente conserva sus orígenes.
  const save = async (draft) => {
    const clean = cleanIncoming({ ...draft, source: "manual" });
    const payload = phoneContactFields({
      ...clean,
      otherNames: (draft.otherNames || []).map(fixNameCase).filter(Boolean),
      sources: draft.id ? draft.sources || [] : ["manual"],
    });
    const saved = draft.id
      ? await phoneContactsService.update(draft.id, payload, { additive: true })
      : await phoneContactsService.create(payload, { additive: true });
    setContacts((prev) => [...prev.filter((c) => c.id !== saved.id), saved]);
    return saved;
  };

  const remove = async (contact) => {
    await phoneContactsService.remove(contact.id, { additive: true });
    setContacts((prev) => prev.filter((c) => c.id !== contact.id));
  };

  // Suma a la lista lo que escribió una importación.
  const applyImported = (saved) => {
    const byId = new Map(saved.map((c) => [c.id, c]));
    setContacts((prev) => [...prev.filter((c) => !byId.has(c.id)), ...saved]);
  };

  return { contacts, loading, loadError, reload, save, remove, applyImported };
}
