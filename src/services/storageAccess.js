// La marca de acceso de la sesión (`appAccess`), que revisan las reglas de
// Storage. La pone la función `syncAccessClaim` (`functions/access.js`) cada
// vez que cambia el perfil en `users/{uid}`, y la sesión la recibe al renovar
// su token, como mucho en una hora.
import { auth } from "../firebase";
import { userPrefsService } from "./userPrefsService";

const WAIT_STEPS = 12;
const WAIT_MS = 2500;

let inFlight = null;

const hasClaim = async (user) => (await user.getIdTokenResult(true)).claims.appAccess === true;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function refresh() {
  const user = auth.currentUser;
  if (!user) return false;
  if (await hasClaim(user)) return true;
  // Sin la marca, escribe la visita en el perfil para que la función la ponga,
  // y la espera hasta medio minuto.
  await userPrefsService.recordVisit(user.uid, user.email);
  for (let i = 0; i < WAIT_STEPS; i++) {
    await pause(WAIT_MS);
    if (await hasClaim(user)) return true;
  }
  return false;
}

// Renueva el token de la sesión para que traiga la marca vigente. Devuelve si
// la sesión quedó con acceso. Varias llamadas a la vez comparten la misma
// renovación.
export function refreshStorageAccess() {
  if (!inFlight) {
    inFlight = refresh().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}
