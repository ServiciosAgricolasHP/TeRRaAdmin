import { useState } from "react";
import { useValuesChanged } from "../../hooks/useValuesChanged";
import { localIsoDate } from "../../utils/dates";
import { meterEnabled } from "../../utils/readMeterKeys";
import { ConsoleCard } from "./ConsoleCard";
import { useReadMeterConfig } from "./useReadMeterConfig";

// ============================================================
// Registro de lecturas
// ============================================================
// Enciende o apaga el registro de lecturas por pantalla (services/readMeter.js)
// y fija hasta qué día registra.
export function ReadMeterSection() {
  return (
    <ConsoleCard
      id="registro-lecturas"
      title="📈 Registro de lecturas"
      description="Anota qué pantalla lee qué colección y cuánto, por persona y por hora. Registra a todos; el informe filtra por persona."
    >
      <ReadMeterPanel />
    </ConsoleCard>
  );
}

// La fecha `n` días después de `iso` (YYYY-MM-DD).
function plusDays(iso, n) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return localIsoDate(d);
}
const fmtDay = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" });

function statusText(config, today) {
  if (!config?.enabled) return "Apagado.";
  if (meterEnabled(config, today)) return config.until ? `Encendido hasta el ${fmtDay(config.until)}.` : "Encendido, sin fecha de término.";
  return `Apagado: terminó el ${fmtDay(config.until)}.`;
}

function ReadMeterPanel() {
  const { config, error, saving, save } = useReadMeterConfig();
  const today = localIsoDate();
  const [until, setUntil] = useState("");
  if (useValuesChanged([config], { onMount: true }) && config !== undefined) {
    setUntil(config?.until || plusDays(today, 14));
  }

  if (config === undefined && !error) return <p className="text-sm text-[var(--color-muted)]">Cargando…</p>;

  const enabled = meterEnabled(config, today);
  const btn =
    "min-h-[32px] rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-60";

  return (
    <div className="space-y-3">
      <p className="text-sm">
        <b>{statusText(config, today)}</b>
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-[var(--color-muted)]">
          Registrar hasta el
          <input
            type="date"
            value={until}
            min={today}
            onChange={(e) => setUntil(e.target.value)}
            className="mt-1 block min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm text-[var(--color-foreground)]"
          />
        </label>
        <button
          type="button"
          disabled={saving || !until}
          onClick={() => save({ enabled: true, until })}
          className={`${btn} bg-[var(--color-accent)] text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]`}
        >
          {enabled ? "Guardar fecha" : "Encender"}
        </button>
        {enabled ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => save({ enabled: false, until })}
            className={`${btn} border border-[var(--color-border)] hover:bg-[var(--color-accent-soft)]`}
          >
            Apagar
          </button>
        ) : null}
      </div>
      {error ? <p className="text-xs text-[var(--color-danger)]">{error}</p> : null}
      <p className="text-xs text-[var(--color-muted)]">
        El cambio llega a cada persona la próxima vez que abre la app. Cuesta unas 2 lecturas al abrirla y una escritura
        cada 5 minutos de uso. Queda un documento por persona y por día en <code>readLogs</code>.
      </p>
    </div>
  );
}
