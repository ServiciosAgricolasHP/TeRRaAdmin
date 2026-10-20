import { createContext, useContext, useEffect, useRef, useState } from "react";
import { onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { userPrefsService } from "../services/userPrefsService";
import { accessOf, visitDue } from "../utils/userAccounts";

const AuthContext = createContext(null);

const ROLES = { ADMIN: "admin", SUPERVISOR: "supervisor" };

// `access`: "ok", "none" (sin perfil) o "disabled" (suspendida). `role` va en
// minúsculas.
async function loadProfile(user) {
  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists()) {
    return { uid: user.uid, email: user.email, role: null, access: accessOf(null) };
  }
  const data = snap.data();
  const role = String(data.role || ROLES.SUPERVISOR).toLowerCase();
  return { ...data, uid: user.uid, email: user.email, role, access: accessOf(data) };
}

// Correo y hora de la visita en el perfil, para la lista de Usuarios.
const recordVisit = (uid, email) =>
  userPrefsService.recordVisit(uid, email).catch((err) => console.warn("[Auth] recordVisit failed:", err));

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Hora (ms) de la última visita grabada desde esta pestaña.
  const lastVisitRef = useRef(0);

  useEffect(() => {
    return onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        try {
          const profile = await loadProfile(fbUser);
          setUser(profile);
          if (profile.access !== "none") {
            lastVisitRef.current = Date.now();
            recordVisit(fbUser.uid, fbUser.email);
          }
        } catch (e) {
          console.error("Failed to load profile", e);
          setUser({ uid: fbUser.uid, email: fbUser.email, role: ROLES.SUPERVISOR, access: "ok" });
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
  }, []);

  // Con la app abierta, volver a ella o usarla vuelve a grabar la visita, como
  // mucho una vez cada 30 minutos (`visitDue`). Un computador que despierta de
  // la suspensión sigue con la página cargada, sin pasar por el inicio de sesión.
  const visitUid = user && user.access !== "none" ? user.uid : null;
  useEffect(() => {
    if (!visitUid) return;
    const onActivity = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (!visitDue(lastVisitRef.current, now)) return;
      lastVisitRef.current = now;
      recordVisit(visitUid, auth.currentUser?.email);
    };
    const opts = { capture: true, passive: true };
    document.addEventListener("visibilitychange", onActivity);
    window.addEventListener("focus", onActivity);
    window.addEventListener("pointerdown", onActivity, opts);
    window.addEventListener("keydown", onActivity, opts);
    return () => {
      document.removeEventListener("visibilitychange", onActivity);
      window.removeEventListener("focus", onActivity);
      window.removeEventListener("pointerdown", onActivity, opts);
      window.removeEventListener("keydown", onActivity, opts);
    };
  }, [visitUid]);

  const login = (email, password) => signInWithEmailAndPassword(auth, email, password);
  const logout = () => signOut(auth);

  // Correo de Firebase, en español, para elegir una contraseña nueva.
  const sendPasswordReset = (email) => {
    auth.languageCode = "es";
    return sendPasswordResetEmail(auth, email);
  };

  const hasAccess = user?.access === "ok";
  const isAdmin = hasAccess && user.role === ROLES.ADMIN;

  // Nombre con que la persona queda en lo que firma: el alias o, si no tiene,
  // el correo. El alias deja un nombre legible en datos que lee gente de terreno.
  const displayName = user ? user.alias || user.email || user.uid : "";

  const updateAlias = async (alias) => {
    if (!user?.uid) return;
    const clean = String(alias || "").trim();
    await userPrefsService.saveAlias(user.uid, clean);
    setUser((u) => (u ? { ...u, alias: clean } : u));
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, login, logout, hasAccess, isAdmin, displayName, updateAlias, sendPasswordReset }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export { ROLES };
