import { useEffect, useMemo, useState } from "react";
import ConfirmDialog from "../components/ConfirmDialog";
import { usersService } from "../services";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { isAdminRole, roleLabel, sortProfiles } from "../utils/userAccounts";
import ScreenLoader from "../components/ScreenLoader";
import BirthdayModal from "./users/BirthdayModal";
import { attempt } from "../utils/attempt";
import { errorMessage, nameOf } from "./users/helpers";
import { useLastChanges } from "./users/useLastChanges";
import { NewAccountModal } from "./users/NewAccountModal";
import { UserCard } from "./users/UserCard";
import { GreetingsModal } from "./users/GreetingsModal";

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
  const [birthdayOf, setBirthdayOf] = useState(null);
  const [creating, setCreating] = useState(false);
  const lastChanges = useLastChanges(profiles, reloadKey);

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
    const { error: err } = await attempt(async () => {
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
    });
    if (err) toast.error(errorMessage(err));
    setBusy(false);
  };

  const copy = action ? confirmCopy(action) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Usuarios</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Cuentas con acceso a TeRRa: rol, suspensión, contraseña, saludos y cumpleaños.
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

      {lastChanges.error ? (
        <p className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-xs text-[var(--color-muted)]">
          {lastChanges.missingIndex ? (
            <>
              Para mostrar el último cambio de cada cuenta falta un índice de Firestore en <code>logs</code>: <code>uid</code>{" "}
              ascendente y <code>timestamp</code> descendente.{" "}
              {lastChanges.indexUrl ? (
                <a href={lastChanges.indexUrl} target="_blank" rel="noreferrer" className="text-[var(--color-accent)] underline">
                  Crear el índice ↗
                </a>
              ) : (
                "El enlace para crearlo está en la consola del navegador."
              )}
            </>
          ) : (
            <>No se pudo leer el último cambio de las cuentas: {errorMessage(lastChanges.error)}</>
          )}
        </p>
      ) : null}

      {loading && profiles.length === 0 ? (
        <ScreenLoader />
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
              lastChange={lastChanges.error ? undefined : { loading: lastChanges.loading, log: lastChanges.byUid[p.id] }}
              onAction={(kind) => setAction({ kind, profile: p })}
              onGreetings={() => setGreetingsOf(p)}
              onBirthday={() => setBirthdayOf(p)}
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

      {birthdayOf && (
        <BirthdayModal
          profile={birthdayOf}
          name={nameOf(birthdayOf)}
          onClose={() => setBirthdayOf(null)}
          onSave={async (birthday) => {
            const { error: err } = await attempt(async () => {
              await usersService.update(birthdayOf.id, { birthday });
              patch(birthdayOf.id, { birthday });
              toast.success("Cumpleaños guardado");
              setBirthdayOf(null);
            });
            if (err) toast.error(errorMessage(err));
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
