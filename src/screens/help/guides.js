import firstSteps from "./guides/primeros-pasos.md?raw";
import cycleGrid from "./guides/grilla-del-ciclo.md?raw";
import jobsAndCycles from "./guides/faenas-y-ciclos.md?raw";
import dayPrices from "./guides/precios-del-dia.md?raw";
import payroll from "./guides/nomina.md?raw";
import payrollFixes from "./guides/corregir-nomina.md?raw";
import advances from "./guides/anticipos-y-bonos.md?raw";

// Las guías de la ayuda, en el orden del índice. El texto de cada una vive en
// su `.md` de `guides/` y sus capturas en `public/help/<id>/`, que regenera
// `npm run help:shots`. Una guía con `adminOnly` solo la ve un admin.
export const GUIDES = [
  { id: "primeros-pasos", icon: "👋", source: firstSteps },
  { id: "faenas-y-ciclos", icon: "🌾", source: jobsAndCycles },
  { id: "grilla-del-ciclo", icon: "🗓", source: cycleGrid },
  { id: "precios-del-dia", icon: "💲", source: dayPrices },
  { id: "nomina", icon: "💰", source: payroll },
  { id: "corregir-nomina", icon: "🛠", source: payrollFixes },
  { id: "anticipos-y-bonos", icon: "🪙", source: advances },
];
