import ConfirmDialog from "../../components/ConfirmDialog";

// Confirmar la publicación de una nómina en el portal de trabajadores, con la
// que está publicada ahora.
export function PublishPortalDialog({ publishing, portal, busy, onConfirm, onCancel }) {
  "use no memo";
  return (
    <ConfirmDialog
      open={!!publishing}
      title="Publicar en el portal de trabajadores"
      message={
        publishing
          ? `¿Publicar "${publishing.name || "Nómina"}" en el portal? ${
              portal?.payrollId === publishing.id
                ? "Ya es la publicada: se actualiza con lo que tiene ahora."
                : portal?.payroll?.name
                  ? `Reemplaza a "${portal.payroll.name}", que es la publicada ahora.`
                  : "Hoy no hay ninguna publicada."
            } Cada trabajador ve solo su detalle, buscando su RUT.`
          : ""
      }
      confirmLabel="Publicar"
      busy={busy}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
