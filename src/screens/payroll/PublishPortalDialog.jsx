import ConfirmDialog from "../../components/ConfirmDialog";

// Confirmar la publicación de una nómina en el portal de trabajadores, o su
// actualización si ya está, con las que están publicadas ahora (`published`).
export function PublishPortalDialog({ publishing, published, busy, onConfirm, onCancel }) {
  const already = !!publishing && published.some((p) => p.payrollId === publishing.id);
  const others = published.filter((p) => p.payrollId !== publishing?.id);
  const othersText =
    others.length === 0
      ? "Hoy no hay ninguna publicada."
      : `Se suma a ${others.length === 1 ? `"${others[0].name || "Nómina"}", que ya está publicada` : `las ${others.length} publicadas`}: cada trabajador ve primero la más reciente y un aviso con las demás.`;
  return (
    <ConfirmDialog
      open={!!publishing}
      title={already ? "Actualizar en el portal de trabajadores" : "Publicar en el portal de trabajadores"}
      message={
        publishing
          ? `¿${already ? "Actualizar" : "Publicar"} "${publishing.name || "Nómina"}" en el portal? ${
              already ? "Ya está publicada: se actualiza con lo que tiene ahora." : othersText
            } Cada trabajador ve solo lo suyo, buscando su RUT.`
          : ""
      }
      confirmLabel={already ? "Actualizar" : "Publicar"}
      busy={busy}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

// Confirmar que se retira una nómina del portal; las demás publicadas siguen.
export function UnpublishPortalDialog({ unpublishing, published, busy, onConfirm, onCancel }) {
  const rest = published.filter((p) => p.payrollId !== unpublishing?.id).length;
  return (
    <ConfirmDialog
      open={!!unpublishing}
      title="Retirar del portal de trabajadores"
      message={
        unpublishing
          ? `¿Retirar "${unpublishing.name || "Nómina"}" del portal? Los trabajadores dejan de verla; ${
              rest === 0 ? "no queda ninguna publicada" : rest === 1 ? "sigue la otra publicada" : `siguen las otras ${rest} publicadas`
            }. Se puede volver a publicar.`
          : ""
      }
      confirmLabel="Retirar"
      danger
      busy={busy}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
