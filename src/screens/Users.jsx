import { useEffect, useMemo, useState } from "react";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import { usersService } from "../services";
import { enqueueJob, waitForJob } from "../services/functionJobsService";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { GREETING_FIELDS } from "../utils/greetings";
import {
  ROLE_OPTIONS,
  isAdminRole,
  lastSeenLabel,
  parseNewAccount,
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
  const [creating, setCreating] = useState(false);

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
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={reload}
            disabled={loading}
            className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
          >
            {loading ? "Cargando…" : "↻ Recargar"}
          </button>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="min-h-[32px] rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]"
          >
            + Nueva cuenta
          </button>
        </div>
      </div>

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

      {creating && (
        <NewAccountModal
          onClose={() => setCreating(false)}
          onCreated={(created) => {
            setProfiles((list) => [...list.filter((p) => p.id !== created.id), created]);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}

// Crea la cuenta con el job `createUser` y, si se pidió, envía el correo para
// elegir contraseña. Un correo que ya tiene cuenta pasa por una confirmación.
function NewAccountModal({ onClose, onCreated }) {
  const { user, sendPasswordReset } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ email: "", alias: "", role: "user", sendReset: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [existingEmail, setExistingEmail] = useState(null);

  const edit = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
    setError("");
    setExistingEmail(null);
  };

  const submit = async (useExisting = false) => {
    const parsed = parseNewAccount(form);
    if (parsed.error) {
      setError(parsed.error);
      return;
    }
    const { email } = parsed.value;
    setBusy(true);
    setError("");
    try {
      const ref = await enqueueJob("createUser", { ...parsed.value, ...(useExisting ? { useExisting: true } : {}) }, user);
      const outcome = await waitForJob(ref);

      if (outcome.status === "done") {
        let resetSent = false;
        if (form.sendReset) {
          try {
            await sendPasswordReset(email);
            resetSent = true;
          } catch {
            toast.warning(`No se pudo enviar el correo a ${email}. Puedes enviarlo con "Contraseña".`);
          }
        }
        const what = outcome.result?.existingAccount ? `${email} ya tiene acceso a TeRRa` : `Cuenta creada para ${email}`;
        toast.success(resetSent ? `${what}. Le llegó un correo para elegir su contraseña.` : `${what}.`);
        onCreated({ id: outcome.result?.uid, ...parsed.value });
        return;
      }
      if (outcome.errorCode === "account-exists") {
        setExistingEmail(email);
        return;
      }
      setError(
        outcome.status === "timeout"
          ? "El backend no respondió a los 45 s. Revisa que las Functions estén desplegadas."
          : outcome.error || "No se pudo crear la cuenta.",
      );
    } catch (err) {
      setError(
        err?.code === "permission-denied"
          ? "Las reglas de Firestore no dejan crear el job: solo un admin puede crear cuentas."
          : err?.message || String(err),
      );
    } finally {
      setBusy(false);
    }
  };

  const confirmButton = existingEmail ? (
    <button
      type="button"
      onClick={() => submit(true)}
      disabled={busy}
      className="rounded-md bg-[var(--color-danger)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
    >
      {busy ? "Dando acceso…" : "Darle acceso"}
    </button>
  ) : (
    <button
      type="button"
      onClick={() => submit(false)}
      disabled={busy}
      className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
    >
      {busy ? "Creando…" : "Crear cuenta"}
    </button>
  );

  return (
    <Modal
      open
      onClose={busy ? undefined : onClose}
      title="Nueva cuenta"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm disabled:opacity-60"
          >
            Cancelar
          </button>
          {confirmButton}
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <label className="block">
          <span className="mb-1 block text-xs text-[var(--color-muted)]">Correo</span>
          <input
            type="email"
            value={form.email}
            onChange={(e) => edit("email", e.target.value)}
            disabled={busy}
            autoFocus
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-[var(--color-muted)]">Alias (opcional)</span>
          <input
            type="text"
            value={form.alias}
            onChange={(e) => edit("alias", e.target.value)}
            disabled={busy}
            maxLength={40}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
          />
          <span className="mt-1 block text-[11px] text-[var(--color-muted)]">
            El nombre con que firma lo que carga a mano. La persona lo puede cambiar en Mi perfil.
          </span>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-[var(--color-muted)]">Rol</span>
          <select
            value={form.role}
            onChange={(e) => edit("role", e.target.value)}
            disabled={busy}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm"
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value} className="bg-[var(--color-surface)] text-[var(--color-text)]">
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-[32px] items-start gap-2">
          <input
            type="checkbox"
            checked={form.sendReset}
            onChange={(e) => setForm((f) => ({ ...f, sendReset: e.target.checked }))}
            disabled={busy}
            className="mt-0.5"
          />
          <span>
            Enviarle el correo para elegir su contraseña
            <span className="block text-[11px] text-[var(--color-muted)]">
              La cuenta se crea con una contraseña al azar que nadie conoce.
            </span>
          </span>
        </label>

        {existingEmail && (
          <div className="rounded-md border border-[var(--color-danger)] bg-[var(--color-danger-soft)] px-3 py-2 text-xs">
            <strong>{existingEmail}</strong> ya tiene una cuenta en Authentication (por ejemplo, de la app
            Calendario). ¿Darle acceso a TeRRa? Hazlo solo si sabes de quién es: quien conozca su contraseña va a
            poder entrar.
          </div>
        )}
        {busy && <p className="text-xs text-[var(--color-muted)]">Esperando al backend…</p>}
        {error && (
          <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-xs text-[var(--color-danger)]">{error}</p>
        )}
      </div>
    </Modal>
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
