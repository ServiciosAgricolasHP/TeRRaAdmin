import { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { renderGuideMarkdown } from "./renderGuide";

// Una guía: su índice de secciones y las secciones. Al llegar con
// `#sección` (desde una sugerencia de la búsqueda) la lleva a la vista y la
// marca un momento.
export function GuideView({ guide }) {
  const { hash } = useLocation();
  const navigate = useNavigate();
  const sections = guide.sections.map((s) => ({ ...s, html: renderGuideMarkdown(s.body) }));
  const introHtml = renderGuideMarkdown(guide.intro);

  useEffect(() => {
    const id = decodeURIComponent(hash.replace(/^#/, ""));
    if (!id) return;
    const el = document.getElementById(`help-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.add("help-section-hit");
    const t = setTimeout(() => el.classList.remove("help-section-hit"), 2500);
    return () => clearTimeout(t);
  }, [hash, guide.id]);

  // Un enlace de una guía a otra navega dentro de la app.
  const followInternalLink = (e) => {
    const a = e.target.closest("a");
    const href = a?.getAttribute("href") || "";
    if (!href.startsWith("/ayuda")) return;
    e.preventDefault();
    navigate(href);
  };

  return (
    <article className="space-y-4" onClick={followInternalLink}>
      <div>
        <Link to="/ayuda" className="text-sm text-[var(--color-muted)] hover:text-[var(--color-accent)]">
          ← Todas las guías
        </Link>
        <h1 className="mt-1 text-xl font-semibold sm:text-2xl">
          {guide.icon} {guide.title}
        </h1>
        {guide.intro && <div className="help-prose mt-1" dangerouslySetInnerHTML={{ __html: introHtml }} />}
      </div>

      {sections.length > 1 && (
        <nav className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3" aria-label="En esta guía">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">En esta guía</div>
          <ol className="list-decimal space-y-0.5 pl-5 text-sm">
            {sections.map((s) => (
              <li key={s.id}>
                <Link to={`/ayuda/${guide.id}#${s.id}`} className="hover:text-[var(--color-accent)]">
                  {s.title}
                </Link>
              </li>
            ))}
          </ol>
        </nav>
      )}

      {sections.map((s) => (
        <section
          key={s.id}
          id={`help-${s.id}`}
          className="scroll-mt-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 transition-shadow sm:p-5"
        >
          <h2 className="mb-2 text-lg font-semibold">{s.title}</h2>
          <div className="help-prose" dangerouslySetInnerHTML={{ __html: s.html }} />
        </section>
      ))}
    </article>
  );
}
