import { useState, useEffect } from "react";
import Modal, { ModalCloseButton } from "../../components/Modal";
import { useToast } from "../../contexts/ToastContext";
import { useAuth } from "../../contexts/AuthContext";
import { getCommitmentConfig, DEFAULT_COMMITMENT_CONFIG, saveCommitmentConfig } from "../../services/commitmentsService";
import { enqueueFunctionJob, waitForFunctionJob } from "../../services/functionJobsService";
import { hasChanges } from "../../utils/formChanges";
import { btnCls, primaryCls, labelCls, inputCls } from "./styles";

const OFFSET_CHOICES = [7, 5, 3, 2, 1, 0];

const offsetLabel = (n) => (n === 0 ? "El mismo día" : n === 1 ? "1 día antes" : `${n} días antes`);

export function ConfigModal({ onClose }) {
  const toast = useToast();
  const { user } = useAuth();
  const [config, setConfig] = useState(null);
  const [recipientsText, setRecipientsText] = useState("");
  // La configuración guardada, para avisar si se cierra con cambios.
  const [baseline, setBaseline] = useState(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    let alive = true;
    getCommitmentConfig()
      .then((c) => {
        if (!alive) return;
        setConfig(c);
        setRecipientsText((c.recipients || []).join("\n"));
        setBaseline({ ...c, recipients: c.recipients || [] });
      })
      .catch(() => {
        if (!alive) return;
        setConfig({ ...DEFAULT_COMMITMENT_CONFIG });
        setBaseline({ ...DEFAULT_COMMITMENT_CONFIG });
      });
    return () => {
      alive = false;
    };
  }, []);

  const parsedRecipients = recipientsText.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  const invalid = parsedRecipients.filter((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  const current = config && { ...config, recipients: parsedRecipients };
  const dirty = !busy && !testing && hasChanges(baseline, current);

  const persist = async () => {
    if (invalid.length) throw new Error(`Correo no válido: ${invalid.join(", ")}`);
    await saveCommitmentConfig(current);
    setBaseline(current);
  };

  const save = async () => {
    setBusy(true);
    try {
      await persist();
      toast.success("Avisos guardados");
      onClose();
    } catch (err) {
      toast.error(err.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    try {
      await persist();
      const ref = await enqueueFunctionJob("sendCommitmentDigest", null, user);
      const outcome = await waitForFunctionJob(ref, { timeoutMs: 60_000 });
      if (outcome.status === "done") {
        toast.success(`Correo de prueba enviado a ${(outcome.result?.recipients || []).join(", ")}`);
      } else if (outcome.status === "timeout") {
        toast.error("El backend no respondió. ¿Está desplegada la función?");
      } else {
        toast.error("No se pudo enviar: " + (outcome.error || outcome.status));
      }
    } catch (err) {
      toast.error(err.message || String(err));
    } finally {
      setTesting(false);
    }
  };

  const toggleOffset = (n) =>
    setConfig((c) => {
      const has = c.offsets.includes(n);
      return { ...c, offsets: has ? c.offsets.filter((x) => x !== n) : [...c.offsets, n].sort((a, b) => b - a) };
    });

  return (
    <Modal
      open
      size="md"
      onClose={onClose}
      dirty={dirty}
      title="Avisos por correo"
      footer={
        <>
          <button type="button" className={`${btnCls} mr-auto`} onClick={sendTest} disabled={!config || testing || busy || !parsedRecipients.length}>
            {testing ? "Enviando…" : "📧 Enviar prueba"}
          </button>
          <ModalCloseButton className={btnCls}>Cancelar</ModalCloseButton>
          <button type="button" className={primaryCls} onClick={save} disabled={!config || busy}>
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </>
      }
    >
      {!config ? (
        <div className="py-6 text-center text-sm text-[var(--color-muted)]">Cargando…</div>
      ) : (
        <div className="space-y-4 text-sm">
          <p className="text-[var(--color-muted)]">
            Todos los días a las 8:00 se envía un solo correo con lo que vence en los días marcados. Si no hay nada que avisar, no llega correo.
          </p>
          <div>
            <label className={labelCls}>Destinatarios (uno por línea)</label>
            <textarea rows={3} value={recipientsText} onChange={(e) => setRecipientsText(e.target.value)} className={inputCls} placeholder="nombre@empresa.cl" />
            {invalid.length > 0 && <div className="mt-1 text-xs text-[var(--color-danger)]">No válido: {invalid.join(", ")}</div>}
          </div>
          <div>
            <label className={labelCls}>Avisar</label>
            <div className="flex flex-wrap gap-2">
              {OFFSET_CHOICES.map((n) => (
                <label key={n} className="flex min-h-8 items-center gap-1.5 rounded-md border border-[var(--color-border)] px-2">
                  <input type="checkbox" checked={config.offsets.includes(n)} onChange={() => toggleOffset(n)} />
                  {offsetLabel(n)}
                </label>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={!!config.includeOverdue} onChange={(e) => setConfig((c) => ({ ...c, includeOverdue: e.target.checked }))} />
            Repetir cada día los vencidos que nadie marcó como pagados
          </label>
          <p className="text-xs text-[var(--color-muted)]">
            Cada correo trae además los próximos 7 días, con los aplazados al principio como "ya vencido". Eso por sí solo no genera un correo: llega cuando hay algo que avisar. El de prueba lo trae siempre.
          </p>
          <div>
            <label className={labelCls}>Cuenta que envía (Gmail con contraseña de aplicación)</label>
            <input value={config.sender || ""} onChange={(e) => setConfig((c) => ({ ...c, sender: e.target.value }))} className={inputCls} placeholder="avisos@gmail.com" />
            <div className="mt-1 text-xs text-[var(--color-muted)]">
              La contraseña no se guarda acá: vive como secreto del backend (ver functions/README.md).
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
