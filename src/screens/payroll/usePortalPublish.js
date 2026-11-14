import { useState, useEffect } from "react";
import { getPublishedPayrolls, publishPayrollToPortal, unpublishPayrollFromPortal } from "../../services/portalService";
import { attempt } from "../../utils/attempt";
import { errorText } from "../../utils/errorText";

const NONE = [];

const workersText = (n) => `${n} ${n === 1 ? "trabajador" : "trabajadores"}`;
const publishedText = (n) => (n === 1 ? "Hay 1 nómina publicada" : `Hay ${n} nóminas publicadas`);

// Las nóminas publicadas en el portal de trabajadores y los flujos de publicar
// (o actualizar) y retirar una. Se publican varias a la vez.
export function usePortalPublish({ toast, user }) {
  // Las publicadas, de la más nueva a la más vieja (`publishedPayrollsOf`).
  const [published, setPublished] = useState(NONE);
  // La nómina que se pide publicar o retirar, o null.
  const [publishing, setPublishing] = useState(null);
  const [unpublishing, setUnpublishing] = useState(null);
  const [publishBusy, setPublishBusy] = useState(false);

  useEffect(() => {
    getPublishedPayrolls().then(setPublished);
  }, []);

  const publishedIds = new Set(published.map((p) => p.payrollId));

  // Corre un pedido al backend y, si sale bien, relee las publicadas.
  const runJob = async (request, { done, failed, close }) => {
    setPublishBusy(true);
    const { error: err } = await attempt(async () => {
      const outcome = await request();
      if (outcome.status === "done") {
        toast.success(done(outcome.result || {}));
        close();
        setPublished(await getPublishedPayrolls());
      } else if (outcome.status === "timeout") {
        toast.error("El backend no respondió. Pruébalo con el ping de la Consola admin.");
      } else {
        toast.error(outcome.error || failed);
      }
    });
    if (err) toast.error(`${failed} ${errorText(err)}`);
    setPublishBusy(false);
  };

  const runPublish = async () => {
    if (!publishing) return;
    const payrollId = publishing.id;
    await runJob(() => publishPayrollToPortal(payrollId, user), {
      failed: "No se pudo publicar en el portal.",
      close: () => setPublishing(null),
      done: (r) =>
        r.updated
          ? `Actualizada en el portal: ${workersText(r.published ?? 0)}.`
          : `Publicada en el portal: ${workersText(r.published ?? 0)}. ${publishedText(r.payrollCount ?? 1)}.`,
    });
  };

  const runUnpublish = async () => {
    if (!unpublishing) return;
    const payrollId = unpublishing.id;
    await runJob(() => unpublishPayrollFromPortal(payrollId, user), {
      failed: "No se pudo retirar del portal.",
      close: () => setUnpublishing(null),
      done: (r) =>
        `Retirada del portal. ${r.payrollCount ? `${publishedText(r.payrollCount)}.` : "No queda ninguna publicada."}`,
    });
  };

  return {
    published,
    publishedIds,
    publishBusy,
    publishing,
    runPublish,
    runUnpublish,
    setPublishing,
    setUnpublishing,
    unpublishing,
  };
}
