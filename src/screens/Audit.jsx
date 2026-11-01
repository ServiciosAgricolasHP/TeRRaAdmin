import { useState } from "react";
import EntitySearchPanel from "./audit/EntitySearchPanel";
import SessionsTab from "./audit/SessionsTab";

const TABS = [
  { value: "sessions", label: "🕒 Sesiones" },
  { value: "record", label: "🔍 Buscar por registro" },
];

// Auditoría: las sesiones de un rango de fechas y el historial de un registro,
// cada uno en su pestaña. Ninguna lee hasta que se le pide; las dos quedan
// montadas, así cambiar de pestaña no pierde lo cargado.
export default function Audit() {
  const [tab, setTab] = useState("sessions");

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Auditoría</h1>
      <div className="flex flex-wrap gap-1 border-b border-[var(--color-border)]" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={tab === t.value}
            onClick={() => setTab(t.value)}
            className={`relative min-h-[32px] px-4 py-2 text-sm transition-colors ${
              tab === t.value ? "font-medium text-[var(--color-accent)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            {t.label}
            {tab === t.value && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-[var(--color-accent)]" />}
          </button>
        ))}
      </div>
      <div className={tab === "sessions" ? "space-y-4" : "hidden"}>
        <SessionsTab />
      </div>
      <div className={tab === "record" ? "" : "hidden"}>
        <EntitySearchPanel />
      </div>
    </div>
  );
}
