import { useState, useEffect } from "react";
import { getPublishedPortal, publishPayrollToPortal } from "../../services/portalService";

// La nómina publicada en el portal de trabajadores y el flujo de publicar otra,
// que reemplaza a la publicada.
export function usePortalPublish({ toast, user }) {
  "use no memo";
  // Cabecera de la nómina publicada en el portal de trabajadores.
  const [portal, setPortal] = useState(null);
  const [publishing, setPublishing] = useState(null);
  const [publishBusy, setPublishBusy] = useState(false);

  useEffect(() => {
    getPublishedPortal().then(setPortal);
  }, []);

  // Publica la nómina elegida en el portal de trabajadores; reemplaza la que
  // estaba publicada.
  const runPublish = async () => {
    if (!publishing) return;
    setPublishBusy(true);
    try {
      const outcome = await publishPayrollToPortal(publishing.id, user);
      if (outcome.status === "done") {
        toast.success(`Publicada en el portal: ${outcome.result?.published ?? 0} trabajador(es)`);
        setPublishing(null);
        setPortal(await getPublishedPortal());
      } else if (outcome.status === "timeout") {
        toast.error("El backend no respondió. Pruébalo con el ping de la Consola admin.");
      } else {
        toast.error(outcome.error || "No se pudo publicar en el portal.");
      }
    } catch (err) {
      toast.error(err?.message || String(err));
    } finally {
      setPublishBusy(false);
    }
  };
  return {
    portal,
    publishBusy,
    publishing,
    runPublish,
    setPublishing,
  };
}
