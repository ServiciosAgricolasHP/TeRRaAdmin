import { useState } from "react";
import Modal, { ModalCloseButton } from "../../components/Modal";
import { ProgressBar } from "../../components/ProgressBar";
import { useCycleDetail } from "./CycleDetailContext";
import { useHarvestImport } from "./importHarvestModal/useHarvestImport";
import { FileStep } from "./importHarvestModal/FileStep";
import { PeopleStep } from "./importHarvestModal/PeopleStep";
import { PreviewStep } from "./importHarvestModal/PreviewStep";

const STEPS = [
  { key: "file", label: "1. Archivo" },
  { key: "people", label: "2. Personas" },
  { key: "preview", label: "3. Revisar" },
];

// Importar la cosecha que entrega la empresa en la labor de cosecha activa,
// en tres pasos (el archivo y sus combos, las personas y la revisión). Es un
// camino aparte de Pesajes QR. Mientras importa muestra el avance y no se
// cierra.
export default function ImportHarvestModal({ onClose }) {
  const { activeLabor, catalogs } = useCycleDetail();
  const h = useHarvestImport({ onDone: onClose });
  const [step, setStep] = useState("file");
  const index = STEPS.findIndex((s) => s.key === step);
  const canNext = step === "file" ? !!h.file && h.rows.length > 0 && h.combosReady : step === "people" ? h.pending === 0 : false;
  const btn = "min-h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-40";
  const primary = "min-h-9 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50";
  return (
    <Modal
      open
      onClose={() => !h.busy && onClose()}
      title={`Importar cosecha · ${activeLabor?.name || ""}`}
      size="xl"
      section="Importar cosecha"
      dirty={!!h.file && !h.busy}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <ModalCloseButton className={btn} disabled={h.busy}>Cancelar</ModalCloseButton>
          <div className="flex gap-2">
            {index > 0 && (
              <button type="button" onClick={() => setStep(STEPS[index - 1].key)} disabled={h.busy} className={btn}>
                ‹ Atrás
              </button>
            )}
            {step !== "preview" ? (
              <button type="button" onClick={() => setStep(STEPS[index + 1].key)} disabled={!canNext} className={primary}>
                Siguiente ›
              </button>
            ) : (
              <button type="button" onClick={h.run} disabled={!h.plan || h.busy || (!h.plan.writes.length && !h.plan.deletes.length)} className={primary}>
                {h.busy ? "Importando…" : "Importar"}
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="mb-3 flex gap-1 text-xs">
        {STEPS.map((s, i) => (
          <span
            key={s.key}
            className={`rounded-full px-2.5 py-1 ${s.key === step ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]" : i < index ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]" : "bg-[var(--color-surface-2)] text-[var(--color-muted)]"}`}
          >
            {s.label}
          </span>
        ))}
      </div>
      {h.progress && (
        <div className="mb-3">
          <ProgressBar label={h.progress.label} done={h.progress.done} total={h.progress.total} />
        </div>
      )}
      {step === "file" && <FileStep h={h} catalogs={catalogs} />}
      {step === "people" && <PeopleStep h={h} />}
      {step === "preview" && <PreviewStep h={h} catalogs={catalogs} />}
    </Modal>
  );
}
