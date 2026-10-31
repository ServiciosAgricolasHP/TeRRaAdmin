import { useState } from "react";
import Modal, { ModalCloseButton } from "../../components/Modal";
import { hasChanges } from "../../utils/formChanges";
import { enqueueFunctionJob, waitForFunctionJob } from "../../services/functionJobsService";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { ROLE_OPTIONS, parseNewAccount } from "../../utils/userAccounts";
import { attempt } from "../../utils/attempt";

// Crea la cuenta con el job `createUser` y, si se pidió, envía el correo para
// elegir contraseña. Un correo que ya tiene cuenta pasa por una confirmación.
export function NewAccountModal({ onClose, onCreated }) {
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
    const { value: outcome, error: err } = await attempt(async () => {
      const ref = await enqueueFunctionJob("createUser", { ...parsed.value, ...(useExisting ? { useExisting: true } : {}) }, user);
      return waitForFunctionJob(ref);
    });
    if (err) {
      setError(
        err?.code === "permission-denied"
          ? "Las reglas de Firestore no dejan crear el job: solo un admin puede crear cuentas."
          : err?.message || String(err),
      );
    } else if (outcome.status === "done") {
      let resetSent = false;
      if (form.sendReset) {
        const { error: resetErr } = await attempt(() => sendPasswordReset(email));
        if (resetErr) toast.warning(`No se pudo enviar el correo a ${email}. Puedes enviarlo con "Contraseña".`);
        else resetSent = true;
      }
      const what = outcome.result?.existingAccount ? `${email} ya tiene acceso a TeRRa` : `Cuenta creada para ${email}`;
      toast.success(resetSent ? `${what}. Le llegó un correo para elegir su contraseña.` : `${what}.`);
      onCreated({ id: outcome.result?.uid, ...parsed.value });
    } else if (outcome.errorCode === "account-exists") {
      setExistingEmail(email);
    } else {
      setError(
        outcome.status === "timeout"
          ? "El backend no respondió a los 45 s. Revisa que las Functions estén desplegadas."
          : outcome.error || "No se pudo crear la cuenta.",
      );
    }
    setBusy(false);
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
      dirty={!busy && hasChanges({ role: "user", sendReset: true }, form)}
      title="Nueva cuenta"
      footer={
        <>
          <ModalCloseButton
            disabled={busy}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm disabled:opacity-60"
          >
            Cancelar
          </ModalCloseButton>
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
