// Los tipos de labor y qué labores nacen con un ciclo nuevo.
//
// Va en su propio módulo porque el form de crear ciclo (Faenas) también lo usa:
// importarlo desde CycleDetail.jsx metería esa pantalla entera, ag-grid
// incluido, en el chunk de Faenas, que es la que se abre al entrar a la app.

export const LABOR_TYPES = [
  { value: "main", label: "Pago al día" },
  { value: "supervision", label: "Supervisión" },
  { value: "extra", label: "Adicional" },
  { value: "cosecha", label: "Cosecha" },
  { value: "trato", label: "A trato" },
  { value: "tratoEtapas", label: "A trato por etapas" },
  { value: "tratoHE", label: "Jornadas con horas extras" },
];

export function laborTypeLabel(type) {
  return LABOR_TYPES.find((t) => t.value === type)?.label || "";
}

// Nombre por defecto de la primera labor del ciclo: "Principal" para `main` y
// el nombre del tipo para los demás.
export function laborDefaultName(type) {
  if (type === "main") return "Principal";
  return laborTypeLabel(type) || "Principal";
}

// Qué labores nacen con un ciclo nuevo, como descriptores SIN `id`: el id lo
// pone quien crea, que es el que ya tiene el generador.
export function initialLaborPlan({ type = "main", withSupervision = false } = {}) {
  const principal = { name: laborDefaultName(type), type };
  // Si la labor elegida ya es de supervisión, `withSupervision` no agrega
  // otra igual.
  if (!withSupervision || type === "supervision") return [principal];
  return [principal, { name: laborTypeLabel("supervision"), type: "supervision" }];
}
