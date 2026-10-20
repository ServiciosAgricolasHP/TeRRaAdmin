import { useState, useMemo } from "react";
import Modal from "../../components/Modal";
import { codesToRelease } from "../../utils/qrCodes";

export function AssignQrModal({ code: initialCode, from, workers, busy, onClose, onAssign }) {
  const [code, setCode] = useState(initialCode || "");
  const [rut, setRut] = useState("");
  const worker = useMemo(
    () => workers.find((w) => w.id === rut) || workers.find((w) => w.rut === rut) || null,
    [workers, rut],
  );

  const releasing = useMemo(() => {
    if (!worker) return [];
    const codes = (worker.idQr || []).map((c) => String(c || "").trim().toUpperCase()).filter(Boolean);
    return codesToRelease(codes, String(code || "").trim().toUpperCase());
  }, [worker, code]);

  return (
    <Modal
      open
      onClose={onClose}
      title={from ? `Reasignar ${initialCode}` : "Asignar QR"}
      size="sm"
      footer={
        <>
          <button onClick={onClose} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm">
            Cancelar
          </button>
          <button
            onClick={() => worker && onAssign(code, worker)}
            disabled={busy || !worker || !code.trim()}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
          >
            {busy ? "Guardando…" : "Asignar"}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {from && (
          <p className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2 text-xs text-[var(--color-muted)]">
            Hoy es de <strong>{from.name || from.id}</strong>. Al asignarlo se le quita.
          </p>
        )}
        <label className="block">
          <span className="mb-1 block text-sm text-[var(--color-muted)]">Código</span>
          <input
            type="text"
            value={code}
            disabled={!!from}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="XX-0123"
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 font-mono text-sm outline-none focus:border-[var(--color-accent)] disabled:opacity-60"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-[var(--color-muted)]">Trabajador</span>
          <input
            type="text"
            value={rut}
            list="harvestqr-qr-workers"
            onChange={(e) => setRut(e.target.value.trim().toUpperCase())}
            placeholder="RUT"
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
          />
          <datalist id="harvestqr-qr-workers">
            {workers.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </datalist>
          <span className={`mt-1 block text-xs ${worker ? "text-[var(--color-muted)]" : "text-[var(--color-danger)]"}`}>
            {worker ? worker.name : rut ? "Ese RUT no está en la lista" : "Escribe el RUT y elige de la lista"}
          </span>
        </label>
        {releasing.length > 0 && (
          <p className="rounded-md border border-[var(--color-warning,#d97706)] bg-[var(--color-warning-soft,rgba(217,119,6,0.12))] p-2 text-xs text-[var(--color-warning,#d97706)]">
            {worker.name || worker.id} ya tiene <span className="font-mono">{releasing.join(", ")}</span> de esta
            cosecha. Se lleva un QR por cosecha, así que al asignarle{" "}
            <span className="font-mono">{code.trim().toUpperCase()}</span> {releasing.length > 1 ? "esos vuelven" : "ese vuelve"} al pozo.
            Sus pesajes anteriores no se tocan: siguen siendo suyos por RUT.
          </p>
        )}
      </div>
    </Modal>
  );
}
