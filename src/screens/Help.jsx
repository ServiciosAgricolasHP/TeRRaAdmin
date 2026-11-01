import { useLocation, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { parseGuide } from "../utils/helpGuides";
import { buildHelpIndex } from "../utils/helpSearch";
import { GUIDES } from "./help/guides";
import { GuideView } from "./help/GuideView";
import { HelpIndex } from "./help/HelpIndex";
import { HelpSearch } from "./help/HelpSearch";

// Las guías son texto fijo del bundle: se leen y se indexan una vez, al cargar
// la pantalla, y buscar no lee nada de Firestore.
const PARSED = GUIDES.map((g) => ({ ...parseGuide(g.id, g.source), icon: g.icon, adminOnly: !!g.adminOnly }));
const INDEX = buildHelpIndex(PARSED);

// La ayuda: el buscador arriba y, debajo, el índice de guías o la guía abierta.
export default function Help() {
  const { guideId } = useParams();
  const { isAdmin } = useAuth();
  const location = useLocation();
  const guides = PARSED.filter((g) => isAdmin || !g.adminOnly);
  const guide = guides.find((g) => g.id === guideId);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <HelpSearch index={INDEX} isAdmin={isAdmin} guideId={guide?.id} fromPath={location.state?.from} />
      {guide ? (
        <GuideView guide={guide} />
      ) : guideId ? (
        <p className="rounded-lg border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-muted)]">
          No existe esa guía. Busca arriba lo que quieres hacer.
        </p>
      ) : (
        <HelpIndex guides={guides} />
      )}
    </div>
  );
}
