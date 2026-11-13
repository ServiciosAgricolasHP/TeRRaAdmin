import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { listCycles, listSubjobs } from "../../services/jobLists";
import { attempt } from "../../utils/attempt";
import { switchableCycles } from "../../utils/cycleSwitch";

// El nombre del ciclo en la ruta de la grilla, como botón con el fondo del
// accent (se ve que se toca) y un marco del accent al pasar el mouse o con la
// lista abierta: abre la lista de los ciclos activos de la misma faena, por
// subfaena, para saltar a otro. Las
// listas salen de las copias que comparten las pantallas, al abrir.
export function CycleSwitcher({ cycle }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState(null);
  const [search, setSearch] = useState("");

  const toggle = async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setSearch("");
    setOpen(true);
    const { value } = await attempt(async () => ({ cycles: await listCycles(), subjobs: await listSubjobs() }));
    setLists(value || { cycles: [], subjobs: [] });
  };
  const go = (id) => {
    setOpen(false);
    if (id !== cycle.id) navigate(`/cycles/${id}`);
  };

  const groups = open && lists
    ? switchableCycles({ cycles: lists.cycles, subjobs: lists.subjobs, jobId: cycle.faenaId, currentId: cycle.id, search })
    : [];
  const total = lists ? lists.cycles.filter((c) => c.faenaId === cycle.faenaId && c.status !== "closed").length : 0;

  return (
    <span className="relative min-w-0">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        title="Cambiar a otro ciclo activo de esta faena"
        className={`inline-flex min-h-8 max-w-full items-center gap-1 rounded-md border bg-[var(--color-accent-soft)] px-1.5 text-left font-medium text-[var(--color-accent)] hover:border-[var(--color-accent)] hover:shadow-sm ${open ? "border-[var(--color-accent)]" : "border-transparent"}`}
      >
        <span className="truncate">{cycle.label}</span>
        <span className="shrink-0 text-xs">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="fixed inset-x-2 top-24 z-40 flex max-h-[70vh] flex-col rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl md:absolute md:inset-x-auto md:left-0 md:top-full md:mt-1 md:w-80">
            {total > 8 && (
              <div className="border-b border-[var(--color-border)] p-1.5">
                <input
                  type="text"
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar subfaena o ciclo"
                  className="min-h-8 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 text-sm outline-none focus:border-[var(--color-accent)]"
                />
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
              {!lists && <p className="px-2 py-3 text-xs text-[var(--color-muted)]">Cargando…</p>}
              {lists && groups.length === 0 && (
                <p className="px-2 py-3 text-xs text-[var(--color-muted)]">{search ? "Nada calza con la búsqueda." : "No hay otros ciclos activos en esta faena."}</p>
              )}
              {groups.map((g) => (
                <div key={g.subjobId || "none"} className="mb-1 last:mb-0">
                  <div className="px-2 pb-0.5 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)] [overflow-wrap:anywhere]">{g.name}</div>
                  {g.cycles.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => go(c.id)}
                      className={`flex min-h-8 w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-sm ${c.current ? "bg-[var(--color-accent-soft)] font-medium text-[var(--color-accent)]" : "text-[var(--color-text)] hover:bg-[var(--color-accent-soft)]"}`}
                    >
                      <span className="[overflow-wrap:anywhere]">{c.name}</span>
                      {c.current && <span className="shrink-0 text-[10px]">● actual</span>}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </span>
  );
}
