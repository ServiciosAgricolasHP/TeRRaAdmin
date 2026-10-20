// Colores y estilos que comparten los gráficos del Dashboard.
// Todos los gráficos del Dashboard viven acá y el Dashboard importa este
// módulo con React.lazy — así Recharts queda en su propio chunk y las
// tarjetas de KPI pintan sin esperar a que baje la librería.
//
// Los colores salen de las variables del tema (`var(--color-*)`), que viven en
// <html>, así que los gráficos siguen el cambio de tema solos. Nada de verde
// hardcodeado: el accent es naranja en donDiego y violeta en sheridan.

export const AXIS_TICK = { fill: "var(--color-muted)", fontSize: 11 };

export const GRID_STROKE = "var(--color-border)";

export const ACCENT = "var(--color-accent)";

export const WARNING = "var(--color-warning)";

export const MUTED = "var(--color-muted)";
