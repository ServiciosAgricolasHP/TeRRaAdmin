import { useState, useEffect } from "react";
import { doc } from "firebase/firestore";
import { getDoc } from "../../services/readMeter";
import { db } from "../../firebase";
import { isAdminRole } from "../../utils/userAccounts";
import { useAuth } from "../../contexts/AuthContext";
import { ConsoleCard } from "./ConsoleCard";

// ============================================================
// Sección Debug: por qué no soy admin
// ============================================================
// Muestra qué recibe el AuthContext (uid, email, rol calculado) y qué contiene
// el doc `users/{uid}` en Firestore.
export function AuthDebugSection() {
  const { user, isAdmin } = useAuth();
  const [docState, setDocState] = useState({ loading: true });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    (async () => {
      setDocState({ loading: true });
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (!snap.exists()) {
          setDocState({ loading: false, exists: false });
        } else {
          setDocState({ loading: false, exists: true, data: snap.data() });
        }
      } catch (err) {
        setDocState({ loading: false, error: err.message || String(err), code: err.code });
      }
    })();
  }, [user?.uid]);

  const copyUid = async () => {
    if (!user?.uid) return;
    try {
      await navigator.clipboard.writeText(user.uid);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  };

  return (
    <ConsoleCard id="debug-de-rol-admin" title="🕵️ Diagnóstico del rol admin">
      <p className="mb-3 text-xs text-[var(--color-muted)]">
        El AuthContext lee <code>users/{"{uid}"}</code> y toma el campo <code>role</code>.
        Si dice <code>"admin"</code> (sin importar mayúsculas), activa el modo admin.
      </p>

      <div className="space-y-3 text-sm">
        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
            Sesión actual
          </div>
          <div className="grid gap-1 text-xs sm:grid-cols-[80px_1fr]">
            <div className="text-[var(--color-muted)]">Email:</div>
            <div className="font-mono">{user?.email || "(sin sesión)"}</div>
            <div className="text-[var(--color-muted)]">UID:</div>
            <div className="flex items-center gap-2">
              <code className="break-all font-mono text-xs">{user?.uid || "—"}</code>
              {user?.uid && (
                <button
                  type="button"
                  onClick={copyUid}
                  className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 text-[10px] hover:bg-[var(--color-accent-soft)]"
                >
                  {copied ? "✓ Copiado" : "📋 Copiar"}
                </button>
              )}
            </div>
            <div className="text-[var(--color-muted)]">Rol visto por AuthContext:</div>
            <div>
              <code className="font-mono">{user?.role || "(ninguno)"}</code>
            </div>
            <div className="text-[var(--color-muted)]">isAdmin:</div>
            <div>
              <span className={isAdmin ? "font-semibold text-[var(--color-success)]" : "font-semibold text-[var(--color-danger)]"}>
                {isAdmin ? "✓ TRUE" : "✗ FALSE"}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
            Firestore <code>users/{user?.uid || "—"}</code>
          </div>
          {docState.loading ? (
            <div className="text-xs text-[var(--color-muted)]">Consultando…</div>
          ) : docState.error ? (
            <>
              <div className="text-xs text-[var(--color-danger)]">
                ✖ Error al leer: <code>{docState.code || "?"}</code>
              </div>
              <div className="mt-1 text-[10px] text-[var(--color-muted)]">
                {docState.error}
              </div>
              <div className="mt-2 rounded bg-[var(--color-surface)] p-2 text-[10px]">
                <strong>Probable causa:</strong> las reglas de seguridad de Firestore
                bloquean la lectura. Necesitas una regla como esta:
                <pre className="mt-1 overflow-auto text-[10px]">{`match /users/{uid} {
  allow read: if request.auth.uid == uid;
}`}</pre>
              </div>
            </>
          ) : !docState.exists ? (
            <>
              <div className="text-xs text-[var(--color-danger)]">
                ✖ El documento <code>users/{user?.uid}</code> NO existe.
              </div>
              <div className="mt-2 rounded bg-[var(--color-surface)] p-2 text-[10px]">
                <strong>Solución</strong>: en la consola de Firebase, crear el documento con id{" "}
                <code>{user?.uid}</code> en la colección <code>users</code> y
                agregar el campo <code>role</code> (texto) con valor{" "}
                <code>"admin"</code> exactamente en minúscula. Después
                vuelve a iniciar sesión en la app.
              </div>
            </>
          ) : (
            <>
              <div className="text-xs text-[var(--color-success)]">
                ✓ Existe. Contenido:
              </div>
              <pre className="mt-1 overflow-auto rounded bg-[var(--color-surface)] p-2 text-[10px]">
                {JSON.stringify(docState.data, null, 2)}
              </pre>
              {!isAdminRole(docState.data?.role) && (
                <div className="mt-2 rounded bg-[var(--color-surface)] p-2 text-[10px] text-[var(--color-danger)]">
                  El campo <code>role</code> es <code>{JSON.stringify(docState.data?.role)}</code>,
                  no <code>"admin"</code>. Cámbialo a <code>"admin"</code> y vuelve a iniciar sesión.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </ConsoleCard>
  );
}
