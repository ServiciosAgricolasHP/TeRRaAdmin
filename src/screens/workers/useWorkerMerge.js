import { useMemo, useState } from "react";
import { useToast } from "../../contexts/ToastContext";
import { analyzeWorkerMerge, mergeWorkers } from "../../services/workerMergeService";
import { attempt } from "../../utils/attempt";
import { planWorkerMerge } from "../../utils/workerMerge";

// La palabra que se escribe para confirmar.
export const MERGE_WORD = "unir";

// Lo que se ve en la barra de avance en cada etapa de `mergeWorkers`.
const STAGE_LABELS = {
  check: "Revisando los ciclos…",
  write: "Pasando las jornadas",
  cycles: "Poniendo al día las labores…",
  workers: "Poniendo al día la lista de trabajadores…",
};

// Unir la ficha duplicada `clone` a la que se elija: leer lo que tiene
// (`analyzeWorkerMerge`), lo decidido en cada choque, el plan
// (`planWorkerMerge`, utils/workerMerge.js) y la unión, con su avance.
export function useWorkerMerge({ clone, onDone }) {
  const toast = useToast();
  const [kept, setKept] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState("");
  const [decisions, setDecisions] = useState({});
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);

  const reset = () => {
    setKept(null);
    setAnalysis(null);
    setAnalyzeError("");
    setDecisions({});
    setTyped("");
  };

  const pick = async (w) => {
    reset();
    setKept(w);
    setAnalyzing(true);
    const { value, error } = await attempt(() => analyzeWorkerMerge(clone, w));
    setAnalyzing(false);
    if (error) {
      setAnalyzeError(error.message || String(error));
      return;
    }
    setAnalysis(value);
  };

  const plan = useMemo(
    () => (analysis && kept ? planWorkerMerge({ clone, kept, workdays: analysis.workdays, existing: analysis.existing, cycles: analysis.cycles, decisions }) : null),
    [analysis, kept, clone, decisions],
  );
  const blockers = [
    ...(analysis?.blockers || []),
    ...(plan?.unknown.length ? [`Tiene ${plan.unknown.length} jornada${plan.unknown.length === 1 ? "" : "s"} que no se puede${plan.unknown.length === 1 ? "" : "n"} pasar: avísale a quien mantiene TeRRa.`] : []),
  ];
  const setDecision = (toId, choice) => setDecisions((prev) => ({ ...prev, [toId]: choice }));
  const setAll = (choice) => setDecisions(Object.fromEntries((plan?.conflicts || []).map((c) => [c.toId, choice])));
  const armed = typed.trim().toLowerCase() === MERGE_WORD;
  const canRun = !!plan && blockers.length === 0 && armed && !busy;

  const run = async () => {
    if (!canRun) return;
    setBusy(true);
    const onProgress = ({ stage, done, total }) => setProgress({ label: STAGE_LABELS[stage], done, total });
    const { error } = await attempt(() => mergeWorkers({ clone, kept, analysis, decisions, onProgress }));
    setBusy(false);
    setProgress(null);
    if (error) {
      toast.error("No se pudo unir: " + (error.message || error));
      return;
    }
    const moved = plan.moves.length + plan.conflicts.length;
    toast.success(`Fichas unidas: ${moved} jornada${moved === 1 ? "" : "s"} de ${clone.name} pasaron a ${kept.name}.`);
    onDone();
  };

  return {
    analysis,
    analyzeError,
    analyzing,
    armed,
    blockers,
    busy,
    canRun,
    kept,
    pick,
    plan,
    progress,
    reset,
    run,
    setAll,
    setDecision,
    setTyped,
    typed,
  };
}
