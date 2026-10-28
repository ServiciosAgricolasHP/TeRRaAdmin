import { useState, useEffect } from "react";
import { subjobsService } from "../../services";

// Cómo se ven las subfaenas de la faena elegida: plegadas o no, con o sin sus
// ciclos cerrados (las dos cosas por usuario, en el dispositivo), y ocultas,
// que se guarda en la subfaena y vale para todos.
export function useSubjobDisplay({ loadSubjobs, selectedId, subjobsByJob, toast, user }) {
  "use no memo";
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
  const [processedHidden, setProcessedHidden] = useState(() => new Set());
  const toggleShowClosed = (subjobId) => {
    setShowClosedInSubjob((prev) => {
      const n = new Set(prev);
      if (n.has(subjobId)) n.delete(subjobId); else n.add(subjobId);
      return n;
    });
  };

  // Pliega las subfaenas ocultas al cargarlas, una vez por subfaena y por
  // sesión (ver processedHidden), para respetar las que el usuario expanda.
  const toCollapse = ((selectedId && subjobsByJob[selectedId]) || [])
    .filter((s) => s.hidden && !processedHidden.has(s.id))
    .map((s) => s.id);
  if (toCollapse.length > 0) {
    setProcessedHidden((prev) => new Set([...prev, ...toCollapse]));
    setCollapsedSubjobs((prev) => new Set([...prev, ...toCollapse]));
  }

  // Marca o desmarca una subfaena como oculta. Se guarda en el doc de la
  // subfaena, así que vale para todos los usuarios y dispositivos.
  const toggleHideSubjob = async (subjob) => {
    try {
      await subjobsService.update(subjob.id, { hidden: !subjob.hidden });
      subjobsService.invalidate();
      // Al ocultarla se pliega. Al mostrarla queda como esté, plegada o no.
      if (!subjob.hidden) {
        setCollapsedSubjobs((prev) => new Set(prev).add(subjob.id));
        setProcessedHidden((prev) => new Set(prev).add(subjob.id));
      }
      if (subjob.faenaId) await loadSubjobs(subjob.faenaId);
    } catch (err) {
      toast.error("Error al ocultar/mostrar subfaena: " + (err.message || err));
    }
  };
  return {
    collapsedSubjobs,
    setCollapsedSubjobs,
    showClosedInSubjob,
    toggleHideSubjob,
    toggleShowClosed,
    toggleSubjobCollapse,
  };
}
