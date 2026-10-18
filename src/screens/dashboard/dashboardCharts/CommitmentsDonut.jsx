import { ResponsiveContainer, PieChart, Tooltip, Pie, Cell } from "recharts";
import { PieTooltip } from "./ChartTooltip";

// Dona de Cheques y pagos del Dashboard, una porción por grupo. La leyenda con
// los montos la arma el Dashboard, así se ve aunque Recharts no haya cargado.
// Ocupa el alto y el ancho del contenedor.
export function CommitmentsDonut({ slices }) {
  const data = slices.filter((s) => s.value > 0);
  const total = data.reduce((sum, s) => sum + s.value, 0);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <defs>
          <filter id="cmt-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.22" />
          </filter>
        </defs>
        <Tooltip content={<PieTooltip total={total} />} />
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={62}
          outerRadius={92}
          paddingAngle={data.length > 1 ? 2 : 0}
          stroke="var(--color-surface)"
          strokeWidth={2}
          filter="url(#cmt-shadow)"
        >
          {data.map((s) => (
            <Cell key={s.name} fill={s.color} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}
