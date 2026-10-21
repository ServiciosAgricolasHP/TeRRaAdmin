import { useMemo, useState } from "react";
import ConfirmDialog from "../../components/ConfirmDialog";
import RowMenu from "../../components/RowMenu";
import { useToast } from "../../contexts/ToastContext";
import {
  CONTACT_TYPES,
  PHONE_SOURCES,
  departmentOptions,
  displayName,
  emptyPhoneContact,
  filterPhoneContacts,
  groupByCompany,
} from "../../utils/phoneBook";
import { usePhoneBook } from "./usePhoneBook";
import PhoneContactRow from "./PhoneContactRow";
import PhoneContactModal from "./PhoneContactModal";
import PhoneBookImportModal from "./PhoneBookImportModal";
import { canShareContacts, shareContact, downloadContactVcard, downloadPhoneBookVcf } from "./phoneBookFiles";
import { writePhoneBookXlsx } from "./writePhoneBookXlsx";
import ScreenLoader from "../../components/ScreenLoader";

// Cuántos contactos se dibujan de una vez; "Mostrar más" suma otros tantos.
const PAGE = 200;
const BY_COMPANY_KEY = "infoAccounts.phoneBook.byCompany";

const selectCls = "min-h-8 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]";
const btnCls = "min-h-8 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)]";

// Pestaña "Agenda telefónica": buscar, filtrar, agrupar por empresa, editar e
// importar contactos.
export default function PhoneBookTab() {
  const toast = useToast();
  const { contacts, loading, loadError, save, remove, applyImported } = usePhoneBook();
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [department, setDepartment] = useState("");
  const [source, setSource] = useState("");
  const [byCompany, setByCompany] = useState(() => {
    try { return localStorage.getItem(BY_COMPANY_KEY) === "true"; } catch { return false; }
  });
  const [limit, setLimit] = useState(PAGE);
  // 📤 solo en un teléfono con menú de compartir.
  const [shareable] = useState(canShareContacts);
  const [editing, setEditing] = useState(null);
  const [importing, setImporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Cambiar la búsqueda o un filtro vuelve a la primera página.
  const onFilter = (setter) => (value) => {
    setter(value);
    setLimit(PAGE);
  };
  const toggleByCompany = () => {
    const next = !byCompany;
    setByCompany(next);
    try { localStorage.setItem(BY_COMPANY_KEY, String(next)); } catch { /* noop */ }
  };

  const filtered = useMemo(
    () => filterPhoneContacts(contacts, { search, type, department, source }),
    [contacts, search, type, department, source],
  );
  const visible = filtered.slice(0, limit);
  const groups = byCompany ? groupByCompany(visible) : null;
  const departments = useMemo(() => departmentOptions(contacts, { inUse: true }), [contacts]);
  const sources = useMemo(() => Object.keys(PHONE_SOURCES).filter((s) => contacts.some((c) => (c.sources || []).includes(s))), [contacts]);
  const filtering = !!(search.trim() || type || department || source);

  const copy = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copiado`);
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  const onSave = async (draft) => {
    await save(draft);
    setEditing(null);
    toast.success("Contacto guardado");
  };

  const doDelete = async () => {
    setDeleteBusy(true);
    try {
      await remove(confirmDelete);
      setConfirmDelete(null);
      toast.success("Contacto eliminado");
    } catch (err) {
      toast.error("No se pudo eliminar: " + (err.message || err));
    } finally {
      setDeleteBusy(false);
    }
  };

  const onImported = (res) => {
    applyImported(res.saved);
    setImporting(false);
    toast.success(`Agenda: ${res.created} ${res.created === 1 ? "nuevo" : "nuevos"} y ${res.updated} ${res.updated === 1 ? "actualizado" : "actualizados"}`);
  };

  const onShare = async (contact) => {
    try {
      const how = await shareContact(contact);
      if (how === "copied") toast.success("Contacto copiado");
      if (how === "fileBlocked") toast.warning("Este teléfono no deja compartir la tarjeta de contacto. Se copió el texto; vuelve a tocar 📤 para compartirlo.");
    } catch (err) {
      toast.error("No se pudo compartir: " + (err.message || err));
    }
  };

  const onDownload = (contact) => {
    downloadContactVcard(contact);
    toast.success("Contacto descargado (.vcf)");
  };

  // Las descargas llevan lo filtrado en pantalla.
  const exportXlsx = async () => {
    try {
      await writePhoneBookXlsx(filtered);
    } catch (err) {
      toast.error("No se pudo generar el Excel: " + (err.message || err));
    }
  };

  const rowProps = { onCopy: copy, onShare: shareable ? onShare : null, onDownload, onEdit: setEditing, onDelete: setConfirmDelete };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => onFilter(setSearch)(e.target.value)}
          placeholder="Buscar por nombre, empresa, cargo o número…"
          className="min-h-8 basis-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] sm:min-w-[260px] sm:flex-1 sm:basis-auto"
        />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setEditing(emptyPhoneContact())} className={btnCls}>+ Contacto</button>
          <button type="button" onClick={() => setImporting(true)} className={btnCls}>📥 Importar</button>
          <RowMenu
            trigger="⬇ Descargar"
            triggerLabel="Descargar la agenda"
            triggerClassName={btnCls}
            items={[
              { icon: "📊", label: "Excel", hint: filtered.length ? "En el formato de la planilla, para corregir y volver a importar" : "No hay contactos en la lista", disabled: !filtered.length, onClick: exportXlsx },
              { icon: "📇", label: "Contactos (.vcf)", hint: filtered.length ? "Para cargarlos en un teléfono o en el correo" : "No hay contactos en la lista", disabled: !filtered.length, onClick: () => downloadPhoneBookVcf(filtered) },
            ]}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Tipo de contacto" value={type} onChange={(e) => onFilter(setType)(e.target.value)} className={selectCls}>
          <option value="">Todos los tipos</option>
          {CONTACT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          <option value="none">Sin tipo</option>
        </select>
        <select aria-label="Departamento" value={department} onChange={(e) => onFilter(setDepartment)(e.target.value)} className={selectCls}>
          <option value="">Todos los departamentos</option>
          {departments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        {sources.length > 1 && (
          <select aria-label="Origen" value={source} onChange={(e) => onFilter(setSource)(e.target.value)} className={selectCls}>
            <option value="">Todos los orígenes</option>
            {sources.map((s) => <option key={s} value={s}>{PHONE_SOURCES[s]}</option>)}
          </select>
        )}
        <button
          type="button"
          onClick={toggleByCompany}
          aria-pressed={byCompany}
          className={`${btnCls} ${byCompany ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]" : ""}`}
        >
          🏢 Por empresa
        </button>
        <span className="ml-auto text-xs text-[var(--color-muted)]">
          {filtering ? `${filtered.length} de ${contacts.length}` : contacts.length} {contacts.length === 1 ? "contacto" : "contactos"}
        </span>
      </div>

      {loading ? (
        <ScreenLoader />
      ) : loadError ? (
        <div className="rounded-md border border-[var(--color-danger)] p-3 text-sm text-[var(--color-danger)]">No se pudo cargar la agenda: {loadError}</div>
      ) : contacts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--color-border)] px-4 py-12 text-center text-sm text-[var(--color-muted)]">
          La agenda está vacía. Importa la planilla o los contactos del correo con “📥 Importar”, o agrega uno con “+ Contacto”.
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--color-border)] py-8 text-center text-sm text-[var(--color-muted)]">
          Sin resultados para la búsqueda.
        </div>
      ) : groups ? (
        <div className="space-y-3">
          {groups.map((g) => (
            <section key={g.company || "_none"} className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
              <h3 className="flex items-baseline justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm font-semibold">
                <span className="break-words">{g.company || "Sin empresa"}</span>
                <span className="shrink-0 text-xs font-normal text-[var(--color-muted)]">{g.contacts.length}</span>
              </h3>
              <ul className="divide-y divide-[var(--color-border)]">
                {g.contacts.map((c) => <PhoneContactRow key={c.id} contact={c} hideCompany {...rowProps} />)}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <ul className="divide-y divide-[var(--color-border)] overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
          {visible.map((c) => <PhoneContactRow key={c.id} contact={c} {...rowProps} />)}
        </ul>
      )}

      {filtered.length > limit && (
        <div className="text-center">
          <button type="button" onClick={() => setLimit((n) => n + PAGE)} className={btnCls}>
            Mostrar más ({filtered.length - limit})
          </button>
        </div>
      )}

      {editing && (
        <PhoneContactModal initial={editing} contacts={contacts} onCancel={() => setEditing(null)} onSave={onSave} />
      )}
      {importing && (
        <PhoneBookImportModal contacts={contacts} onCancel={() => setImporting(false)} onImported={onImported} />
      )}
      <ConfirmDialog
        open={!!confirmDelete}
        title="Eliminar contacto"
        message={confirmDelete ? `¿Eliminar "${displayName(confirmDelete)}" de la agenda? Esta acción no se puede deshacer.` : ""}
        confirmLabel="Eliminar"
        danger
        busy={deleteBusy}
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
