import { BUSY_LOADER_FILE } from "../../utils/screenLoaders";

// Overlay de progreso, visible solo cuando hay `info`: el gato que persigue su
// cola, el paso actual, un detalle opcional (ej. "340 / 500") y una barra. No
// es cancelable porque la mayoría de los pasos corren en paralelo. Con
// movimiento reducido en el sistema, sin el gato.
export function ProgressOverlay({ info }) {
  if (!info) return null;
  const pct = Math.max(0, Math.min(100, Math.round(Number(info.percent) || 0)));
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-[420px] max-w-[90vw] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-2xl">
        {/* La animación trae aire a los lados: se recorta al gato. */}
        <img
          src={`${import.meta.env.BASE_URL}loaders/${BUSY_LOADER_FILE}`}
          alt=""
          width={140}
          height={110}
          decoding="async"
          className="mx-auto mb-2 h-[110px] w-[140px] object-cover motion-reduce:hidden"
        />
        <div className="mb-3 text-center text-sm font-medium">{info.step || "Procesando..."}</div>
        {info.detail && (
          <div className="mb-2 text-center text-xs text-[var(--color-muted)]">{info.detail}</div>
        )}
        <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-surface-2)]">
          <div
            className="h-full bg-[var(--color-accent)] transition-all duration-200"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-1 text-right text-xs text-[var(--color-muted)]">{pct}%</div>
      </div>
    </div>
  );
}
