import { useState, useRef, useEffect } from "react";
import { collection, serverTimestamp } from "firebase/firestore";
import { addDoc, onSnapshot } from "../../services/readMeter";
import { db } from "../../firebase";
import { useAuth } from "../../contexts/AuthContext";
import { ConsoleCard } from "./ConsoleCard";
import { attempt } from "../../utils/attempt";

// ============================================================
// Sección Debug: ping al backend
// ============================================================
// Prueba Cloud Functions de punta a punta por el mismo camino que cualquier
// job: escribe un doc en `functionJobs`, un trigger de Firestore lo levanta y
// la respuesta llega en el mismo doc (ver functions/index.js).
//
// Distingue tres fallas, que se arreglan en lugares distintos:
// `permission-denied` (las reglas no dejan crear el job), timeout (la función
// no está desplegada o mira otra base) y job en `error` (la función corrió y
// falló adentro).
const FUNCTION_JOBS_COLLECTION = "functionJobs";

export function PingSection() {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const cleanupRef = useRef(null);

  // Al desmontar, cierra el listener y el timer del job en curso.
  useEffect(() => () => cleanupRef.current?.(), []);

  const runPing = async () => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    setBusy(true);
    setResult(null);

    let unsub = null;
    let timer = null;
    const teardown = () => {
      if (timer) clearTimeout(timer);
      if (unsub) unsub();
    };
    const finish = (r) => {
      teardown();
      cleanupRef.current = null;
      setResult(r);
      setBusy(false);
    };

    let ref;
    const { error: err } = await attempt(async () => {
      ref = await addDoc(collection(db, FUNCTION_JOBS_COLLECTION), {
        type: "ping",
        status: "pending",
        requestedBy: user?.uid || null,
        requestedByEmail: user?.email || null,
        requestedAt: serverTimestamp(),
      });
    });
    if (err) {
      finish({
        ok: false,
        message:
          err?.code === "permission-denied"
            ? "Las reglas de Firestore no dejan crear la tarea: solo un admin puede encolarla. Si lo eres, revisa que firestore.rules esté publicado en la consola."
            : err?.message || String(err),
      });
      return;
    }

    cleanupRef.current = teardown;
    const t0 = Date.now();

    // Corte generoso: un arranque en frío tarda varios segundos, y que expire
    // tiene que significar "no está", no "tardó".
    timer = setTimeout(() => {
      finish({
        ok: false,
        message:
          "La tarea quedó sin respuesta a los 45 s. O la función no está desplegada, o su trigger no está suscrito a hpdatabase.",
      });
    }, 45_000);

    unsub = onSnapshot(
      ref,
      (snap) => {
        const d = snap.data();
        if (!d || d.status === "pending" || d.status === "running") return;
        finish(
          d.status === "done"
            ? { ok: true, data: d.result, ms: Date.now() - t0 }
            : { ok: false, message: d.error || "La tarea terminó en error." },
        );
      },
      (err) => finish({ ok: false, message: err?.message || String(err) }),
    );
  };

  return (
    <ConsoleCard id="ping-al-backend" title="🧪 Ping al backend">
      <p className="mb-3 text-xs text-[var(--color-muted)]">
        Encola una tarea en <code>{FUNCTION_JOBS_COLLECTION}</code> y espera la respuesta del
        backend. Es el mismo camino que usa el backup.
      </p>
      <button
        onClick={runPing}
        disabled={busy}
        className="rounded-md border border-[var(--color-warning)] bg-[var(--color-warning-soft)] px-3 py-1.5 text-sm text-[var(--color-warning)] hover:opacity-80 disabled:opacity-60"
      >
        {busy ? "Esperando al backend..." : "Probar ping"}
      </button>
      {result && (
        <div
          className={`mt-3 rounded-md border p-3 font-mono text-xs ${
            result.ok
              ? "border-[var(--color-success)] bg-[var(--color-success-soft)] text-[var(--color-success)]"
              : "border-[var(--color-danger)] bg-[var(--color-danger-soft)] text-[var(--color-danger)]"
          }`}
        >
          {result.ok
            ? `✓ OK en ${result.ms} ms — ${JSON.stringify(result.data)}`
            : `✗ ${result.message}`}
        </div>
      )}
    </ConsoleCard>
  );
}
