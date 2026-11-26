// Marca de acceso de cada cuenta en Authentication (`appAccess`), que revisan
// las reglas de Storage (`storage.rules`). Vale `true` cuando la cuenta tiene
// perfil en `users/{uid}` sin `disabled: true`, lo mismo que da acceso en
// `firestore.rules`. La sesión la recibe al renovar su token, como mucho en una
// hora, o cuando la app lo pide (`src/services/storageAccess.js`).

export const ACCESS_CLAIM = "appAccess";

export function profileGrantsAccess(profile) {
  return !!profile && profile.disabled !== true;
}

// Pone la marca de `uid` según su perfil vivo, solo si cambió, y conserva las
// demás marcas de la cuenta. Un perfil sin cuenta en Authentication no hace
// nada.
export async function applyAccessClaim(db, auth, uid) {
  const snap = await db.collection("users").doc(uid).get();
  const access = profileGrantsAccess(snap.exists ? snap.data() : null);
  const account = await auth.getUser(uid).catch((err) => {
    if (err?.code === "auth/user-not-found") return null;
    throw err;
  });
  if (!account) return { uid, access, changed: false, account: false };
  const claims = account.customClaims || {};
  if (claims[ACCESS_CLAIM] === access) return { uid, access, changed: false, account: true };
  await auth.setCustomUserClaims(uid, { ...claims, [ACCESS_CLAIM]: access });
  return { uid, access, changed: true, account: true };
}
