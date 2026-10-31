import firstSteps from "./guides/primeros-pasos.md?raw";
import cycleGrid from "./guides/grilla-del-ciclo.md?raw";

// Las guías de la ayuda, en el orden del índice. El texto de cada una vive en
// su `.md` de `guides/` y sus capturas en `public/help/<id>/`, que regenera
// `npm run help:shots`. Una guía con `adminOnly` solo la ve un admin.
export const GUIDES = [
  { id: "primeros-pasos", icon: "👋", source: firstSteps },
  { id: "grilla-del-ciclo", icon: "🗓", source: cycleGrid },
];
