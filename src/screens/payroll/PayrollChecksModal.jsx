import { useMemo, useState } from "react";
import Modal from "../../components/Modal";
import { checkOf } from "../../utils/payrollChecks/payrollChecks";
import { matchesSearchQuery } from "../../utils/textSearch";
import { workerSearchInput } from "../../utils/workerSearch";
import { CheckGroup } from "./payrollChecksModal/CheckGroup";
import { SEVERITY_ICON, SEVERITY_LABEL, worstOpenSeverity } from "./checkSeverity";

const RANK = { red: 0, orange: 1, info: 2 };

// La revisión de la nómina: una sección por revisión, de la más grave a la
// más leve, con las personas y lo encontrado. En Generar es la alarma
// (`onShowInTable` filtra la tabla, `onReview` marca revisadas); en el
// detalle, la explicación. `initialSearch` la abre ya filtrada a una persona.
export function PayrollChecksModal({ alerts, summary, onClose, onReview = null, onShowInTable = null, initialSearch = "" }) {
  const [search, setSearch] = useState(initialSearch);
  const [openIds, setOpenIds] = useState(() => new Set());

  const q = search.trim();
  const visible = useMemo(
    () => (q ? alerts.filter((a) => matchesSearchQuery(a.name, q) || String(a.rut).toLowerCase().includes(q.toLowerCase())) : alerts),
    [alerts, q],
  );

  const groups = useMemo(() => {
    const byCheck = new Map();
    for (const a of visible) {
      if (!byCheck.has(a.checkId)) byCheck.set(a.checkId, []);
      byCheck.get(a.checkId).push(a);
    }
    const rankOf = (list) => {
      const worst = worstOpenSeverity(list);
      return worst ? RANK[worst] : 3;
    };
    return [...byCheck]
      .map(([id, list]) => ({ check: checkOf(id), alerts: list, rank: rankOf(list) }))
      .sort((a, b) => a.rank - b.rank || a.check.order - b.check.order);
  }, [visible]);

  const toggle = (id) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const counts = ["red", "orange", "info"].filter((s) => summary[s] > 0);

  return (
    <Modal open onClose={onClose} title="🔎 Revisión de la nómina" size="xl" section="Revisión de la nómina">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {counts.map((s) => (
            <span key={s} title={SEVERITY_LABEL[s]} className="whitespace-nowrap">
              {SEVERITY_ICON[s]} {summary[s]}
            </span>
          ))}
          {summary.reviewed > 0 && <span className="whitespace-nowrap text-[var(--color-muted)]">✓ {summary.reviewed} revisadas</span>}
          <input
            value={search}
            onChange={(e) => setSearch(workerSearchInput(e.target.value))}
            placeholder="Buscar por nombre o RUT..."
            className="min-h-8 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-accent)] sm:ml-auto sm:w-64"
          />
        </div>
        {groups.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--color-muted)]">{alerts.length ? "Nadie coincide con la búsqueda." : "No hay nada inusual en esta nómina."}</p>
        ) : (
          groups.map((g) => (
            <CheckGroup
              key={g.check.id}
              check={g.check}
              alerts={g.alerts}
              open={!!q || openIds.has(g.check.id)}
              onToggle={() => toggle(g.check.id)}
              onReview={onReview}
              onShowInTable={onShowInTable}
            />
          ))
        )}
      </div>
    </Modal>
  );
}
