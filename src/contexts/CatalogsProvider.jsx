import { useEffect, useState, useCallback } from "react";
import { catalogsService, CATALOG_DEFAULTS } from "../services/catalogsService";
import { useAuth } from "./AuthContext";
import { CatalogsContext } from "./CatalogsContext";
import { attempt } from "../utils/attempt";

export function CatalogsProvider({ children }) {
  const { user, hasAccess } = useAuth();
  const uid = hasAccess ? user.uid : null;
  const [catalogs, setCatalogs] = useState(CATALOG_DEFAULTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;
    (async () => {
      const { error: err } = await attempt(async () => {
        const all = await catalogsService.getAll();
        setCatalogs((c) => ({ ...c, ...all }));
      });
      if (err) console.error("[Catalogs] load failed:", err);
      setLoading(false);
    })();
  }, [uid]);

  const addEntry = useCallback(
    async (name, label) => {
      const cur = catalogs[name] || [];
      const trimmed = label.trim();
      if (!trimmed) return null;
      // Si ya hay una entrada con la misma etiqueta (sin distinguir mayúsculas), devuelve esa.
      const existing = cur.find((e) => e.label.toLowerCase() === trimmed.toLowerCase());
      if (existing) return existing.value;
      const nextValue = cur.reduce((m, e) => Math.max(m, e.value), -1) + 1;
      const next = [...cur, { value: nextValue, label: trimmed }];
      await catalogsService.setEntries(name, next);
      setCatalogs((c) => ({ ...c, [name]: next }));
      return nextValue;
    },
    [catalogs],
  );

  const renameEntry = useCallback(
    async (name, value, newLabel) => {
      const cur = catalogs[name] || [];
      const trimmed = newLabel.trim();
      if (!trimmed) return;
      const next = cur.map((e) => (e.value === value ? { ...e, label: trimmed } : e));
      await catalogsService.setEntries(name, next);
      setCatalogs((c) => ({ ...c, [name]: next }));
    },
    [catalogs],
  );

  return (
    <CatalogsContext.Provider value={{ catalogs, loading, addEntry, renameEntry }}>
      {children}
    </CatalogsContext.Provider>
  );
}
