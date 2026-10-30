import { useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { listBackups, requestBackup, requestBackupLink } from "../../services/backupsService";

// Crear el job puede fallar antes de llegar al backend.
function enqueueFailure(err) {
  return err?.code === "permission-denied"
    ? "Las reglas de Firestore no dejan crear la tarea: solo un admin puede pedirla."
    : err?.message || String(err);
}

// El motivo de un job que no terminó bien.
function jobFailure(outcome) {
  if (outcome.status === "timeout") {
    return "El backend no respondió a tiempo. Revisa el registro de la función en la consola de Google Cloud.";
  }
  return outcome.error || "La tarea terminó en error.";
}

// Genera un respaldo y relee la lista. No lanza: devuelve
// { ok, result?, backups?, message? }.
async function generateBackup(user, onProgress) {
  let outcome;
  try {
    outcome = await requestBackup(user, { onProgress });
  } catch (err) {
    return { ok: false, message: enqueueFailure(err) };
  }
  if (outcome.status !== "done") return { ok: false, message: jobFailure(outcome) };
  const backups = await listBackups().catch(() => null);
  return { ok: true, result: outcome.result, backups };
}

// El enlace para bajar un respaldo. No lanza: devuelve { url } o { message }.
async function backupLink(id, user) {
  let outcome;
  try {
    outcome = await requestBackupLink(id, user);
  } catch (err) {
    return { message: enqueueFailure(err) };
  }
  return outcome.status === "done" && outcome.result?.url ? { url: outcome.result.url } : { message: jobFailure(outcome) };
}

// Los respaldos en JSON de la Consola admin: la lista, generar uno ahora y
// bajarlo. La lista se lee al montar.
export function useBackups() {
  const { user } = useAuth();
  const [backups, setBackups] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [outcome, setOutcome] = useState(null);
  const [linkBusy, setLinkBusy] = useState("");

  useEffect(() => {
    let cancelled = false;
    listBackups().then(
      (list) => {
        if (!cancelled) setBackups(list);
      },
      (err) => {
        if (!cancelled) setLoadError(err?.message || String(err));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const generate = () => {
    setRunning(true);
    setProgress(null);
    setOutcome(null);
    generateBackup(user, setProgress).then((r) => {
      if (r.backups) setBackups(r.backups);
      setOutcome(r);
      setRunning(false);
    });
  };

  const download = (id) => {
    setLinkBusy(id);
    setOutcome(null);
    backupLink(id, user).then((r) => {
      setLinkBusy("");
      if (r.url) window.location.assign(r.url);
      else setOutcome({ ok: false, message: r.message });
    });
  };

  return { backups, loadError, running, progress, outcome, linkBusy, generate, download };
}
