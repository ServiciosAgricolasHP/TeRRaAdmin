import Modal from "../../components/Modal";
import { CatalogSection } from "./CatalogSection";

export function CatalogsModal({ open, onClose, catalogs, onAddEntry, onRenameEntry }) {
  return (
    <Modal open={open} onClose={onClose} title="Catálogos globales" size="xl">
      <p className="mb-5 text-sm text-[var(--color-muted)]">
        Estos catálogos son compartidos por toda la aplicación. Cualquier supervisor puede
        agregar entradas; renombrar afecta los datos históricos (las jornadas guardan el
        número de índice, no el label).
      </p>

      <CatalogGroup
        emoji="🫐"
        title="Cosecha"
        description="Definen cómo se clasifica cada kilo cosechado: a qué calidad y en qué envase se midió. Aparecen como selectores al cargar producción de una labor de tipo cosecha, y se muestran en los resúmenes y comprobantes."
      >
        <CatalogSection
          title="Calidades"
          subtitle="Categoría comercial de cada kilo (Exportación, IQF, Repaso, Consumo, Semilla…)"
          field="qualities" entries={catalogs.qualities || []}
          onAddEntry={onAddEntry} onRenameEntry={onRenameEntry}
        />
        <CatalogSection
          title="Envases"
          subtitle="Recipiente donde se midió (saco, capacho, bandeja, kilo). Define la unidad en los resúmenes."
          field="containers" entries={catalogs.containers || []}
          onAddEntry={onAddEntry} onRenameEntry={onRenameEntry}
        />
      </CatalogGroup>

      <CatalogGroup
        emoji="✂️"
        title="Trato"
        description="Definen qué se hace a trato (poda, amarre…) y cómo se cuenta la cantidad diaria (por metro, por polín, por planta…). Aparecen en la configuración de la labor y, la unidad, junto al precio por día."
      >
        <CatalogSection
          title="Tipos de trato"
          subtitle="Etiqueta de la labor a trato (Poda, Amarre, Desmalezado, Carpas…). Se elige al crear/editar una labor de tipo trato."
          field="tratoTypes" entries={catalogs.tratoTypes || []}
          onAddEntry={onAddEntry} onRenameEntry={onRenameEntry}
        />
        <CatalogSection
          title="Unidades de trato"
          subtitle="Qué representa la cantidad de cada día (Metro, Polín, Planta, Hilera…). Se elige junto al precio en el panel de Precios por día."
          field="tratoUnits" entries={catalogs.tratoUnits || []}
          onAddEntry={onAddEntry} onRenameEntry={onRenameEntry}
        />
      </CatalogGroup>

      <div className="mt-6 flex justify-end">
        <button onClick={onClose} className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]">
          Cerrar
        </button>
      </div>
    </Modal>
  );
}

// Agrupa catálogos relacionados (Cosecha, Trato) en el modal de catálogos:
// encabezado con emoji, título y descripción, y un fondo que lo separa del
// bloque siguiente.
function CatalogGroup({ emoji, title, description, children }) {
  return (
    <section className="mb-5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/50 p-4">
      <div className="mb-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <span aria-hidden>{emoji}</span>
          <span>{title}</span>
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-[var(--color-muted)]">{description}</p>
      </div>
      <div className="grid gap-5 md:grid-cols-2">{children}</div>
    </section>
  );
}
