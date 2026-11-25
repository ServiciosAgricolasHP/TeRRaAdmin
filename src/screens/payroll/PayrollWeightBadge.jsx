import { MAX_DOC_BYTES } from "../../utils/docSizes";
import { fmtNumber } from "../../utils/format";

const kb = (bytes) => fmtNumber(Math.round(bytes / 1024));
const pctText = (share) => (share < 0.01 ? "<1%" : `${Math.round(share * 100)}%`);
const TONE = {
  ok: "text-[var(--color-success)]",
  near: "text-[var(--color-warning)] font-semibold",
  over: "text-[var(--color-danger)] font-semibold",
};

// Cuánto pesaría la nómina guardada contra lo que cabe en un documento de
// Firestore (`usePayrollWeight`): verde, amarillo desde el 75% y rojo si no
// cabe. El detalle, al pasar el mouse.
export function PayrollWeightBadge({ weight }) {
  const title =
    `Peso: la nómina pesaría ${kb(weight.payroll)} KB y la cabecera de su JSON ${kb(weight.json)} KB, ` +
    `de ${kb(MAX_DOC_BYTES)} KB que caben en un documento de Firestore. Las jornadas del JSON van aparte y no cuentan.`;
  return (
    <span className={`whitespace-nowrap ${TONE[weight.status]}`} title={title}>
      ⚖ {pctText(weight.share)}
    </span>
  );
}

// El aviso bajo el encabezado cuando la nómina está cerca del límite o no cabe.
export function PayrollWeightNotice({ weight }) {
  if (weight.status === "ok") return null;
  const over = weight.status === "over";
  return (
    <div
      className={`rounded-lg border px-4 py-2 text-sm ${
        over
          ? "border-[var(--color-danger)] bg-[var(--color-danger-soft)] text-[var(--color-danger)]"
          : "border-[var(--color-warning)] bg-[var(--color-warning-soft)] text-[var(--color-warning)]"
      }`}
    >
      {over ? (
        <>
          ⚖ <b>La nómina no cabe:</b> pesaría {kb(weight.bytes)} KB y un documento de Firestore admite {kb(MAX_DOC_BYTES)} KB. Pártela en dos:
          deja ciclos o personas para otra nómina.
        </>
      ) : (
        <>
          ⚖ La nómina pesaría el {pctText(weight.share)} de lo que cabe en un documento de Firestore. Si va a crecer (Recalcular, + Agregar
          persona), conviene partirla: deja ciclos o personas para otra nómina.
        </>
      )}
    </div>
  );
}
