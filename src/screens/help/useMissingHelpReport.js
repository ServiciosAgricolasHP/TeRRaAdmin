import { useState } from "react";
import { helpQuestionsService } from "../../services";
import { useToast } from "../../contexts/ToastContext";
import { attempt } from "../../utils/attempt";

// "Avisar que falta": guarda la pregunta que no encontró su respuesta en la
// ayuda. Escribe solo cuando se toca el botón, una vez por pregunta.
export function useMissingHelpReport({ query, guideId, fromPath }) {
  const toast = useToast();
  const [sent, setSent] = useState({ query: null, status: "idle" });
  const status = sent.query === query ? sent.status : "idle";

  const report = async () => {
    const question = query.trim();
    if (!question || status !== "idle") return;
    setSent({ query, status: "sending" });
    const { error } = await attempt(() =>
      helpQuestionsService.create({ question, guideId: guideId || null, fromPath: fromPath || null }),
    );
    if (error) {
      console.error("[ayuda] guardar la pregunta:", error);
      toast.error("No se pudo guardar la pregunta. Intenta de nuevo.");
      setSent({ query, status: "idle" });
      return;
    }
    setSent({ query, status: "sent" });
  };

  return { status, report };
}
