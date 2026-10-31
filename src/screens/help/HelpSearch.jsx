import { useState } from "react";
import { Link } from "react-router-dom";
import { searchHelp, snippetOf } from "../../utils/helpSearch";
import { useMissingHelpReport } from "./useMissingHelpReport";

// "¿Qué quieres hacer?": mientras se escribe, sugiere las secciones de las
// guías que responden la pregunta. Si ninguna sirve, se puede avisar que falta.
export function HelpSearch({ index, isAdmin, guideId, fromPath }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(true);
  const results = searchHelp(index, query, { isAdmin });
  const asked = query.trim().length >= 3;
  const { status, report } = useMissingHelpReport({ query, guideId, fromPath });

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 sm:p-4">
      <label htmlFor="help-search" className="mb-1.5 block text-sm font-semibold">
        ¿Qué quieres hacer?
      </label>
      <input
        id="help-search"
        type="search"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Por ejemplo: cómo agrego a una persona a la nómina"
        autoComplete="off"
        className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
      />
      {open && asked && (
        <div className="mt-2">
          {results.length > 0 ? (
            <ul className="divide-y divide-[var(--color-border)] rounded-md border border-[var(--color-border)]">
              {results.map((r) => (
                <li key={r.id}>
                  <Link
                    to={`/ayuda/${r.guideId}#${r.sectionId}`}
                    onClick={() => setOpen(false)}
                    className="block px-3 py-2 hover:bg-[var(--color-accent-soft)]"
                  >
                    <div className="text-xs text-[var(--color-muted)]">{r.guideTitle}</div>
                    <div className="text-sm font-medium">{r.title}</div>
                    <div className="mt-0.5 text-xs text-[var(--color-muted)]">
                      {snippetOf(r.text, query).map((part, i) =>
                        part.hit ? (
                          <mark key={i} className="rounded-sm bg-[var(--color-accent-soft)] px-0.5 text-[var(--color-text)]">{part.text}</mark>
                        ) : (
                          <span key={i}>{part.text}</span>
                        ),
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--color-muted)]">No encontré eso en la ayuda.</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--color-muted)]">
            {status === "sent" ? (
              <span>Gracias, quedó anotado para sumar esa respuesta a la ayuda.</span>
            ) : (
              <>
                <span>{results.length > 0 ? "¿No es lo que buscabas?" : "Si te falta esta respuesta,"}</span>
                <button
                  type="button"
                  onClick={report}
                  disabled={status === "sending"}
                  className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1 text-xs text-[var(--color-text)] hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
                >
                  {status === "sending" ? "Enviando…" : "Avisar que falta"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
