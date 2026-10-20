import { useState, useEffect, useRef, useMemo, Fragment } from "react";
import { useSearchParams } from "react-router-dom";
import { jobsService, subjobsService, cyclesService, workdaysService } from "../services";
import { payrollsService } from "../services/payrollsService";
import { defaultLayout, userPrefsService, normalizeLayout, UNGROUPED_ID } from "../services/userPrefsService";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import Modal, { ModalCloseButton } from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import TextField from "../components/TextField";
import Select from "../components/Select";
import { useIsMobile } from "../hooks/useIsMobile";
import { initialLaborPlan, LABOR_TYPES } from "../utils/laborTypes";
import { localIsoDate } from "../utils/dates";
import { closedCyclePatch } from "../utils/cycleClosing";
import { cloneLabors, cycleLabelSuffix, importCandidatesOf, importedDayPrices, movedWorkday, nextCycleLabors } from "../utils/cycleCreation";
import { toTitleName, unshout } from "../utils/textCase";
import { hasChanges } from "../utils/formChanges";
import { ColorPickerButton } from "./jobs/ColorPickerButton";
import { GroupHeader } from "./jobs/GroupHeader";
import { ImportSection } from "./jobs/ImportSection";
import { SelectedDetail } from "./jobs/SelectedDetail";

// Un formulario de faena, subfaena o ciclo con una copia de cómo se abrió
// (`initial`), para avisar si se cierra con cambios sin guardar.
const withInitial = (form) => ({ ...form, initial: form.data });

// En el alta de un ciclo, lo que se ofrece para importar no es un dato del
// formulario.
const CYCLE_FORM_IGNORE = ["importCandidates", "labors", "days"];

const emptyJob = { name: "", location: "", notes: "" };

const emptySubjob = { name: "", notes: "" };

const orderKey = (uid) => `af.faenaOrder.${uid || "anon"}`;

const todayStr = () => localIsoDate();

const newId = () => (crypto?.randomUUID?.() || `id_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`);

function applyOrder(items, order) {
  if (!order?.length) return items;
  const idx = new Map(order.map((id, i) => [id, i]));
  return [...items].sort((a, b) => {
    const ai = idx.has(a.id) ? idx.get(a.id) : Number.MAX_SAFE_INTEGER;
    const bi = idx.has(b.id) ? idx.get(b.id) : Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return a.name.localeCompare(b.name);
  });
}

// Los trabajadores van solo en la primera labor: la de supervisión arranca
// vacía (la supervisa otra gente, no la misma cuadrilla).
function defaultLabors(workers = [], opts = {}) {
  return initialLaborPlan(opts).map((l, i) => ({
    ...l,
    id: newId(),
    workers: i === 0 ? workers : [],
  }));
}

export default function Jobs() {
  const toast = useToast();
  const isMobile = useIsMobile();
  const { user, isAdmin } = useAuth();
  const storageKey = orderKey(user?.uid);
  const [searchParams, setSearchParams] = useSearchParams();

  const [rawJobs, setRawJobs] = useState([]);
  const [order, setOrder] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || "[]"); } catch { return []; }
  });
  const [subjobsByJob, setSubjobsByJob] = useState({});
  const [cyclesByJob, setCyclesByJob] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(() => searchParams.get("selected"));

  // Sincroniza selectedId con el parámetro `selected` de la URL (enlaces del breadcrumb de CycleDetail).
  useEffect(() => {
    const fromUrl = searchParams.get("selected");
    if (fromUrl && fromUrl !== selectedId) setSelectedId(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (selectedId) {
      if (searchParams.get("selected") !== selectedId) {
        setSearchParams({ selected: selectedId }, { replace: true });
      }
    } else if (searchParams.get("selected")) {
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const [jobForm, setJobForm] = useState(null);
  const [subjobForm, setSubjobForm] = useState(null);
  // Subfaena recién creada a la que se le ofrece abrir su primer ciclo.
  const [subjobOfferCycle, setSubjobOfferCycle] = useState(null);
  const [cycleForm, setCycleForm] = useState(null);
  const [closeFlow, setCloseFlow] = useState(null);
  const [confirm, setConfirm] = useState(null);
  // Segunda confirmación (cascada) dentro de doDelete: un diálogo que se
  // puede esperar con await.
  const [cascadeConfirm, setCascadeConfirm] = useState(null);
  const askCascadeConfirm = (message) =>
    new Promise((resolve) => setCascadeConfirm({ message, resolve }));
  const [busy, setBusy] = useState(false);

  const [dragId, setDragId] = useState(null);
  const [dropOverId, setDropOverId] = useState(null);
  const [dropOverGroupId, setDropOverGroupId] = useState(null);

  // ---------------- Subfaenas plegadas / ciclos cerrados ----------------
  // Guardado por usuario en localStorage. Las subfaenas arrancan expandidas;
  // los ciclos cerrados, ocultos cuando hay abiertos al lado (se muestran
  // con "Ver N cerrados").
  const collapsedSubjobsKey = `af.collapsedSubs.${user?.uid || "anon"}`;
  const [collapsedSubjobs, setCollapsedSubjobs] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(collapsedSubjobsKey) || "[]")); } catch { return new Set(); }
  });
  useEffect(() => {
    try { localStorage.setItem(collapsedSubjobsKey, JSON.stringify([...collapsedSubjobs])); } catch { /* noop */ }
  }, [collapsedSubjobs, collapsedSubjobsKey]);

  const showClosedKey = `af.showClosedInSub.${user?.uid || "anon"}`;
  const [showClosedInSubjob, setShowClosedInSubjob] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(showClosedKey) || "[]")); } catch { return new Set(); }
  });
  useEffect(() => {
    try { localStorage.setItem(showClosedKey, JSON.stringify([...showClosedInSubjob])); } catch { /* noop */ }
  }, [showClosedInSubjob, showClosedKey]);

  const toggleSubjobCollapse = (subjobId) => {
    setCollapsedSubjobs((prev) => {
      const n = new Set(prev);
      if (n.has(subjobId)) n.delete(subjobId); else n.add(subjobId);
      return n;
    });
  };

  // Subfaenas ocultas (`hidden`) que ya se plegaron solas en esta sesión. Se
  // pliegan una vez por sesión: si el usuario expande una, queda expandida
  // hasta recargar la página.
  const processedHiddenRef = useRef(new Set());
  const toggleShowClosed = (subjobId) => {
    setShowClosedInSubjob((prev) => {
      const n = new Set(prev);
      if (n.has(subjobId)) n.delete(subjobId); else n.add(subjobId);
      return n;
    });
  };

  // ---------------- Distribución (grupos y colores por usuario) ----------------
  const [layout, setLayout] = useState(defaultLayout);
  const [editLayout, setEditLayout] = useState(false);
  const layoutSaveTimer = useRef(null);
  // Grupos plegados, guardados en el dispositivo (localStorage): la
  // distribución viaja con el usuario, pero plegar es una preferencia visual
  // del momento.
  const [collapsedGroups, setCollapsedGroups] = useState(() => {
    try {
      const raw = localStorage.getItem("faenas.collapsedGroups");
      return new Set(raw ? JSON.parse(raw) : []);
    } catch {
      return new Set();
    }
  });
  const toggleGroupCollapsed = (gid) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(gid)) next.delete(gid);
      else next.add(gid);
      try { localStorage.setItem("faenas.collapsedGroups", JSON.stringify([...next])); } catch { /* noop */ }
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

  const jobs = useMemo(() => applyOrder(rawJobs, order), [rawJobs, order]);

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

  const persistOrder = (next) => {
    setOrder(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch (e) { void e; }
  };

  const loadJobs = async () => {
    setLoading(true);
    try {
      const list = await jobsService.list({
        order: ["name", "asc"],
        cache: true,
        persist: true,
        ttl: 10 * 60 * 1000,
      });
      setRawJobs(list);
      const ids = list.map((f) => f.id);
      const cleaned = order.filter((id) => ids.includes(id));
      const missing = ids.filter((id) => !cleaned.includes(id));
      const next = [...cleaned, ...missing];
      if (JSON.stringify(next) !== JSON.stringify(order)) persistOrder(next);
    } finally {
      setLoading(false);
    }
  };

  const loadSubjobs = async (jobId) => {
    const list = await subjobsService.list({
      wheres: [["faenaId", "==", jobId]],
      order: ["name", "asc"],
      cache: true,
      persist: true,
      ttl: 10 * 60 * 1000,
    });
    setSubjobsByJob((prev) => ({ ...prev, [jobId]: list }));
  };

  const loadCycles = async (jobId) => {
    const list = await cyclesService.list({
      wheres: [["faenaId", "==", jobId]],
      order: ["createdAt", "desc"],
      cache: true,
      ttl: 2 * 60 * 1000,
    });
    setCyclesByJob((prev) => ({ ...prev, [jobId]: list }));
  };

  useEffect(() => {
    loadJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    if (!subjobsByJob[selectedId]) loadSubjobs(selectedId);
    if (!cyclesByJob[selectedId]) loadCycles(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // Pliega las subfaenas ocultas al cargarlas, una vez por subfaena y por
  // sesión (ver processedHiddenRef), para respetar las que el usuario expanda.
  useEffect(() => {
    if (!selectedId) return;
    const subjobs = subjobsByJob[selectedId];
    if (!subjobs) return;
    const toCollapse = [];
    for (const s of subjobs) {
      if (s.hidden && !processedHiddenRef.current.has(s.id)) {
        toCollapse.push(s.id);
        processedHiddenRef.current.add(s.id);
      }
    }
    if (toCollapse.length > 0) {
      setCollapsedSubjobs((prev) => {
        const n = new Set(prev);
        for (const id of toCollapse) n.add(id);
        return n;
      });
    }
  }, [selectedId, subjobsByJob]);

  // Marca o desmarca una subfaena como oculta. Se guarda en el doc de la
  // subfaena, así que vale para todos los usuarios y dispositivos.
  const toggleHideSubjob = async (subjob) => {
    try {
      await subjobsService.update(subjob.id, { hidden: !subjob.hidden });
      subjobsService.invalidate();
      // Al ocultarla se pliega. Al mostrarla queda como esté, plegada o no.
      if (!subjob.hidden) {
        setCollapsedSubjobs((prev) => new Set(prev).add(subjob.id));
        processedHiddenRef.current.add(subjob.id);
      }
      if (subjob.faenaId) await loadSubjobs(subjob.faenaId);
    } catch (err) {
      toast.error("Error al ocultar/mostrar subfaena: " + (err.message || err));
    }
  };

  // Al abrir el detalle de una faena, desplaza la vista hasta el panel. Espera
  // un frame para que React lo dibuje antes de medir.
  const selectedDetailRef = useRef(null);
  useEffect(() => {
    if (!selectedId) return;
    const id = window.requestAnimationFrame(() => {
      const el = selectedDetailRef.current;
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => window.cancelAnimationFrame(id);
  }, [selectedId]);

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

  const submitJob = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = {
        // Nombre y ubicación como título; notas sin gritar (utils/textCase.js).
        name: toTitleName(jobForm.data.name),
        location: toTitleName(jobForm.data.location || ""),
        notes: unshout(jobForm.data.notes || ""),
      };
      if (jobForm.mode === "create") {
        const created = await jobsService.create(payload);
        persistOrder([...order, created.id]);
      } else {
        await jobsService.update(jobForm.data.id, payload);
      }
      setJobForm(null);
      await loadJobs();
      toast.success(jobForm.mode === "create" ? "Faena creada" : "Faena actualizada");
    } catch (err) {
      toast.error("Error al guardar la faena: " + (err.message || err));
    } finally {
      setBusy(false);
    }
  };

  const submitSubjob = async (e) => {
    e.preventDefault();
    const { mode, jobId, data } = subjobForm;
    setBusy(true);
    try {
      let creada = null;
      const fields = { name: toTitleName(data.name || ""), notes: unshout(data.notes || "") };
      if (mode === "create") creada = await subjobsService.create({ ...data, ...fields, faenaId: jobId });
      else await subjobsService.update(data.id, fields);
      setSubjobForm(null);
      await loadSubjobs(jobId);
      toast.success(mode === "create" ? "Subfaena creada" : "Subfaena actualizada");
      // Al crear una subfaena se ofrece abrir su primer ciclo (cancelable): sin
      // ciclos no hay dónde anotar jornadas.
      if (creada?.id) setSubjobOfferCycle({ jobId, subjobId: creada.id, name: fields.name });
    } catch (err) {
      toast.error("Error al guardar la subfaena: " + (err.message || err));
    } finally {
      setBusy(false);
    }
  };

  const cyclePrefix = (jobId, subjobId) => {
    const f = jobs.find((x) => x.id === jobId);
    const subjobList = subjobsByJob[jobId] || [];
    const s = subjobList.find((x) => x.id === subjobId);
    const parts = [];
    if (f?.name) parts.push(f.name);
    if (s?.name) parts.push(s.name);
    return parts.length ? parts.join("/") + "/" : "";
  };

  const submitCycle = async (e) => {
    e.preventDefault();
    const { mode, jobId, data } = cycleForm;
    if (mode === "create") {
      const existing = cyclesByJob[jobId] || [];
      const subjobs = subjobsByJob[jobId] || [];
      if (!data.subfaenaId && subjobs.length > 0) {
        toast.warning("La faena tiene subfaenas. Selecciona una subfaena para el ciclo.");
        return;
      }
    }
    setBusy(true);
    try {
      // Labores y datos a importar desde el ciclo origen, si se pidió.
      let labors;
      let importPlan = null; // { source, picked, oldToNewLaborId }
      if (mode === "create" && data.importEnabled && data.importSourceId) {
        const source = (data.importCandidates || []).find((c) => c.id === data.importSourceId);
        const picked = (source?.labors || []).filter((l) => (data.importLaborIds || new Set()).has(l.id));
        if (picked.length === 0) {
          toast.warning("Marca al menos una labor a clonar (o desactiva la importación).");
          setBusy(false);
          return;
        }
        const cloned = cloneLabors(picked, newId);
        labors = cloned.labors;
        importPlan = { source, picked, oldToNewLaborId: cloned.oldToNewLaborId };
      } else if (mode === "create") {
        labors = defaultLabors([], {
          type: data.laborType || "main",
          withSupervision: !!data.withSupervision,
        });
      } else {
        labors = data.labors && data.labors.length ? data.labors : defaultLabors();
      }

      const prefix = cyclePrefix(jobId, data.subfaenaId);
      const suffix = (data.labelSuffix ?? data.label ?? "").trim();

      // Días: los marcados en `importDays` definen la lista del nuevo ciclo y
      // restringen qué jornadas y precios se importan.
      const importDaysSet = data.importDays || new Set();
      let nextDays = data.days || [];
      if (mode === "create" && importPlan) {
        nextDays = (importPlan.source.days || []).filter((d) => importDaysSet.has(d));
      } else if (mode === "create") {
        // El ciclo nace con la fecha de inicio como primer día, así la grilla
        // abre con una columna.
        nextDays = [data.startDate || todayStr()];
      }

      // dayPrices: si se pidió copiarlos, los de las labores y días importados.
      const nextDayPrices = mode === "create" && importPlan && data.importCopyDayPrices
        ? importedDayPrices(importPlan.source.dayPrices, importPlan.oldToNewLaborId, importDaysSet)
        : undefined;

      const payload = {
        faenaId: jobId,
        subfaenaId: data.subfaenaId || null,
        label: prefix + suffix,
        startDate: data.startDate || todayStr(),
        notes: unshout(data.notes || ""),
        status: data.status || "open",
        days: nextDays,
        labors,
        ...(nextDayPrices ? { dayPrices: nextDayPrices } : {}),
      };

      let createdCycleId = null;
      if (mode === "create") {
        const created = await cyclesService.create(payload);
        createdCycleId = created?.id || created;
      } else {
        await cyclesService.update(data.id, payload);
      }

      // Mover jornadas: por cada labor importada, se leen sus jornadas en el
      // origen y se recrean en el ciclo nuevo (crear + borrar, ver
      // `movedWorkday`). Las jornadas con payrollId se saltan para no romper
      // nóminas ya generadas.
      if (mode === "create" && importPlan && data.importMoveWorkdays && createdCycleId) {
        const oldCycleId = importPlan.source.id;
        let skippedPaid = 0;
        let moved = 0;
        for (const oldLabor of importPlan.picked) {
          const newLaborId = importPlan.oldToNewLaborId.get(oldLabor.id);
          const wds = await workdaysService.list({
            wheres: [["cycleId", "==", oldCycleId], ["laborId", "==", oldLabor.id]],
          });
          for (const w of wds) {
            if (w.payrollId) { skippedPaid += 1; continue; }
            if (!importDaysSet.has(w.date)) continue;
            const target = movedWorkday(w, createdCycleId, newLaborId);
            await workdaysService.upsert(target.id, target.data);
            await workdaysService.remove(w.id);
            moved += 1;
          }
        }
        if (skippedPaid > 0) {
          toast.success(`Se movieron ${moved} workday(s). ${skippedPaid} ya estaban en una nómina y quedaron en el ciclo origen.`);
        } else {
          toast.success(mode === "create" ? "Ciclo creado" : "Ciclo actualizado");
        }
      } else {
        toast.success(mode === "create" ? "Ciclo creado" : "Ciclo actualizado");
      }

      setCycleForm(null);
      await loadCycles(jobId);
    } catch (err) {
      toast.error("Error al guardar el ciclo: " + (err.message || err));
    } finally {
      setBusy(false);
    }
  };

  const openCreateCycle = (jobId, subjobId) => {
    if (!subjobId) {
      toast.warning("Los ciclos se crean dentro de una subfaena. Crea primero una subfaena.");
      return;
    }
    const existing = cyclesByJob[jobId] || [];
    const scope = existing.filter((c) => c.subfaenaId === subjobId);
    const openCandidates = importCandidatesOf(existing, subjobId);

    setCycleForm(withInitial({
      mode: "create",
      jobId,
      data: {
        labelSuffix: `Ciclo ${scope.length + 1}`,
        subfaenaId: subjobId,
        startDate: todayStr(),
        notes: "",
        // Las labores se arman al guardar a partir de estas dos opciones; el
        // tipo se elige en el form.
        laborType: "main",
        withSupervision: false,
        // Importar desde otro ciclo abierto: arranca apagado. Al activarlo
        // queda elegido el más reciente, con todas sus labores y días.
        importCandidates: openCandidates,
        importEnabled: false,
        importSourceId: openCandidates[0]?.id || null,
        importLaborIds: new Set((openCandidates[0]?.labors || []).map((l) => l.id)),
        importDays: new Set((openCandidates[0]?.days || [])),
        importCopyDayPrices: false,
        importMoveWorkdays: false,
      },
    }));
  };

  const openEditCycle = (cycle, jobId) => {
    const prefix = cyclePrefix(jobId, cycle.subfaenaId);
    const suffix = cycleLabelSuffix(cycle.label, prefix);
    setCycleForm(withInitial({
      mode: "edit",
      jobId,
      data: {
        id: cycle.id,
        labelSuffix: suffix,
        subfaenaId: cycle.subfaenaId || "",
        startDate: cycle.startDate || todayStr(),
        notes: cycle.notes || "",
        labors: cycle.labors || defaultLabors(),
        days: cycle.days || [],
        status: cycle.status || "open",
      },
    }));
  };

  const openCloseFlow = (cycle, jobId) => {
    setCloseFlow({ cycle, jobId, askNext: false, copyWorkers: true });
  };

  const confirmCloseCycle = async () => {
    if (!closeFlow) return;
    setBusy(true);
    try {
      await cyclesService.update(closeFlow.cycle.id, closedCyclePatch(closeFlow.cycle));
      setCloseFlow((s) => ({ ...s, askNext: true }));
      await loadCycles(closeFlow.jobId);
    } finally {
      setBusy(false);
    }
  };

  const createNextCycle = async (copy) => {
    if (!closeFlow) return;
    setBusy(true);
    try {
      const prev = closeFlow.cycle;
      const cycles = cyclesByJob[closeFlow.jobId] || [];
      const scope = cycles.filter((c) =>
        prev.subfaenaId ? c.subfaenaId === prev.subfaenaId : !c.subfaenaId,
      );
      const nextNumber = scope.length + 1;
      const prevLabors = prev.labors || defaultLabors(prev.workers || []);
      const newLabors = nextCycleLabors(prevLabors, copy, newId);
      await cyclesService.create({
        faenaId: closeFlow.jobId,
        subfaenaId: prev.subfaenaId || null,
        label: cyclePrefix(closeFlow.jobId, prev.subfaenaId) + `Ciclo ${nextNumber}`,
        startDate: todayStr(),
        notes: "",
        status: "open",
        // Como al crear desde el form, el ciclo nace con un primer día para
        // que la grilla tenga una columna.
        days: [todayStr()],
        labors: newLabors,
      });
      setCloseFlow(null);
      await loadCycles(closeFlow.jobId);
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    if (!confirm) return;
    setConfirm((c) => ({ ...c, busy: true }));
    try {
      try {
      if (confirm.kind === "faena") {
        // Sin caché: los bloqueos y el log de diagnóstico salen de datos frescos.
        cyclesService.invalidate();
        subjobsService.invalidate();
        const subjobs = await subjobsService.list({ wheres: [["faenaId", "==", confirm.item.id]] });
        const cyc = await cyclesService.list({ wheres: [["faenaId", "==", confirm.item.id]] });
        console.log(`[Faena delete] Faena ${confirm.item.id} (${confirm.item.name})`);
        console.log(`  Subfaenas asociadas (${subjobs.length}):`, subjobs.map((s) => ({ id: s.id, name: s.name })));
        console.log(`  Ciclos asociados (${cyc.length}):`, cyc.map((c) => ({ id: c.id, label: c.label, status: c.status, subfaenaId: c.subfaenaId })));

        const blockers = [];
        if (subjobs.length) blockers.push(`${subjobs.length} subfaena(s): ${subjobs.map((s) => s.name).join(", ")}`);
        if (cyc.length) blockers.push(`${cyc.length} ciclo(s): ${cyc.map((c) => c.label).join(", ")}`);

        if (blockers.length) {
          if (!isAdmin) {
            toast.error(`${blockers.join("\n")}\n\n(Pide a un admin para borrado en cascada)`, { title: "No se puede eliminar" });
            setConfirm(null);
            return;
          }
          // La cascada se bloquea si alguna jornada ya forma parte de una
          // nómina: borrarla dejaría la nómina huérfana. Primero hay que
          // eliminar esas nóminas.
          const allCycleWds = [];
          for (const c of cyc) {
            const wds = await workdaysService.list({ wheres: [["cycleId", "==", c.id]] });
            allCycleWds.push(...wds);
          }
          const taggedPayrollIds = [...new Set(allCycleWds.map((w) => w.payrollId).filter(Boolean))];
          if (taggedPayrollIds.length > 0) {
            const payrolls = await Promise.all(
              taggedPayrollIds.map((id) => payrollsService.getById(id).catch(() => null)),
            );
            const names = payrolls
              .filter(Boolean)
              .map((p) => `· ${p.name}${p.status === "paid" ? " (pagada)" : ""}`)
              .join("\n");
            const taggedCount = allCycleWds.filter((w) => w.payrollId).length;
            toast.error(
              `${taggedCount} workday(s) ya forman parte de ${taggedPayrollIds.length} nómina(s):\n` +
                `${names || "(nómina sin nombre)"}\n\n` +
                `Elimina primero esas nóminas y vuelve a intentar.`,
              { title: "No se puede eliminar en cascada" },
            );
            setConfirm(null);
            return;
          }

          const ok = await askCascadeConfirm(
            `Bloqueado por:\n - ${blockers.join("\n - ")}\n\n¿Eliminar TODO en cascada (subfaenas + ciclos + producción)?\nRevisa la consola del navegador para ver los IDs.\nEsta acción no se puede deshacer.`,
          );
          if (!ok) { setConfirm(null); return; }

          // Reusa las jornadas ya leídas arriba para no volver a leerlas.
          const wdsByCycle = new Map();
          for (const w of allCycleWds) {
            if (!wdsByCycle.has(w.cycleId)) wdsByCycle.set(w.cycleId, []);
            wdsByCycle.get(w.cycleId).push(w);
          }
          for (const c of cyc) {
            const wds = wdsByCycle.get(c.id) || [];
            console.log(`  Borrando ciclo ${c.id} (${c.label}) con ${wds.length} workdays`);
            for (const w of wds) await workdaysService.remove(w.id);
            await cyclesService.remove(c.id);
          }
          for (const s of subjobs) {
            console.log(`  Borrando subfaena ${s.id} (${s.name})`);
            await subjobsService.remove(s.id);
          }
        }

        console.log(`  Borrando faena ${confirm.item.id}`);
        await jobsService.remove(confirm.item.id);
        persistOrder(order.filter((id) => id !== confirm.item.id));
        if (selectedId === confirm.item.id) setSelectedId(null);
        await loadJobs();
      } else if (confirm.kind === "sub") {
        await subjobsService.remove(confirm.item.id);
        await loadSubjobs(confirm.item.faenaId);
      } else if (confirm.kind === "cycle") {
        try {
          const wds = await workdaysService.list({
            wheres: [["cycleId", "==", confirm.item.id]],
          });
          if (wds.length) {
            // Antes de proponer la cascada, bloquea si alguna jornada tiene
            // `payrollId`: borrar el ciclo dejaría los `workdayIds` de la
            // nómina apuntando a docs inexistentes, y borrarla, revertirla o
            // marcarla pagada fallaría. Primero hay que eliminar esas nóminas.
            const taggedPayrollIds = [...new Set(wds.map((w) => w.payrollId).filter(Boolean))];
            if (taggedPayrollIds.length > 0) {
              const payrolls = await Promise.all(
                taggedPayrollIds.map((id) => payrollsService.getById(id).catch(() => null)),
              );
              const names = payrolls
                .filter(Boolean)
                .map((p) => `· ${p.name}${p.status === "paid" ? " (pagada)" : ""}`)
                .join("\n");
              const taggedCount = wds.filter((w) => w.payrollId).length;
              toast.error(
                `${taggedCount} workday(s) ya forman parte de ${taggedPayrollIds.length} nómina(s):\n` +
                  `${names || "(nómina sin nombre)"}\n\n` +
                  `Elimina primero esas nóminas y vuelve a intentar.`,
                { title: `No se puede eliminar el ciclo "${confirm.item.label}"` },
              );
              setConfirm(null);
              return;
            }
            if (isAdmin) {
              const ok = await askCascadeConfirm(
                `El ciclo "${confirm.item.label}" tiene ${wds.length} registro(s) de producción.\n\n¿Eliminar TODO en cascada (producción + ciclo)?\nEsta acción no se puede deshacer.`,
              );
              if (!ok) {
                setConfirm(null);
                return;
              }
              for (const w of wds) await workdaysService.remove(w.id);
            } else {
              toast.error(
                `El ciclo tiene ${wds.length} registro(s) de producción. (Pide a un admin para cascada)`,
                { title: "No se puede eliminar" },
              );
              setConfirm(null);
              return;
            }
          }
          await cyclesService.remove(confirm.item.id);
          cyclesService.invalidate();
          await loadCycles(confirm.item.faenaId);
        } catch (err) {
          console.error("Error eliminando ciclo:", err);
          toast.error(`Error al eliminar ciclo: ${err?.message || err}`);
          setConfirm(null);
          return;
        }
      }
      setConfirm(null);
      } catch (err) {
        console.error("Error en eliminación:", err);
        toast.error(`${err?.message || err}\nRevisa la consola para ver el detalle.`, { title: "Error al eliminar" });
        setConfirm(null);
      }
    } finally {
      setConfirm((c) => (c ? { ...c, busy: false } : null));
    }
  };

  const selected = jobs.find((f) => f.id === selectedId);
  const selectedSubjobs = selectedId ? subjobsByJob[selectedId] : null;
  const selectedCycles = selectedId ? cyclesByJob[selectedId] : null;
  const selectedGroupId = selectedId
    ? (layout.faenaGroup[selectedId] && layout.groups.some((g) => g.id === layout.faenaGroup[selectedId])
        ? layout.faenaGroup[selectedId]
        : UNGROUPED_ID)
    : null;

  const renderSelectedDetail = () =>
    selected && (
      <div ref={selectedDetailRef}>
      <SelectedDetail
        selected={selected}
        cardColor={colorOf(selected)}
        subjobs={selectedSubjobs}
        cycles={selectedCycles}
        onCreateSubjob={() => setSubjobForm(withInitial({ mode: "create", jobId: selected.id, data: { ...emptySubjob } }))}
        onEditSubjob={(s) => setSubjobForm(withInitial({ mode: "edit", jobId: selected.id, data: { ...s } }))}
        onDeleteSubjob={(s) => setConfirm({ kind: "sub", item: s, message: `¿Eliminar la subfaena "${s.name}"?` })}
        onToggleHideSubjob={toggleHideSubjob}
        onCreateCycle={(subjobId) => openCreateCycle(selected.id, subjobId || "")}
        onEditCycle={(c) => openEditCycle(c, selected.id)}
        onOpenCloseFlow={(c) => openCloseFlow(c, selected.id)}
        onReopenCycle={async (c) => {
          await cyclesService.update(c.id, { status: "open", endDate: null });
          await loadCycles(selected.id);
        }}
        onDeleteCycle={(c) =>
          setConfirm({
            kind: "cycle",
            item: { ...c, faenaId: selected.id },
            message: `¿Eliminar el ciclo "${c.label}"?`,
          })
        }
        collapsedSubjobs={collapsedSubjobs}
        onToggleSubjobCollapse={toggleSubjobCollapse}
        onCollapseAllSubjobs={() => setCollapsedSubjobs(new Set((selectedSubjobs || []).map((s) => s.id)))}
        onExpandAllSubjobs={() => setCollapsedSubjobs(new Set())}
        showClosedInSubjob={showClosedInSubjob}
        onToggleShowClosed={toggleShowClosed}
      />
      </div>
    );

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Faenas</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Arrastra las tarjetas para reordenarlas o moverlas entre grupos.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setEditLayout((v) => !v)}
            className={`rounded-md border px-3 py-2 text-sm transition-colors ${
              editLayout
                ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                : "border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-accent-soft)]"
            }`}
          >
            {editLayout ? "✓ Listo" : "⚙ Organizar"}
          </button>
          {editLayout && (
            <button
              onClick={addGroup}
              className="rounded-md border border-dashed border-[var(--color-accent)] px-3 py-2 text-sm text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]"
            >
              + Grupo
            </button>
          )}
          <button
            onClick={() => setJobForm(withInitial({ mode: "create", data: { ...emptyJob } }))}
            className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] shadow-sm hover:bg-[var(--color-accent-hover)]"
          >
            + Nueva faena
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-[var(--color-muted)]">Cargando...</div>
      ) : jobs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--color-border)] p-10 text-center text-[var(--color-muted)]">
          No hay faenas. Crea la primera.
        </div>
      ) : (
        <div className="space-y-6">
          {layout.groups.map((g) => {
            const groupJobs = jobsByGroup[g.id] || [];
            // La sección "sin grupo" vacía solo se muestra al organizar.
            if (g.id === UNGROUPED_ID && groupJobs.length === 0 && !editLayout) return null;
            const isDropTarget = dropOverGroupId === g.id;
            return (
              <section
                key={g.id}
                onDragOver={onGroupDragOver(g.id)}
                onDrop={onGroupDrop(g.id)}
                onDragLeave={() => setDropOverGroupId(null)}
                className={`rounded-lg border-2 ${
                  isDropTarget ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]/30" : "border-transparent"
                } transition-colors`}
              >
                <GroupHeader
                  group={g}
                  count={groupJobs.length}
                  editable={editLayout}
                  isUngrouped={g.id === UNGROUPED_ID}
                  collapsed={collapsedGroups.has(g.id)}
                  onToggleCollapsed={() => toggleGroupCollapsed(g.id)}
                  onUpdate={(patch) => updateGroup(g.id, patch)}
                  onRemove={() => removeGroup(g.id)}
                />
                {collapsedGroups.has(g.id) ? null : groupJobs.length === 0 ? (
                  <div className={`rounded-lg border border-dashed border-[var(--color-border)] p-6 text-center text-xs text-[var(--color-muted)] ${editLayout ? "" : "hidden"}`}>
                    Arrastra una tarjeta aquí.
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {groupJobs.map((f) => {
                      const subjobCount = subjobsByJob[f.id]?.length;
                      const cyclesCount = cyclesByJob[f.id]?.length;
                      const isSelected = selectedId === f.id;
                      const cardColor = colorOf(f);
                      return (
                        <Fragment key={f.id}><div
                          draggable
                          onDragStart={onDragStart(f.id)}
                          onDragOver={onDragOver(f.id)}
                          onDragLeave={onDragLeave}
                          onDrop={onDrop(f.id)}
                          onDragEnd={onDragEnd}
                          onClick={() => setSelectedId(isSelected ? null : f.id)}
                          data-dragging={dragId === f.id}
                          data-drop-over={dropOverId === f.id}
                          style={{
                            backgroundColor: "var(--color-surface)",
                            backgroundImage: cardColor ? `linear-gradient(135deg, ${cardColor}1A, transparent 60%)` : undefined,
                            "--card-hover-shadow": cardColor ? `0 4px 14px ${cardColor}33` : "0 4px 14px rgb(0 0 0 / 0.08)",
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.boxShadow = e.currentTarget.style.getPropertyValue("--card-hover-shadow"); }}
                          onMouseLeave={(e) => { e.currentTarget.style.boxShadow = ""; }}
                          className={`dnd-card group relative cursor-pointer rounded-lg border pt-5 px-4 pb-4 shadow-sm transition-all hover:border-[var(--color-border-strong)] ${
                            isSelected
                              ? "border-[var(--color-accent)] ring-2 ring-[var(--color-accent)] ring-offset-2 ring-offset-[var(--color-surface)]"
                              : "border-[var(--color-border)]"
                          }`}
                        >
                          <span
                            aria-hidden
                            className="pointer-events-none absolute inset-x-0 top-0 h-1.5 rounded-t-lg"
                            style={{ backgroundColor: cardColor || "var(--color-border)" }}
                          />
                          <div className="mb-2 flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2 min-w-0">
                              <span className="mt-1 select-none text-[10px] leading-none text-[var(--color-muted)] opacity-30 group-hover:opacity-90 transition-opacity" title="Arrastra para reordenar">⠿</span>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span
                                    aria-hidden
                                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                                    style={{ backgroundColor: cyclesCount > 0 ? "#16a34a" : "var(--color-muted)" }}
                                    title={cyclesCount > 0 ? "Activa" : "Sin ciclos"}
                                  />
                                  <span className="truncate text-[15px] font-semibold leading-tight text-[var(--color-text)]">{f.name}</span>
                                </div>
                                {f.location && <div className="mt-0.5 truncate text-[11px] text-[var(--color-muted)]">{f.location}</div>}
                              </div>
                            </div>
                            <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                              <ColorPickerButton
                                value={layout.faenaColor[f.id] ?? null}
                                onChange={(c) => setJobCardColor(f.id, c)}
                              />
                            </div>
                          </div>
                          {f.notes && <p className="mb-3 line-clamp-2 text-[11px] leading-snug text-[var(--color-muted)]">{f.notes}</p>}
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border)] pt-3 text-xs">
                            <div className="flex flex-wrap gap-1.5">
                              <span className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-muted)]">
                                {subjobCount != null ? `${subjobCount} sub` : "—"}
                              </span>
                              <span
                                className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                                style={
                                  cardColor && cyclesCount > 0
                                    ? { backgroundColor: `${cardColor}22`, color: cardColor }
                                    : cyclesCount > 0
                                      ? { backgroundColor: "var(--color-accent-soft)", color: "var(--color-accent)" }
                                      : { backgroundColor: "var(--color-surface-2)", color: "var(--color-muted)" }
                                }
                              >
                                {cyclesCount != null ? `${cyclesCount} ciclos` : "—"}
                              </span>
                            </div>
                            <div className="ml-auto flex shrink-0 gap-1 opacity-70 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => setJobForm(withInitial({ mode: "edit", data: { ...f } }))}
                                className="rounded-md px-2 py-1 text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
                              >
                                Editar
                              </button>
                              <button
                                onClick={() => setConfirm({ kind: "faena", item: f, message: `¿Eliminar la faena "${f.name}"?` })}
                                className="rounded-md px-2 py-1 text-[var(--color-muted)] hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)]"
                              >
                                Eliminar
                              </button>
                            </div>
                          </div>
                        </div>
                        {isMobile && isSelected && (
                          <div className="col-span-full">
                            {renderSelectedDetail()}
                          </div>
                        )}
                        </Fragment>
                      );
                    })}
                  </div>
                )}
                {!isMobile && !collapsedGroups.has(g.id) && selectedGroupId === g.id && renderSelectedDetail()}
              </section>
            );
          })}
          {!isMobile && selected && !layout.groups.some((g) => g.id === selectedGroupId) && renderSelectedDetail()}
        </div>
      )}

      {/* Modal de faena */}
      <Modal
        open={!!jobForm}
        onClose={() => !busy && setJobForm(null)}
        dirty={!!jobForm && !busy && hasChanges(jobForm.initial, jobForm.data)}
        title={jobForm?.mode === "edit" ? "Editar faena" : "Nueva faena"}
      >
        {jobForm && (
          <form onSubmit={submitJob} className="space-y-4">
            <TextField
              label="Nombre"
              required
              autoFocus
              value={jobForm.data.name}
              onChange={(v) => setJobForm((f) => ({ ...f, data: { ...f.data, name: v } }))}
            />
            <TextField
              label="Ubicación"
              value={jobForm.data.location}
              onChange={(v) => setJobForm((f) => ({ ...f, data: { ...f.data, location: v } }))}
            />
            <TextField
              label="Notas"
              value={jobForm.data.notes}
              onChange={(v) => setJobForm((f) => ({ ...f, data: { ...f.data, notes: v } }))}
            />
            <div className="flex justify-end gap-2 pt-2">
              <ModalCloseButton
                disabled={busy}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
              >
                Cancelar
              </ModalCloseButton>
              <button
                type="submit"
                disabled={busy}
                className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] shadow-sm hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
              >
                {busy ? "..." : "Guardar"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal de subfaena */}
      <Modal
        open={!!subjobForm}
        onClose={() => !busy && setSubjobForm(null)}
        dirty={!!subjobForm && !busy && hasChanges(subjobForm.initial, subjobForm.data)}
        title={subjobForm?.mode === "edit" ? "Editar subfaena" : "Nueva subfaena"}
      >
        {subjobForm && (
          <form onSubmit={submitSubjob} className="space-y-4">
            <TextField
              label="Nombre"
              required
              autoFocus
              value={subjobForm.data.name}
              onChange={(v) => setSubjobForm((s) => ({ ...s, data: { ...s.data, name: v } }))}
            />
            <TextField
              label="Notas"
              value={subjobForm.data.notes}
              onChange={(v) => setSubjobForm((s) => ({ ...s, data: { ...s.data, notes: v } }))}
            />
            <div className="flex justify-end gap-2 pt-2">
              <ModalCloseButton
                disabled={busy}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
              >
                Cancelar
              </ModalCloseButton>
              <button
                type="submit"
                disabled={busy}
                className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] shadow-sm hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
              >
                {busy ? "..." : "Guardar"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal de ciclo */}
      <Modal
        open={!!cycleForm}
        onClose={() => !busy && setCycleForm(null)}
        dirty={!!cycleForm && !busy && hasChanges(cycleForm.initial, cycleForm.data, { ignore: CYCLE_FORM_IGNORE })}
        title={cycleForm?.mode === "edit" ? "Editar ciclo" : "Nuevo ciclo"}
      >
        {cycleForm && (
          <form onSubmit={submitCycle} className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm text-[var(--color-muted)]">
                Etiqueta<span className="ml-0.5 text-[var(--color-danger)]">*</span>
              </span>
              <div className="flex items-stretch overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)]">
                <span className="flex items-center bg-[var(--color-surface)] px-2 text-xs text-[var(--color-muted)] border-r border-[var(--color-border)]">
                  {cyclePrefix(cycleForm.jobId, cycleForm.data.subfaenaId) || "—"}
                </span>
                <input
                  required
                  autoFocus
                  value={cycleForm.data.labelSuffix ?? ""}
                  onChange={(e) => setCycleForm((c) => ({ ...c, data: { ...c.data, labelSuffix: e.target.value } }))}
                  placeholder="Ciclo 1"
                  className="flex-1 bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
                />
              </div>
              <span className="mt-1 block text-[10px] text-[var(--color-muted)]">
                El prefijo Faena/Subfaena/ es fijo
              </span>
            </label>
            {selectedSubjobs && selectedSubjobs.length > 0 && (
              <Select
                label="Subfaena"
                required
                value={cycleForm.data.subfaenaId || ""}
                onChange={(v) => setCycleForm((c) => ({ ...c, data: { ...c.data, subfaenaId: v } }))}
                options={selectedSubjobs.map((s) => ({ value: s.id, label: s.name }))}
                placeholder="Selecciona la subfaena"
              />
            )}
            <TextField
              label="Fecha inicio"
              type="date"
              value={cycleForm.data.startDate}
              onChange={(v) => setCycleForm((c) => ({ ...c, data: { ...c.data, startDate: v } }))}
            />
            <TextField
              label="Notas"
              value={cycleForm.data.notes}
              onChange={(v) => setCycleForm((c) => ({ ...c, data: { ...c.data, notes: v } }))}
            />
            {cycleForm.mode === "create" && !cycleForm.data.importEnabled && (
              <div className="space-y-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
                <Select
                  label="Primera labor"
                  value={cycleForm.data.laborType || "main"}
                  onChange={(v) => setCycleForm((c) => ({ ...c, data: { ...c.data, laborType: v } }))}
                  options={LABOR_TYPES}
                />
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!cycleForm.data.withSupervision}
                    onChange={(e) =>
                      setCycleForm((c) => ({ ...c, data: { ...c.data, withSupervision: e.target.checked } }))
                    }
                    disabled={cycleForm.data.laborType === "supervision"}
                    className="mt-0.5"
                  />
                  <span className={cycleForm.data.laborType === "supervision" ? "text-[var(--color-muted)]" : ""}>
                    Agregar también una labor de Supervisión
                    {cycleForm.data.laborType === "supervision" ? " (ya es la primera)" : ""}
                  </span>
                </label>
              </div>
            )}
            {cycleForm.mode === "create" && (cycleForm.data.importCandidates || []).length > 0 && (
              <ImportSection
                data={cycleForm.data}
                onChange={(patch) =>
                  setCycleForm((c) => ({ ...c, data: { ...c.data, ...patch } }))
                }
              />
            )}
            <p className="text-xs text-[var(--color-muted)]">
              {cycleForm.mode === "create" && cycleForm.data.importEnabled
                ? "Se clonarán las labores marcadas. Si activaste 'Mover jornadas', se transferirán al nuevo ciclo y desaparecerán del origen."
                : cycleForm.mode === "create"
                  ? `El ciclo arranca con la fecha de inicio como primer día y ${
                      cycleForm.data.withSupervision && cycleForm.data.laborType !== "supervision" ? "dos labores" : "una labor"
                    }. Podrás agregar más al abrirlo.`
                  : "Podrás agregar más labores al abrir el ciclo."}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <ModalCloseButton
                disabled={busy}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
              >
                Cancelar
              </ModalCloseButton>
              <button
                type="submit"
                disabled={busy}
                className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] shadow-sm hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
              >
                {busy ? "..." : "Guardar"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Recién creada una subfaena, se ofrece abrirle el primer ciclo. */}
      <Modal
        open={!!subjobOfferCycle}
        onClose={() => setSubjobOfferCycle(null)}
        title="¿Crear el primer ciclo?"
        footer={
          <>
            <button
              onClick={() => setSubjobOfferCycle(null)}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)]"
            >
              Después
            </button>
            <button
              onClick={() => {
                const { jobId, subjobId } = subjobOfferCycle;
                setSubjobOfferCycle(null);
                openCreateCycle(jobId, subjobId);
              }}
              className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]"
            >
              Crear ciclo
            </button>
          </>
        }
      >
        <p className="text-sm">
          La subfaena <strong>{subjobOfferCycle?.name}</strong> ya está creada. Las jornadas se cargan
          dentro de un ciclo, así que sin uno todavía no hay dónde anotar nada.
        </p>
      </Modal>

      {/* Cierre de ciclo */}
      <Modal
        open={!!closeFlow}
        onClose={() => !busy && setCloseFlow(null)}
        title={closeFlow?.askNext ? "¿Crear nuevo ciclo?" : "Cerrar ciclo"}
        footer={
          closeFlow?.askNext ? (
            <>
              <button
                onClick={() => setCloseFlow(null)}
                disabled={busy}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
              >
                No, gracias
              </button>
              <button
                onClick={() => createNextCycle(closeFlow.copyWorkers)}
                disabled={busy}
                className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
              >
                {busy ? "..." : "Crear ciclo"}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setCloseFlow(null)}
                disabled={busy}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                onClick={confirmCloseCycle}
                disabled={busy}
                className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
              >
                {busy ? "..." : "Cerrar ciclo"}
              </button>
            </>
          )
        }
      >
        {closeFlow && !closeFlow.askNext && (
          <p className="text-sm text-[var(--color-muted)]">
            Vas a cerrar <span className="text-[var(--color-text)]">{closeFlow.cycle.label}</span>.
          </p>
        )}
        {closeFlow?.askNext && (
          <div className="space-y-3">
            <p className="text-sm text-[var(--color-muted)]">
              El ciclo fue cerrado. ¿Crear uno nuevo a continuación?
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={closeFlow.copyWorkers}
                onChange={(e) => setCloseFlow((s) => ({ ...s, copyWorkers: e.target.checked }))}
              />
              Copiar trabajadores de cada labor del ciclo anterior
            </label>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        title="Eliminar"
        confirmLabel="Eliminar"
        danger
        message={confirm?.message}
        busy={confirm?.busy}
        onCancel={() => !confirm?.busy && setConfirm(null)}
        onConfirm={doDelete}
      />

      <ConfirmDialog
        open={!!cascadeConfirm}
        title="Eliminar en cascada"
        confirmLabel="Eliminar todo"
        danger
        message={cascadeConfirm?.message || ""}
        onCancel={() => { cascadeConfirm?.resolve(false); setCascadeConfirm(null); }}
        onConfirm={() => { cascadeConfirm?.resolve(true); setCascadeConfirm(null); }}
      />
    </div>
  );
}
