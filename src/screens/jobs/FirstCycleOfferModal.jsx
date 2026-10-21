import Modal from "../../components/Modal";

// Recién creada una subfaena, ofrece abrirle el primer ciclo: sin uno no
// hay dónde anotar jornadas.
export function FirstCycleOfferModal({ openCreateCycle, setSubjobOfferCycle, subjobOfferCycle }) {
  "use no memo";
  return (
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
  );
}
