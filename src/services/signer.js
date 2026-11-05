import { auth } from "../firebase";

// El nombre con que firma quien tiene la sesión lo que guarda: su alias o, si
// no tiene, su correo, igual que `displayName` de AuthContext. `AuthProvider`
// fija el alias al cargar el perfil y al cambiarlo.
let signerAlias = "";

export function setSignerAlias(alias) {
  signerAlias = String(alias || "").trim();
}

export function signerName() {
  return signerAlias || auth.currentUser?.email || null;
}
