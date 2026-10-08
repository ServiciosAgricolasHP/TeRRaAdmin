// Cuentas de TeRRa: el perfil `users/{uid}` decide el acceso y el rol.
// Los permisos de este archivo son los mismos que aplica `firestore.rules`.

export const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "user", label: "Usuario" },
];

export function isAdminRole(role) {
  return String(role || "").toLowerCase() === "admin";
}

export function roleLabel(role) {
  return isAdminRole(role) ? "Admin" : "Usuario";
}

// "ok" | "none" (sin perfil) | "disabled" (suspendida).
export function accessOf(profile) {
  if (!profile) return "none";
  return profile.disabled === true ? "disabled" : "ok";
}

// Cada predicado devuelve el motivo del bloqueo, o null si la acción vale.
// `target` es un perfil de la lista ({ id, role, disabled }); `myUid`, la
// cuenta con la sesión.

export function roleChangeBlock(target, myUid) {
  if (target.id === myUid) return "No puedes cambiar tu propio rol.";
  if (!isAdminRole(target.role) && target.disabled === true) {
    return "Reactiva la cuenta antes de hacerla admin.";
  }
  return null;
}

export function suspendBlock(target, myUid) {
  if (target.id === myUid) return "No puedes suspender tu propia cuenta.";
  if (isAdminRole(target.role) && target.disabled !== true) {
    return "Quítale el rol de admin antes de suspenderla.";
  }
  return null;
}

export function passwordResetBlock(target) {
  return target.email ? null : "Sin correo: aparece cuando la persona entra a TeRRa.";
}

// "hace 5 min", "hace 3 h", "hace 2 días" y, desde la semana, la fecha.
export function lastSeenLabel(date, now = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "Sin registro";
  const min = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return d === 1 ? "hace 1 día" : `hace ${d} días`;
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${date.getFullYear()}`;
}

// Primero la cuenta propia, después los admins, los usuarios activos y las
// suspendidas; dentro de cada grupo, por correo.
export function sortProfiles(profiles, myUid) {
  const rank = (p) => {
    if (p.id === myUid) return 0;
    if (p.disabled === true) return 3;
    return isAdminRole(p.role) ? 1 : 2;
  };
  const key = (p) => String(p.email || p.id).toLowerCase();
  return [...profiles].sort((a, b) => rank(a) - rank(b) || key(a).localeCompare(key(b)));
}
