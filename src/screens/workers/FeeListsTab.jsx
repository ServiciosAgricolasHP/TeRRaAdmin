import { useEffect, useState } from "react";
import ScreenLoader from "../../components/ScreenLoader";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { useEmployers } from "../../hooks/useEmployers";
import { feeListsService, FEE_LISTS } from "../../services/feeListsService";
import { fmtCurrency } from "../../utils/format";
import FeeConfigModal from "./FeeConfigModal";
import FeeListModal from "./FeeListModal";
import GenerateFeeListModal from "./GenerateFeeListModal";

const fmt = (iso) => (iso ? iso.split("-").reverse().join("-") : "");

// Las listas de honorarios generadas, de la más nueva a la más antigua, con
// cuántas boletas lleva emitidas cada una. Una lista se abre para marcar las
// boletas y bajar el Excel.
export default function FeeListsTab() {
  const toast = useToast();
  const { isAdmin } = useAuth();
  const { employers } = useEmployers();
  const [lists, setLists] = useState(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [open, setOpen] = useState(null);
  const [configOpen, setConfigOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    feeListsService
      .list(FEE_LISTS)
      .then((l) => !cancelled && setLists(l))
      .catch((e) => !cancelled && setError(e.message || "No se pudieron leer las listas."));
    return () => {
      cancelled = true;
    };
  }, [version]);
  const reload = () => setVersion((v) => v + 1);

  const status = (l) => {
    const t = l.totals || {};
    const done = t.count > 0 && t.issued === t.count;
    return (
      <span className={done ? "text-[var(--color-success)]" : t.issued ? "text-[var(--color-warning)]" : "text-[var(--color-muted)]"}>
        {t.issued || 0} de {t.count || 0} emitidas
      </span>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--color-muted)]">Listas de boletas de honorarios por empleador y período.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setGenerating(true)} className="min-h-9 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]">
            + Generar lista
          </button>
          {isAdmin && (
            <button type="button" onClick={() => setConfigOpen(true)} className="min-h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)]">
              ⚙ Tarifa
            </button>
          )}
        </div>
      </div>

      {error ? (
        <p className="text-sm text-[var(--color-danger)]">{error}</p>
      ) : !lists ? (
        <ScreenLoader label="Cargando listas…" />
      ) : lists.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--color-border)] py-8 text-center text-sm text-[var(--color-muted)]">
          Todavía no hay listas. Genera una con "+ Generar lista".
        </div>
      ) : (
        <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
          {lists.map((l) => (
            <li key={l.id}>
              <button type="button" onClick={() => setOpen(l)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5 text-left text-sm hover:bg-[var(--color-surface-2)]">
                <span className="font-medium">{l.employerName || "—"}</span>
                <span className="tabular-nums">{fmt(l.from)} → {fmt(l.to)}</span>
                <span className="text-[var(--color-muted)]">
                  {l.totals?.people || 0} persona{l.totals?.people === 1 ? "" : "s"} · {l.totals?.days || 0} días
                </span>
                <span className="tabular-nums">
                  {fmtCurrency(l.totals?.gross)} bruto · {fmtCurrency(l.totals?.net)} líquido
                </span>
                <span className="ml-auto">{status(l)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {generating && (
        <GenerateFeeListModal
          employers={employers}
          onClose={() => setGenerating(false)}
          onSaved={(saved) => {
            setGenerating(false);
            toast.success("Lista guardada");
            reload();
            setOpen(saved);
          }}
        />
      )}
      {open && (
        <FeeListModal
          key={open.id}
          list={open}
          onClose={() => setOpen(null)}
          onChanged={() => {
            setOpen(null);
            reload();
          }}
        />
      )}
      {configOpen && <FeeConfigModal onClose={() => setConfigOpen(false)} />}
    </div>
  );
}
