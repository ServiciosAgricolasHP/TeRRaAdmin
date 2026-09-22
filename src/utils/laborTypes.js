// Los tipos de labor y qué labores nacen con un ciclo nuevo.
//
// Vive acá y no en `CycleDetail.jsx` porque el form de crear ciclo (Faenas)
// también necesita la lista: importarla desde la pantalla del ciclo arrastraría
// ese módulo entero —8.600 líneas, ag-grid incluido— al chunk de Faenas, que es
// justamente la pantalla que se abre al entrar a la app.

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

// Nombre por defecto de la primera labor del ciclo. `main` conserva
// "Principal": es como se llamaban todas hasta que se pudo elegir el tipo, y
// renombrarlas ahora cambiaría el encabezado de ciclos que la gente ya conoce.
// Para el resto el nombre del tipo es mejor rótulo que "Principal".
export function laborDefaultName(type) {
  if (type === "main") return "Principal";
  return laborTypeLabel(type) || "Principal";
}

// Qué labores nacen con un ciclo nuevo, como descriptores SIN `id`: el id lo
// pone quien crea, que es el que ya tiene el generador.
export function initialLaborPlan({ type = "main", withSupervision = false } = {}) {
  const principal = { name: laborDefaultName(type), type };
  // Si la labor elegida ya es de supervisión, el checkbox no agrega una
  // segunda: quedarían dos labores iguales y hay que borrar una a mano.
  if (!withSupervision || type === "supervision") return [principal];
  return [principal, { name: laborTypeLabel("supervision"), type: "supervision" }];
}
