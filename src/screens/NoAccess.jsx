import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";

// Pantalla de una cuenta con sesión pero sin acceso: sin perfil en `users` o
// suspendida.
export default function NoAccess() {
  const { user, logout } = useAuth();
  const [copied, setCopied] = useState(false);
  const suspended = user?.access === "disabled";

  const copyUid = async () => {
    try {
      await navigator.clipboard.writeText(user.uid);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-4 text-[var(--color-text)]">
      <div className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center shadow-lg">
        <div className="text-3xl">{suspended ? "⏸️" : "🔒"}</div>
        <h1 className="mt-2 text-lg font-semibold">
          {suspended ? "Acceso suspendido" : "Cuenta sin acceso"}
        </h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          {suspended
            ? "Un administrador suspendió el acceso de esta cuenta a TeRRa."
            : "Esta cuenta todavía no tiene acceso a TeRRa."}{" "}
          Pídele a un administrador que la habilite.
        </p>

        <div className="mt-4 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-left text-xs">
          <div className="break-all">{user?.email}</div>
          {!suspended && (
            <button
              type="button"
              onClick={copyUid}
              title="Copiar el código de la cuenta"
              className="mt-1 inline-flex min-h-[32px] items-center gap-1 break-all text-left font-mono text-[11px] text-[var(--color-muted)] hover:text-[var(--color-accent)]"
            >
              {user?.uid}
              <span aria-hidden="true">{copied ? "✓" : "📋"}</span>
            </button>
          )}
        </div>
        {!suspended && (
          <p className="mt-2 text-[11px] text-[var(--color-muted)]">
            El administrador necesita ese código para darte acceso.
          </p>
        )}

        <button
          type="button"
          onClick={logout}
          className="mt-5 w-full rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)]"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
