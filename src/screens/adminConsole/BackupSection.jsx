import { KEEP_BACKUPS } from "../../services/backupsService";
import { fmtBytes, fmtNumber } from "../../utils/format";
import { ConsoleCard } from "./ConsoleCard";
import { useBackups } from "./useBackups";

// ============================================================
// Respaldos en JSON
// ============================================================
// Todas las colecciones menos la auditoría, en un archivo JSON en Cloud
// Storage (functions/backup.js). La lista se lee recién al abrir la tarjeta.
export function BackupSection() {
  return (
    <ConsoleCard
      id="respaldos"
      title="💾 Respaldos en JSON"
      description={`Todas las colecciones menos la auditoría. Se genera solo los domingos a las 3:00 y se guardan los últimos ${KEEP_BACKUPS}.`}
    >
      <BackupPanel />
    </ConsoleCard>
  );
}

const dateTime = (iso) => new Date(iso).toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" });

// La carpeta de los respaldos en la consola de Google Cloud.
const cloudFolderUrl = (bucket) =>
  `https://console.cloud.google.com/storage/browser/${bucket}/backups?project=${import.meta.env.VITE_FIREBASE_PROJECT_ID}`;

function BackupPanel() {
  const { backups, loadError, running, progress, outcome, linkBusy, generate, download } = useBackups();
  const bucket = backups?.[0]?.bucket;

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--color-muted)]">
        Cada respaldo es un archivo en Cloud Storage con el contenido de la base. <b>⬇ Bajar</b> pide un enlace que vence
        en 15 minutos. Firestore guarda además su respaldo nativo diario de los últimos 7 días.
      </p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={generate}
          disabled={running}
          className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
        >
          {running ? "Respaldando..." : "💾 Generar respaldo ahora"}
        </button>
        {bucket ? (
          <a href={cloudFolderUrl(bucket)} target="_blank" rel="noreferrer" className="text-xs text-[var(--color-accent)] hover:underline">
            Abrir la carpeta en Google Cloud ↗
          </a>
        ) : null}
      </div>

      {running ? (
        <p className="text-xs text-[var(--color-muted)]">
          {progress
            ? `${progress.step} de ${progress.total} colecciones · ${fmtNumber(progress.docs)} documentos (última: ${progress.collection})`
            : "Esperando al backend..."}
        </p>
      ) : null}

      {outcome ? (
        <div
          className={`rounded-md border p-3 text-xs ${
            outcome.ok
              ? "border-[var(--color-success)] bg-[var(--color-success-soft)] text-[var(--color-success)]"
              : "border-[var(--color-danger)] bg-[var(--color-danger-soft)] text-[var(--color-danger)]"
          }`}
        >
          {outcome.ok
            ? `✓ Respaldo listo: ${fmtNumber(outcome.result?.totalDocs)} documentos de ${outcome.result?.collectionCount} colecciones, ${fmtBytes(outcome.result?.bytes)} comprimido.`
            : `✗ ${outcome.message}`}
        </div>
      ) : null}

      {loadError ? (
        <p className="text-xs text-[var(--color-danger)]">No se pudo leer la lista de respaldos: {loadError}</p>
      ) : backups === null ? (
        <p className="text-xs text-[var(--color-muted)]">Cargando respaldos...</p>
      ) : backups.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)]">Todavía no hay respaldos.</p>
      ) : (
        <ul className="divide-y divide-[var(--color-border)] rounded-md border border-[var(--color-border)]">
          {backups.map((b) => (
            <BackupRow
              key={b.id}
              backup={b}
              busy={linkBusy === b.id}
              disabled={Boolean(linkBusy)}
              onDownload={() => download(b.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function BackupRow({ backup, busy, disabled, onDownload }) {
  const origin =
    backup.trigger === "scheduled" ? "Automático" : `Manual${backup.requestedByEmail ? ` · ${backup.requestedByEmail}` : ""}`;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{dateTime(backup.createdAt)}</div>
        <div className="break-words text-xs text-[var(--color-muted)]">
          {origin} · {fmtNumber(backup.totalDocs)} documentos · {fmtBytes(backup.bytes)}
        </div>
      </div>
      <button
        type="button"
        onClick={onDownload}
        disabled={disabled}
        className="min-h-[32px] rounded-md border border-[var(--color-border)] px-3 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
      >
        {busy ? "Pidiendo enlace..." : "⬇ Bajar"}
      </button>
    </li>
  );
}
