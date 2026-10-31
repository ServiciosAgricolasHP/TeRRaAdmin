import { useState } from "react";
import {
  advancesService,
  ADVANCE_TYPES,
  normalizeAdvanceType,
  advanceTypeMeta,
  advanceMatchesWorker,
  computeCuotaAmount,
  cadenceMeta,
  INSTALLMENT_CADENCES,
} from "../../services/advancesService";
import { logsService } from "../../services";
import { formatRutForDisplay } from "../../utils/rutUtils";
import ConfirmDialog from "../../components/ConfirmDialog";
import WorkerSearchPicker from "../../components/WorkerSearchPicker";
import Modal, { ModalCloseButton } from "../../components/Modal";
import { hasChanges } from "../../utils/formChanges";
import { useToast } from "../../contexts/ToastContext";
import { toTitleName } from "../../utils/textCase";
import { fmtCurrency } from "../../utils/format";
import { localIsoDate } from "../../utils/dates";
import { attempt } from "../../utils/attempt";
import { useValuesChanged } from "../../hooks/useValuesChanged";

const todayStr = () => localIsoDate();

// Al crear, un movimiento pendiente del mismo trabajador y por el mismo monto
// se avisa como posible duplicado, con quién lo puso. No se bloquea.
const PENDING_STATUSES = ["pending", "partial"];

// El formulario de un anticipo o bono tal como se abre: vacío o con lo guardado.
function advanceForm(item) {
  return {
    type: normalizeAdvanceType(item?.type) || "anticipo",
    workerRut: item?.workerRut || "",
    // `workerId` es el id del trabajador, que no cambia; sin ese campo,
    // usa `workerRut`.
    workerId: item?.workerId || item?.workerRut || "",
    workerName: item?.workerName || "",
    amount: item?.amount || 0,
    date: item?.date || todayStr(),
    note: item?.note || "",
    useInstallments: !!item?.installments?.count,
    installmentCount: Number(item?.installments?.count) || 2,
    installmentCadence: item?.installments?.cadence || "porPago",
  };
}

export default function AdvanceFormModal({ open, item, items = [], onClose, onSaved }) {
  const toast = useToast();
  const isEdit = item?.mode === "edit";
  // Con pagos aplicados no se cambia el trabajador ni el tipo, y el monto no
  // baja de lo ya pagado. Bajarlo a `amountPaid` cierra el anticipo (status
  // "applied") y perdona el saldo.
  const amountPaid = Number(item?.amountPaid) || 0;
  const isPartial = isEdit && (item?.status === "partial" || amountPaid > 0);
  const [form, setForm] = useState({
    type: "anticipo",
    workerRut: "",
    workerId: "",
    workerName: "",
    amount: 0,
    date: todayStr(),
    note: "",
    useInstallments: false,
    installmentCount: 2,
    installmentCadence: "porPago",
  });
  const [busy, setBusy] = useState(false);
  // Con el buscador abierto se elige a otra persona.
  const [pickerOpen, setPickerOpen] = useState(false);

  if (useValuesChanged([open, item], { onMount: true }) && open) {
    setForm(advanceForm(item));
    setPickerOpen(false);
  }

  const [dupConfirm, setDupConfirm] = useState(null);

  const doSave = async (newAmount) => {
    setBusy(true);
    const { error: err } = await attempt(async () => {
      // Con pagos aplicados, el estado se recalcula: si el monto queda en lo
      // pagado o menos, "applied" (saldo perdonado); si no, "partial".
      let status = item?.status || "pending";
      if (isPartial) {
        status = newAmount <= amountPaid ? "applied" : "partial";
      }
      const data = {
        type: form.type,
        workerRut: form.workerRut,
        workerId: form.workerId || form.workerRut,
        workerName: form.workerName,
        amount: newAmount,
        date: form.date,
        // La nota de un anticipo o bono va como título ("Bono Producción Octubre").
        note: toTitleName(form.note || ""),
        status,
      };
      if (!isEdit) {
        // Plan de cuotas: se fija solo al crear, nunca en edición.
        data.installments = (form.type === "anticipo" && form.useInstallments)
          ? { count: Math.floor(form.installmentCount), amount: computeCuotaAmount(newAmount, form.installmentCount), cadence: form.installmentCadence }
          : null;
      } else if (item?.installments && !isPartial && newAmount !== (Number(item.amount) || 0)) {
        // El plan no se edita, pero si cambia el monto de un anticipo sin
        // pagos, la cuota se recalcula para que calce con el nuevo total.
        data.installments = { ...item.installments, amount: computeCuotaAmount(newAmount, item.installments.count) };
      }
      if (isEdit) await advancesService.update(item.id, data);
      else await advancesService.create(data);
      setDupConfirm(null);
      onSaved();
    });
    setBusy(false);
    if (err) throw err;
  };

  const submit = async () => {
    if (!form.workerRut) { toast.warning("Selecciona un trabajador."); return; }
    if (!form.amount || form.amount <= 0) { toast.warning("Monto debe ser mayor a 0."); return; }
    const newAmount = Math.round(Number(form.amount) || 0);
    if (isPartial && newAmount < amountPaid) {
      { toast.warning(`El monto no puede ser menor a lo ya pagado (${fmtCurrency(amountPaid)}). Si quieres cerrar el saldo, déjalo igual a ${fmtCurrency(amountPaid)}.`); return; }
    }
    if (!isEdit && form.type === "anticipo" && form.useInstallments) {
      const n = Math.floor(Number(form.installmentCount) || 0);
      if (n < 2) { toast.warning("El plan de cuotas necesita al menos 2 cuotas."); return; }
      if (n > 60) { toast.warning("Máximo 60 cuotas."); return; }
    }

    if (isEdit) { await doSave(newAmount); return; }

    const keys = new Set([form.workerId || form.workerRut, form.workerRut].filter(Boolean));
    const dupes = items.filter(
      (a) =>
        advanceMatchesWorker(a, keys) &&
        (Number(a.amount) || 0) === newAmount &&
        PENDING_STATUSES.includes(a.status || "pending"),
    );
    if (dupes.length === 0) { await doSave(newAmount); return; }

    // El email de quien lo creó no está en el doc del anticipo (solo el uid);
    // sale del log, que se puede pedir por trabajador. Si no se puede leer, el
    // aviso sale igual, sin decir quién lo creó.
    const byId = new Map();
    await attempt(async () => {
      const chunks = await Promise.all(
        [...keys].map((k) =>
          logsService.list({ wheres: [["entity", "==", "advance"], ["meta.workerRut", "==", k]] }).catch(() => []),
        ),
      );
      for (const row of chunks.flat()) {
        if (row.action === "create" && row.entityId) byId.set(row.entityId, row.email || row.uid);
      }
    });

    const lineas = dupes.map((d) => {
      const meta = advanceTypeMeta(d.type);
      const quien = byId.get(d.id);
      return `${meta.icon} ${meta.label} · ${fmtCurrency(d.amount)} · ${d.date}${quien ? ` · puesto por ${quien}` : ""}`;
    });
    setDupConfirm({
      amount: newAmount,
      message: `${form.workerName || form.workerRut} ya tiene ${dupes.length === 1 ? "un movimiento pendiente" : `${dupes.length} movimientos pendientes`} por el mismo monto:\n\n${lineas.join("\n")}\n\n¿Crear igual?`,
    });
  };

  if (!open) return null;

  // El tipo es el del botón con que se abrió (anticipo o bono): cambiarlo sin
  // escribir nada más no es un cambio que se pierda.
  const dirty = !busy && hasChanges(advanceForm(item), form, { ignore: isEdit ? [] : ["type"] });

  return (
    <>
    <Modal
      open={open}
      onClose={onClose}
      dirty={dirty}
      title={`${isEdit ? "Editar" : "Nuevo"} ${advanceTypeMeta(form.type).label.toLowerCase()}`}
      size="md"
      footer={
        <>
          <ModalCloseButton className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm">
            Cancelar
          </ModalCloseButton>
          <button
            onClick={submit}
            disabled={busy}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] disabled:opacity-50"
          >
            {busy ? "Guardando..." : "Guardar"}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {isPartial && (
          <div className="rounded-md border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-3 py-2 text-xs text-[var(--color-accent)]">
            <div className="font-semibold">Anticipo parcialmente aplicado</div>
            <div className="mt-0.5 opacity-90">
              Pagado: <span className="font-mono">{fmtCurrency(amountPaid)}</span>
              {" · "}
              Resta: <span className="font-mono">{fmtCurrency(Math.max(0, (Number(item?.amount) || 0) - amountPaid))}</span>
            </div>
            <div className="mt-1 opacity-80">
              Puedes bajar el monto hasta <span className="font-mono">{fmtCurrency(amountPaid)}</span> para perdonar el saldo (queda cerrado).
              No se puede cambiar el trabajador ni el tipo.
            </div>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-muted)]">Tipo</label>
          <div className={`flex gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-1 text-sm ${isPartial ? "opacity-60" : ""}`}>
            {ADVANCE_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                disabled={isPartial}
                onClick={() => !isPartial && setForm((f) => ({
                  ...f,
                  type: t.value,
                  useInstallments: t.value === "anticipo" && f.useInstallments,
                }))}
                className={`flex-1 rounded px-3 py-1 ${
                  form.type === t.value ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]" : "text-[var(--color-muted)]"
                } disabled:cursor-not-allowed`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-muted)]">Trabajador</label>
          {form.workerRut && !pickerOpen ? (
            <div className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm">
              <span>
                <span className="font-medium">{form.workerName}</span>
                <span className="ml-2 font-mono text-xs text-[var(--color-muted)]">{formatRutForDisplay(form.workerRut)}</span>
              </span>
              {!isPartial && (
                <button
                  onClick={() => setPickerOpen(true)}
                  className="text-xs text-[var(--color-accent)]"
                >
                  Cambiar
                </button>
              )}
            </div>
          ) : (
            <WorkerSearchPicker
              autoFocus
              onPick={(w) => {
                setForm((f) => ({ ...f, workerRut: w.rut || w.id, workerId: w.id, workerName: w.name }));
                setPickerOpen(false);
              }}
            />
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-muted)]">Monto</label>
            <input
              type="number"
              value={form.amount || ""}
              placeholder="0"
              onChange={(e) => setForm((f) => ({ ...f, amount: Number(e.target.value) || 0 }))}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-muted)]">Fecha</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
            />
          </div>
        </div>

        {form.type === "anticipo" && !isEdit && (
          <div className="rounded-md border border-[var(--color-border)] p-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.useInstallments}
                onChange={(e) => setForm((f) => ({ ...f, useInstallments: e.target.checked }))}
              />
              <span className="font-medium">Descontar en cuotas</span>
            </label>
            {form.useInstallments && (
              <div className="mt-2 grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--color-muted)]">N° de cuotas</label>
                  <input
                    type="number"
                    min={2}
                    max={60}
                    value={form.installmentCount}
                    onChange={(e) => setForm((f) => ({ ...f, installmentCount: Number(e.target.value) || 2 }))}
                    className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--color-muted)]">Frecuencia</label>
                  <select
                    value={form.installmentCadence}
                    onChange={(e) => setForm((f) => ({ ...f, installmentCadence: e.target.value }))}
                    className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
                  >
                    {INSTALLMENT_CADENCES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                {form.amount > 0 && form.installmentCount >= 2 && (
                  <div className="col-span-2 text-xs text-[var(--color-muted)]">
                    {form.installmentCount} cuotas de {fmtCurrency(computeCuotaAmount(form.amount, form.installmentCount))}
                    {computeCuotaAmount(form.amount, form.installmentCount) * form.installmentCount !== Math.round(Number(form.amount) || 0)
                      ? " · la última cuota se ajusta al saldo"
                      : ""}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {form.type === "anticipo" && isEdit && item?.installments && (
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-xs">
            <div className="font-medium text-[var(--color-text)]">
              Plan de cuotas: {item.installments.count} de {fmtCurrency(item.installments.amount)} · {cadenceMeta(item.installments.cadence).label}
            </div>
            <div className="mt-1 text-[var(--color-muted)]">
              El plan no se edita. Para cambiarlo, elimina y vuelve a crear el anticipo (solo mientras sigue pendiente).
            </div>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-muted)]">Nota (opcional)</label>
          <input
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            placeholder="Motivo, referencia..."
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
          />
        </div>
      </div>
    </Modal>

    {/* Va después del formulario: los dos son `Modal`, con `z-50` y sin
        portal, y con el mismo z-index queda encima el último del DOM. */}
    <ConfirmDialog
      open={!!dupConfirm}
      title="Puede estar duplicado"
      message={dupConfirm?.message || ""}
      confirmLabel="Crear igual"
      busy={busy}
      onConfirm={() => dupConfirm && doSave(dupConfirm.amount)}
      onCancel={() => setDupConfirm(null)}
    />
    </>
  );
}
