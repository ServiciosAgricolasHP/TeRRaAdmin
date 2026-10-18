import { useState, useEffect, useMemo } from "react";
import { useToast } from "../../contexts/ToastContext";
import { qrPrefixesService, harvestWeightsService } from "../../services";
import { workersService } from "../../services/workersService";
import { countedList } from "../../services/cache";
import { useAuth } from "../../contexts/AuthContext";
import { assignQrCode } from "../../services/qrCodesService";
import { codesOfWorker, prefixOfCode } from "../../utils/qrCodes";
import { AssignQrModal } from "./AssignQrModal";
import { BackfillQrModal } from "./BackfillQrModal";
import { WORKERS_TTL_MS, readsLabel, TAP } from "./helpers";
import { TypeToConfirm } from "./TypeToConfirm";

// Gestión de los QR físicos asignados a trabajadores.
//
// No hay catálogo de QRs: el único registro de un código es estar dentro del
// array `idQr` de algún trabajador. Por eso esta vista se arma desde `worker`
// y solo puede mostrar los códigos asignados — un QR impreso que nadie tiene
// todavía es invisible para el sistema.
export function QrManager({ prefixes, onPrefixesChanged }) {
  const { isAdmin } = useAuth();
  const [reads, setReads] = useState(null);
  const toast = useToast();
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(() => new Set());
  const [assigning, setAssigning] = useState(null); // null | { code, from } | { code: "", from: null }
  const [clearing, setClearing] = useState(null); // null | { scope: "prefix"|"all", prefixId?, codes }
  const [backfill, setBackfill] = useState(null); // null | { code, worker, rows }
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      // Mismas opciones que la pestaña de pesajes y que Trabajadores, Nómina y
      // Calendario: comparten clave de caché, así que la primera pantalla que
      // se abre paga y el resto sale de la caché.
      const { data, reads: readCount } = await countedList(workersService, {
        order: ["name", "asc"],
        cache: true,
        persist: true,
        ttl: WORKERS_TTL_MS,
      });
      setWorkers(data);
      setReads(readCount);
    } catch (err) {
      toast.error("No se pudieron cargar los trabajadores: " + (err.message || err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  const prefixLabels = useMemo(
    () => new Map(prefixes.map((p) => [p.id, p.label || p.id])),
    [prefixes],
  );

  // Rehace `qrPrefixes/{PREFIJO}.padron` desde `worker`, que es la fuente de
  // verdad, y reporta en qué diferían.
  //
  // El padrón es un espejo y puede desviarse sin que se note (por ejemplo, si
  // falló la escritura del espejo): los pesajes quedan con el RUT equivocado.
  // Conviene correrlo al abrir cada temporada.
  //
  // No cuesta lecturas de trabajadores: usa la lista ya cargada.
  const rebuildRosters = async () => {
    setBusy(true);
    try {
      const expected = new Map(); // prefijo -> { code: {rut, name} }

      for (const w of workers) {
        for (const code of codesOfWorker(w)) {
          const pfx = prefixOfCode(code);
          if (!pfx) continue;
          if (!expected.has(pfx)) expected.set(pfx, {});
          expected.get(pfx)[code] = { rut: w.id, name: w.name || "" };
        }
      }

      // Los prefijos configurados que quedaron sin ningún código también hay
      // que vaciarlos, o conservarían asignaciones de la temporada pasada.
      for (const p of prefixes) if (!expected.has(p.id)) expected.set(p.id, {});

      let added = 0;
      let removed = 0;
      let changed = 0;

      // `expected` puede traer prefijos de `worker.idQr` sin doc en
      // `qrPrefixes` (la vista los marca "sin prefijo configurado"). `update`
      // usa `updateDoc`, que falla si el doc no existe: esos se saltan y se
      // reportan como huérfanos.
      const knownPrefixes = new Set(prefixes.map((p) => p.id));
      const orphans = [];

      for (const [pfx, codeMap] of expected) {
        if (!knownPrefixes.has(pfx)) { orphans.push(pfx); continue; }
        const currentRoster = prefixes.find((p) => p.id === pfx)?.padron || {};

        for (const [code, info] of Object.entries(codeMap)) {
          if (!currentRoster[code]) added += 1;
          else if (currentRoster[code].rut !== info.rut) changed += 1;
        }
        for (const code of Object.keys(currentRoster)) if (!codeMap[code]) removed += 1;

        // Se escribe el mapa entero, no un merge: el merge nunca borraría los
        // códigos que dejaron de estar asignados.
        await qrPrefixesService.update(pfx, { padron: codeMap });
      }

      const parts = [];
      if (added) parts.push(`${added} agregado(s)`);
      if (removed) parts.push(`${removed} quitado(s)`);
      if (changed) parts.push(`${changed} con otro dueño`);
      if (orphans.length) parts.push(`${orphans.length} sin prefijo configurado: ${orphans.join(", ")}`);

      toast.success(
        parts.length
          ? `Padrones reconstruidos · ${parts.join(" · ")}`
          : "Padrones reconstruidos · ya estaban al día",
      );

      // El diff se calcula contra `prefixes`, que viene del padre: se recarga
      // para que una segunda corrida compare contra los padrones nuevos.
      onPrefixesChanged?.();
    } catch (err) {
      toast.error("No se pudieron reconstruir los padrones: " + (err.message || err));
    } finally {
      setBusy(false);
    }
  };

  const view = useMemo(() => {
    const needle = search.trim().toUpperCase();
    const byPrefix = new Map();
    const owners = new Map(); // código → [trabajadores], para detectar repetidos
    let total = 0;

    for (const w of workers) {
      for (const raw of w.idQr || []) {
        const code = String(raw || "").trim().toUpperCase();
        if (!code) continue;
        total += 1;
        owners.set(code, [...(owners.get(code) || []), w]);
        const pfx = prefixOfCode(code) || "(sin prefijo)";
        if (!byPrefix.has(pfx)) byPrefix.set(pfx, []);
        byPrefix.get(pfx).push({ code, worker: w });
      }
    }

    const duplicated = [...owners.entries()].filter(([, ws]) => ws.length > 1).map(([code]) => code);
    const dupSet = new Set(duplicated);

    // Trabajadores con más de un código de la misma cosecha. Se muestran para
    // limpiarlos: reasignar cualquiera de los dos deja solo ese.
    const multi = [];
    for (const w of workers) {
      const byPfx = new Map();
      for (const raw of w.idQr || []) {
        const code = String(raw || "").trim().toUpperCase();
        const pfx = prefixOfCode(code);
        if (!code || !pfx) continue;
        byPfx.set(pfx, [...(byPfx.get(pfx) || []), code]);
      }
      for (const [pfx, codes] of byPfx) {
        if (codes.length > 1) multi.push({ worker: w, prefix: pfx, codes: codes.sort() });
      }
    }

    const groups = [...byPrefix.entries()]
      .map(([id, items]) => ({
        id,
        label: prefixLabels.get(id) || null,
        known: prefixLabels.has(id),
        total: items.length,
        items: items
          .filter((it) => !needle || it.code.includes(needle) || String(it.worker.name || "").toUpperCase().includes(needle) || String(it.worker.id || "").includes(needle))
          .sort((a, b) => a.code.localeCompare(b.code, "es", { numeric: true })),
      }))
      .sort((a, b) => a.id.localeCompare(b.id));

    return { groups, total, duplicated, dupSet, multi };
  }, [workers, search, prefixLabels]);

  const toggle = (id) => setOpen((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const codesOf = (worker) => (worker.idQr || []).map((c) => String(c || "").trim().toUpperCase()).filter(Boolean);

  // Pesajes del trabajador en el prefijo del código que no tienen `idQr`.
  // Rellenarlo no cambia de quién es ningún pesaje: eso lo dice `rut`.
  //
  // El filtro por prefijo y por "sin código" va en cliente: Firestore no puede
  // consultar por un campo ausente.
  const findLooseWeights = async (worker, code) => {
    const pfx = prefixOfCode(code);
    if (!pfx) return [];
    const keys = [...new Set([worker.id, worker.rut].filter(Boolean))];
    if (keys.length === 0) return [];
    const rows = await harvestWeightsService.list({
      wheres: [keys.length > 1 ? ["rut", "in", keys] : ["rut", "==", keys[0]]],
    });
    return rows.filter((w) => w.prefix === pfx && !String(w.idQr || "").trim());
  };

  const runBackfill = async () => {
    if (!backfill) return;
    setBusy(true);
    setProgress({ done: 0, total: backfill.rows.length });
    try {
      let done = 0;
      for (const row of backfill.rows) {
        await harvestWeightsService.update(row.id, { idQr: backfill.code });
        done += 1;
        setProgress({ done, total: backfill.rows.length });
      }
      toast.success(`${done} pesaje(s) quedaron con ${backfill.code}`);
    } catch (err) {
      toast.error("Se interrumpió a mitad de camino: " + (err.message || err));
    } finally {
      setBusy(false);
      setProgress(null);
      setBackfill(null);
    }
  };

  const unassign = async (code, worker) => {
    setBusy(true);
    try {
      await workersService.update(worker.id, { idQr: codesOf(worker).filter((c) => c !== code) });
      toast.success(`${code} liberado`);
      await load();
    } catch (err) {
      toast.error("No se pudo quitar: " + (err.message || err));
    } finally {
      setBusy(false);
    }
  };

  const assign = async (code, toWorker, fromWorker) => {
    const clean = String(code || "").trim().toUpperCase();
    if (!clean) { toast.error("El código es obligatorio"); return false; }
    if (fromWorker && fromWorker.id === toWorker.id) return true;
    setBusy(true);
    try {
      const { released } = await assignQrCode(clean, toWorker, fromWorker);
      toast.success(
        released.length
          ? `${clean} → ${toWorker.name || toWorker.id} · ${released.join(", ")} liberado(s)`
          : `${clean} → ${toWorker.name || toWorker.id}`,
      );
      await load();
      try {
        const loose = await findLooseWeights(toWorker, clean);
        if (loose.length) setBackfill({ code: clean, worker: toWorker, rows: loose });
      } catch {
        // El QR ya quedó asignado; los sueltos se pueden rellenar reasignando.
      }
      return true;
    } catch (err) {
      toast.error("No se pudo asignar: " + (err.message || err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  // Limpiar hace una actualización por trabajador afectado, sin batch, para
  // que cada borrado quede en el log de auditoría.
  const runClear = async () => {
    if (!clearing) return;
    const codes = new Set(clearing.codes);
    const affected = workers.filter((w) => codesOf(w).some((c) => codes.has(c)));
    setBusy(true);
    setProgress({ done: 0, total: affected.length });
    try {
      let done = 0;
      for (const w of affected) {
        await workersService.update(w.id, { idQr: codesOf(w).filter((c) => !codes.has(c)) });
        done += 1;
        setProgress({ done, total: affected.length });
      }
      toast.success(`${codes.size} QR liberados de ${affected.length} trabajador(es)`);
      setClearing(null);
      await load();
    } catch (err) {
      toast.error("No se pudo completar la limpieza: " + (err.message || err));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  if (loading) return <p className="text-sm text-[var(--color-muted)]">Cargando trabajadores…</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar código, nombre o RUT"
          className="min-w-[200px] flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
        />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[var(--color-muted)]">
            {view.total} QR asignados
            {isAdmin && reads != null ? ` ${readsLabel(reads)}` : ""}
          </span>
          <button
            onClick={() => setAssigning({ code: "", from: null })}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]"
          >
            + Asignar QR
          </button>
          <button
            onClick={() => setClearing({ scope: "all", codes: view.groups.flatMap((g) => g.items.map((i) => i.code)) })}
            disabled={view.total === 0}
            className="rounded-md border border-[var(--color-danger)] px-3 py-1.5 text-sm text-[var(--color-danger)] hover:bg-[var(--color-danger-soft,rgba(220,38,38,0.12))] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Limpiar todos
          </button>

          <button
            onClick={rebuildRosters}
            disabled={busy || loading}
            title="Rehace el espejo que la app de escaneo lee para reconocer los QR sin señal"
            className={`${TAP} rounded-md border border-[var(--color-border)] px-3 text-sm hover:bg-[var(--color-accent-soft)] disabled:cursor-not-allowed disabled:opacity-40`}
          >
            Reconstruir padrones
          </button>
        </div>
      </div>

      {view.duplicated.length > 0 && (
        <p className="rounded-md border border-[var(--color-warning,#d97706)] bg-[var(--color-warning-soft,rgba(217,119,6,0.12))] p-2 text-xs text-[var(--color-warning,#d97706)]">
          ⚠ {view.duplicated.length} código(s) asignados a más de un trabajador: {view.duplicated.join(", ")}. El escáner los va a atribuir al primero que encuentre.
        </p>
      )}

      {view.multi.length > 0 && (
        <div className="rounded-md border border-[var(--color-warning,#d97706)] bg-[var(--color-warning-soft,rgba(217,119,6,0.12))] p-2 text-xs text-[var(--color-warning,#d97706)]">
          ⚠ {view.multi.length} trabajador(es) con más de un QR de la misma cosecha. Reasignarles cualquiera de los dos deja solo ese:
          <ul className="mt-1 space-y-0.5">
            {view.multi.map((m) => (
              <li key={`${m.worker.id}-${m.prefix}`}>
                {m.worker.name || m.worker.id} · <span className="font-mono">{m.codes.join(" + ")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {view.groups.length === 0 ? (
        <p className="rounded-md border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-muted)]">
          Ningún trabajador tiene QR asignados.
        </p>
      ) : (
        view.groups.map((g) => (
          <div key={g.id} className="overflow-hidden rounded-md border border-[var(--color-border)]">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-[var(--color-surface-2)] px-3 py-2">
              <button onClick={() => toggle(g.id)} className="flex min-h-[32px] min-w-0 flex-wrap items-center gap-2 text-left text-sm">
                <span className="text-[var(--color-muted)]">{open.has(g.id) ? "▾" : "▸"}</span>
                <span className="font-mono font-semibold">{g.id}</span>
                {g.label && <span className="truncate text-xs text-[var(--color-muted)]">{g.label}</span>}
                {!g.known && (
                  <span className="rounded-full border border-[var(--color-warning,#d97706)] px-2 py-0.5 text-[11px] text-[var(--color-warning,#d97706)]">
                    sin prefijo configurado
                  </span>
                )}
                <span className="text-xs text-[var(--color-muted)]">{g.total} QR</span>
              </button>
              <button
                onClick={() => setClearing({ scope: "prefix", prefixId: g.id, codes: g.items.map((i) => i.code) })}
                className={`${TAP} rounded-md border border-[var(--color-border)] px-2.5 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger-soft,rgba(220,38,38,0.12))]`}
              >
                Limpiar {g.id}
              </button>
            </div>

            {open.has(g.id) && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
                    <tr>
                      <th className="px-3 py-2">Código</th>
                      <th className="px-3 py-2">Trabajador</th>
                      <th className="px-3 py-2 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {g.items.map((it) => (
                      <tr key={`${it.code}__${it.worker.id}`}>
                        <td className="px-3 py-2 font-mono">
                          {it.code}
                          {view.dupSet.has(it.code) && <span className="ml-1 text-[var(--color-warning,#d97706)]">⚠</span>}
                        </td>
                        <td className="px-3 py-2">
                          <div>{it.worker.name || it.worker.id}</div>
                          <div className="font-mono text-xs text-[var(--color-muted)]">{it.worker.id}</div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => setAssigning({ code: it.code, from: it.worker })}
                              className={`${TAP} rounded-md border border-[var(--color-border)] px-2.5 text-xs hover:bg-[var(--color-accent-soft)]`}
                            >
                              Reasignar
                            </button>
                            <button
                              onClick={() => unassign(it.code, it.worker)}
                              disabled={busy}
                              className={`${TAP} rounded-md border border-[var(--color-border)] px-2.5 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger-soft,rgba(220,38,38,0.12))] disabled:opacity-40`}
                            >
                              Quitar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {g.items.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-3 py-3 text-center text-xs text-[var(--color-muted)]">
                          Ningún código de este prefijo coincide con la búsqueda.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))
      )}

      {assigning && (
        <AssignQrModal
          code={assigning.code}
          from={assigning.from}
          workers={workers}
          busy={busy}
          onClose={() => setAssigning(null)}
          onAssign={async (code, toWorker) => {
            const ok = await assign(code, toWorker, assigning.from);
            if (ok) setAssigning(null);
          }}
        />
      )}

      {backfill && (
        <BackfillQrModal
          code={backfill.code}
          worker={backfill.worker}
          count={backfill.rows.length}
          busy={busy}
          progress={progress}
          onConfirm={runBackfill}
          onCancel={() => setBackfill(null)}
        />
      )}

      {clearing && (
        <TypeToConfirm
          word={clearing.scope === "all" ? "LIMPIAR TODO" : clearing.prefixId}
          title={clearing.scope === "all" ? "Liberar todos los QR" : `Liberar los QR de ${clearing.prefixId}`}
          message={
            clearing.scope === "all"
              ? `Se van a quitar ${clearing.codes.length} código(s) de todos los trabajadores que los tengan. Los QR físicos siguen existiendo, pero dejan de estar asociados a nadie y el escáner no va a poder atribuir sus pesajes.`
              : `Se van a quitar ${clearing.codes.length} código(s) del prefijo ${clearing.prefixId}. Los QR físicos siguen existiendo, pero dejan de estar asociados a nadie.`
          }
          confirmLabel="Liberar"
          busy={busy}
          progress={progress}
          onConfirm={runClear}
          onCancel={() => setClearing(null)}
        />
      )}
    </div>
  );
}
