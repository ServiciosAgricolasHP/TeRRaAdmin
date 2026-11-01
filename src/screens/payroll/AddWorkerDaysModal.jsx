import { useState, useRef, useMemo, useEffect, useEffectEvent } from "react";
import { workdaysService } from "../../services";
import { listPendingForWorkers } from "../../services/advancesService";
import { workerKeys } from "../../services/workersService";
import { formatRutForDisplay } from "../../utils/rutUtils";
import { workerSearchInput } from "../../utils/workerSearch";
import { getTratoTierTotals } from "../../utils/cosechaCombos";
import { useCatalogs } from "../../contexts/CatalogsContext";
import { inChosenCycles, workerDayRows, asPayrollWorker, planAddWorkdays } from "../../utils/payrollItem";
import Modal from "../../components/Modal";
import { matchesSearchQuery } from "../../utils/textSearch";
import { fmtCurrency } from "../../utils/format";
import { formatWorkerDetailProd, workerDetailDateLabel } from "./workerDetailLabels";
import { attempt } from "../../utils/attempt";

// Dígitos (y la K) de un RUT, para buscar sin puntos ni guion.
function rutDigits(s) {
  return String(s || "").replace(/[^0-9kK]/g, "").toLowerCase();
}

// Agregar a una persona puntual: se la busca, se cargan sus días de los
// ciclos abiertos —de cualquier faena, estén o no en la nómina— y se elige
// cuáles se le suman. Los días que ya están en una nómina se muestran sin
// casilla, para ver el cuadro completo de la persona.
//
// Sirve en los dos momentos:
//   - En una nómina pendiente (`payroll`): la cuenta es la misma que al
//     agregar ciclos (`planAddWorkdays`), y el pie muestra antes de confirmar
//     cuánto suma y qué anticipos se le descuentan.
//   - Al generar (sin `payroll`): se eligen los días de una persona suelta.
//     Los que ya entran por los ciclos elegidos (`chosen`) se ven incluidos y
//     sin casilla. Los anticipos se reparten en la vista previa, junto con lo
//     que la persona traiga de los ciclos, así que el pie muestra solo lo
//     elegido. `previous` tiene lo que ya se le eligió a cada persona, para
//     poder corregirlo, e `initialWorker` abre el modal directo en una.
//
// Se monta solo mientras está abierto, igual que `AddCyclesModal`.
export function AddWorkerDaysModal({
  onClose,
  payroll = null,
  items = [],
  workers,
  cycles,
  allPayrolls = [],
  profileFor,
  chosen = null,
  previous = null,
  initialWorker = null,
  onConfirm,
  busy,
}) {
  const { catalogs } = useCatalogs();
  const generando = !payroll;
  const payrollId = payroll?.id ?? null;
  const [query, setQuery] = useState("");
  const [worker, setWorker] = useState(initialWorker);
  const [data, setData] = useState(null); // { workdays, advances }
  const [loading, setLoading] = useState(!!initialWorker);
  const [error, setError] = useState("");
  // Claves de las filas elegidas.
  const [selected, setSelected] = useState(() => new Set((initialWorker && previous?.get(initialWorker.id)) || []));
  // Si se elige otra persona antes de que termine la carga de la anterior,
  // esa respuesta se descarta.
  const pedido = useRef(0);

  const clavesEnNomina = useMemo(() => {
    const out = new Set();
    for (const it of items) {
      if (it.workerId) out.add(it.workerId);
      if (it.rut) out.add(it.rut);
    }
    return out;
  }, [items]);
  // Ya en la nómina, o, al generar, ya agregada como persona suelta.
  const yaEsta = (w) => (generando ? !!previous?.has(w.id) : workerKeys(w).some((k) => clavesEnNomina.has(k)));

  const resultados = useMemo(() => {
    const q = query.trim();
    if (q.length < 2) return [];
    const qRut = /\d/.test(q) ? rutDigits(q) : "";
    return workers
      .filter((w) => matchesSearchQuery(w.name || "", q) || (qRut.length >= 2 && rutDigits(w.rut || w.id).includes(qRut)))
      .slice(0, 30);
  }, [workers, query]);

  const cargar = async (w, id) => {
    const { error: err } = await attempt(async () => {
      const claves = workerKeys(w);
      // Al generar, los anticipos se reparten en la vista previa: acá no se
      // necesitan.
      const [workdays, advances] = await Promise.all([
        workdaysService.list({ wheres: [["workerRut", "in", claves]] }),
        generando ? [] : listPendingForWorkers(claves),
      ]);
      if (pedido.current === id) setData({ workdays, advances });
    });
    if (err && pedido.current === id) setError(err?.message || String(err));
    if (pedido.current === id) setLoading(false);
  };
  const elegir = (w) => {
    const id = ++pedido.current;
    setWorker(w);
    setData(null);
    setSelected(new Set(previous?.get(w.id) || []));
    setError("");
    setLoading(true);
    cargar(w, id);
  };
  // Abierto directo en una persona: sus días se cargan al montar.
  const loadInitialWorker = useEffectEvent(() => {
    if (initialWorker) cargar(initialWorker, ++pedido.current);
  });
  useEffect(() => {
    loadInitialWorker();
  }, []);
  const otraPersona = () => {
    pedido.current += 1;
    setWorker(null);
    setData(null);
    setSelected(new Set());
    setError("");
    setLoading(false);
  };

  const laborById = useMemo(() => new Map(cycles.flatMap((c) => (c.labors || []).map((l) => [l.id, l]))), [cycles]);
  const laborTypeById = useMemo(() => new Map([...laborById].map(([id, l]) => [id, l.type])), [laborById]);
  const cycleById = useMemo(() => new Map(cycles.map((c) => [c.id, c])), [cycles]);
  const payrollNameById = useMemo(() => new Map(allPayrolls.map((p) => [p.id, p.name || p.id])), [allPayrolls]);
  // Los ciclos que ya están en la nómina o, al generar, los elegidos con
  // alguna labor.
  const ciclosDeLaNomina = useMemo(() => {
    if (!generando) return new Set([...(payroll.cycleDetails || []).map((c) => c.id), ...(payroll.cycleIds || [])]);
    return new Set(
      [...(chosen || new Map())]
        .filter(([, laborIds]) => !Array.isArray(laborIds) || laborIds.length > 0)
        .map(([cycleId]) => cycleId),
    );
  }, [generando, payroll, chosen]);

  // Al generar, lo que ya entra por los ciclos y labores elegidos: se ve
  // incluido y no se puede elegir otra vez.
  const cubierta = (f) => generando && f.status === "pending" && inChosenCycles(f, chosen || new Map());
  const libre = (f) => f.status === "pending" && !cubierta(f);

  // Por ciclo abierto, sus filas. Solo abiertos, igual que al generar o al
  // agregar ciclos: uno cerrado ya se liquidó o está por liquidarse.
  const secciones = useMemo(() => {
    if (!data) return [];
    const abiertas = data.workdays.filter((wd) => {
      const c = cycleById.get(wd.cycleId);
      return c && c.status !== "closed";
    });
    const porCiclo = new Map();
    for (const fila of workerDayRows(abiertas, { laborTypeById, payrollId })) {
      if (!porCiclo.has(fila.cycleId)) porCiclo.set(fila.cycleId, []);
      porCiclo.get(fila.cycleId).push(fila);
    }
    return [...porCiclo.entries()]
      .map(([cycleId, filas]) => ({ cycle: cycleById.get(cycleId), filas }))
      .sort((a, b) => (a.cycle.label || "").localeCompare(b.cycle.label || "", "es"));
  }, [data, cycleById, laborTypeById, payrollId]);

  const elegidas = secciones.flatMap((s) => s.filas).filter((f) => libre(f) && selected.has(f.key));
  const totalElegido = elegidas.reduce((s, f) => s + f.amount, 0);

  // Lo que pasaría al confirmar, con la misma cuenta que se va a guardar. Solo
  // en una nómina ya armada: al generar, el reparto sale en la vista previa.
  const preview = useMemo(() => {
    if (generando || !worker || !data) return null;
    const marcadas = secciones.flatMap((s) => s.filas).filter((f) => f.status === "pending" && selected.has(f.key));
    if (marcadas.length === 0) return null;
    const persona = asPayrollWorker({
      items,
      keys: workerKeys(worker),
      fallbackKey: worker.id,
      rut: worker.rut || worker.id,
      workdays: marcadas.flatMap((f) => f.workdays),
      advances: data.advances,
    });
    const plan = planAddWorkdays({
      items,
      workdays: persona.workdays,
      laborTypeById,
      pendingAdvances: persona.advances,
      profileFor: () => profileFor(worker),
    });
    return plan.added.find((x) => x.key === persona.key) || null;
  }, [generando, worker, data, secciones, selected, items, laborTypeById, profileFor]);
  const puedeConfirmar = generando ? elegidas.length > 0 : !!preview;

  const toggle = (key) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });
  const toggleSeccion = (seccion) => setSelected((prev) => {
    const pendientes = seccion.filas.filter(libre).map((f) => f.key);
    const todas = pendientes.every((k) => prev.has(k));
    const next = new Set(prev);
    for (const k of pendientes) {
      if (todas) next.delete(k);
      else next.add(k);
    }
    return next;
  });

  // Producción de la fila, con el mismo formato que el detalle por trabajador.
  const prodDe = (fila, labor) => {
    const acc = { labor, kilos: 0, containers: new Set(), tratoQty: 0, tratoUnits: new Set(), jornadas: 0, overtimeHours: 0 };
    for (const wd of fila.workdays) {
      const qty = Number(wd.qty) || 0;
      if (labor?.type === "cosecha") {
        acc.kilos += qty;
        if (wd.containerY != null) acc.containers.add(Number(wd.containerY));
      } else if (labor?.type === "trato") {
        acc.tratoQty += getTratoTierTotals(wd).qty;
        if (labor.tratoUnit != null) acc.tratoUnits.add(Number(labor.tratoUnit));
      } else if (labor?.type === "tratoHE") {
        acc.jornadas += qty;
        acc.overtimeHours += Number(wd.overtimeHours) || 0;
      } else {
        acc.jornadas += 1;
      }
    }
    return formatWorkerDetailProd(acc, catalogs);
  };
  const diaDe = (d) => {
    const m = String(d || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return d || "—";
    const dia = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
      .toLocaleDateString("es-CL", { weekday: "short" })
      .replace(".", "");
    return `${dia} ${workerDetailDateLabel(d)}`;
  };
  const estadoDe = (fila) =>
    cubierta(fila)
      ? "entra con el ciclo elegido"
      : fila.status === "here"
        ? "en esta nómina"
        : `en ${payrollNameById.get(fila.payrollId) || "otra nómina"}`;

  return (
    <Modal
      section="Agregar días a la nómina"
      open
      onClose={onClose}
      title={generando ? "Agregar persona a la nómina nueva" : "Agregar persona a la nómina"}
      size="xl"
      footer={
        <>
          {worker && elegidas.length > 0 && (
            <div className="mr-auto min-w-0 text-xs">
              <div className="font-semibold tabular-nums">
                {elegidas.length} día{elegidas.length === 1 ? "" : "s"} · {fmtCurrency(totalElegido)}
              </div>
              {generando ? (
                totalElegido > 0 ? (
                  <div className="text-[var(--color-muted)]">Los anticipos y bonos se descuentan en la vista previa.</div>
                ) : (
                  <div className="text-amber-700 dark:text-amber-400">
                    Lo elegido suma $0: solo entra si tiene otra producción en la nómina.
                  </div>
                )
              ) : preview ? (
                <div className="tabular-nums text-[var(--color-muted)]">
                  {preview.isNew
                    ? "Entra a la nómina"
                    : `Bruto ${fmtCurrency(preview.oldGross)} → ${fmtCurrency(preview.newGross)}`}
                  {preview.anticipos > 0 && (
                    <> · <span style={{ color: "#b45309" }}>anticipos −{fmtCurrency(preview.anticipos)}</span></>
                  )}
                  {preview.bonos > 0 && <> · bonos +{fmtCurrency(preview.bonos)}</>}
                  {" · a pagar "}
                  {preview.isNew ? "" : `${fmtCurrency(preview.oldNet)} → `}
                  <span className="font-semibold text-[var(--color-text)]">{fmtCurrency(preview.newNet)}</span>
                </div>
              ) : (
                <div className="text-amber-700 dark:text-amber-400">
                  Lo elegido suma $0 y no está en la nómina: no hay nada que pagarle.
                </div>
              )}
            </div>
          )}
          <button onClick={onClose} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm">
            Cancelar
          </button>
          <button
            onClick={() =>
              onConfirm({
                worker,
                workdayIds: elegidas.flatMap((f) => f.workdayIds),
                rowKeys: elegidas.map((f) => f.key),
                filas: elegidas.map((f) => ({ cycleId: f.cycleId, laborId: f.laborId, date: f.date, amount: f.amount })),
              })
            }
            disabled={!puedeConfirmar || busy}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] disabled:opacity-50"
          >
            {busy
              ? "Agregando..."
              : elegidas.length
                ? `Agregar ${elegidas.length} día${elegidas.length === 1 ? "" : "s"}`
                : "Agregar días"}
          </button>
        </>
      }
    >
      {!worker ? (
        <div>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(workerSearchInput(e.target.value))}
            placeholder="🔍 Buscar por nombre o RUT…"
            className="mb-3 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
          />
          {query.trim().length < 2 ? (
            <p className="py-6 text-center text-sm text-[var(--color-muted)]">
              Escribe al menos 2 letras del nombre o dígitos del RUT.
            </p>
          ) : resultados.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--color-muted)]">Nadie coincide con la búsqueda.</p>
          ) : (
            <ul className="space-y-1">
              {resultados.map((w) => (
                <li key={w.id}>
                  <button
                    type="button"
                    onClick={() => elegir(w)}
                    className="flex min-h-[40px] w-full items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-left text-sm hover:bg-[var(--color-accent-soft)]"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">{w.name || "(sin nombre)"}</span>
                    {yaEsta(w) && (
                      <span className="shrink-0 rounded-full bg-[var(--color-accent-soft)] px-2 py-0.5 text-[10px] text-[var(--color-accent)]">
                        {generando ? "ya agregada" : "en esta nómina"}
                      </span>
                    )}
                    <span className="shrink-0 text-xs tabular-nums text-[var(--color-muted)]">
                      {formatRutForDisplay(w.rut || w.id)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{worker.name || "(sin nombre)"}</div>
              <div className="text-xs tabular-nums text-[var(--color-muted)]">
                {formatRutForDisplay(worker.rut || worker.id)}
                {yaEsta(worker) ? (generando ? " · ya agregada" : " · ya está en esta nómina") : ""}
              </div>
            </div>
            <button
              type="button"
              onClick={otraPersona}
              className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 text-xs hover:bg-[var(--color-accent-soft)]"
            >
              ← Otra persona
            </button>
          </div>
          <p className="text-[11px] text-[var(--color-muted)]">
            {generando
              ? "Días de ciclos abiertos. Los que ya están en una nómina, o que ya entran con los ciclos elegidos, se muestran sin casilla."
              : "Días de ciclos abiertos. Los que ya están en una nómina se muestran sin casilla."}
          </p>
          {loading ? (
            <div className="py-8 text-center text-sm text-[var(--color-muted)]">Cargando días…</div>
          ) : error ? (
            <div className="py-8 text-center text-sm text-[var(--color-danger)]">No se pudieron cargar los días: {error}</div>
          ) : secciones.length === 0 ? (
            <div className="py-8 text-center text-sm text-[var(--color-muted)]">No tiene días en ciclos abiertos.</div>
          ) : (
            <div className="space-y-2">
              {secciones.map((sec) => {
                const c = sec.cycle;
                const libres = sec.filas.filter(libre);
                const cubiertas = sec.filas.filter(cubierta);
                const todas = libres.length > 0 && libres.every((f) => selected.has(f.key));
                const pendienteTotal = libres.reduce((s, f) => s + f.amount, 0);
                const enNomina = ciclosDeLaNomina.has(c.id);
                const detalle = [
                  generando
                    ? enNomina ? "Ciclo elegido" : "Ciclo sin elegir"
                    : enNomina ? "En esta nómina" : "Fuera de esta nómina",
                  libres.length > 0 &&
                    `${libres.length} pendiente${libres.length === 1 ? "" : "s"} · ${fmtCurrency(pendienteTotal)}`,
                  cubiertas.length > 0 && `${cubiertas.length} ya entra${cubiertas.length === 1 ? "" : "n"} con el ciclo`,
                  libres.length === 0 && cubiertas.length === 0 && "sin pendientes",
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <div key={c.id} className="overflow-hidden rounded-md border border-[var(--color-border)]">
                    <div className="flex flex-wrap items-center gap-2 bg-[var(--color-surface-2)] px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{c.label || c.id}</div>
                        <div className="text-[11px] text-[var(--color-muted)]">{detalle}</div>
                      </div>
                      {libres.length > 0 && (
                        <button
                          type="button"
                          onClick={() => toggleSeccion(sec)}
                          className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-xs hover:bg-[var(--color-accent-soft)]"
                        >
                          {todas ? "Ninguno" : "Todos"}
                        </button>
                      )}
                    </div>
                    <ul className="divide-y divide-[var(--color-border)]">
                      {sec.filas.map((f) => {
                        const labor = laborById.get(f.laborId);
                        const esLibre = libre(f);
                        return (
                          <li key={f.key}>
                            <label
                              className={`flex min-h-[40px] items-center gap-2 px-3 py-1.5 text-sm ${
                                esLibre ? "cursor-pointer hover:bg-[var(--color-accent-soft)]" : "opacity-60"
                              }`}
                            >
                              {esLibre ? (
                                <input
                                  type="checkbox"
                                  checked={selected.has(f.key)}
                                  onChange={() => toggle(f.key)}
                                  className="h-4 w-4 shrink-0 accent-[var(--color-accent)]"
                                />
                              ) : (
                                <span className="w-4 shrink-0 text-center text-xs">
                                  {f.status === "here" || cubierta(f) ? "✓" : "—"}
                                </span>
                              )}
                              <span className="w-[74px] shrink-0 text-xs tabular-nums">{diaDe(f.date)}</span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate">{labor?.name || "Labor"}</span>
                                <span className="block truncate text-[11px] text-[var(--color-muted)]">
                                  {esLibre ? prodDe(f, labor) : `${prodDe(f, labor)} · ${estadoDe(f)}`}
                                </span>
                              </span>
                              <span className="shrink-0 tabular-nums">{fmtCurrency(f.amount)}</span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
