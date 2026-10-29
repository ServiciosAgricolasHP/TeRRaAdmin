import { createContext, useContext } from "react";

// La sesión y el perfil de quien usa la app. Lo provee `AuthProvider`.
export const AuthContext = createContext(null);

export const ROLES = { ADMIN: "admin", SUPERVISOR: "supervisor" };

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
