import { useEffect, useState } from "react";
import { logsService } from "../../services";

// El último registro de auditoría de cada cuenta: una lectura por cuenta. La
// consulta usa el índice compuesto de `logs` uid ↑ + timestamp ↓; si falta,
// Firestore responde `failed-precondition` con el enlace para crearlo.
export function useLastChanges(profiles, reloadKey) {
  const idsKey = profiles.map((p) => p.id).sort().join("|");
  const key = `${idsKey}#${reloadKey}`;
  const [result, setResult] = useState({ key: null, byUid: {}, error: null });

  useEffect(() => {
    const ids = idsKey ? idsKey.split("|") : [];
    if (!ids.length) return;
    let cancelled = false;
    Promise.all(
      ids.map((uid) =>
        logsService
          .list({ wheres: [["uid", "==", uid]], order: ["timestamp", "desc"], take: 1 })
          .then((rows) => [uid, rows[0] || null]),
      ),
    )
      .then((entries) => {
        if (!cancelled) setResult({ key, byUid: Object.fromEntries(entries), error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("[Users] último cambio:", err);
        setResult({ key, byUid: {}, error: err });
      });
    return () => {
      cancelled = true;
    };
  }, [idsKey, key]);

  const { error } = result;
  return {
    loading: result.key !== key,
    byUid: result.byUid,
    missingIndex: error?.code === "failed-precondition",
    indexUrl: String(error?.message || "").match(/https:\/\/console\.firebase\.google\.com\/\S+/)?.[0] || null,
    error,
  };
}
