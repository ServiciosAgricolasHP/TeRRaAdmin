import { useState } from "react";
import { toTitleName, unshout } from "../../utils/textCase";
import { jobsService, subjobsService } from "../../services";

// Alta y edición de faenas y subfaenas. Crear una subfaena ofrece abrir su
// primer ciclo.
export function useJobForms({ loadJobs, loadSubjobs, order, persistOrder, setBusy, toast }) {
  "use no memo";
  const [jobForm, setJobForm] = useState(null);
  const [subjobForm, setSubjobForm] = useState(null);
  // Subfaena recién creada a la que se le ofrece abrir su primer ciclo.
  const [subjobOfferCycle, setSubjobOfferCycle] = useState(null);

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
  return {
    jobForm,
    setJobForm,
    setSubjobForm,
    setSubjobOfferCycle,
    subjobForm,
    subjobOfferCycle,
    submitJob,
    submitSubjob,
  };
}
