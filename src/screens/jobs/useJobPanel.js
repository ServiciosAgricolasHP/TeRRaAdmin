import { useEffect, useSyncExternalStore, useState } from "react";
import { useValuesChanged } from "../../hooks/useValuesChanged";

// Las columnas de la grilla de tarjetas (`sm:grid-cols-2 lg:grid-cols-3
// xl:grid-cols-4`), según el ancho de la ventana.
const COLUMN_QUERIES = [
  ["(min-width: 1280px)", 4],
  ["(min-width: 1024px)", 3],
  ["(min-width: 640px)", 2],
];

function subscribeColumns(onChange) {
  const lists = COLUMN_QUERIES.map((q) => window.matchMedia(q[0]));
  lists.forEach((l) => l.addEventListener("change", onChange));
  return () => lists.forEach((l) => l.removeEventListener("change", onChange));
}

function columnsNow() {
  const hit = COLUMN_QUERIES.find((q) => window.matchMedia(q[0]).matches);
  return hit ? hit[1] : 1;
}

// Lo que dura el panel en plegarse; coincide con su `duration-200`.
const CLOSE_MS = 200;

// El panel con el detalle de la faena elegida, que se abre bajo la fila de su
// tarjeta. `panelId` es la faena que muestra: sigue siendo la anterior
// mientras se pliega (`closing`), así se pliega con su contenido. `columns`,
// cuántas tarjetas hay por fila.
export function useJobPanel(selectedId) {
  const columns = useSyncExternalStore(subscribeColumns, columnsNow);
  const [panelId, setPanelId] = useState(selectedId);
  if (useValuesChanged([selectedId]) && selectedId) setPanelId(selectedId);
  const closing = !selectedId && !!panelId;
  useEffect(() => {
    if (!closing) return undefined;
    const timer = setTimeout(() => setPanelId(null), CLOSE_MS);
    return () => clearTimeout(timer);
  }, [closing]);
  return { closing, columns, panelId };
}
