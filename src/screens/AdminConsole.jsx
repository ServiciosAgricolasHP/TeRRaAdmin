import { AuthDebugSection } from "./adminConsole/AuthDebugSection";
import { BackfillWorkerRutFieldSection } from "./adminConsole/BackfillWorkerRutFieldSection";
import { BackupSection } from "./adminConsole/BackupSection";
import { CollectionCountsSection } from "./adminConsole/CollectionCountsSection";
import { LogsBreakdownSection } from "./adminConsole/LogsBreakdownSection";
import { MigrateAdvanceRutsSection } from "./adminConsole/MigrateAdvanceRutsSection";
import { NormalizeWorkerNamesSection } from "./adminConsole/NormalizeWorkerNamesSection";
import { PingSection } from "./adminConsole/PingSection";
import { ReadMeterSection } from "./adminConsole/ReadMeterSection";
import { ReadReportSection } from "./adminConsole/ReadReportSection";
import { WorkdaysByCycleSection } from "./adminConsole/WorkdaysByCycleSection";
import { WorkdaysByMonthSection } from "./adminConsole/WorkdaysByMonthSection";
import { WorkdaysByRangeSection } from "./adminConsole/WorkdaysByRangeSection";

// Consola admin: diagnóstico, inspección de escala y migraciones únicas.
// Los recuentos usan `getCountFromServer`, que cuesta ~1 lectura por cada
// 1.000 documentos contados. Nada se ejecuta solo: cada botón dispara su
// propia consulta.

function Group({ title, children }) {
  return (
    <div className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
        {title}
      </h2>
      {children}
    </div>
  );
}

export default function AdminConsole() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Consola admin</h1>
        <p className="text-sm text-[var(--color-muted)]">
          Inspección de escala. Cada botón dispara una consulta de recuento
          (~1 lectura por 1000 documentos). No se ejecuta nada hasta que lo dispares.
        </p>
      </div>

      <Group title="Diagnóstico">
        <AuthDebugSection />
        <PingSection />
      </Group>

      <Group title="Respaldos">
        <BackupSection />
      </Group>

      <Group title="Inspección de escala">
        <ReadMeterSection />
        <ReadReportSection />
        <CollectionCountsSection />
        <LogsBreakdownSection />
        <WorkdaysByMonthSection />
        <WorkdaysByRangeSection />
        <WorkdaysByCycleSection />
      </Group>

      {/* Migraciones de una sola corrida, juntas para ver de un vistazo qué
          queda pendiente de migrar. */}
      <Group title="Migraciones únicas">
        <NormalizeWorkerNamesSection />
        <BackfillWorkerRutFieldSection />
        <MigrateAdvanceRutsSection />
      </Group>
    </div>
  );
}
