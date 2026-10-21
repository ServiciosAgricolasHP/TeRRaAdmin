import { useState, useMemo, useEffect, Fragment } from "react";
import { useToast } from "../../contexts/ToastContext";
import { harvestWeightsService } from "../../services";
import { workersService, WORKERS_LIST } from "../../services/workersService";
import { countedList } from "../../services/cache";
import { useCatalogs } from "../../contexts/CatalogsContext";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useAuth } from "../../contexts/AuthContext";
import { comboKey, mapHarvestCodes, qualityLabel, containerLabel } from "../../utils/cosechaCombos";
import { currentRutResolver } from "../../utils/workerRut";
import { daysAgoKey, todayKey, readsLabel, TAP } from "./helpers";
import { WeightFormModal } from "./WeightFormModal";
import ScreenLoader from "../../components/ScreenLoader";

// TTL del explorador de pesajes. Los pesajes cambian todo el rato mientras se
// cosecha y ningún TTL deja la pantalla fresca: la antigüedad se muestra y el
// refresco es manual.
// Solo vale para mirar: la sincronización a jornadas (SyncModal) lee sin
// caché, porque de esos pesajes salen las jornadas que se pagan.
const WEIGHTS_TTL_MS = 2 * 60 * 60 * 1000;

// Antigüedad de los datos en pantalla ("hace 3 min"), que no se refrescan solos.
const agoLabel = (ts) => {
  if (!ts) return "";
  const min = Math.floor((Date.now() - ts) / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.floor(h / 24)} d`;
};

// Agrupa los pesajes de un día por trabajador. El subtotal solo aparece si
// todos sus pesajes son del mismo combo — sumar kilos con bandejas no da nada.
const groupDayByWorker = (entries) => {
  const map = new Map();
  for (const e of entries) {
    if (!map.has(e.rut)) map.set(e.rut, { rut: e.rut, name: e.name, entries: [] });
    map.get(e.rut).entries.push(e);
  }
  return [...map.values()]
    .map((w) => {
      const combos = new Set(w.entries.map((e) => comboKey(e.x, e.y)));
      return { ...w, total: combos.size === 1 ? w.entries.reduce((s, e) => s + e.qty, 0) : null };
    })
    .sort((a, b) => (a.name || a.rut).localeCompare(b.name || b.rut));
};

// Vista de `harvestWeights`, la colección cruda que escribe la app de escaneo.
// Consulta y corrige pesajes; sincronizarlos hacia jornadas se hace desde la
// pestaña de prefijos, que es donde se elige el ciclo y la labor destino.
//
// No hay "total general": los envases no son comparables entre sí (kilos +
// bandejas + capachos no da nada), así que los totales van siempre
// desglosados por combo calidad/envase.
export function WeightsExplorer({ prefixes, jobById }) {
  const toast = useToast();
  const { catalogs } = useCatalogs();
  const [dateFrom, setDateFrom] = useState(daysAgoKey(14));
  const [dateTo, setDateTo] = useState(todayKey());
  const [prefixFilter, setPrefixFilter] = useState("");
  const [search, setSearch] = useState("");
  const [groupBy, setGroupBy] = useState("worker");
  const [openDays, setOpenDays] = useState(() => new Set());
  const [weights, setWeights] = useState([]);
  const [busy, setBusy] = useState(false);
  const [workers, setWorkers] = useState([]);
  const [editing, setEditing] = useState(null); // null | { mode, data }
  const [reloadKey, setReloadKey] = useState(0);
  const [fetchedAt, setFetchedAt] = useState(null);
  const [reads, setReads] = useState(null);
  // Se prende si Firestore rechaza la consulta acotada por falta de índice; a
  // partir de ahí el filtro por prefijo se aplica en memoria.
  const [missingIndex, setMissingIndex] = useState(false);
  const { isAdmin } = useAuth();

  const isMobile = useIsMobile();
  const prefixById = useMemo(() => new Map(prefixes.map((p) => [p.id, p])), [prefixes]);

  const knownCodes = useMemo(() => {
    const set = new Set();
    for (const w of weights) {
      const c = String(w.idQr || "").trim().toUpperCase();
      if (c) set.add(c);
    }
    return set;
  }, [weights]);

  // Se indexa por las dos llaves porque el pesaje guarda el rut que escaneó la
  // app, que puede ser el docId (id estable) o el rut legal actual si el
  // trabajador cambió de cédula.
  const workerNames = useMemo(() => {
    const map = new Map();
    for (const w of workers) {
      if (w.id) map.set(w.id, w.name);
      if (w.rut) map.set(w.rut, w.name);
    }
    return map;
  }, [workers]);
  // Rut vigente de la ficha, para mostrar (ver utils/workerRut.js).
  const rutOf = useMemo(() => currentRutResolver(workers), [workers]);

  // Buscar por QR resuelve al trabajador y filtra por su RUT, no por el `idQr`
  // del pesaje: los códigos se reciclan y se reemplazan, y así aparecen
  // también los pesajes de antes de un cambio de QR.
  const qrMatch = useMemo(() => {
    const needle = search.trim().toUpperCase();
    if (!needle) return null;
    const owner = workers.find((w) =>
      (w.idQr || []).some((c) => String(c || "").trim().toUpperCase() === needle),
    );
    if (owner) return { code: needle, owners: [owner], keys: new Set([owner.id, owner.rut].filter(Boolean)) };

    // Un código liberado no es de nadie hoy: se resuelve por los pesajes que
    // lo anotaron. Puede traer más de una persona si el código pasó por varias
    // manos.
    const keys = new Set();
    for (const w of weights) {
      if (String(w.idQr || "").trim().toUpperCase() === needle && w.rut) keys.add(w.rut);
    }
    if (keys.size === 0) return null;
    const owners = workers.filter((w) => keys.has(w.id) || keys.has(w.rut));
    for (const w of owners) {
      if (w.id) keys.add(w.id);
      if (w.rut) keys.add(w.rut);
    }
    return { code: needle, owners, keys, freed: true };
  }, [workers, weights, search]);

  // Cacheada y compartida con Trabajadores, Nómina y Calendario.
  // `workersService` es aditivo (ver services/index.js): al asignar un QR
  // parchea la entrada en memoria sin releer la colección.
  const loadWorkers = () =>
    workersService
      .list(WORKERS_LIST)
      .then(setWorkers)
      .catch(() => { /* sin la lista se muestra el RUT en vez del nombre */ });

  useEffect(() => {
    loadWorkers();
  }, []);

  // Espera 400 ms antes de releer: un `<input type="date">` emite un cambio
  // por cada parte de la fecha que se completa, y cada rango nuevo se lee
  // entero.
  const [range, setRange] = useState({ from: dateFrom, to: dateTo });
  useEffect(() => {
    const t = setTimeout(() => setRange({ from: dateFrom, to: dateTo }), 400);
    return () => clearTimeout(t);
  }, [dateFrom, dateTo]);

  useEffect(() => {
    let cancelled = false;
    const { from, to } = range;
    if (!from || !to || from > to) return;
    setBusy(true);

    // El prefijo filtra en la consulta, así elegir uno baja las lecturas.
    // Necesita el índice compuesto (prefix, dateKey), el mismo que usa la
    // sincronización. Si falta, Firestore responde `failed-precondition`: se
    // recuerda en `missingIndex` y se vuelve a pedir sin el filtro, que entonces
    // se aplica en memoria.
    const filterByPrefix = !!prefixFilter && !missingIndex;
    const opts = {
      wheres: [
        ...(filterByPrefix ? [["prefix", "==", prefixFilter]] : []),
        ["dateKey", ">=", from],
        ["dateKey", "<=", to],
      ],
      order: ["dateKey", "desc"],
      // Sin `persist`: cada rango es su propia clave y la lista de trabajadores
      // ya ocupa lo suyo en `localStorage`. En memoria alcanza para ir y venir
      // entre pestañas.
      cache: true,
      ttl: WEIGHTS_TTL_MS,
    };

    (async () => {
      try {
        const { data, reads: readCount } = await countedList(harvestWeightsService, opts);
        if (cancelled) return;
        setWeights(data);
        setReads(readCount);
        setFetchedAt(Date.now());
      } catch (err) {
        if (cancelled) return;
        if (filterByPrefix && err?.code === "failed-precondition") {
          setMissingIndex(true);
          return;
        }
        toast.error("No se pudieron leer los pesajes: " + (err.message || err));
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => { cancelled = true; };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [range, reloadKey, prefixFilter, missingIndex]);

  // Descarta la caché de pesajes y vuelve a leer: con TTL largo, refrescar es
  // una decisión de quien mira.
  const refresh = () => {
    harvestWeightsService.invalidate();
    setReloadKey((k) => k + 1);
  };

  // La búsqueda filtra en cliente. El filtro por prefijo se repite aquí para
  // cuando la consulta va sin él (`missingIndex`).
  const view = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const combos = new Map();
    const byWorker = new Map();
    const byDay = new Map();
    const detail = [];
    let count = 0;
    const days = new Set();
    const ruts = new Set();

    for (const w of weights) {
      if (!w.dateKey) continue;
      const prefixId = w.prefix || "—";
      if (prefixFilter && prefixId !== prefixFilter) continue;

      const rut = w.rut || "—";
      const name = workerNames.get(rut) || "";
      const displayRut = rut === "—" ? rut : rutOf(rut);
      if (qrMatch) {
        if (!qrMatch.keys.has(rut)) continue;
      } else if (needle && !rut.toLowerCase().includes(needle) && !displayRut.toLowerCase().includes(needle) && !name.toLowerCase().includes(needle)) continue;

      const pfx = prefixById.get(prefixId) || null;
      const { x, y } = mapHarvestCodes(pfx, w);
      const ck = comboKey(x, y);
      const qty = Number(w.amount) || 0;

      if (!combos.has(ck)) {
        combos.set(ck, { key: ck, x, y, label: `${qualityLabel(catalogs, x)} / ${containerLabel(catalogs, y)}`, qty: 0, count: 0 });
      }
      const combo = combos.get(ck);
      combo.qty += qty;
      combo.count += 1;

      count += 1;
      days.add(w.dateKey);
      ruts.add(rut);

      const bucket = (map, key, extra) => {
        if (!map.has(key)) map.set(key, { key, qtyByCombo: new Map(), count: 0, prefixes: new Set(), ...extra });
        const g = map.get(key);
        g.qtyByCombo.set(ck, (g.qtyByCombo.get(ck) || 0) + qty);
        g.count += 1;
        g.prefixes.add(prefixId);
        return g;
      };
      const entry = { id: w.id, rut, displayRut, name, date: w.dateKey, prefixId, comboLabel: combo.label, qty, x, y, idQr: w.idQr || "", supervisor: w.supervisor || "" };

      bucket(byWorker, rut, { rut, displayRut, name, days: new Set() }).days.add(w.dateKey);
      const dayGroup = bucket(byDay, w.dateKey, { date: w.dateKey, ruts: new Set(), entries: [] });
      dayGroup.ruts.add(rut);
      dayGroup.entries.push(entry);

      detail.push(entry);
    }

    const comboList = [...combos.values()].sort((a, b) => (a.x !== b.x ? a.x - b.x : a.y - b.y));
    return {
      comboList,
      count,
      daysCount: days.size,
      workersCount: ruts.size,
      byWorker: [...byWorker.values()].sort((a, b) => (a.name || a.rut).localeCompare(b.name || b.rut)),
      byDay: [...byDay.values()]
        .map((d) => ({ ...d, entries: d.entries.sort((a, b) => (a.name || a.rut).localeCompare(b.name || b.rut)) }))
        .sort((a, b) => b.date.localeCompare(a.date)),
      detail,
    };
  }, [weights, prefixFilter, search, prefixById, catalogs, workerNames, qrMatch, rutOf]);

  const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString("es-CL", { maximumFractionDigits: 2 }));
  const DETAIL_CAP = 500;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="block min-w-[130px] flex-1">
          <span className="mb-1 block text-xs text-[var(--color-muted)]">Desde</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block min-w-[130px] flex-1">
          <span className="mb-1 block text-xs text-[var(--color-muted)]">Hasta</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block min-w-[140px] flex-1">
          <span className="mb-1 block text-xs text-[var(--color-muted)]">Prefijo</span>
          <select
            value={prefixFilter}
            onChange={(e) => setPrefixFilter(e.target.value)}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-sm"
          >
            <option value="">Todos</option>
            {prefixes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id} — {jobById.get(p.faenaId)?.name || p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-[160px] flex-[2]">
          <span className="mb-1 block text-xs text-[var(--color-muted)]">Buscar trabajador</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="RUT, nombre o QR"
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-sm"
          />
          {qrMatch && (
            <span className="mt-1 block text-xs text-[var(--color-muted)]">
              <span className="font-mono">{qrMatch.code}</span>
              {qrMatch.freed ? " está libre; lo usó " : " es de "}
              <strong>{qrMatch.owners.map((o) => o.name || o.id).join(", ") || "alguien sin ficha"}</strong>
              {" — se muestran todos sus pesajes, también los de cuando tenía otro código."}
            </span>
          )}
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-1 text-sm">
          {[
            { v: "worker", l: "Por trabajador" },
            { v: "day", l: "Por día" },
            { v: "detail", l: "Detalle" },
          ].map((o) => (
            <button
              key={o.v}
              onClick={() => setGroupBy(o.v)}
              className={`rounded px-3 py-1 ${groupBy === o.v ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]" : "text-[var(--color-muted)]"}`}
            >
              {o.l}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[var(--color-muted)]">
            {busy ? "Leyendo…" : `${fmt(view.count)} pesajes · ${view.workersCount} trabajadores · ${view.daysCount} días`}
            {!busy && fetchedAt ? ` · ${agoLabel(fetchedAt)}` : ""}
            {!busy && isAdmin && reads != null ? ` ${readsLabel(reads)}` : ""}
          </span>
          {missingIndex && prefixFilter ? (
            <span
              title="Falta el índice compuesto (prefix, dateKey) en Firestore"
              className="text-xs text-[var(--color-warning,#d97706)]"
            >
              ⚠ filtro en memoria
            </span>
          ) : null}
          <button
            onClick={refresh}
            disabled={busy}
            title="Vuelve a leer los pesajes del rango desde Firestore"
            className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-40"
          >
            🔄 Refrescar
          </button>
          <button
            onClick={() => setEditing({ mode: "create", data: { prefix: prefixFilter, dateKey: dateTo } })}
            disabled={prefixes.length === 0}
            title={prefixes.length === 0 ? "Primero hay que configurar al menos un prefijo" : undefined}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            + Nuevo pesaje
          </button>
        </div>
      </div>

      {view.comboList.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {view.comboList.map((c) => (
            <div key={c.key} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2">
              <div className="text-xs text-[var(--color-muted)]">{c.label}</div>
              <div className="text-base font-semibold">{fmt(c.qty)}</div>
              <div className="text-[11px] text-[var(--color-muted)]">{fmt(c.count)} pesajes</div>
            </div>
          ))}
        </div>
      )}

      {busy ? (
        <ScreenLoader label="Cargando pesajes…" />
      ) : view.count === 0 ? (
        <p className="rounded-md border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-muted)]">
          No hay pesajes en este rango{prefixFilter || search ? " con los filtros aplicados" : ""}.
        </p>
      ) : groupBy === "detail" && isMobile ? (
        <div className="space-y-2">
          {view.detail.slice(0, DETAIL_CAP).map((d) => (
            <div key={d.id} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">{d.name || d.rut}</div>
                  {d.name && <div className="font-mono text-xs text-[var(--color-muted)]">{d.displayRut}</div>}
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-lg font-semibold leading-none">{fmt(d.qty)}</div>
                  <div className="text-xs text-[var(--color-muted)]">{d.date}</div>
                </div>
              </div>
              <div className="mt-2 space-y-0.5 text-xs text-[var(--color-muted)]">
                <div>{d.comboLabel}</div>
                <div className="font-mono">{d.idQr || d.prefixId}</div>
                {d.supervisor && <div className="break-all">Supervisor: {d.supervisor}</div>}
              </div>
              <button
                onClick={() => setEditing({ mode: "edit", data: { id: d.id, rut: d.rut, dateKey: d.date, prefix: d.prefixId, x: d.x, y: d.y, amount: d.qty, idQr: d.idQr } })}
                className={`${TAP} mt-2 w-full rounded-md border border-[var(--color-border)] px-2.5 text-xs hover:bg-[var(--color-accent-soft)]`}
              >
                Editar
              </button>
            </div>
          ))}
          {view.detail.length > DETAIL_CAP && (
            <p className="rounded-md border border-dashed border-[var(--color-border)] p-3 text-center text-xs text-[var(--color-muted)]">
              Mostrando {DETAIL_CAP} de {fmt(view.detail.length)} pesajes — acota el rango o filtra por prefijo para ver el resto.
            </p>
          )}
        </div>
      ) : groupBy === "detail" ? (
        <div className="overflow-x-auto rounded-md border border-[var(--color-border)]">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-[var(--color-surface-2)] text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
              <tr>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Trabajador</th>
                <th className="px-3 py-2">Prefijo</th>
                <th className="px-3 py-2">QR</th>
                <th className="px-3 py-2">Calidad / envase</th>
                <th className="px-3 py-2 text-right">Cantidad</th>
                <th className="px-3 py-2">Supervisor</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {view.detail.slice(0, DETAIL_CAP).map((d) => (
                <tr key={d.id}>
                  <td className="px-3 py-2 whitespace-nowrap">{d.date}</td>
                  <td className="px-3 py-2">
                    <div>{d.name || d.rut}</div>
                    {d.name && <div className="font-mono text-xs text-[var(--color-muted)]">{d.displayRut}</div>}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{d.prefixId}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {d.idQr || <span className="text-[var(--color-muted)]">—</span>}
                  </td>
                  <td className="px-3 py-2 text-xs">{d.comboLabel}</td>
                  <td className="px-3 py-2 text-right font-medium">{fmt(d.qty)}</td>
                  <td className="max-w-[10rem] break-all px-3 py-2 text-xs">
                    {d.supervisor || <span className="text-[var(--color-muted)]">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => setEditing({ mode: "edit", data: { id: d.id, rut: d.rut, dateKey: d.date, prefix: d.prefixId, x: d.x, y: d.y, amount: d.qty, idQr: d.idQr } })}
                      className={`${TAP} rounded-md border border-[var(--color-border)] px-2.5 text-xs hover:bg-[var(--color-accent-soft)]`}
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {view.detail.length > DETAIL_CAP && (
            <p className="border-t border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-muted)]">
              Mostrando {DETAIL_CAP} de {fmt(view.detail.length)} pesajes — acota el rango o filtra por prefijo para ver el resto.
            </p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-[var(--color-border)]">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-[var(--color-surface-2)] text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
              <tr>
                <th className="px-3 py-2">{groupBy === "worker" ? "Trabajador" : "Día"}</th>
                <th className="px-3 py-2">{groupBy === "worker" ? "Días" : "Trabajadores"}</th>
                <th className="px-3 py-2">Prefijos</th>
                {view.comboList.map((c) => (
                  <th key={c.key} className="px-3 py-2 text-right">{c.label}</th>
                ))}
                <th className="px-3 py-2 text-right">Pesajes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {(groupBy === "worker" ? view.byWorker : view.byDay).map((g) => (
                <Fragment key={g.key}>
                <tr>
                  <td className="px-3 py-2">
                    {groupBy === "worker" ? (
                      <>
                        <div>{g.name || g.rut}</div>
                        {g.name && <div className="font-mono text-xs text-[var(--color-muted)]">{g.displayRut}</div>}
                        <button
                          onClick={() => { setSearch(g.rut); setGroupBy("detail"); }}
                          className={`${TAP} mt-1 rounded-md border border-[var(--color-border)] px-2.5 text-xs hover:bg-[var(--color-accent-soft)]`}
                        >
                          Ver / editar pesajes
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setOpenDays((s) => {
                          const next = new Set(s);
                          if (next.has(g.date)) next.delete(g.date); else next.add(g.date);
                          return next;
                        })}
                        className="flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <span className="text-[var(--color-muted)]">{openDays.has(g.date) ? "▾" : "▸"}</span>
                        {g.date}
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--color-muted)]">
                    {groupBy === "worker" ? g.days.size : g.ruts.size}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{[...g.prefixes].join(", ")}</td>
                  {view.comboList.map((c) => (
                    <td key={c.key} className="px-3 py-2 text-right">
                      {g.qtyByCombo.has(c.key) ? fmt(g.qtyByCombo.get(c.key)) : "—"}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right text-xs text-[var(--color-muted)]">{g.count}</td>
                </tr>
                {groupBy === "day" && openDays.has(g.date) && (
                  <tr>
                    <td colSpan={4 + view.comboList.length} className="bg-[var(--color-surface-2)] px-3 py-2">
                      <table className="w-full text-xs">
                        <thead className="text-left uppercase tracking-wide text-[var(--color-muted)]">
                          <tr>
                            <th className="py-1 pr-3">Trabajador</th>
                            <th className="py-1 pr-3">QR / prefijo</th>
                            <th className="py-1 pr-3">Calidad / envase</th>
                            <th className="py-1 pr-3 text-right">Cantidad</th>
                            <th className="py-1"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {groupDayByWorker(g.entries).map((w) => (
                            <Fragment key={w.rut}>
                              <tr className="border-t border-[var(--color-border)]">
                                <td className="py-1 pr-3 align-top">
                                  <button
                                    onClick={() => setEditing({
                                      mode: "create",
                                      data: { rut: w.rut, dateKey: g.date, prefix: w.entries[0]?.prefixId || prefixFilter },
                                    })}
                                    title={`Agregar pesajes a ${w.name || w.rut} el ${g.date}`}
                                    className={`${TAP} rounded-md border border-[var(--color-border)] px-2.5 hover:bg-[var(--color-accent-soft)]`}
                                  >
                                    + pesaje
                                  </button>
                                </td>
                                <td className="py-1 pr-3" colSpan={2}>
                                  <span className="font-medium">{w.name || w.rut}</span>
                                  {w.name && <span className="ml-2 font-mono text-[11px] text-[var(--color-muted)]">{w.displayRut}</span>}
                                  <span className="ml-2 text-[11px] text-[var(--color-muted)]">{w.entries.length} pesaje(s)</span>
                                </td>
                                <td className="py-1 pr-3 text-right font-semibold">{w.total == null ? "" : fmt(w.total)}</td>
                                <td />
                              </tr>
                              {w.entries.map((e) => (
                                <tr key={e.id}>
                                  <td />
                                  <td className="py-1 pr-3 font-mono text-[var(--color-muted)]" title={e.supervisor ? `Supervisor: ${e.supervisor}` : undefined}>
                                    {e.idQr || e.prefixId}
                                  </td>
                                  <td className="py-1 pr-3 text-[var(--color-muted)]">{e.comboLabel}</td>
                                  <td className="py-1 pr-3 text-right">{fmt(e.qty)}</td>
                                  <td className="py-1 text-right">
                                    <button
                                      onClick={() => setEditing({ mode: "edit", data: { id: e.id, rut: e.rut, dateKey: e.date, prefix: e.prefixId, x: e.x, y: e.y, amount: e.qty, idQr: e.idQr } })}
                                      className={`${TAP} rounded-md border border-[var(--color-border)] px-2.5 hover:bg-[var(--color-accent-soft)]`}
                                    >
                                      Editar
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </Fragment>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <WeightFormModal
          mode={editing.mode}
          initial={editing.data}
          prefixes={prefixes}
          workers={workers}
          catalogs={catalogs}
          knownCodes={knownCodes}
          onWorkersChanged={loadWorkers}
          onClose={() => setEditing(null)}
          onSaved={(savedDate) => {
            setEditing(null);
            setReloadKey((k) => k + 1);
            if (savedDate && (savedDate < dateFrom || savedDate > dateTo)) {
              toast.info(`El pesaje quedó en ${savedDate}, fuera del rango que estás viendo.`);
            }
          }}
        />
      )}
    </div>
  );
}
