import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useToast } from "../../contexts/ToastContext";
import { cyclesService, harvestWeightsService, workdaysService, qrPrefixesService } from "../../services";
import { findWorkerByRut } from "../../services/workersService";
import { mapHarvestCodes, comboKey, workdayDocId, getDayCombos } from "../../utils/cosechaCombos";
import Modal from "../../components/Modal";
import { nextSyncRange, lastSyncLabel } from "./helpers";
import { ProgressBar } from "./ProgressBar";

export function SyncModal({ prefix, cycle, onClose, onSynced }) {
  const toast = useToast();
  const sugerido = useRef(nextSyncRange(prefix.lastSync)).current;
  const [dateFrom, setDateFrom] = useState(sugerido.from);
  const [dateTo, setDateTo] = useState(sugerido.to);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState(null);

  const run = async () => {
    setBusy(true);
    setResult(null);
    setProgress({ label: "Leyendo el ciclo…" });
    try {
      // `days` y `labors` se reescriben enteros más abajo, así que hay que
      // partir del doc fresco y no de la copia que tiene la pantalla.
      const fresh = prefix.cycleId ? await cyclesService.getById(prefix.cycleId) : null;
      const labor = (fresh?.labors || []).find((l) => l.id === prefix.laborId);
      if (!fresh || !labor) throw new Error("Ciclo/labor vigente no disponible");
      // `healthOf` ya deshabilita el botón, pero el ciclo pudo cerrarse desde
      // otra pantalla después de que esta lo cargó: se revisa el doc fresco.
      if (fresh.status === "closed") {
        throw new Error("El ciclo vigente se cerró. Reapunta el prefijo al ciclo abierto antes de sincronizar.");
      }

      setProgress({ label: "Leyendo pesajes…" });
      const weights = await harvestWeightsService.list({
        wheres: [
          ["prefix", "==", prefix.id],
          ["dateKey", ">=", dateFrom],
          ["dateKey", "<=", dateTo],
        ],
      });

      // Agrupa por (trabajador, día, combo calidad/envase) y suma los kilos.
      // Sin `qualityMap`/`containerMap` el mapeo es identidad: los catálogos
      // usan la misma numeración que la app de escaneo.
      const groups = new Map();
      for (const w of weights) {
        if (!w.rut || !w.dateKey) continue;
        const { x, y } = mapHarvestCodes(prefix, w);
        const ck = comboKey(x, y);
        const gKey = `${w.rut}__${w.dateKey}__${ck}`;
        const g = groups.get(gKey) || { rut: w.rut, dateKey: w.dateKey, x, y, ck, qty: 0 };
        g.qty += Number(w.amount) || 0;
        groups.set(gKey, g);
      }

      // Una lectura de `worker` por RUT distinto, no una por grupo. Da el
      // `workerId` de la jornada y la entrada del trabajador en la labor.
      const workerByRut = new Map();
      const resolveWorker = async (rut) => {
        if (workerByRut.has(rut)) return workerByRut.get(rut);
        const w = await findWorkerByRut(rut);
        workerByRut.set(rut, w);
        return w;
      };
      const rutsToResolve = [...new Set([...groups.values()].map((g) => g.rut))];
      let resolved = 0;
      setProgress({ label: "Buscando trabajadores…", done: 0, total: rutsToResolve.length });
      for (const rut of rutsToResolve) {
        await resolveWorker(rut);
        resolved += 1;
        setProgress({ label: "Buscando trabajadores…", done: resolved, total: rutsToResolve.length });
      }

      // La grilla del ciclo se dibuja con `cycle.days` (columnas) y
      // `labor.workers` (filas): una jornada cuyo día o trabajador no esté en
      // esas listas no tiene celda donde mostrarse. Lo que falte se agrega en
      // una sola actualización del ciclo.
      const neededDays = [...new Set([...groups.values()].map((g) => g.dateKey))];
      const neededRuts = [...new Set([...groups.values()].map((g) => g.rut))];
      const rosterKeys = new Set((labor.workers || []).flatMap((w) => [w.rut, w.id].filter(Boolean)));

      const daysAdded = neededDays.filter((d) => !(fresh.days || []).includes(d)).sort();
      const rutsToAdd = neededRuts.filter((r) => !rosterKeys.has(r));
      // Sin ficha en `worker` no hay con qué armar la entrada de la labor: esos
      // RUT se reportan.
      const unknownRuts = rutsToAdd.filter((r) => !workerByRut.get(r));
      // El `rut` de la entrada es el de `harvestWeights`, no el del doc del
      // trabajador: la grilla arma con ese valor el docId de la jornada para
      // buscar la celda. Se deduplica por id porque dos RUT distintos pueden
      // resolver al mismo trabajador.
      const seenWorkerIds = new Set();
      const workersToAdd = [];
      for (const r of rutsToAdd) {
        const w = workerByRut.get(r);
        if (!w) continue;
        const entryId = w.id || r;
        if (seenWorkerIds.has(entryId) || rosterKeys.has(entryId)) continue;
        seenWorkerIds.add(entryId);
        workersToAdd.push({ id: entryId, rut: r, name: w.name || r });
      }

      if (daysAdded.length || workersToAdd.length) {
        setProgress({ label: "Agregando días y trabajadores al ciclo…" });
        const nextDays = [...(fresh.days || []), ...daysAdded].sort();
        const nextLabor = { ...labor, workers: [...(labor.workers || []), ...workersToAdd] };
        const nextLabors = (fresh.labors || []).map((l) => (l.id === labor.id ? nextLabor : l));
        await cyclesService.update(fresh.id, { days: nextDays, labors: nextLabors });
      }

      // Una jornada ya liquidada no se toca: el upsert hace merge y la dejaría
      // con monto nuevo y el `payrollId` viejo, contando como pagada sin que
      // la diferencia se pague nunca.
      //
      // Se leen por id, en tandas de 25 en paralelo.
      setProgress({ label: "Revisando jornadas ya liquidadas…", done: 0, total: groups.size });
      const claves = [...groups.values()].map((g) => ({
        g,
        docId: workdayDocId(fresh.id, labor.id, g.rut, g.dateKey, g.ck),
      }));
      const bloqueadas = new Set();
      const blocked = [];
      // Guarda cada doc leído para pasárselo a `upsert` como `before`, así el
      // servicio no lo vuelve a leer: una lectura por jornada.
      const yaLeidas = new Map();
      for (let i = 0; i < claves.length; i += 25) {
        const tanda = claves.slice(i, i + 25);
        const docs = await Promise.all(tanda.map((k) => workdaysService.getById(k.docId)));
        docs.forEach((doc, j) => {
          yaLeidas.set(tanda[j].docId, doc ?? null);
          if (!doc?.payrollId) return;
          bloqueadas.add(tanda[j].docId);
          blocked.push(`${tanda[j].g.rut} · ${tanda[j].g.dateKey}`);
        });
        setProgress({ label: "Revisando jornadas ya liquidadas…", done: Math.min(i + 25, claves.length), total: claves.length });
      }

      let written = 0;
      const zeroPriceDays = new Set();
      setProgress({ label: "Escribiendo jornadas…", done: 0, total: groups.size });
      for (const { g, docId } of claves) {
        if (bloqueadas.has(docId)) continue;
        const combos = getDayCombos(fresh.dayPrices, labor.id, g.dateKey, "unit");
        const combo = combos.find((c) => c.key === g.ck) || { price: 0, mode: "unit" };
        const amount = combo.mode === "flat" ? combo.price : g.qty * combo.price;
        if (g.qty > 0 && amount === 0) zeroPriceDays.add(g.dateKey);
        const worker = workerByRut.get(g.rut);
        await workdaysService.upsert(docId, {
          cycleId: fresh.id,
          laborId: labor.id,
          workerRut: g.rut,
          workerId: worker?.id || g.rut,
          date: g.dateKey,
          qualityX: g.x,
          containerY: g.y,
          qty: g.qty,
          amount,
          harvestSynced: true,
          harvestPrefix: prefix.id,
        }, { before: yaLeidas.get(docId) ?? null });
        written++;
        setProgress({ label: "Escribiendo jornadas…", done: written, total: claves.length });
      }

      setProgress({ label: "Guardando el resultado…" });
      await qrPrefixesService.update(prefix.id, {
        lastSync: { at: new Date().toISOString(), days: [...neededDays].sort(), written },
      });

      setResult({
        weightsRead: weights.length,
        groups: groups.size,
        written,
        daysAdded,
        workersAdded: workersToAdd.length,
        unknownRuts,
        blocked,
        zeroPriceDays: [...zeroPriceDays].sort(),
      });
      toast.success(`Sincronizado: ${written} jornada(s) actualizadas desde ${weights.length} pesaje(s)`);
      onSynced?.();
    } catch (err) {
      toast.error("No se pudo sincronizar: " + err.message);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Sincronizar pesajes — ${prefix.id}`} size="sm">
      <div className="space-y-3">
        <p className="text-sm text-[var(--color-muted)]">
          Recalcula y sobreescribe las jornadas de <strong>{cycle?.label || cycle?.name}</strong> en el rango elegido, sumando los pesajes de este prefijo. Los días y trabajadores que falten se agregan al ciclo para que las jornadas sean visibles en la grilla. Se puede repetir sin problema — vuelve a calcular desde cero cada vez.
        </p>
        {lastSyncLabel(prefix.lastSync) && (
          <p className="text-xs text-[var(--color-muted)]">
            Última sincronización: <strong>{lastSyncLabel(prefix.lastSync)}</strong> — el rango de abajo sigue desde ahí.
          </p>
        )}
        <div className="flex gap-2">
          <label className="block flex-1">
            <span className="mb-1 block text-sm text-[var(--color-muted)]">Desde</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm"
            />
          </label>
          <label className="block flex-1">
            <span className="mb-1 block text-sm text-[var(--color-muted)]">Hasta</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm"
            />
          </label>
        </div>
        {busy && progress && <ProgressBar label={progress.label} done={progress.done} total={progress.total} />}

        {result && (
          <div className="space-y-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-sm">
            <div>Pesajes leídos: {result.weightsRead}</div>
            <div>Combinaciones trabajador/día: {result.groups}</div>
            <div>Jornadas escritas: {result.written}</div>
            {result.daysAdded.length > 0 && (
              <div>Días agregados al ciclo: {result.daysAdded.length} ({result.daysAdded.join(", ")})</div>
            )}
            {result.workersAdded > 0 && <div>Trabajadores agregados a la labor: {result.workersAdded}</div>}
            {result.unknownRuts.length > 0 && (
              <div className="text-[var(--color-danger)]">
                ⚠ Sin ficha en Trabajadores: {result.unknownRuts.join(", ")} — sus jornadas quedan invisibles hasta que los crees y vuelvas a sincronizar.
              </div>
            )}
            {result.blocked.length > 0 && (
              <div className="text-[var(--color-warning,#d97706)]">
                ⚠ No se tocaron {result.blocked.length} jornada(s) ya liquidadas: {result.blocked.join(", ")}. Si el pesaje cambió, la diferencia hay que corregirla desde la nómina que las pagó.
              </div>
            )}
            {result.zeroPriceDays.length > 0 && (
              <div className="text-[var(--color-warning,#d97706)]">
                ⚠ Días sin precio para ese combo: {result.zeroPriceDays.join(", ")} — esas jornadas quedaron en $0. Configura el precio en el ciclo y vuelve a sincronizar.
              </div>
            )}
            {cycle?.id && (
              <Link
                to={`/cycles/${cycle.id}`}
                className="mt-2 inline-block rounded-md border border-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]"
              >
                Ir a {cycle.label || cycle.name || "el ciclo"} →
              </Link>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm">
            Cerrar
          </button>
          <button
            onClick={run}
            disabled={busy}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
          >
            {busy ? "Sincronizando…" : "Sincronizar"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
