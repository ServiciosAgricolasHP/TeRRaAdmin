import { useState, useEffect } from "react";
import { subjobsService } from "../../services";
import { attempt } from "../../utils/attempt";
import { readStoredJson, writeStoredJson } from "../../utils/browserStorage";

// Los ids guardados en el dispositivo; vacío si no hay o no es una lista.
function storedSet(key) {
  const ids = readStoredJson(key, []);
  return new Set(Array.isArray(ids) ? ids : []);
}

// Cómo se ven las subfaenas de la faena elegida: plegadas o no, con o sin sus
// ciclos cerrados (las dos cosas por usuario, en el dispositivo), y ocultas,
// que se guarda en la subfaena y vale para todos.
export function useSubjobDisplay({ loadSubjobs, selectedId, subjobsByJob, toast, user }) {
  // ---------------- Subfaenas plegadas / ciclos cerrados ----------------
  // Guardado por usuario en localStorage. Las subfaenas arrancan expandidas;
  // los ciclos cerrados, ocultos cuando hay abiertos al lado (se muestran
  // con "Ver N cerrados").
  const collapsedSubjobsKey = `af.collapsedSubs.${user?.uid || "anon"}`;
  const [collapsedSubjobs, setCollapsedSubjobs] = useState(() => storedSet(collapsedSubjobsKey));
  useEffect(() => {
    writeStoredJson(collapsedSubjobsKey, [...collapsedSubjobs]);
  }, [collapsedSubjobs, collapsedSubjobsKey]);

  const showClosedKey = `af.showClosedInSub.${user?.uid || "anon"}`;
  const [showClosedInSubjob, setShowClosedInSubjob] = useState(() => storedSet(showClosedKey));
  useEffect(() => {
    writeStoredJson(showClosedKey, [...showClosedInSubjob]);
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
    const { error: err } = await attempt(async () => {
      await subjobsService.update(subjob.id, { hidden: !subjob.hidden });
      // Al ocultarla se pliega. Al mostrarla queda como esté, plegada o no.
      if (!subjob.hidden) {
        setCollapsedSubjobs((prev) => new Set(prev).add(subjob.id));
        setProcessedHidden((prev) => new Set(prev).add(subjob.id));
      }
      if (subjob.faenaId) await loadSubjobs(subjob.faenaId);
    });
    if (err) toast.error("Error al ocultar/mostrar subfaena: " + (err.message || err));
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
