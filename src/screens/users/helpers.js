export const nameOf = (p) => p.alias || p.email || p.id;

export const errorMessage = (err) =>
  err?.code === "permission-denied"
    ? "Las reglas de Firestore no permiten este cambio. Revisa que firestore.rules esté publicado."
    : err?.message || String(err);
