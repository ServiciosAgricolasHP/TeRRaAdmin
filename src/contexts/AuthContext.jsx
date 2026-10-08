import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { userPrefsService } from "../services/userPrefsService";
import { accessOf } from "../utils/userAccounts";

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

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        try {
          const profile = await loadProfile(fbUser);
          setUser(profile);
          if (profile.access !== "none") {
            userPrefsService
              .recordVisit(fbUser.uid, fbUser.email)
              .catch((err) => console.warn("[Auth] recordVisit failed:", err));
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

  const login = (email, password) => signInWithEmailAndPassword(auth, email, password);
  const logout = () => signOut(auth);

  // Correo de Firebase, en español, para elegir una contraseña nueva.
  const sendPasswordReset = (email) => {
    auth.languageCode = "es";
    return sendPasswordResetEmail(auth, email);
  };

  const hasAccess = user?.access === "ok";
  const isAdmin = hasAccess && user.role === ROLES.ADMIN;

  // Cómo se llama esta persona en los documentos que firma. El correo es el
  // único identificador garantizado, pero termina copiado en datos que
  // después lee gente de terreno; el alias existe para que ahí quede un
  // nombre y no una casilla de mail.
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
