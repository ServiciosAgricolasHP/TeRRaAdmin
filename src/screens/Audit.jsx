import EntitySearchPanel from "./audit/EntitySearchPanel";
import SessionsTab from "./audit/SessionsTab";

export default function Audit() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Auditoría</h1>
        <p className="text-sm text-[var(--color-muted)]">
          Sesiones inferidas por gaps de inactividad. Cada sesión agrupa
          acciones consecutivas del mismo usuario separadas por menos del
          gap configurado.
        </p>
      </div>

      <EntitySearchPanel />

      <SessionsTab />
    </div>
  );
}
