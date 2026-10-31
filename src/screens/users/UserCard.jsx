import { useState } from "react";
import { entityLabelEs } from "../../utils/auditLabels";
import {
  birthdayLabel,
  isAdminRole,
  lastSeenLabel,
  passwordResetBlock,
  roleChangeBlock,
  roleLabel,
  suspendBlock,
} from "../../utils/userAccounts";
import { attempt } from "../../utils/attempt";

const dateOf = (ts) => (ts?.toDate ? ts.toDate() : null);

const ACTION_VERB = { create: "creó", update: "editó", delete: "eliminó", import: "importó" };
const dateTimeOf = (date) =>
  date.toLocaleString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

function Badge({ children, tone = "neutral" }) {
  const tones = {
    neutral: "bg-[var(--color-surface-2)] text-[var(--color-muted)]",
    accent: "bg-[var(--color-accent-soft)] text-[var(--color-accent)]",
    danger: "bg-[var(--color-danger-soft)] text-[var(--color-danger)]",
  };
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${tones[tone]}`}>{children}</span>;
}

function ActionButton({ children, onClick, disabled = false, danger = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-h-[32px] rounded-md border px-2.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
        danger
          ? "border-[var(--color-danger)] text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]"
          : "border-[var(--color-border)] hover:bg-[var(--color-accent-soft)]"
      }`}
    >
      {children}
    </button>
  );
}

// `lastChange`: `{ loading, log }` con el último registro de auditoría de la
// cuenta (`log` null si no tiene), o undefined si no se pudo leer.
export function UserCard({ profile, myUid, lastChange, onAction, onGreetings, onBirthday }) {
  const [copied, setCopied] = useState(false);
  const isMe = profile.id === myUid;
  const admin = isAdminRole(profile.role);
  const suspended = profile.disabled === true;
  const roleBlock = roleChangeBlock(profile, myUid);
  const suspendBlockReason = suspendBlock(profile, myUid);
  const resetBlock = passwordResetBlock(profile);
  const reasons = isMe ? [resetBlock] : [roleBlock, suspendBlockReason, resetBlock];

  const copyUid = async () => {
    await attempt(async () => {
      await navigator.clipboard.writeText(profile.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div
      className={`rounded-lg border bg-[var(--color-surface)] p-3 ${
        suspended ? "border-dashed border-[var(--color-danger)]" : "border-[var(--color-border)]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">
            {profile.alias || profile.email || "Sin correo todavía"}
          </div>
          {profile.alias && profile.email ? (
            <div className="truncate text-xs text-[var(--color-muted)]">{profile.email}</div>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          {isMe && <Badge>Tú</Badge>}
          <Badge tone={admin ? "accent" : "neutral"}>{roleLabel(profile.role)}</Badge>
          {suspended && <Badge tone="danger">Suspendida</Badge>}
        </div>
      </div>

      <button
        type="button"
        onClick={copyUid}
        title="Copiar UID"
        className="inline-flex min-h-[32px] max-w-full items-center gap-1 break-all text-left font-mono text-[10px] text-[var(--color-muted)] hover:text-[var(--color-accent)]"
      >
        {profile.id}
        <span aria-hidden="true">{copied ? "✓" : "📋"}</span>
      </button>
      <div className="text-xs text-[var(--color-muted)]">
        {/* La cuenta propia está en la app ahora; su visita recién grabada puede
            venir todavía sin la hora del servidor. */}
        Visto por última vez: {isMe ? "ahora" : lastSeenLabel(dateOf(profile.lastSeenAt))}
      </div>
      {lastChange && <LastChangeLine {...lastChange} />}
      {birthdayLabel(profile.birthday) && (
        <div className="text-xs text-[var(--color-muted)]">Cumpleaños: {birthdayLabel(profile.birthday)}</div>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {!isMe && (
          <>
            <ActionButton onClick={() => onAction("role")} disabled={!!roleBlock}>
              {admin ? "Quitar admin" : "Hacer admin"}
            </ActionButton>
            <ActionButton onClick={() => onAction("suspend")} disabled={!!suspendBlockReason} danger={!suspended}>
              {suspended ? "Reactivar" : "Suspender"}
            </ActionButton>
          </>
        )}
        <ActionButton onClick={() => onAction("reset")} disabled={!!resetBlock}>
          Contraseña
        </ActionButton>
        <ActionButton onClick={onGreetings}>Saludos</ActionButton>
        <ActionButton onClick={onBirthday}>Cumpleaños</ActionButton>
      </div>

      {reasons.filter(Boolean).map((r) => (
        <p key={r} className="mt-2 text-[11px] text-[var(--color-muted)]">
          {r}
        </p>
      ))}
    </div>
  );
}

// "Último cambio: hace 3 h · Jornada", con la acción y la hora exacta al pasar
// el mouse.
function LastChangeLine({ loading, log }) {
  const when = log ? dateOf(log.timestamp) : null;
  const title = log && when ? `${ACTION_VERB[log.action] || log.action} ${entityLabelEs(log.entity)} el ${dateTimeOf(when)}` : undefined;
  return (
    <div className="text-xs text-[var(--color-muted)]" title={title}>
      Último cambio:{" "}
      {loading ? "…" : log ? `${when ? lastSeenLabel(when) : "recién"} · ${entityLabelEs(log.entity)}` : "Sin registro"}
    </div>
  );
}
