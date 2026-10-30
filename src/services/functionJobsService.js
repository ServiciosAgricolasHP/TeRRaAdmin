import { addDoc, collection, onSnapshot, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

// Cola de jobs del backend (`functionJobs`, ver functions/index.js): la app crea
// el job y el trigger de Cloud Functions lo ejecuta y escribe el resultado en
// el mismo documento.

const FUNCTION_JOBS = "functionJobs";

// Crea un job `pending` a nombre de `user` y devuelve su referencia.
export function enqueueFunctionJob(type, params, user) {
  return addDoc(collection(db, FUNCTION_JOBS), {
    type,
    status: "pending",
    requestedBy: user?.uid || null,
    requestedByEmail: user?.email || null,
    requestedAt: serverTimestamp(),
    ...(params ? { params } : {}),
  });
}

// Espera a que el job termine. Resuelve con `{ status, result, error, errorCode }`,
// o con `{ status: "timeout" }` si pasan `timeoutMs` sin respuesta. Mientras
// corre, `onProgress` recibe el campo `progress` del job cada vez que cambia.
export function waitForFunctionJob(ref, { timeoutMs = 45_000, onProgress } = {}) {
  return new Promise((resolve) => {
    let finished = false;
    let unsub = null;
    const finish = (outcome) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      unsub?.();
      resolve(outcome);
    };
    const timer = setTimeout(() => finish({ status: "timeout" }), timeoutMs);
    unsub = onSnapshot(
      ref,
      (snap) => {
        const d = snap.data();
        if (!d || d.status === "pending" || d.status === "running") {
          if (d?.progress) onProgress?.(d.progress);
          return;
        }
        finish({ status: d.status, result: d.result, error: d.error, errorCode: d.errorCode });
      },
      (err) => finish({ status: "error", error: err?.message || String(err) }),
    );
    if (finished) unsub();
  });
}
