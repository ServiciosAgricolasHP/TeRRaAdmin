import { useEffect, useState } from "react";
import Modal, { ModalCloseButton } from "../../components/Modal";
import { getEmploymentConfig, saveEmploymentConfig } from "../../services/feeListsService";
import { feeAmounts } from "../../utils/employment";
import { fmtCurrency } from "../../utils/format";

const inputCls =
  "w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";

// La tarifa líquida por día y la retención con que se generan las listas de
// honorarios (`employmentConfig/main`). Una lista ya guardada conserva las
// suyas.
export default function FeeConfigModal({ onClose }) {
  const [dailyNet, setDailyNet] = useState("");
  const [ratePct, setRatePct] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getEmploymentConfig()
      .then((c) => {
        setDailyNet(String(c.feeDailyNet));
        setRatePct(String(Math.round(c.feeWithholdingRate * 10000) / 100));
      })
      .catch((e) => setError(e.message || String(e)));
  }, []);

  const net = Number(dailyNet) || 0;
  const rate = (Number(String(ratePct).replace(",", ".")) || 0) / 100;
  const sample = feeAmounts(1, net, rate);

  const save = async () => {
    if (net <= 0 || rate < 0 || rate >= 1) return setError("Revisa la tarifa y la retención.");
    setBusy(true);
    try {
      await saveEmploymentConfig({ feeDailyNet: net, feeWithholdingRate: rate });
      onClose();
    } catch (e) {
      setError(e.message || "No se pudo guardar.");
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title="Tarifa de honorarios"
      size="sm"
      footer={
        <>
          <ModalCloseButton disabled={busy} className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm">
            Cancelar
          </ModalCloseButton>
          <button type="button" onClick={save} disabled={busy} className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] disabled:opacity-60">
            Guardar
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm text-[var(--color-muted)]">Líquido por día</span>
          <input type="number" min="0" value={dailyNet} onChange={(e) => setDailyNet(e.target.value)} className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-[var(--color-muted)]">Retención de la boleta (%)</span>
          <input inputMode="decimal" value={ratePct} onChange={(e) => setRatePct(e.target.value)} className={inputCls} />
        </label>
        <p className="text-xs text-[var(--color-muted)]">
          Un día: {fmtCurrency(sample.gross)} bruto, {fmtCurrency(sample.withholding)} de retención y {fmtCurrency(sample.net)} líquido. Las listas ya guardadas conservan su tarifa.
        </p>
        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
      </div>
    </Modal>
  );
}
