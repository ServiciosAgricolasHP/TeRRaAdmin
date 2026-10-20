// Los ids de <defs> son globales al documento, así que cada gradiente/filtro
// lleva prefijo propio para no pisarse entre gráficos de la misma página.
export function ChartDefs({ id, color, altColor }) {
  return (
    <defs>
      <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity={0.95} />
        <stop offset="100%" stopColor={color} stopOpacity={0.55} />
      </linearGradient>
      <linearGradient id={`${id}-area`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity={0.55} />
        <stop offset="100%" stopColor={color} stopOpacity={0.04} />
      </linearGradient>
      <linearGradient id={`${id}-fill-h`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor={color} stopOpacity={0.6} />
        <stop offset="100%" stopColor={color} stopOpacity={0.95} />
      </linearGradient>
      {altColor && (
        <>
          <linearGradient id={`${id}-alt`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={altColor} stopOpacity={0.95} />
            <stop offset="100%" stopColor={altColor} stopOpacity={0.55} />
          </linearGradient>
          <linearGradient id={`${id}-alt-h`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={altColor} stopOpacity={0.6} />
            <stop offset="100%" stopColor={altColor} stopOpacity={0.95} />
          </linearGradient>
        </>
      )}
      <filter id={`${id}-shadow`} x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="1.5" stdDeviation="2.5" floodOpacity="0.22" />
      </filter>
    </defs>
  );
}
