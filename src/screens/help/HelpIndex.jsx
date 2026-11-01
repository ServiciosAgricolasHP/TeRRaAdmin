import { Link } from "react-router-dom";
import { plainText } from "../../utils/helpGuides";

// Las guías, una tarjeta por guía con su introducción y sus secciones.
export function HelpIndex({ guides }) {
  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">❓ Ayuda</h1>
        <p className="text-sm text-[var(--color-muted)]">
          Cómo hacer cada tarea en TeRRa, paso a paso. Escribe arriba lo que quieres hacer, o elige una guía.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {guides.map((g) => (
          <Link
            key={g.id}
            to={`/ayuda/${g.id}`}
            className="block rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 hover:border-[var(--color-accent)]"
          >
            <div className="font-semibold">
              {g.icon} {g.title}
            </div>
            <p className="mt-1 text-sm text-[var(--color-muted)]">{plainText(g.intro)}</p>
            <div className="mt-2 text-xs text-[var(--color-muted)]">{g.sections.length} secciones</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
