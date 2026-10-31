import { useState, useRef, useEffect, useMemo } from "react";
import { defaultLayout, userPrefsService, normalizeLayout, UNGROUPED_ID } from "../../services/userPrefsService";
import { readStoredJson, writeStoredJson } from "../../utils/browserStorage";

// La distribución de las tarjetas: grupos con nombre y color, el color de cada
// faena y arrastrar para reordenar o cambiar de grupo. Viaja con el usuario
// (`users/{uid}.faenaLayout`); los grupos plegados quedan en el dispositivo.
export function useJobLayout({ jobs, persistOrder, toast, user }) {
  const [dragId, setDragId] = useState(null);
  const [dropOverId, setDropOverId] = useState(null);
  const [dropOverGroupId, setDropOverGroupId] = useState(null);

  // ---------------- Distribución (grupos y colores por usuario) ----------------
  const [layout, setLayout] = useState(defaultLayout);
  const [editLayout, setEditLayout] = useState(false);
  const layoutSaveTimer = useRef(null);
  // Grupos plegados, guardados en el dispositivo (localStorage): la
  // distribución viaja con el usuario, pero plegar es una preferencia visual
  // del momento.
  const [collapsedGroups, setCollapsedGroups] = useState(() => {
    const ids = readStoredJson("faenas.collapsedGroups", []);
    return new Set(Array.isArray(ids) ? ids : []);
  });
  const toggleGroupCollapsed = (gid) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(gid)) next.delete(gid);
      else next.add(gid);
      writeStoredJson("faenas.collapsedGroups", [...next]);
      return next;
    });
  };

  useEffect(() => {
    if (!user?.uid) return;
    (async () => {
      const saved = await userPrefsService.getLayout(user.uid);
      setLayout(normalizeLayout(saved));
    })();
  }, [user?.uid]);

  // Actualiza el estado y guarda en las preferencias del usuario tras 400 ms sin cambios.
  const persistLayout = (next) => {
    setLayout(next);
    if (!user?.uid) return;
    if (layoutSaveTimer.current) clearTimeout(layoutSaveTimer.current);
    layoutSaveTimer.current = setTimeout(() => {
      userPrefsService.saveLayout(user.uid, next).catch((err) => {
        console.error("[layout] save:", err);
        toast.error("No se pudo guardar la distribución.");
      });
    }, 400);
  };

  // Faenas por grupo
  const jobsByGroup = useMemo(() => {
    const out = {};
    for (const g of layout.groups) out[g.id] = [];
    for (const f of jobs) {
      const gid = layout.faenaGroup[f.id] && out[layout.faenaGroup[f.id]] ? layout.faenaGroup[f.id] : UNGROUPED_ID;
      out[gid].push(f);
    }
    return out;
  }, [jobs, layout]);

  const onDragStart = (id) => () => setDragId(id);
  const onDragOver = (id) => (e) => {
    e.preventDefault();
    if (id !== dropOverId) setDropOverId(id);
  };
  const onDragLeave = () => setDropOverId(null);
  const onDrop = (targetId) => (e) => {
    e.preventDefault();
    if (!dragId || dragId === targetId) {
      setDragId(null);
      setDropOverId(null);
      return;
    }
    // Si cambia de grupo, la faena arrastrada pasa al grupo del destino.
    const targetGroup = layout.faenaGroup[targetId] || UNGROUPED_ID;
    const dragGroup = layout.faenaGroup[dragId] || UNGROUPED_ID;
    if (targetGroup !== dragGroup) {
      persistLayout({
        ...layout,
        faenaGroup: { ...layout.faenaGroup, [dragId]: targetGroup },
      });
    }
    const ids = jobs.map((f) => f.id);
    const fromIdx = ids.indexOf(dragId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = [...ids];
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, dragId);
    persistOrder(next);
    setDragId(null);
    setDropOverId(null);
  };
  const onDragEnd = () => {
    setDragId(null);
    setDropOverId(null);
    setDropOverGroupId(null);
  };

  // Soltar sobre la sección de un grupo (zona vacía o encabezado) asigna la faena a ese grupo.
  const onGroupDragOver = (gid) => (e) => {
    if (!dragId) return;
    e.preventDefault();
    if (gid !== dropOverGroupId) setDropOverGroupId(gid);
  };
  const onGroupDrop = (gid) => (e) => {
    e.preventDefault();
    if (!dragId) return;
    const currentGroup = layout.faenaGroup[dragId] || UNGROUPED_ID;
    if (currentGroup !== gid) {
      persistLayout({
        ...layout,
        faenaGroup: { ...layout.faenaGroup, [dragId]: gid },
      });
    }
    setDragId(null);
    setDropOverId(null);
    setDropOverGroupId(null);
  };

  // ---------------- Grupos ----------------
  const newGroupId = () => `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  const addGroup = () => {
    const id = newGroupId();
    const newGroup = { id, name: "Nuevo grupo", color: null };
    // Se inserta antes de "sin grupo", que siempre va al final.
    const groups = [...layout.groups];
    const ungroupedIdx = groups.findIndex((g) => g.id === UNGROUPED_ID);
    groups.splice(ungroupedIdx, 0, newGroup);
    persistLayout({ ...layout, groups });
  };

  const updateGroup = (gid, patch) => {
    persistLayout({
      ...layout,
      groups: layout.groups.map((g) => (g.id === gid ? { ...g, ...patch } : g)),
    });
  };

  const removeGroup = (gid) => {
    if (gid === UNGROUPED_ID) return;
    // Sus faenas vuelven a "sin grupo".
    const nextJobGroup = { ...layout.faenaGroup };
    for (const fid in nextJobGroup) {
      if (nextJobGroup[fid] === gid) delete nextJobGroup[fid];
    }
    persistLayout({
      ...layout,
      groups: layout.groups.filter((g) => g.id !== gid),
      faenaGroup: nextJobGroup,
    });
  };

  const setJobCardColor = (jobId, color) => {
    const next = { ...layout.faenaColor };
    if (color == null) delete next[jobId];
    else next[jobId] = color;
    persistLayout({ ...layout, faenaColor: next });
  };

  const colorOf = (job) => {
    const override = layout.faenaColor[job.id];
    if (override) return override;
    const gid = layout.faenaGroup[job.id] || UNGROUPED_ID;
    return layout.groups.find((g) => g.id === gid)?.color || null;
  };
  return {
    addGroup,
    collapsedGroups,
    colorOf,
    dragId,
    dropOverGroupId,
    dropOverId,
    editLayout,
    jobsByGroup,
    layout,
    onDragEnd,
    onDragLeave,
    onDragOver,
    onDragStart,
    onDrop,
    onGroupDragOver,
    onGroupDrop,
    removeGroup,
    setDropOverGroupId,
    setEditLayout,
    setJobCardColor,
    toggleGroupCollapsed,
    updateGroup,
  };
}
