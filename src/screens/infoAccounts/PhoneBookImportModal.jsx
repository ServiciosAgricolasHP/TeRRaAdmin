import { useMemo, useState } from "react";
import Modal, { ModalCloseButton } from "../../components/Modal";
import { useToast } from "../../contexts/ToastContext";
import { importPhoneContacts } from "../../services/phoneContactsService";
import { displayName, formatPhone, planPhoneBookImport } from "../../utils/phoneBook";
import { readPhoneBookFile } from "./readPhoneBookFile";

const SOURCE_LABELS = { sheet: "Planilla de la agenda", google: "Contactos de Google", outlook: "Contactos de Outlook", vcard: "Archivo vCard" };

// Importa a la agenda la planilla de las secretarias (.xlsx), contactos de
// Google u Outlook (.csv) y archivos vCard (.vcf), uno o varios a la vez. Lo
// que comparte un número queda como un solo contacto. Muestra qué se crea, qué
// se actualiza y qué copias se juntan antes de escribir nada.
export default function PhoneBookImportModal({ contacts, onCancel, onImported }) {
  const toast = useToast();
  const [files, setFiles] = useState([]); // { name, source, detail, rows, error }
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);

  const pick = async (fileList) => {
    const picked = [...(fileList || [])];
    if (!picked.length) return;
    setReading(true);
    const read = await Promise.all(picked.map(async (f) => {
      try {
        const { source, rows, detail } = await readPhoneBookFile(f);
        return { name: f.name, source, rows, detail, error: "" };
      } catch (err) {
        return { name: f.name, source: null, rows: [], detail: "", error: err.message || String(err) };
      }
    }));
    setFiles(read);
    setReading(false);
  };

  const plan = useMemo(
    () => (files.length ? planPhoneBookImport(contacts, files.flatMap((f) => f.rows)) : null),
    [contacts, files],
  );
  const writes = plan ? plan.create.length + plan.update.length : 0;

  const confirm = async () => {
    setBusy(true);
    try {
      const res = await importPhoneContacts(plan, { files: files.filter((f) => !f.error).map((f) => f.name) });
      onImported(res);
    } catch (err) {
      toast.error("Error al importar: " + (err.message || err));
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      size="xl"
      onClose={onCancel}
      title="Importar a la agenda"
      footer={
        <>
          <ModalCloseButton className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm">Cancelar</ModalCloseButton>
          <button
            type="button"
            onClick={confirm}
            disabled={busy || reading || !writes}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
          >
            {busy ? "Importando…" : `Importar ${writes}`}
          </button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="rounded-md border border-dashed border-[var(--color-border)] p-3">
          <p className="mb-2 text-[var(--color-muted)]">
            La planilla de la agenda (.xlsx), los contactos exportados de Google u Outlook (.csv) o un archivo de
            contactos del teléfono (.vcf). Se pueden elegir varios a la vez. Un mismo número queda como un solo contacto.
          </p>
          <input
            type="file"
            multiple
            accept=".xlsx,.csv,.vcf,.vcard"
            aria-label="Archivos para importar"
            onChange={(e) => pick(e.target.files)}
            className="block w-full text-xs file:mr-3 file:rounded-md file:border file:border-[var(--color-border)] file:bg-[var(--color-surface-2)] file:px-3 file:py-1.5"
          />
        </div>

        {reading && <p className="text-[var(--color-muted)]">Leyendo…</p>}

        {!reading && files.length > 0 && (
          <ul className="space-y-1">
            {files.map((f) => (
              <li key={f.name} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium break-all">{f.name}</span>
                {f.error ? (
                  <span className="text-[var(--color-danger)]">{f.error}</span>
                ) : (
                  <span className="text-[var(--color-muted)]">
                    {SOURCE_LABELS[f.source]}{f.detail ? `, ${f.detail}` : ""} · {f.rows.length} {f.rows.length === 1 ? "fila" : "filas"}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        {!reading && plan && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Nuevos" value={plan.create.length} accent />
              <Stat label="Se actualizan" value={plan.update.length} />
              <Stat label="Sin cambios" value={plan.unchanged} />
              <Stat label="Sin teléfono ni correo" value={plan.skipped.length} />
            </div>

            {plan.warnings.length > 0 && (
              <div className="rounded-md border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-2 text-xs">
                {plan.warnings.map((w, i) => (
                  <p key={i}>
                    Un número une a {w.names.join(" y ")}, que ya están en la agenda. No se juntan: lo importado va a {w.kept}, sin los números de los otros.
                  </p>
                ))}
              </div>
            )}

            {plan.mergedGroups.length > 0 && (
              <Details title={`Copias que se juntan (${plan.mergedGroups.length})`} hint="Filas que comparten un número y quedan como un solo contacto.">
                {plan.mergedGroups.map((g, i) => (
                  <li key={i} className="py-1">
                    <span className="font-medium">{displayName(g.contact)}</span>
                    <span className="text-[var(--color-muted)]">
                      {" "}← {g.rows.map((r) => r.name || "(sin nombre)").join(", ")} · {g.contact.phones.map((p) => formatPhone(p.number)).join(", ")}
                    </span>
                  </li>
                ))}
              </Details>
            )}

            {plan.update.length > 0 && (
              <Details title={`Se actualizan (${plan.update.length})`} hint="Contactos que ya estaban en la agenda.">
                {plan.update.map((u) => (
                  <li key={u.id} className="py-1">
                    <span className="font-medium">{displayName(u.contact)}</span>
                    <span className="text-[var(--color-muted)]"> · {describeChanges(u.changes)}</span>
                  </li>
                ))}
              </Details>
            )}

            {plan.create.length > 0 && (
              <Details title={`Nuevos (${plan.create.length})`}>
                {plan.create.slice(0, 300).map((c, i) => (
                  <li key={i} className="py-0.5">
                    {displayName(c.contact)}
                    <span className="text-[var(--color-muted)]">
                      {c.contact.company && c.contact.name ? ` · ${c.contact.company}` : ""}
                      {c.contact.phones[0] ? ` · ${formatPhone(c.contact.phones[0].number)}` : ""}
                    </span>
                  </li>
                ))}
                {plan.create.length > 300 && <li className="py-0.5 text-[var(--color-muted)]">… y {plan.create.length - 300} más</li>}
              </Details>
            )}

            {plan.skipped.length > 0 && (
              <Details title={`No se importan (${plan.skipped.length})`} hint="Filas sin teléfono ni correo.">
                {plan.skipped.map((s, i) => (
                  <li key={i} className="py-0.5">
                    {s.row.name || s.row.company || "(fila vacía)"}
                    <span className="text-[var(--color-muted)]"> · {s.row.file}{s.row.line ? `, fila ${s.row.line}` : ""}</span>
                  </li>
                ))}
              </Details>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

function describeChanges(ch) {
  const parts = [];
  if (ch.addedPhones.length) parts.push(`+${ch.addedPhones.length} ${ch.addedPhones.length === 1 ? "número" : "números"}`);
  if (ch.addedEmails.length) parts.push(`+${ch.addedEmails.length} ${ch.addedEmails.length === 1 ? "correo" : "correos"}`);
  if (ch.addedNames.length) parts.push(`también: ${ch.addedNames.join(", ")}`);
  if (ch.fields.length) parts.push(`cambia ${ch.fields.join(", ")}`);
  return parts.join(" · ");
}

function Stat({ label, value, accent = false }) {
  return (
    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2">
      <div className="text-[11px] text-[var(--color-muted)]">{label}</div>
      <div className={`text-lg font-semibold ${accent ? "text-[var(--color-accent)]" : ""}`}>{value}</div>
    </div>
  );
}

function Details({ title, hint, children }) {
  return (
    <details className="rounded-md border border-[var(--color-border)]">
      <summary className="cursor-pointer select-none px-3 py-2 font-medium">{title}</summary>
      {hint && <p className="px-3 text-xs text-[var(--color-muted)]">{hint}</p>}
      <ul className="max-h-64 overflow-y-auto px-3 pb-2 text-xs">{children}</ul>
    </details>
  );
}
