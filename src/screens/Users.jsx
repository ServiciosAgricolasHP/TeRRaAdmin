import { useEffect, useMemo, useState } from "react";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import { usersService } from "../services";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { GREETING_FIELDS } from "../utils/greetings";
import {
  isAdminRole,
  lastSeenLabel,
  passwordResetBlock,
  roleChangeBlock,
  roleLabel,
  sortProfiles,
  suspendBlock,
} from "../utils/userAccounts";

const nameOf = (p) => p.alias || p.email || p.id;
const dateOf = (ts) => (ts?.toDate ? ts.toDate() : null);

const errorMessage = (err) =>
  err?.code === "permission-denied"
    ? "Las reglas de Firestore no permiten este cambio. Revisa que firestore.rules esté publicado."
    : err?.message || String(err);

// Título, botón y texto del diálogo que confirma cada acción.
function confirmCopy({ kind, profile }) {
  const who = nameOf(profile);
  if (kind === "role") {
    return isAdminRole(profile.role)
      ? {
          title: "Quitar admin",
          label: "Quitar admin",
          danger: true,
          message: `${who} sigue entrando a TeRRa, pero sin las pantallas de admin.`,
        }
      : {
          title: "Hacer admin",
          label: "Hacer admin",
          danger: false,
          message: `${who} va a ver las pantallas de admin, incluida esta, y podrá cambiar el rol de otras cuentas.`,
        };
  }
  if (kind === "suspend") {
    return profile.disabled === true
      ? {
          title: "Reactivar cuenta",
          label: "Reactivar",
          danger: false,
          message: `${who} vuelve a entrar a TeRRa.`,
        }
      : {
          title: "Suspender cuenta",
          label: "Suspender",
          danger: true,
          message: `${who} deja de ver los datos de TeRRa de inmediato y, al entrar, ve un aviso. Puedes reactivarla cuando quieras.`,
        };
  }
  return {
    title: "Restablecer contraseña",
    label: "Enviar correo",
    danger: false,
    message: `Firebase le envía a ${profile.email} un correo para elegir una contraseña nueva.`,
  };
}

export default function Users() {
  const { user, sendPasswordReset } = useAuth();
  const toast = useToast();
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  // { kind: "role" | "suspend" | "reset", profile }
  const [action, setAction] = useState(null);
  const [busy, setBusy] = useState(false);
  const [greetingsOf, setGreetingsOf] = useState(null);

  useEffect(() => {
    let cancelled = false;
    usersService
      .list()
      .then((list) => {
        if (cancelled) return;
        setProfiles(list);
        setError("");
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const reload = () => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  };

  const sorted = useMemo(() => sortProfiles(profiles, user?.uid), [profiles, user?.uid]);

  const patch = (id, changes) =>
    setProfiles((list) => list.map((p) => (p.id === id ? { ...p, ...changes } : p)));

  const runAction = async () => {
    if (!action) return;
    const { kind, profile } = action;
    setBusy(true);
    try {
      if (kind === "reset") {
        await sendPasswordReset(profile.email);
        toast.success(`Correo enviado a ${profile.email}`);
      } else if (kind === "role") {
        const role = isAdminRole(profile.role) ? "user" : "admin";
        await usersService.update(profile.id, { role });
        patch(profile.id, { role });
        toast.success(`${nameOf(profile)} ahora es ${roleLabel(role).toLowerCase()}`);
      } else {
        const disabled = profile.disabled !== true;
        await usersService.update(profile.id, { disabled });
        patch(profile.id, { disabled });
        toast.success(`${nameOf(profile)}: cuenta ${disabled ? "suspendida" : "reactivada"}`);
      }
      setAction(null);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const copy = action ? confirmCopy(action) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Usuarios</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Cuentas con acceso a TeRRa: rol, suspensión, contraseña y saludos.
          </p>
        </div>
        <button
          type="button"
          onClick={reload}
          disabled={loading}
          className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
        >
          {loading ? "Cargando…" : "↻ Recargar"}
        </button>
      </div>

      <NewAccountHelp />

      {error ? (
        <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>
      ) : null}

      {loading && profiles.length === 0 ? (
        <div className="py-10 text-center text-sm text-[var(--color-muted)]">Cargando…</div>
      ) : sorted.length === 0 ? (
        error ? null : (
          <div className="rounded-lg border border-dashed border-[var(--color-border)] py-12 text-center text-sm text-[var(--color-muted)]">
            No hay perfiles en <code>users</code>.
          </div>
        )
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {sorted.map((p) => (
            <UserCard
              key={p.id}
              profile={p}
              myUid={user?.uid}
              onAction={(kind) => setAction({ kind, profile: p })}
              onGreetings={() => setGreetingsOf(p)}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!action}
        title={copy?.title}
        message={copy?.message}
        confirmLabel={copy?.label}
        danger={copy?.danger}
        busy={busy}
        onConfirm={runAction}
        onCancel={() => {
          if (!busy) setAction(null);
        }}
      />

      {greetingsOf && (
        <GreetingsModal
          profile={greetingsOf}
          onClose={() => setGreetingsOf(null)}
          onSaved={(greetings) => {
            patch(greetingsOf.id, { greetings });
            setGreetingsOf(null);
          }}
        />
      )}
    </div>
  );
}

function NewAccountHelp() {
  return (
    <details className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm">
      <summary className="min-h-[32px] cursor-pointer select-none py-1 font-medium">
        ¿Cómo dar acceso a alguien nuevo?
      </summary>
      <ol className="mt-2 list-decimal space-y-1.5 pb-1 pl-5 text-xs text-[var(--color-muted)]">
        <li>
          En la consola de Firebase, <strong>Authentication → Agregar usuario</strong>, con su correo y una
          contraseña temporal.
        </li>
        <li>
          En <strong>Firestore</strong>, base <code>hpdatabase</code>, colección <code>users</code>: agrega un
          documento cuyo ID sea el <strong>UID</strong> de la cuenta, con los campos <code>role</code> ={" "}
          <code>user</code> y <code>email</code> = su correo.
        </li>
        <li>
          Acá, con <strong>Contraseña</strong>, le llega un correo para elegir la suya.
        </li>
      </ol>
    </details>
  );
}

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

function UserCard({ profile, myUid, onAction, onGreetings }) {
  const [copied, setCopied] = useState(false);
  const isMe = profile.id === myUid;
  const admin = isAdminRole(profile.role);
  const suspended = profile.disabled === true;
  const roleBlock = roleChangeBlock(profile, myUid);
  const suspendBlockReason = suspendBlock(profile, myUid);
  const resetBlock = passwordResetBlock(profile);
  const reasons = isMe ? [resetBlock] : [roleBlock, suspendBlockReason, resetBlock];

  const copyUid = async () => {
    try {
      await navigator.clipboard.writeText(profile.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
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
        Último ingreso: {lastSeenLabel(dateOf(profile.lastSeenAt))}
      </div>

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
      </div>

      {reasons.filter(Boolean).map((r) => (
        <p key={r} className="mt-2 text-[11px] text-[var(--color-muted)]">
          {r}
        </p>
      ))}
    </div>
  );
}

function GreetingsModal({ profile, onClose, onSaved }) {
  const toast = useToast();
  const [drafts, setDrafts] = useState(() => ({ ...(profile.greetings || {}) }));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const greetings = {};
      for (const f of GREETING_FIELDS) {
        const text = String(drafts[f.slot] || "").trim();
        if (text) greetings[f.slot] = text;
      }
      await usersService.update(profile.id, { greetings });
      toast.success("Saludos guardados");
      onSaved(greetings);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Saludos · ${nameOf(profile)}`}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
          >
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </>
      }
    >
      <p className="text-xs text-[var(--color-muted)]">
        Los ve solo esta persona, en el lugar que indica cada campo. Vacío = sin saludo.
      </p>
      {GREETING_FIELDS.map((f) => (
        <label key={f.slot} className="mt-3 block">
          <span className="block text-xs font-medium">{f.label}</span>
          <span className="block text-[11px] text-[var(--color-muted)]">{f.note}</span>
          <input
            type="text"
            value={drafts[f.slot] || ""}
            onChange={(e) => setDrafts((d) => ({ ...d, [f.slot]: e.target.value }))}
            placeholder="(sin saludo)"
            className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
          />
        </label>
      ))}
    </Modal>
  );
}
