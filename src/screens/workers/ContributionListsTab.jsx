import { useEffect, useState } from "react";
import ScreenLoader from "../../components/ScreenLoader";
import { useToast } from "../../contexts/ToastContext";
import { useEmployers } from "../../hooks/useEmployers";
import { contributionListsService, CONTRIBUTION_LISTS } from "../../services/contributionListsService";
import { monthTitle } from "../../utils/contributionLists";
import ContributionListModal from "./ContributionListModal";
import GenerateContributionListModal from "./GenerateContributionListModal";

const fmt = (iso) => (iso ? iso.split("-").reverse().join("-") : "");

// Las listas de imposiciones generadas, de la más nueva a la más antigua, con
// si se enviaron al contador. Una lista se abre para bajar el Excel o
// marcarla enviada.
export default function ContributionListsTab() {
  const toast = useToast();
  const { employers } = useEmployers();
  const [lists, setLists] = useState(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    let cancelled = false;
    contributionListsService
      .list(CONTRIBUTION_LISTS)
      .then((l) => !cancelled && setLists(l))
      .catch((e) => !cancelled && setError(e.message || "No se pudieron leer las listas."));
    return () => {
      cancelled = true;
    };
  }, [version]);
  const reload = () => setVersion((v) => v + 1);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--color-muted)]">Días imponibles del mes por empleador y faena, para el contador.</p>
        <button type="button" onClick={() => setGenerating(true)} className="min-h-9 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]">
          + Generar lista
        </button>
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
                <span className="font-medium">{monthTitle(l.month)}</span>
                <span>{l.employerName || "—"}</span>
                <span className="text-[var(--color-muted)]">
                  {l.totals?.people || 0} persona{l.totals?.people === 1 ? "" : "s"} · {l.totals?.days || 0} días
                  {l.totals?.settlements ? ` · ${l.totals.settlements} con finiquito` : ""}
                </span>
                <span className="ml-auto">
                  {l.sentAt ? <span className="text-[var(--color-success)]">Enviada el {fmt(l.sentAt)}</span> : <span className="text-[var(--color-muted)]">Sin enviar</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {generating && (
        <GenerateContributionListModal
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
        <ContributionListModal
          key={open.id}
          list={open}
          onClose={() => setOpen(null)}
          onChanged={() => {
            setOpen(null);
            reload();
          }}
        />
      )}
    </div>
  );
}
