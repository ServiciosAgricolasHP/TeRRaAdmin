import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { serverTimestamp } from "firebase/firestore";
import { Link } from "react-router-dom";
import { useToast } from "../contexts/ToastContext";
import { faenasService, cyclesService, workdaysService, harvestWeightsService, qrPrefixesService } from "../services";
import { findWorkerByRut, workersService } from "../services/workersService";
import { useCatalogs } from "../contexts/CatalogsContext";
import { useIsMobile } from "../hooks/useIsMobile";
import { useAuth } from "../contexts/AuthContext";
import { comboKey, getDayCombos, workdayDocId, qualityLabel, containerLabel, mapHarvestCodes, invertHarvestCodes } from "../utils/cosechaCombos";
import Modal from "../components/Modal";
import Select from "../components/Select";
import ConfirmDialog from "../components/ConfirmDialog";

// Puente entre los prefijos QR físicos (impresos de antemano, app scan_IS) y
// el (faena, ciclo, labor) vigente al que hay que sincronizar sus pesajes.
//
// Por qué el ciclo/labor vigente se reapunta a mano: los ciclos son un límite
// de negocio (cuándo se cierra uno y se abre el siguiente), no algo que el
// sistema pueda inferir con confianza — "el ciclo más reciente" no siempre es
// el vigente. Es una decisión deliberada, no una automatización pendiente.
// El prefijo de un código es lo que va antes del primer guion (`XX-0123` →
// `XX`), la misma convención que usa la app de scan para saber a qué faena
// pertenece el pesaje.
const prefixOfCode = (code) => {
  const raw = String(code || "").trim().toUpperCase();
  const cut = raw.indexOf("-");
  return cut > 0 ? raw.slice(0, cut) : "";
};

// Una persona lleva **un** QR por cosecha: el prefijo es la cosecha, así que
// darle XX-21 a quien tiene XX-19 le quita el 19, que vuelve al pozo. Esto
// devuelve los códigos que hay que soltar para respetar esa regla.
const codesToRelease = (codes, incoming) => {
  const pfx = prefixOfCode(incoming);
  if (!pfx) return [];
  return codes.filter((c) => c !== incoming && prefixOfCode(c) === pfx);
};

// Alto mínimo de toque del proyecto. Se usa en los botones que viven dentro
// de celdas y filas: llega a 32px sin agrandar la fuente ni ensanchar la
// columna, que es lo que un `py-` más grande sí haría.
const TAP = "min-h-[32px] inline-flex items-center justify-center";

const codesOfWorker = (w) => (w?.idQr || []).map((c) => String(c || "").trim().toUpperCase()).filter(Boolean);

// Deja `code` en manos de `toWorker`: se lo quita a quien lo tuviera y suelta
// el que esa persona ya tenía de la misma cosecha. Devuelve los códigos que
// quedaron libres, para poder decirlo.
async function assignQrCode(code, toWorker, fromWorker) {
  const clean = String(code || "").trim().toUpperCase();
  if (!clean) throw new Error("El código es obligatorio");
  if (fromWorker && fromWorker.id === toWorker.id) return { released: [], code: clean };

  if (fromWorker) {
    await workersService.update(fromWorker.id, {
      idQr: codesOfWorker(fromWorker).filter((c) => c !== clean),
    });
  }
  const already = codesOfWorker(toWorker);
  const released = codesToRelease(already, clean);
  if (!already.includes(clean) || released.length) {
    await workersService.update(toWorker.id, {
      idQr: [...already.filter((c) => !released.includes(c)), ...(already.includes(clean) ? [] : [clean])],
    });
  }
  return { released, code: clean };
}

// Quién tiene hoy ese código, si alguien lo tiene.
const ownerOfCode = (workers, code) => {
  const clean = String(code || "").trim().toUpperCase();
  if (!clean) return null;
  return workers.find((w) => codesOfWorker(w).includes(clean)) || null;
};

const numberOfCode = (code) => {
  const m = /^.+-(\d+)$/.exec(String(code || ""));
  return m ? { n: Number(m[1]), pad: m[1].length } : null;
};

// Códigos del prefijo que hoy no tiene nadie, para no tener que sacarle el
// suyo a otra persona. No hay catálogo de QRs impresos, así que "libre" se
// deduce de dos fuentes: los números que faltan en la serie que sí está
// asignada, y los que aparecen en pesajes viejos (esos existen físicamente
// seguro, alguien los escaneó). Un hueco marcado `impreso` es la mejor
// sugerencia posible; el `fueraDeRango` es un número que quizá nunca se
// imprimió, y solo se ofrece cuando no quedan huecos.
function suggestFreeCodes(workers, prefixId, knownCodes, max = 3) {
  if (!prefixId) return [];
  const taken = new Set();
  const pads = new Map();
  let top = 0;
  const contar = (code) => {
    if (prefixOfCode(code) !== prefixId) return null;
    const parsed = numberOfCode(code);
    if (!parsed) return null;
    pads.set(parsed.pad, (pads.get(parsed.pad) || 0) + 1);
    if (parsed.n > top) top = parsed.n;
    return parsed;
  };
  for (const w of workers) {
    for (const c of codesOfWorker(w)) {
      const parsed = contar(c);
      if (parsed) taken.add(parsed.n);
    }
  }
  for (const c of knownCodes) contar(c);

  const pad = [...pads.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] || 1;
  const fmt = (n) => `${prefixId}-${String(n).padStart(pad, "0")}`;

  const out = [];
  for (let i = 1; i <= top && out.length < max; i++) {
    if (taken.has(i)) continue;
    const code = fmt(i);
    out.push({ code, impreso: knownCodes.has(code) });
  }
  if (out.length === 0) out.push({ code: fmt(top + 1), impreso: false, fueraDeRango: true });
  return out;
}

const todayKey = () => new Date().toLocaleDateString("sv-SE");
const daysAgoKey = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString("sv-SE");
};

// Se arma con el constructor local y no con `new Date("2026-04-19")`, que
// parsea como UTC y en Chile devuelve el día anterior. El desborde de mes lo
// resuelve el propio constructor.
const addDaysKey = (key, n) => {
  const [y, m, d] = String(key || "").split("-").map(Number);
  if (!y || !m || !d) return key;
  return new Date(y, m - 1, d + n).toLocaleDateString("sv-SE");
};

// La sincronización siguiente arranca donde terminó la anterior: el día
// después del último que realmente se sincronizó. El techo son 14 días, o
// hoy si el ciclo viene más atrasado que eso.
const nextSyncRange = (lastSync) => {
  const days = lastSync?.days || [];
  const hoy = todayKey();
  if (days.length === 0) return { from: daysAgoKey(14), to: hoy };
  const ultimo = [...days].sort().at(-1);
  const from = [addDaysKey(ultimo, 1), hoy].sort()[0];
  const to = [addDaysKey(from, 14), hoy].sort()[0];
  return { from, to };
};

// El rango sincronizado se muestra en día-mes: el año se sobreentiende y así
// entra en la celda sin romper la tabla.
const dayMonth = (iso) => {
  const [, m, d] = String(iso || "").split("-");
  return d && m ? `${d}-${m}` : null;
};

const lastSyncLabel = (lastSync) => {
  const days = (lastSync?.days || []).map(dayMonth).filter(Boolean);
  if (days.length === 0) return null;
  if (days.length === 1) return days[0];
  if (days.length <= 3) return days.join(", ");
  return `${days[0]} al ${days[days.length - 1]} · ${days.length} días`;
};

// Sin `total` la barra queda indeterminada: sirve para los pasos que no se
// pueden contar de antemano (leer, actualizar el ciclo) y que igual tardan.
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

function ProgressBar({ label, done, total }) {
  const pct = total ? Math.round((done / total) * 100) : null;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs text-[var(--color-muted)]">
        <span>{label}</span>
        {pct != null && <span>{done}/{total}</span>}
      </div>
      <div className="h-2 overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)]">
        <div
          className={`h-full bg-[var(--color-accent)] ${pct == null ? "w-1/3 animate-pulse" : "transition-[width] duration-200"}`}
          style={pct == null ? undefined : { width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function healthOf(prefix, cyclesById) {
  if (!prefix.cycleId || !prefix.laborId) {
    return { level: "red", label: "Sin ciclo/labor configurado" };
  }
  const cycle = cyclesById.get(prefix.cycleId);
  if (!cycle) return { level: "red", label: "El ciclo configurado ya no existe" };
  const cosechaLabors = (cycle.labors || []).filter((l) => l.type === "cosecha");
  const labor = cosechaLabors.find((l) => l.id === prefix.laborId);
  if (!labor) {
    if (cosechaLabors.length === 0) {
      return { level: "red", label: "El ciclo vigente no tiene ninguna labor de cosecha" };
    }
    return { level: "red", label: "La labor configurada ya no es de tipo cosecha en este ciclo" };
  }
  if (cosechaLabors.length > 1) {
    return { level: "yellow", label: `Hay ${cosechaLabors.length} labores de cosecha en este ciclo — verifica que sea la correcta` };
  }
  return { level: "green", label: "OK" };
}

const HEALTH_STYLES = {
  green: "border-[var(--color-success,#16a34a)] text-[var(--color-success,#16a34a)] bg-[var(--color-success-soft,rgba(22,163,74,0.12))]",
  yellow: "border-[var(--color-warning,#d97706)] text-[var(--color-warning,#d97706)] bg-[var(--color-warning-soft,rgba(217,119,6,0.12))]",
  red: "border-[var(--color-danger,#dc2626)] text-[var(--color-danger,#dc2626)] bg-[var(--color-danger-soft,rgba(220,38,38,0.12))]",
};

export default function HarvestQr() {
  const toast = useToast();
  const [tab, setTab] = useState("sync"); // sync | weights | qr
  const [prefixes, setPrefixes] = useState([]);
  const [faenas, setFaenas] = useState([]);
  const [cyclesById, setCyclesById] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [formState, setFormState] = useState(null); // null | { mode: "create" | "edit", data }
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [syncFor, setSyncFor] = useState(null); // prefix doc mientras se elige rango

  const reload = async () => {
    setLoading(true);
    try {
      const [px, fa] = await Promise.all([
        qrPrefixesService.list({ order: ["label", "asc"] }),
        faenasService.list({ order: ["name", "asc"], cache: true }),
      ]);
      setPrefixes(px);
      setFaenas(fa);
      const cycleIds = [...new Set(px.map((p) => p.cycleId).filter(Boolean))];
      const cycles = await Promise.all(cycleIds.map((id) => cyclesService.getById(id)));
      const map = new Map();
      cycles.forEach((c) => { if (c) map.set(c.id, c); });
      setCyclesById(map);
    } catch (err) {
      toast.error("No se pudo cargar la configuración de prefijos QR: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const faenaById = useMemo(() => new Map(faenas.map((f) => [f.id, f])), [faenas]);

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleteBusy(true);
    try {
      await qrPrefixesService.remove(confirmDelete.id);
      setConfirmDelete(null);
      toast.success(`Prefijo ${confirmDelete.id} eliminado`);
      await reload();
    } catch (err) {
      toast.error("No se pudo eliminar: " + (err.message || err));
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">📷 Cosecha QR</h1>
          <p className="text-sm text-[var(--color-muted)]">
            {tab === "sync"
              ? "A qué faena/ciclo/labor apunta cada prefijo QR físico (app scan_IS), y sincronización de sus pesajes hacia las jornadas."
              : tab === "weights"
                ? "Lectura directa de los pesajes que escribe la app de scan, antes de sincronizarlos hacia las jornadas."
                : "Qué QR físico tiene asignado cada trabajador, agrupados por prefijo."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-1 text-sm">
            <button
              onClick={() => setTab("sync")}
              className={`${TAP} flex-1 rounded px-3 ${tab === "sync" ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]" : "text-[var(--color-muted)]"}`}
            >
              🔄 Sincronizar cosechas
            </button>
            <button
              onClick={() => setTab("weights")}
              className={`${TAP} flex-1 rounded px-3 ${tab === "weights" ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]" : "text-[var(--color-muted)]"}`}
            >
              ⚖️ Pesajes
            </button>
            <button
              onClick={() => setTab("qr")}
              className={`${TAP} flex-1 rounded px-3 ${tab === "qr" ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]" : "text-[var(--color-muted)]"}`}
            >
              📱 Gestión QRs
            </button>
          </div>
        </div>
      </div>

      {tab === "sync" && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-[var(--color-muted)]">
            {loading ? "Cargando…" : `${prefixes.length} prefijo(s) configurado(s)`}
          </span>
          <button
            onClick={() => setFormState({ mode: "create", data: { active: true } })}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]"
          >
            + Nuevo prefijo
          </button>
        </div>
      )}

      {tab === "sync" && (loading ? (
        <p className="text-sm text-[var(--color-muted)]">Cargando…</p>
      ) : prefixes.length === 0 ? (
        <p className="rounded-md border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-muted)]">
          No hay prefijos configurados todavía.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-[var(--color-border)]">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-[var(--color-surface-2)] text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
              <tr>
                <th className="px-3 py-2">Prefijo</th>
                <th className="px-3 py-2">Faena</th>
                <th className="px-3 py-2">Ciclo / labor vigente</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Última sincronización</th>
                <th className="px-3 py-2">Activo</th>
                <th className="px-3 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {prefixes.map((p) => {
                const health = healthOf(p, cyclesById);
                const cycle = p.cycleId ? cyclesById.get(p.cycleId) : null;
                const labor = cycle?.labors?.find((l) => l.id === p.laborId);
                return (
                  <tr key={p.id}>
                    <td className="px-3 py-2 font-mono font-semibold">{p.id}</td>
                    <td className="px-3 py-2">
                      <div>{faenaById.get(p.faenaId)?.name || "—"}</div>
                      <div className="text-xs text-[var(--color-muted)]">{p.label}</div>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <div>{cycle?.label || cycle?.name || (p.cycleId ? "(ciclo no encontrado)" : "—")}</div>
                      <div className="text-[var(--color-muted)]">{labor?.name || (p.laborId ? "(labor no encontrada)" : "—")}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded-full border px-2 py-0.5 text-xs ${HEALTH_STYLES[health.level]}`} title={health.label}>
                        {health.level === "green" ? "🟢" : health.level === "yellow" ? "🟡" : "🔴"} {health.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {lastSyncLabel(p.lastSync) ? (
                        <>
                          <div>{lastSyncLabel(p.lastSync)}</div>
                          <div className="text-[var(--color-muted)]" title={p.lastSync.at}>
                            {dayMonth(String(p.lastSync.at || "").slice(0, 10)) || "—"}
                            {p.lastSync.written != null && ` · ${p.lastSync.written} jornada(s)`}
                          </div>
                        </>
                      ) : (
                        <span className="text-[var(--color-muted)]">Nunca</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{p.active ? "Sí" : "No"}</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1.5">
                        <button
                          onClick={() => setSyncFor(p)}
                          disabled={health.level === "red"}
                          className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          🔄 Sincronizar
                        </button>
                        <button
                          onClick={() => setFormState({ mode: "edit", data: p })}
                          className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)]"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => setConfirmDelete(p)}
                          className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger-soft,rgba(220,38,38,0.12))]"
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      {tab === "weights" && <WeightsExplorer prefixes={prefixes} faenaById={faenaById} />}

      {tab === "qr" && <QrManager prefixes={prefixes} />}

      {formState && (
        <PrefixFormModal
          mode={formState.mode}
          initial={formState.data}
          faenas={faenas}
          onClose={() => setFormState(null)}
          onSaved={() => { setFormState(null); reload(); }}
        />
      )}

      {syncFor && (
        <SyncModal
          prefix={syncFor}
          cycle={cyclesById.get(syncFor.cycleId)}
          onClose={() => setSyncFor(null)}
          onSynced={reload}
        />
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="Eliminar prefijo"
        message={confirmDelete ? `¿Eliminar el prefijo "${confirmDelete.id}"? Esto no borra los pesajes ya registrados, solo el mapeo hacia la faena/ciclo.` : ""}
        confirmLabel="Eliminar"
        danger
        busy={deleteBusy}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

function PrefixFormModal({ mode, initial, faenas, onClose, onSaved }) {
  const toast = useToast();
  const [prefix, setPrefix] = useState(initial.id || "");
  const [label, setLabel] = useState(initial.label || "");
  const [faenaId, setFaenaId] = useState(initial.faenaId || "");
  const [cycleId, setCycleId] = useState(initial.cycleId || "");
  const [laborId, setLaborId] = useState(initial.laborId || "");
  const [active, setActive] = useState(initial.active !== false);
  const [cycles, setCycles] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!faenaId) { setCycles([]); return; }
    cyclesService
      .list({ wheres: [["faenaId", "==", faenaId]], order: ["createdAt", "desc"] })
      .then((list) => {
        setCycles(list.sort((a, b) => (a.status === b.status ? 0 : a.status === "open" ? -1 : 1)));
      });
  }, [faenaId]);

  const selectedCycle = cycles.find((c) => c.id === cycleId);
  const laborOptions = (selectedCycle?.labors || [])
    .filter((l) => l.type === "cosecha")
    .map((l) => ({ value: l.id, label: l.name }));

  const submit = async () => {
    const prefixId = prefix.trim().toUpperCase();
    if (!prefixId || !label.trim() || !faenaId) {
      toast.error("Prefijo, etiqueta y faena son obligatorios");
      return;
    }
    setBusy(true);
    try {
      await qrPrefixesService.upsert(prefixId, {
        label: label.trim(),
        faenaId,
        cycleId: cycleId || null,
        laborId: laborId || null,
        active,
      });
      toast.success(mode === "create" ? "Prefijo creado" : "Prefijo actualizado");
      onSaved();
    } catch (err) {
      toast.error("No se pudo guardar: " + err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === "create" ? "Nuevo prefijo QR" : `Editar prefijo ${initial.id}`}
      size="sm"
      footer={
        <>
          <button onClick={onClose} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm">
            Cancelar
          </button>
          <button
            type="submit"
            form="harvestqr-prefix-form"
            disabled={busy}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
          >
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </>
      }
    >
      <form id="harvestqr-prefix-form" onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm text-[var(--color-muted)]">
            Prefijo <span className="text-[var(--color-danger)]">*</span>
          </span>
          <input
            type="text"
            value={prefix}
            disabled={mode === "edit"}
            onChange={(e) => setPrefix(e.target.value.toUpperCase())}
            placeholder="HP"
            maxLength={5}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm uppercase outline-none focus:border-[var(--color-accent)] disabled:opacity-60"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-[var(--color-muted)]">
            Etiqueta <span className="text-[var(--color-danger)]">*</span>
          </span>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Ej. HP — Berries Ejemplo"
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
          />
        </label>
        <Select
          label="Faena"
          required
          value={faenaId}
          onChange={(v) => { setFaenaId(v); setCycleId(""); setLaborId(""); }}
          options={faenas.map((f) => ({ value: f.id, label: f.name }))}
        />
        <Select
          label="Ciclo vigente"
          value={cycleId}
          onChange={(v) => { setCycleId(v); setLaborId(""); }}
          disabled={!faenaId}
          placeholder={faenaId ? "Sin ciclo asignado" : "Elige una faena primero"}
          options={cycles.map((c) => ({ value: c.id, label: `${c.label || c.name || c.id}${c.status === "closed" ? " (cerrado)" : ""}` }))}
        />
        <Select
          label="Labor de cosecha vigente"
          value={laborId}
          onChange={setLaborId}
          disabled={!cycleId}
          placeholder={
            !cycleId ? "Elige un ciclo primero" : laborOptions.length === 0 ? "Este ciclo no tiene labores de cosecha" : "Sin labor asignada"
          }
          options={laborOptions}
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Activo (visible como opción en el scan app)
        </label>
      </form>
    </Modal>
  );
}

function SyncModal({ prefix, cycle, onClose, onSynced }) {
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

      setProgress({ label: "Leyendo pesajes…" });
      const weights = await harvestWeightsService.list({
        wheres: [
          ["prefix", "==", prefix.id],
          ["dateKey", ">=", dateFrom],
          ["dateKey", "<=", dateTo],
        ],
      });

      // Agrupa por (trabajador, día, combo calidad/envase) y suma los kilos —
      // el mapeo por defecto es identidad (ver contexto: los catálogos se
      // diseñaron a propósito preservando la convención numérica del scan app).
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

      // Un doc de worker por rut distinto del batch, no uno por grupo. Se usa
      // para dos cosas: el `workerId` estable del workday y la entrada del
      // roster de la labor.
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
      // `labor.workers` (filas): un workday cuyo día o trabajador no esté en
      // esas listas existe pero no tiene celda donde mostrarse. Se adjunta lo
      // que falte en un solo update del ciclo.
      const neededDays = [...new Set([...groups.values()].map((g) => g.dateKey))];
      const neededRuts = [...new Set([...groups.values()].map((g) => g.rut))];
      const rosterKeys = new Set((labor.workers || []).flatMap((w) => [w.rut, w.id].filter(Boolean)));

      const daysAdded = neededDays.filter((d) => !(fresh.days || []).includes(d)).sort();
      const rutsToAdd = neededRuts.filter((r) => !rosterKeys.has(r));
      // Sin ficha en `worker` no hay con qué armar la entrada del roster; se
      // reportan en vez de inventarles un nombre.
      const unknownRuts = rutsToAdd.filter((r) => !workerByRut.get(r));
      // El `rut` de la entrada es el de `harvestWeights`, no el rut legal del
      // worker: la grilla arma el docId del workday con ese valor para buscar
      // la celda, y si divergen la fila sale vacía. El dedupe por id es porque
      // dos ruts distintos pueden resolver al mismo trabajador.
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

      // Una jornada ya liquidada no se toca por detrás. Si se recalcula, queda
      // con monto nuevo y `payrollId` viejo (el upsert hace merge y no manda
      // ese campo): sigue contando como pagada, se sigue filtrando de las
      // nóminas futuras, y la diferencia no se cobra nunca.
      //
      // Se leen de a tandas y en paralelo — son lecturas, no escrituras, así
      // que no hay nada que ordenar. Una query de rango sobre `date` sería una
      // sola lectura pero exige un índice compuesto que el proyecto no tiene.
      setProgress({ label: "Revisando jornadas ya liquidadas…", done: 0, total: groups.size });
      const claves = [...groups.values()].map((g) => ({
        g,
        docId: workdayDocId(fresh.id, labor.id, g.rut, g.dateKey, g.ck),
      }));
      const bloqueadas = new Set();
      const blocked = [];
      for (let i = 0; i < claves.length; i += 25) {
        const tanda = claves.slice(i, i + 25);
        const docs = await Promise.all(tanda.map((k) => workdaysService.getById(k.docId)));
        docs.forEach((doc, j) => {
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
        });
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
                ⚠ Días sin precio para ese combo: {result.zeroPriceDays.join(", ")} — esas jornadas quedaron en $0. Configurá el precio en el ciclo y volvé a sincronizar.
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

// ============================================================
// Espejo pesaje → jornada
// ============================================================
//
// Una jornada es el agregado de (trabajador × día × combo). Al guardar un
// pesaje se conocen las claves afectadas —la de antes y la de después—, así
// que alcanza con recalcular esas dos desde los pesajes que existen ahora; no
// hace falta recorrer el rango.
//
// Solo se espeja si la clave ya tenía jornada. Esa jornada es la prueba de que
// alguien aprobó que este prefijo apunte a ese ciclo para esa fecha: el puntero
// ciclo/labor del prefijo se reapunta a mano y puede estar viejo, así que crear
// jornadas sin esa prueba podría meterlas en el ciclo equivocado.

const keyOf = (k) => `${k.prefixId}__${k.rut}__${k.dateKey}__${comboKey(k.x, k.y)}`;

async function loadSyncTarget(prefixDoc) {
  const cycle = prefixDoc?.cycleId ? await cyclesService.getById(prefixDoc.cycleId) : null;
  const labor = (cycle?.labors || []).find((l) => l.id === prefixDoc?.laborId) || null;
  return cycle && labor ? { cycle, labor } : null;
}

// Deja las jornadas de `keys` iguales a los pesajes que existen ahora mismo.
// Un grupo que se quedó sin pesajes borra su jornada en vez de dejarla con el
// valor viejo.
async function syncWorkdayKeys(prefixDoc, target, keys) {
  const { cycle, labor } = target;
  const report = { written: 0, removed: 0, blocked: [], unknownRuts: [], daysAdded: [], workersAdded: 0, zeroPriceDays: [] };

  const groups = new Map();
  for (const date of [...new Set(keys.map((k) => k.dateKey))]) {
    const weights = await harvestWeightsService.list({
      wheres: [["prefix", "==", prefixDoc.id], ["dateKey", ">=", date], ["dateKey", "<=", date]],
    });
    for (const w of weights) {
      if (!w.rut || !w.dateKey) continue;
      const { x, y } = mapHarvestCodes(prefixDoc, w);
      const gk = `${w.rut}__${w.dateKey}__${comboKey(x, y)}`;
      const g = groups.get(gk) || { rut: w.rut, dateKey: w.dateKey, x, y, qty: 0 };
      g.qty += Number(w.amount) || 0;
      groups.set(gk, g);
    }
  }

  const rosterKeys = new Set((labor.workers || []).flatMap((w) => [w.rut, w.id].filter(Boolean)));
  const attachDays = new Set();
  const attachWorkers = new Map();

  for (const key of keys) {
    const ck = comboKey(key.x, key.y);
    const docId = workdayDocId(cycle.id, labor.id, key.rut, key.dateKey, ck);
    const existing = await workdaysService.getById(docId);

    // Una jornada ya liquidada no se toca por detrás: dejaría el ciclo
    // diciendo algo distinto de la nómina que la pagó.
    if (existing?.payrollId) {
      report.blocked.push(`${key.rut} · ${key.dateKey}`);
      continue;
    }

    const g = groups.get(`${key.rut}__${key.dateKey}__${ck}`);
    if (!g || g.qty <= 0) {
      if (existing) { await workdaysService.remove(docId); report.removed += 1; }
      continue;
    }

    const combos = getDayCombos(cycle.dayPrices, labor.id, key.dateKey, "unit");
    const combo = combos.find((c) => c.key === ck) || { price: 0, mode: "unit" };
    const amount = combo.mode === "flat" ? combo.price : g.qty * combo.price;
    if (amount === 0 && !report.zeroPriceDays.includes(key.dateKey)) report.zeroPriceDays.push(key.dateKey);
    const worker = await findWorkerByRut(key.rut);
    await workdaysService.upsert(docId, {
      cycleId: cycle.id,
      laborId: labor.id,
      workerRut: key.rut,
      workerId: worker?.id || key.rut,
      date: key.dateKey,
      qualityX: g.x,
      containerY: g.y,
      qty: g.qty,
      amount,
      harvestSynced: true,
      harvestPrefix: prefixDoc.id,
    });
    report.written += 1;

    if (!(cycle.days || []).includes(key.dateKey)) attachDays.add(key.dateKey);
    if (!rosterKeys.has(key.rut)) {
      if (!worker) report.unknownRuts.push(key.rut);
      else if (!attachWorkers.has(worker.id || key.rut)) {
        attachWorkers.set(worker.id || key.rut, { id: worker.id || key.rut, rut: key.rut, name: worker.name || key.rut });
      }
    }
  }

  report.zeroPriceDays.sort();

  if (attachDays.size || attachWorkers.size) {
    const nextLabor = { ...labor, workers: [...(labor.workers || []), ...attachWorkers.values()] };
    await cyclesService.update(cycle.id, {
      days: [...(cycle.days || []), ...attachDays].sort(),
      labors: (cycle.labors || []).map((l) => (l.id === labor.id ? nextLabor : l)),
    });
    report.daysAdded = [...attachDays].sort();
    report.workersAdded = attachWorkers.size;
  }

  return report;
}

// Lleva cada clave tocada a su jornada, creándola si no existía — un combo, un
// trabajador o un día nuevo son exactamente el caso que hay que reflejar, no
// uno que haya que excluir. El único freno es no tener a dónde escribir: un
// prefijo sin ciclo y labor asignados no tiene jornada posible, y eso se
// reporta en `noTarget` para poder decirlo.
async function mirrorWeightToWorkdays(prefixes, keys) {
  const byPrefix = new Map();
  const seen = new Set();
  for (const k of keys) {
    if (seen.has(keyOf(k))) continue;
    seen.add(keyOf(k));
    if (!byPrefix.has(k.prefixId)) byPrefix.set(k.prefixId, []);
    byPrefix.get(k.prefixId).push(k);
  }

  const total = {
    written: 0, removed: 0, blocked: [], unknownRuts: [],
    daysAdded: [], workersAdded: 0, zeroPriceDays: [], noTarget: [],
  };
  let reached = false;
  for (const [prefixId, group] of byPrefix) {
    const doc = prefixes.find((p) => p.id === prefixId);
    const t = doc ? await loadSyncTarget(doc) : null;
    if (!t) { total.noTarget.push(prefixId); continue; }
    reached = true;
    const r = await syncWorkdayKeys(doc, t, group);
    total.written += r.written;
    total.removed += r.removed;
    total.workersAdded += r.workersAdded;
    total.blocked.push(...r.blocked);
    total.unknownRuts.push(...r.unknownRuts);
    total.daysAdded.push(...r.daysAdded);
    total.zeroPriceDays.push(...r.zeroPriceDays);
  }
  total.zeroPriceDays = [...new Set(total.zeroPriceDays)].sort();
  return reached ? total : null;
}

// Vista de `harvestWeights`, la colección cruda que escribe la app de scan.
// Consulta y corrige pesajes; sincronizarlos hacia jornadas se hace desde la
// pestaña de prefijos, que es donde se elige el ciclo y la labor destino.
//
// No hay "total general": los envases no son comparables entre sí (kilos +
// bandejas + capachos no da nada), así que los totales van siempre
// desglosados por combo calidad/envase.
function WeightsExplorer({ prefixes, faenaById }) {
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

  // Buscar por QR resuelve al trabajador y desde ahí filtra por rut, nunca por
  // el `idQr` del pesaje. El código es una llave prestada: se recicla, se
  // pierde, se reemplaza. Filtrar por él escondería justo los pesajes que se
  // quieren revisar cuando alguien cambió de QR — los de antes del cambio.
  const qrMatch = useMemo(() => {
    const needle = search.trim().toUpperCase();
    if (!needle) return null;
    const owner = workers.find((w) =>
      (w.idQr || []).some((c) => String(c || "").trim().toUpperCase() === needle),
    );
    if (owner) return { code: needle, owners: [owner], keys: new Set([owner.id, owner.rut].filter(Boolean)) };

    // Un código liberado no es de nadie hoy, pero los pesajes que lo anotaron
    // siguen diciendo de quién fue. Se resuelve por ahí para que buscar un QR
    // devuelto al pozo no quede mudo. Puede traer más de una persona: el mismo
    // código pudo andar en manos distintas en temporadas distintas.
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

  // Con `cache: true`: tras asignar un QR el servicio invalida la entrada, así
  // que esta llamada trae la lista fresca; el resto de las veces no cuesta
  // lecturas.
  const loadWorkers = () =>
    workersService
      .list({ order: ["name", "asc"], cache: true, persist: true, ttl: 2 * 60 * 60 * 1000 })
      .then(setWorkers)
      .catch(() => { /* sin nombres se muestra el rut, no vale la pena molestar */ });

  useEffect(() => {
    loadWorkers();
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!dateFrom || !dateTo || dateFrom > dateTo) return;
    setBusy(true);
    harvestWeightsService
      .list({ wheres: [["dateKey", ">=", dateFrom], ["dateKey", "<=", dateTo]], order: ["dateKey", "desc"] })
      .then((list) => { if (!cancelled) setWeights(list); })
      .catch((err) => { if (!cancelled) toast.error("No se pudieron leer los pesajes: " + err.message); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [dateFrom, dateTo, reloadKey]);

  // El filtro por prefijo y la búsqueda son en cliente a propósito: sumarlos a
  // la query obligaría a un índice compuesto (rango sobre dateKey + igualdad
  // sobre prefix) por una ganancia nula a este volumen.
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
      if (qrMatch) {
        if (!qrMatch.keys.has(rut)) continue;
      } else if (needle && !rut.toLowerCase().includes(needle) && !name.toLowerCase().includes(needle)) continue;

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
      const entry = { id: w.id, rut, name, date: w.dateKey, prefixId, comboLabel: combo.label, qty, x, y, idQr: w.idQr || "", supervisor: w.supervisor || "" };

      bucket(byWorker, rut, { rut, name, days: new Set() }).days.add(w.dateKey);
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
  }, [weights, prefixFilter, search, prefixById, catalogs, workerNames, qrMatch]);

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
                {p.id} — {faenaById.get(p.faenaId)?.name || p.label}
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
          </span>
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
        <p className="text-sm text-[var(--color-muted)]">Cargando pesajes…</p>
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
                  {d.name && <div className="font-mono text-xs text-[var(--color-muted)]">{d.rut}</div>}
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
              Mostrando {DETAIL_CAP} de {fmt(view.detail.length)} pesajes — achicá el rango o filtrá por prefijo para ver el resto.
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
                    {d.name && <div className="font-mono text-xs text-[var(--color-muted)]">{d.rut}</div>}
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
              Mostrando {DETAIL_CAP} de {fmt(view.detail.length)} pesajes — achicá el rango o filtrá por prefijo para ver el resto.
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
                        {g.name && <div className="font-mono text-xs text-[var(--color-muted)]">{g.rut}</div>}
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
                                  {w.name && <span className="ml-2 font-mono text-[11px] text-[var(--color-muted)]">{w.rut}</span>}
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

// Alta y edición manual de un pesaje. `harvestWeights` la escribe normalmente
// la app de scan; esto es la vía de excepción para corregir una lectura mala o
// cargar una que no se alcanzó a escanear.
//
// Dos cosas que no son obvias:
//
// 1. El documento guarda la numeración del SCAN (`weightProcess`/`weightType`),
//    no la del catálogo. El formulario deja elegir el combo del catálogo y
//    guarda su inversa según el prefijo — con verificación de ida y vuelta,
//    porque un prefijo con remapeo puede no poder representar el combo elegido.
//
// 2. El `rut` que se guarda es el docId del trabajador (el id estable), que es
//    contra el que resuelve la sincronización. Guardar el rut legal actual
//    haría que un trabajador que cambió de cédula no matchee.
function WeightFormModal({ mode, initial, prefixes, workers, catalogs, knownCodes, onClose, onSaved, onWorkersChanged }) {
  const toast = useToast();
  const { displayName } = useAuth();
  const isEdit = mode === "edit";
  const [rut, setRut] = useState(initial?.rut || "");
  const [dateKey, setDateKey] = useState(initial?.dateKey || todayKey());
  const [prefixId, setPrefixId] = useState(initial?.prefix || prefixes[0]?.id || "");
  const [qrPick, setQrPick] = useState(initial?.idQr || "");
  const [busy, setBusy] = useState(false);

  // Asignar un QR desde acá evita salir a Gestión QRs cuando la persona
  // recién llega y todavía no tiene código. Lo que NO evita es la validación:
  // los códigos se reciclan, así que asignar uno puede estar quitándoselo a
  // otra persona, y eso se pregunta.
  const [nuevoQr, setNuevoQr] = useState(null); // null | { code }
  const [confirmarRobo, setConfirmarRobo] = useState(null); // null | { code, from }
  const [recienAsignado, setRecienAsignado] = useState("");

  // Una persona en la pesa descarga varios envases seguidos: mismo trabajador,
  // mismo día, mismo QR, y lo que cambia es el combo y los kilos. Por eso el
  // quién/cuándo/dónde va arriba una sola vez y cada envase es una fila.
  const [rows, setRows] = useState(() => [
    { uid: 1, x: initial?.x ?? 0, y: initial?.y ?? 0, amount: initial?.amount != null ? String(initial.amount) : "" },
  ]);
  const nextUid = useRef(2);

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

  // El idQr es la llave del QR físico que originó el pesaje, no la identidad
  // del trabajador: los códigos se imprimen antes de la cosecha, se entregan, y
  // se reciclan — el mismo XX-19 pudo ser de otra persona la temporada pasada.
  // Queda como rastro de lo que se escaneó ese día; quien necesite saber de
  // quién es el pesaje usa `rut`, nunca esto.
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
    const extra = recienAsignado && prefixOfCode(recienAsignado) === prefixId ? [recienAsignado] : [];
    return [...new Set([...original, ...workerCodes, ...extra])];
  }, [isEdit, initial, rut, prefixId, workerCodes, recienAsignado]);

  // Derivado y no un efecto: cambiar de trabajador o de prefijo invalida la
  // selección anterior sin que haya que sincronizarla a mano.
  const qrCode = qrOptions.includes(qrPick) ? qrPick : qrOptions.length === 1 ? qrOptions[0] : "";

  const sugerencias = useMemo(
    () => (nuevoQr ? suggestFreeCodes(workers, prefixId, knownCodes || new Set()) : []),
    [nuevoQr, workers, prefixId, knownCodes],
  );

  // Verificación de ida y vuelta: si el prefijo tiene un remapeo que no permite
  // representar este combo, guardarlo escribiría un pesaje que se lee como otra
  // cosa. Mejor bloquear que guardar algo que miente.
  const checked = useMemo(
    () =>
      rows.map((r) => {
        const crudo = invertHarvestCodes(prefix, { x: r.x, y: r.y });
        const vuelta = mapHarvestCodes(prefix, crudo);
        return { ...r, crudo, ok: vuelta.x === r.x && vuelta.y === r.y, qty: Number(r.amount) };
      }),
    [rows, prefix],
  );

  const totalQty = checked.reduce((s, r) => s + (Number.isFinite(r.qty) && r.qty > 0 ? r.qty : 0), 0);

  const asignarQr = async (code, fromWorker) => {
    setBusy(true);
    try {
      const { released } = await assignQrCode(code, worker, fromWorker);
      setRecienAsignado(code);
      setQrPick(code);
      setNuevoQr(null);
      setConfirmarRobo(null);
      toast.success(
        released.length
          ? `${code} → ${worker.name || worker.id} · ${released.join(", ")} liberado(s)`
          : `${code} → ${worker.name || worker.id}`,
      );
      onWorkersChanged?.();
    } catch (err) {
      toast.error("No se pudo asignar: " + (err.message || err));
    } finally {
      setBusy(false);
    }
  };

  const pedirAsignacion = () => {
    const code = String(nuevoQr?.code || "").trim().toUpperCase();
    if (!code) { toast.error("Escribí el código del QR"); return; }
    if (prefixOfCode(code) !== prefixId) {
      toast.error(`Ese código no es del prefijo ${prefixId}. Un QR pertenece a la cosecha que dice su prefijo.`);
      return;
    }
    const duenio = ownerOfCode(workers, code);
    if (duenio && duenio.id === worker.id) { toast.info("Esa persona ya tiene ese QR"); setNuevoQr(null); return; }
    if (duenio) { setConfirmarRobo({ code, from: duenio }); return; }
    asignarQr(code, null);
  };

  const submit = async () => {
    if (!worker) { toast.error("Elegí un trabajador de la lista"); return; }
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
    try {
      for (const r of checked) {
        const payload = {
          rut: worker.id,
          dateKey,
          prefix: prefixId,
          weightProcess: r.crudo.weightProcess,
          weightType: r.crudo.weightType,
          amount: r.qty,
          idQr: qrCode,
        };
        // Solo al crear, y nunca al editar:
        //  - `supervisor` es quién estuvo en el pesaje; en una carga a mano ese
        //    es quien la carga. Sobrescribirlo borraría al supervisor real de
        //    un pesaje escaneado; quién editó está en el log.
        //  - `dateInsert` es cuándo se creó el registro, no cuándo se cosechó
        //    (eso es `dateKey`, que puede ser un día pasado). Es con lo que la
        //    app de scan ordena los pesajes dentro del día, así que sin esto
        //    los cargados a mano se le irían todos al principio.
        if (isEdit) await harvestWeightsService.update(initial.id, payload);
        else await harvestWeightsService.create({ ...payload, supervisor: displayName, dateInsert: serverTimestamp() });
      }
      toast.success(isEdit ? "Pesaje actualizado" : `${checked.length} pesaje(s) agregado(s)`);

      // El espejo va aparte: si falla, los pesajes igual quedaron guardados y
      // hay que decirlo así en vez de que parezca que no se guardó nada.
      try {
        const nuevas = checked.map((r) => ({ prefixId, rut: worker.id, dateKey, x: r.x, y: r.y }));
        const vieja = isEdit
          ? { prefixId: initial.prefix, rut: initial.rut, dateKey: initial.dateKey, x: initial.x, y: initial.y }
          : null;
        const mirror = await mirrorWeightToWorkdays(prefixes, vieja ? [vieja, ...nuevas] : nuevas);
        if (!mirror) {
          toast.warning(`El prefijo ${prefixId} no tiene ciclo y labor asignados: el pesaje quedó guardado pero no llega a ninguna jornada. Configuralo en Sincronizar cosechas.`);
        } else {
          const partes = [];
          if (mirror.written) partes.push(`${mirror.written} jornada(s) recalculada(s)`);
          if (mirror.removed) partes.push(`${mirror.removed} sin pesajes, eliminada(s)`);
          if (mirror.daysAdded.length) partes.push(`${mirror.daysAdded.length} día(s) agregado(s) al ciclo`);
          if (mirror.workersAdded) partes.push(`${mirror.workersAdded} trabajador(es) agregado(s)`);
          if (partes.length) toast.success("Jornadas al día: " + partes.join(" · "));
          if (mirror.noTarget.length) {
            toast.warning(`Sin ciclo/labor asignado: ${mirror.noTarget.join(", ")} — esos pesajes no llegan a ninguna jornada.`);
          }
          if (mirror.blocked.length) {
            toast.warning(`No se tocaron jornadas ya liquidadas: ${mirror.blocked.join(", ")}. Corregilas desde la nómina.`);
          }
          if (mirror.unknownRuts.length) {
            toast.warning(`Sin ficha en Trabajadores: ${mirror.unknownRuts.join(", ")} — su jornada no se ve en la grilla.`);
          }
          if (mirror.zeroPriceDays.length) {
            toast.warning(`Sin precio configurado para ${mirror.zeroPriceDays.join(", ")}: esas jornadas quedaron en $0.`);
          }
        }
      } catch (err) {
        toast.warning("El pesaje se guardó, pero no se pudo actualizar la jornada: " + (err.message || err));
      }

      onSaved(dateKey);
    } catch (err) {
      toast.error("No se pudo guardar: " + (err.message || err));
    } finally {
      setBusy(false);
    }
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
      title={isEdit ? "Editar pesaje" : "Nuevos pesajes"}
      size="lg"
      footer={
        <>
          <button onClick={onClose} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm">
            Cancelar
          </button>
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
            nuevoQr ? (
              <span className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  autoFocus
                  value={nuevoQr.code}
                  onChange={(e) => setNuevoQr({ code: e.target.value.toUpperCase() })}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); pedirAsignacion(); } }}
                  placeholder={`${prefixId}-0123`}
                  className="w-36 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={pedirAsignacion}
                  disabled={busy}
                  className={`${TAP} rounded-md bg-[var(--color-accent)] px-2.5 text-xs font-medium text-[var(--color-accent-fg)] disabled:opacity-60`}
                >
                  Asignar
                </button>
                <button
                  type="button"
                  onClick={() => setNuevoQr(null)}
                  className={`${TAP} rounded-md border border-[var(--color-border)] px-2.5 text-xs`}
                >
                  Cancelar
                </button>
                {sugerencias.length > 0 && (
                  <span className="flex w-full flex-wrap items-center gap-1 text-xs text-[var(--color-muted)]">
                    <span>Libres:</span>
                    {sugerencias.map((s) => (
                      <button
                        key={s.code}
                        type="button"
                        onClick={() => setNuevoQr({ code: s.code })}
                        title={
                          s.fueraDeRango
                            ? "Nadie usó nunca este número en este prefijo — puede que el QR no esté impreso"
                            : s.impreso
                              ? "Se usó antes y hoy no es de nadie"
                              : "Nadie lo tiene asignado"
                        }
                        className={`${TAP} rounded-md border px-2 font-mono ${
                          s.impreso
                            ? "border-[var(--color-success,#16a34a)] text-[var(--color-success,#16a34a)]"
                            : "border-[var(--color-border)]"
                        }`}
                      >
                        {s.code}{s.fueraDeRango ? " ?" : ""}
                      </button>
                    ))}
                  </span>
                )}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setNuevoQr({ code: `${prefixId}-` })}
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
                  El prefijo {prefixId} remapea los códigos del scan y esta combinación no se puede representar. Elegí otra, u otro prefijo.
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
          Esto escribe los pesajes crudos y recalcula las jornadas del ciclo, creando el día o el trabajador si hacía falta. Firmás como <strong>{displayName}</strong>.
        </p>
      </form>
    </Modal>

    {/* Va DESPUÉS del formulario a propósito: los dos son `Modal` con `z-50`
        fijo y sin portal, así que puesto antes queda tapado por él. */}
    <ConfirmDialog
      open={!!confirmarRobo}
      title="Ese QR ya tiene dueño"
      message={
        confirmarRobo
          ? `${confirmarRobo.code} es de ${confirmarRobo.from.name || confirmarRobo.from.id}.\n\nSi se lo asignás a ${worker?.name || worker?.id}, esa persona se queda sin ese código. Los pesajes que ya lo anotaron no se tocan: siguen siendo de su dueño de entonces, porque se resuelven por RUT.\n\n¿Pasárselo igual?`
          : ""
      }
      confirmLabel="Pasárselo"
      busy={busy}
      onConfirm={() => asignarQr(confirmarRobo.code, confirmarRobo.from)}
      onCancel={() => setConfirmarRobo(null)}
    />
    </>
  );
}

// Gestión de los QR físicos asignados a trabajadores.
//
// No hay catálogo de QRs: el único registro de un código es estar dentro del
// array `idQr` de algún trabajador. Por eso esta vista se arma desde `worker`
// y solo puede mostrar los códigos asignados — un QR impreso que nadie tiene
// todavía es invisible para el sistema.
function QrManager({ prefixes }) {
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
      const list = await workersService.list({ order: ["name", "asc"] });
      setWorkers(list);
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

    // Data vieja puede tener a alguien con dos códigos de la misma cosecha,
    // de antes de que la asignación soltara el anterior. Se muestra para que
    // se pueda limpiar; reasignar cualquiera de los dos lo resuelve.
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

  // Un pesaje pertenece a su trabajador por `rut`; el `idQr` es solo el rastro
  // del QR físico con el que se lo identificó ese día. Por eso rellenarlo es
  // seguro: no cambia de quién es ningún pesaje.
  //
  // El filtro por prefijo y por "sin código" va en cliente: Firestore no puede
  // consultar por un campo ausente, y los pesajes escaneados antes de que
  // existiera `idQr` no lo tienen — que son justamente los que se buscan.
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

  // Limpiar es un update por trabajador afectado, no un batch: así cada
  // borrado queda en el log de auditoría, que para una acción masiva y
  // destructiva importa más que la velocidad.
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
          <span className="text-xs text-[var(--color-muted)]">{view.total} QR asignados</span>
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
        </div>
      </div>

      {view.duplicated.length > 0 && (
        <p className="rounded-md border border-[var(--color-warning,#d97706)] bg-[var(--color-warning-soft,rgba(217,119,6,0.12))] p-2 text-xs text-[var(--color-warning,#d97706)]">
          ⚠ {view.duplicated.length} código(s) asignados a más de un trabajador: {view.duplicated.join(", ")}. El scan los va a atribuir al primero que encuentre.
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
              ? `Se van a quitar ${clearing.codes.length} código(s) de todos los trabajadores que los tengan. Los QR físicos siguen existiendo, pero dejan de estar asociados a nadie y el scan no va a poder atribuir sus pesajes.`
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

function AssignQrModal({ code: initialCode, from, workers, busy, onClose, onAssign }) {
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

function BackfillQrModal({ code, worker, count, busy, progress, onConfirm, onCancel }) {
  return (
    <Modal
      open
      onClose={onCancel}
      title="Pesajes sin QR registrado"
      size="sm"
      footer={
        <>
          <button onClick={onCancel} disabled={busy} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm disabled:opacity-60">
            Dejar así
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
          >
            {busy ? "Asignando…" : `Asignar ${code}`}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <p>
          <strong>{worker.name || worker.id}</strong> tiene <strong>{count}</strong> pesaje(s) del prefijo{" "}
          <span className="font-mono">{prefixOfCode(code)}</span> sin ningún QR anotado — cargados a mano, o
          escaneados antes de que se guardara el código.
        </p>
        {busy && progress && <ProgressBar label="Anotando el código…" done={progress.done} total={progress.total} />}
        <p className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2 text-xs text-[var(--color-muted)]">
          Esto solo anota la llave con la que hoy se identifica a esta persona en terreno. Ningún pesaje
          cambia de dueño: siguen siendo suyos por RUT, que es lo que se lee al buscar.
        </p>
      </div>
    </Modal>
  );
}

function TypeToConfirm({ word, title, message, confirmLabel, busy, progress, onConfirm, onCancel }) {
  const [typed, setTyped] = useState("");
  const armed = typed.trim().toUpperCase() === String(word).toUpperCase();

  return (
    <Modal
      open
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <button onClick={onCancel} disabled={busy} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm disabled:opacity-60">
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={!armed || busy}
            className="rounded-md bg-[var(--color-danger)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            {busy ? "Procesando…" : confirmLabel}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm">{message}</p>
        {busy && progress && <ProgressBar label="Liberando códigos…" done={progress.done} total={progress.total} />}
        <label className="block">
          <span className="mb-1 block text-sm text-[var(--color-muted)]">
            Escribí <strong className="font-mono">{word}</strong> para confirmar
          </span>
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoFocus
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 font-mono text-sm outline-none focus:border-[var(--color-accent)]"
          />
        </label>
      </div>
    </Modal>
  );
}
