import { useState, useRef, useMemo } from "react";
import { serverTimestamp } from "firebase/firestore";
import { useToast } from "../../contexts/ToastContext";
import { harvestWeightsService } from "../../services";
import { useAuth } from "../../contexts/AuthContext";
import { invertHarvestCodes, mapHarvestCodes } from "../../utils/cosechaCombos";
import Modal, { ModalCloseButton } from "../../components/Modal";
import { hasChanges } from "../../utils/formChanges";
import ConfirmDialog from "../../components/ConfirmDialog";
import { mirrorWeightToWorkdays } from "../../services/harvestSyncService";
import { assignQrCode } from "../../services/qrCodesService";
import { prefixOfCode, suggestFreeCodes, ownerOfCode } from "../../utils/qrCodes";
import { todayKey, TAP } from "./helpers";
import { attempt } from "../../utils/attempt";

// Alta y edición manual de pesajes. `harvestWeights` la escribe la app de
// scan; esto es la vía de excepción para corregir una lectura mala o cargar
// una que no se alcanzó a escanear.
//
// 1. El documento guarda la numeración del scan (`weightProcess`/`weightType`),
//    no la del catálogo: el formulario elige el combo del catálogo y guarda su
//    inversa según el prefijo, con verificación de ida y vuelta, porque un
//    prefijo con remapeo puede no poder representar el combo elegido.
//
// 2. El `rut` que se guarda es el docId del trabajador (el id estable), con el
//    que resuelve la sincronización aunque la persona haya cambiado de cédula.
export function WeightFormModal({ mode, initial, prefixes, workers, catalogs, knownCodes, onClose, onSaved, onWorkersChanged }) {
  const toast = useToast();
  const { displayName } = useAuth();
  const isEdit = mode === "edit";
  const [rut, setRut] = useState(initial?.rut || "");
  const [dateKey, setDateKey] = useState(initial?.dateKey || todayKey());
  const [prefixId, setPrefixId] = useState(initial?.prefix || prefixes[0]?.id || "");
  const [qrPick, setQrPick] = useState(initial?.idQr || "");
  const [busy, setBusy] = useState(false);

  // Asignación de QR sin salir a Gestión QRs. Si el código ya tiene dueño, se
  // pide confirmación antes de quitárselo.
  const [newQr, setNewQr] = useState(null); // null | { code }
  const [confirmTakeover, setConfirmTakeover] = useState(null); // null | { code, from }
  const [justAssigned, setJustAssigned] = useState("");

  // Una persona en la pesa descarga varios envases seguidos: mismo trabajador,
  // mismo día, mismo QR, y lo que cambia es el combo y los kilos. Por eso el
  // quién/cuándo/dónde va arriba una sola vez y cada envase es una fila.
  const [rows, setRows] = useState(() => [
    { uid: 1, x: initial?.x ?? 0, y: initial?.y ?? 0, amount: initial?.amount != null ? String(initial.amount) : "" },
  ]);
  const nextUid = useRef(2);
  // `uid` solo identifica la fila en la pantalla.
  const values = { rut, dateKey, prefixId, qrPick, rows: rows.map((r) => ({ x: r.x, y: r.y, amount: r.amount })) };
  const [baseline] = useState(values);

  const addRow = () => {
    const last = rows[rows.length - 1];
    setRows((rs) => [...rs, { uid: nextUid.current++, x: last?.x ?? 0, y: last?.y ?? 0, amount: "" }]);
  };
  const patchRow = (uid, patch) => setRows((rs) => rs.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));
  const dropRow = (uid) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.uid !== uid) : rs));

  const prefix = prefixes.find((p) => p.id === prefixId) || null;

  const worker = useMemo(
    () => workers.find((w) => w.id === rut) || workers.find((w) => w.rut === rut) || null,
    [workers, rut],
  );

  // El `idQr` del pesaje es el rastro del QR físico escaneado, no la identidad
  // del trabajador: los códigos se reciclan entre temporadas. De quién es el
  // pesaje lo dice `rut`.
  const workerCodes = useMemo(() => {
    const all = (worker?.idQr || []).map((c) => String(c || "").trim().toUpperCase()).filter(Boolean);
    return prefixId ? all.filter((c) => prefixOfCode(c) === prefixId) : all;
  }, [worker, prefixId]);

  // Un pesaje que se está editando conserva el código con el que se guardó
  // aunque ese QR ya esté en manos de otro: borrarlo perdería el rastro.
  const qrOptions = useMemo(() => {
    const original = isEdit && initial?.idQr && rut === initial.rut && prefixId === initial.prefix
      ? [String(initial.idQr).trim().toUpperCase()]
      : [];
    const extra = justAssigned && prefixOfCode(justAssigned) === prefixId ? [justAssigned] : [];
    return [...new Set([...original, ...workerCodes, ...extra])];
  }, [isEdit, initial, rut, prefixId, workerCodes, justAssigned]);

  // Se deriva en el render: al cambiar de trabajador o de prefijo, una
  // selección que ya no está entre las opciones se descarta sola.
  const qrCode = qrOptions.includes(qrPick) ? qrPick : qrOptions.length === 1 ? qrOptions[0] : "";

  const suggestions = useMemo(
    () => (newQr ? suggestFreeCodes(workers, prefixId, knownCodes || new Set()) : []),
    [newQr, workers, prefixId, knownCodes],
  );

  // Verificación de ida y vuelta: si el remapeo del prefijo no puede
  // representar el combo, el pesaje se leería como otra cosa y no se guarda.
  const checked = useMemo(
    () =>
      rows.map((r) => {
        const rawCodes = invertHarvestCodes(prefix, { x: r.x, y: r.y });
        const roundTrip = mapHarvestCodes(prefix, rawCodes);
        return { ...r, rawCodes, ok: roundTrip.x === r.x && roundTrip.y === r.y, qty: Number(r.amount) };
      }),
    [rows, prefix],
  );

  const totalQty = checked.reduce((s, r) => s + (Number.isFinite(r.qty) && r.qty > 0 ? r.qty : 0), 0);

  const assignQr = async (code, fromWorker) => {
    setBusy(true);
    const { error: err } = await attempt(async () => {
      const { released } = await assignQrCode(code, worker, fromWorker);
      setJustAssigned(code);
      setQrPick(code);
      setNewQr(null);
      setConfirmTakeover(null);
      toast.success(
        released.length
          ? `${code} → ${worker.name || worker.id} · ${released.join(", ")} liberado(s)`
          : `${code} → ${worker.name || worker.id}`,
      );
      onWorkersChanged?.();
    });
    if (err) toast.error("No se pudo asignar: " + (err.message || err));
    setBusy(false);
  };

  const requestAssignment = () => {
    const code = String(newQr?.code || "").trim().toUpperCase();
    if (!code) { toast.error("Escribe el código del QR"); return; }
    if (prefixOfCode(code) !== prefixId) {
      toast.error(`Ese código no es del prefijo ${prefixId}. Un QR pertenece a la cosecha que dice su prefijo.`);
      return;
    }
    const currentOwner = ownerOfCode(workers, code);
    if (currentOwner && currentOwner.id === worker.id) { toast.info("Esa persona ya tiene ese QR"); setNewQr(null); return; }
    if (currentOwner) { setConfirmTakeover({ code, from: currentOwner }); return; }
    assignQr(code, null);
  };

  const submit = async () => {
    if (!worker) { toast.error("Elige un trabajador de la lista"); return; }
    if (!prefixId) { toast.error("El prefijo es obligatorio: define cómo se leen la calidad y el envase"); return; }
    if (!dateKey) { toast.error("La fecha es obligatoria"); return; }

    for (const [i, r] of checked.entries()) {
      if (!Number.isFinite(r.qty) || r.qty <= 0) {
        toast.error(`Pesaje ${i + 1}: la cantidad tiene que ser mayor que 0`);
        return;
      }
      if (!r.ok) {
        toast.error(`Pesaje ${i + 1}: el prefijo ${prefixId} tiene un remapeo que no puede representar esa calidad/envase`);
        return;
      }
    }

    setBusy(true);
    const { error: err } = await attempt(async () => {
      for (const r of checked) {
        const payload = {
          rut: worker.id,
          dateKey,
          prefix: prefixId,
          weightProcess: r.rawCodes.weightProcess,
          weightType: r.rawCodes.weightType,
          amount: r.qty,
          idQr: qrCode,
        };
        // `supervisor` y `dateInsert` se escriben solo al crear:
        //  - `supervisor` es quién estuvo en el pesaje; en una carga a mano,
        //    quien la carga. Al editar se conserva el del escaneo; quién editó
        //    queda en el log.
        //  - `dateInsert` es cuándo se creó el registro (la cosecha es
        //    `dateKey`). La app de scan ordena con él los pesajes del día.
        if (isEdit) await harvestWeightsService.update(initial.id, payload);
        else await harvestWeightsService.create({ ...payload, supervisor: displayName, dateInsert: serverTimestamp() });
      }
      toast.success(isEdit ? "Pesaje actualizado" : `${checked.length} pesaje(s) agregado(s)`);

      // El espejo va aparte: si falla, los pesajes ya quedaron guardados y el
      // aviso lo dice.
      const { error: mirrorErr } = await attempt(async () => {
        const newKeys = checked.map((r) => ({ prefixId, rut: worker.id, dateKey, x: r.x, y: r.y }));
        const oldKey = isEdit
          ? { prefixId: initial.prefix, rut: initial.rut, dateKey: initial.dateKey, x: initial.x, y: initial.y }
          : null;
        const mirror = await mirrorWeightToWorkdays(prefixes, oldKey ? [oldKey, ...newKeys] : newKeys);
        if (!mirror) {
          toast.warning(`El prefijo ${prefixId} no tiene ciclo y labor asignados: el pesaje quedó guardado pero no llega a ninguna jornada. Configúralo en Sincronizar cosechas.`);
        } else {
          const parts = [];
          if (mirror.written) parts.push(`${mirror.written} jornada(s) recalculada(s)`);
          if (mirror.removed) parts.push(`${mirror.removed} sin pesajes, eliminada(s)`);
          if (mirror.daysAdded.length) parts.push(`${mirror.daysAdded.length} día(s) agregado(s) al ciclo`);
          if (mirror.workersAdded) parts.push(`${mirror.workersAdded} trabajador(es) agregado(s)`);
          if (parts.length) toast.success("Jornadas al día: " + parts.join(" · "));
          if (mirror.noTarget.length) {
            toast.warning(`Sin ciclo/labor asignado: ${mirror.noTarget.join(", ")} — esos pesajes no llegan a ninguna jornada.`);
          }
          if (mirror.blocked.length) {
            toast.warning(`No se tocaron jornadas ya liquidadas: ${mirror.blocked.join(", ")}. Corrígelas desde la nómina.`);
          }
          if (mirror.unknownRuts.length) {
            toast.warning(`Sin ficha en Trabajadores: ${mirror.unknownRuts.join(", ")} — su jornada no se ve en la grilla.`);
          }
          if (mirror.zeroPriceDays.length) {
            toast.warning(`Sin precio configurado para ${mirror.zeroPriceDays.join(", ")}: esas jornadas quedaron en $0.`);
          }
        }
      });
      if (mirrorErr) toast.warning("El pesaje se guardó, pero no se pudo actualizar la jornada: " + (mirrorErr.message || mirrorErr));

      onSaved(dateKey);
    });
    if (err) toast.error("No se pudo guardar: " + (err.message || err));
    setBusy(false);
  };

  const numSelect = (label, value, onChange, entries) => (
    <label className="block min-w-[9rem] flex-1">
      <span className="mb-1 block text-xs text-[var(--color-muted)]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-2 text-sm"
      >
        {entries.map((e) => (
          <option key={e.value} value={e.value}>{e.label}</option>
        ))}
      </select>
    </label>
  );

  return (
    <>
    <Modal
      open
      onClose={onClose}
      dirty={!busy && hasChanges(baseline, values)}
      title={isEdit ? "Editar pesaje" : "Nuevos pesajes"}
      size="lg"
      footer={
        <>
          <ModalCloseButton className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm">
            Cancelar
          </ModalCloseButton>
          <button
            type="submit"
            form="harvestqr-weight-form"
            disabled={busy}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
          >
            {busy ? "Guardando…" : isEdit ? "Guardar" : `Guardar ${checked.length} pesaje(s)`}
          </button>
        </>
      }
    >
      <form id="harvestqr-weight-form" onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm text-[var(--color-muted)]">
            Trabajador <span className="text-[var(--color-danger)]">*</span>
          </span>
          <input
            type="text"
            value={rut}
            list="harvestqr-workers"
            onChange={(e) => setRut(e.target.value.trim().toUpperCase())}
            placeholder="RUT"
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
          />
          <datalist id="harvestqr-workers">
            {workers.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </datalist>
          <span className={`mt-1 block text-xs ${worker ? "text-[var(--color-muted)]" : "text-[var(--color-danger)]"}`}>
            {worker ? worker.name : rut ? "Ese RUT no está en la lista de trabajadores" : "Escribe el RUT y elige de la lista"}
          </span>
        </label>

        <div className="flex gap-2">
          <label className="block flex-1">
            <span className="mb-1 block text-sm text-[var(--color-muted)]">
              Fecha <span className="text-[var(--color-danger)]">*</span>
            </span>
            <input
              type="date"
              value={dateKey}
              onChange={(e) => setDateKey(e.target.value)}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm"
            />
          </label>
          <label className="block flex-1">
            <span className="mb-1 block text-sm text-[var(--color-muted)]">
              Prefijo <span className="text-[var(--color-danger)]">*</span>
            </span>
            <select
              value={prefixId}
              onChange={(e) => setPrefixId(e.target.value)}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm"
            >
              <option value="">—</option>
              {prefixes.map((p) => (
                <option key={p.id} value={p.id}>{p.id} — {p.label}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm text-[var(--color-muted)]">QR usado</span>
          <select
            value={qrCode}
            onChange={(e) => setQrPick(e.target.value)}
            disabled={qrOptions.length === 0}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 font-mono text-sm disabled:opacity-60"
          >
            <option value="">Sin QR</option>
            {qrOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {worker && prefixId && qrOptions.length === 0 ? (
            <span className="mt-1 block text-xs text-[var(--color-warning,#d97706)]">
              {worker.name || worker.id} no tiene ningún QR del prefijo {prefixId}. El pesaje se guarda igual, pero sin rastro del QR físico.
            </span>
          ) : (
            <span className="mt-1 block text-xs text-[var(--color-muted)]">
              Los códigos se reciclan entre temporadas, así que esto queda como rastro de lo que se escaneó, no como identidad del trabajador.
            </span>
          )}

          {worker && prefixId && (
            newQr ? (
              <span className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  autoFocus
                  value={newQr.code}
                  onChange={(e) => setNewQr({ code: e.target.value.toUpperCase() })}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); requestAssignment(); } }}
                  placeholder={`${prefixId}-0123`}
                  className="w-36 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={requestAssignment}
                  disabled={busy}
                  className={`${TAP} rounded-md bg-[var(--color-accent)] px-2.5 text-xs font-medium text-[var(--color-accent-fg)] disabled:opacity-60`}
                >
                  Asignar
                </button>
                <button
                  type="button"
                  onClick={() => setNewQr(null)}
                  className={`${TAP} rounded-md border border-[var(--color-border)] px-2.5 text-xs`}
                >
                  Cancelar
                </button>
                {suggestions.length > 0 && (
                  <span className="flex w-full flex-wrap items-center gap-1 text-xs text-[var(--color-muted)]">
                    <span>Libres:</span>
                    {suggestions.map((s) => (
                      <button
                        key={s.code}
                        type="button"
                        onClick={() => setNewQr({ code: s.code })}
                        title={
                          s.outOfRange
                            ? "Nadie usó nunca este número en este prefijo — puede que el QR no esté impreso"
                            : s.printed
                              ? "Se usó antes y hoy no es de nadie"
                              : "Nadie lo tiene asignado"
                        }
                        className={`${TAP} rounded-md border px-2 font-mono ${
                          s.printed
                            ? "border-[var(--color-success,#16a34a)] text-[var(--color-success,#16a34a)]"
                            : "border-[var(--color-border)]"
                        }`}
                      >
                        {s.code}{s.outOfRange ? " ?" : ""}
                      </button>
                    ))}
                  </span>
                )}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setNewQr({ code: `${prefixId}-` })}
                className="mt-2 text-xs underline decoration-dotted underline-offset-2 hover:text-[var(--color-accent)]"
              >
                {qrOptions.length === 0 ? `Asignarle un QR de ${prefixId}` : "Asignarle otro QR"}
              </button>
            )
          )}
        </label>

        <div className="space-y-2 rounded-md border border-[var(--color-border)] p-2">
          {checked.map((r, i) => (
            <div key={r.uid} className="space-y-1">
              {!isEdit && (
                <div className="flex items-center justify-between text-xs text-[var(--color-muted)]">
                  <span>Pesaje {i + 1}</span>
                  {rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => dropRow(r.uid)}
                      className={`${TAP} rounded px-2 text-[var(--color-danger)] hover:bg-[var(--color-danger-soft,rgba(220,38,38,0.12))]`}
                    >
                      Quitar
                    </button>
                  )}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {numSelect("Calidad", r.x, (v) => patchRow(r.uid, { x: v }), catalogs.qualities || [])}
                {numSelect("Envase", r.y, (v) => patchRow(r.uid, { y: v }), catalogs.containers || [])}
                <label className="block w-24 flex-none">
                  <span className="mb-1 block text-xs text-[var(--color-muted)]">
                    Cantidad <span className="text-[var(--color-danger)]">*</span>
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    value={r.amount}
                    onChange={(e) => patchRow(r.uid, { amount: e.target.value })}
                    className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-2 text-sm"
                  />
                </label>
              </div>
              {!r.ok && (
                <p className="text-xs text-[var(--color-danger)]">
                  El prefijo {prefixId} traduce los códigos del escáner y esta combinación no se puede representar. Elige otra, u otro prefijo.
                </p>
              )}
            </div>
          ))}

          {!isEdit && (
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={addRow}
                className={`${TAP} rounded-md border border-[var(--color-border)] px-2.5 text-xs hover:bg-[var(--color-accent-soft)]`}
              >
                + Otro pesaje
              </button>
              {totalQty > 0 && (
                <span className="text-xs text-[var(--color-muted)]">
                  Total: {totalQty.toLocaleString("es-CL", { maximumFractionDigits: 2 })}
                </span>
              )}
            </div>
          )}
        </div>

        <p className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2 text-xs text-[var(--color-muted)]">
          Esto escribe los pesajes crudos y recalcula las jornadas del ciclo, creando el día o el trabajador si hacía falta. Firmas como <strong>{displayName}</strong>.
        </p>
      </form>
    </Modal>

    {/* Va DESPUÉS del formulario a propósito: los dos son `Modal` con `z-50`
        fijo y sin portal, así que puesto antes queda tapado por él. */}
    <ConfirmDialog
      open={!!confirmTakeover}
      title="Ese QR ya tiene dueño"
      message={
        confirmTakeover
          ? `${confirmTakeover.code} es de ${confirmTakeover.from.name || confirmTakeover.from.id}.\n\nSi se lo asignas a ${worker?.name || worker?.id}, esa persona se queda sin ese código. Los pesajes que ya lo anotaron no se tocan: siguen siendo de su dueño de entonces, porque se resuelven por RUT.\n\n¿Pasárselo igual?`
          : ""
      }
      confirmLabel="Pasárselo"
      busy={busy}
      onConfirm={() => confirmTakeover && assignQr(confirmTakeover.code, confirmTakeover.from)}
      onCancel={() => setConfirmTakeover(null)}
    />
    </>
  );
}
