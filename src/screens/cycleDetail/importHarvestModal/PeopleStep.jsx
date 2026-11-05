import { useState } from "react";
import WorkerSearchPicker from "../../../components/WorkerSearchPicker";
import { formatRutForDisplay, validateRut } from "../../../utils/rutUtils";
import { fmtNumber } from "../../../utils/format";
import { newWorkerDefaults } from "../../../utils/harvestImport";

const selectCls =
  "min-h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]";

const STATUS = {
  matched: { label: "Calza", cls: "border border-[var(--color-success)] text-[var(--color-success)]" },
  review: { label: "Revisar", cls: "bg-[var(--color-warning-soft)] text-[var(--color-warning)]" },
  new: { label: "Nueva", cls: "bg-[var(--color-accent-soft)] text-[var(--color-accent)]" },
};

const REASON = {
  nameMismatch: "Su RUT es de una ficha con otro nombre: puede que la empresa lo haya reasignado.",
  otherRut: "Hay una ficha con el mismo nombre y otro RUT.",
};

// Cómo queda la ficha nueva de una persona, según su RUT (`newWorkerDefaults`).
function newWorkerText(rut) {
  const d = newWorkerDefaults(rut);
  if (!d.groupLeader) return "sin líder ni forma de pago";
  return d.cash ? `${d.groupLeader} · efectivo` : d.groupLeader;
}

// El valor del selector de una persona: "use:<id>", "create" o "skip".
const valueOf = (d) => (!d ? "" : d.action === "use" ? `use:${d.workerId}` : d.action);
const decisionOf = (v) => (v.startsWith("use:") ? { action: "use", workerId: v.slice(4) } : v ? { action: v } : null);

// Paso 2 de importar la cosecha: con qué ficha va cada persona del archivo.
// Lo que calza por RUT y nombre va solo; lo dudoso se decide acá.
export function PeopleStep({ h }) {
  const { matches, decisions, setDecision, pending, workerById } = h;
  const [filter, setFilter] = useState(pending ? "review" : "all");
  const counts = { all: matches.length, review: 0, new: 0, matched: 0 };
  for (const m of matches) counts[m.status] += 1;
  const shown = filter === "all" ? matches : matches.filter((m) => m.status === filter);
  const chip = (key, label) => (
    <button
      type="button"
      onClick={() => setFilter(key)}
      className={`min-h-8 rounded-full border px-3 py-1 text-xs ${filter === key ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}
    >
      {label} ({counts[key]})
    </button>
  );
  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--color-muted)]">
        Calza sola la persona cuyo RUT y nombre coinciden con una ficha. Si eliges a mano una ficha que no calzaba, el RUT y el nombre del archivo quedan guardados en ella y la próxima vez calza sola.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {chip("review", "Por revisar")}
        {chip("new", "Nuevas")}
        {chip("matched", "Calzan")}
        {chip("all", "Todas")}
      </div>
      {pending > 0 && (
        <p className="text-sm text-[var(--color-warning)]">Falta decidir {pending} persona{pending === 1 ? "" : "s"}.</p>
      )}
      <ul className="space-y-2">
        {shown.map((m) => (
          <PersonRow key={m.rut} m={m} decision={decisions[m.rut]} setDecision={setDecision} workerById={workerById} />
        ))}
      </ul>
      {shown.length === 0 && <p className="text-sm text-[var(--color-muted)]">No hay personas en este filtro.</p>}
    </div>
  );
}

// Una persona del archivo: lo que trae, el selector con las fichas que le
// calzan y un buscador para elegir cualquier otra.
function PersonRow({ m, decision, setDecision, workerById }) {
  const [searching, setSearching] = useState(false);
  const d = decision;
  const listed = m.status === "matched" ? [m.worker, ...m.candidates] : m.candidates;
  const chosen = d?.action === "use" ? workerById.get(d.workerId) : null;
  const options = chosen && !listed.some((w) => w.id === chosen.id) ? [chosen, ...listed] : listed;
  const canCreate = validateRut(m.rut) && !m.rutTaken;
  const createLabel = m.rutTaken
    ? "Crear una ficha nueva (no: el RUT ya es de otra ficha)"
    : canCreate
      ? `Crear una ficha nueva con este RUT · ${newWorkerText(m.rut)}`
      : "Crear una ficha nueva (el RUT no es válido)";
  const units = (m.units || []).filter((u) => u.units > 0).map((u) => `${fmtNumber(u.units)} ${u.container || "sin envase"}`);
  return (
    <li className={`rounded-lg border p-2.5 text-sm ${!d ? "border-[var(--color-warning)]" : "border-[var(--color-border)]"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="min-w-0 break-words font-medium">{m.name || "(sin nombre)"}</span>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${STATUS[m.status].cls}`}>{STATUS[m.status].label}</span>
      </div>
      <div className="text-xs text-[var(--color-muted)]">
        RUT en el archivo {formatRutForDisplay(m.rut)} · {m.days} día{m.days === 1 ? "" : "s"} · {[...units, `${fmtNumber(m.kilos)} kg`].join(" · ")}
      </div>
      {m.reason && <div className="mt-1 text-xs text-[var(--color-warning)]">{REASON[m.reason]}</div>}
      <div className="mt-2 flex flex-wrap gap-2">
        <select
          aria-label={`Ficha de ${m.name}`}
          value={valueOf(d)}
          onChange={(e) => setDecision(m.rut, decisionOf(e.target.value))}
          className={`${selectCls} min-w-0 flex-1 basis-60`}
        >
          <option value="">Elige…</option>
          {options.map((w) => (
            <option key={w.id} value={`use:${w.id}`}>
              Ficha: {w.name} · {formatRutForDisplay(w.rut || w.id)}
            </option>
          ))}
          <option value="create" disabled={!canCreate}>
            {createLabel}
          </option>
          <option value="skip">Dejar fuera</option>
        </select>
        <button
          type="button"
          onClick={() => setSearching((s) => !s)}
          aria-expanded={searching}
          className="min-h-9 shrink-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)]"
        >
          {searching ? "Cerrar búsqueda" : "🔍 Buscar otra ficha"}
        </button>
      </div>
      {d?.action === "create" && (
        <div className="mt-1 text-xs text-[var(--color-muted)]">
          Ficha nueva: {newWorkerText(m.rut)}
          {!newWorkerDefaults(m.rut).groupLeader && ". Complétala después en Trabajadores."}
        </div>
      )}
      {searching && (
        <div className="mt-2">
          <WorkerSearchPicker
            autoFocus
            onPick={(w) => {
              setDecision(m.rut, { action: "use", workerId: w.id });
              setSearching(false);
            }}
          />
        </div>
      )}
    </li>
  );
}
