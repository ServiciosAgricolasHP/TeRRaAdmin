import { describe, expect, it } from "vitest";
import {
  accessOf,
  isAdminRole,
  lastSeenLabel,
  passwordResetBlock,
  roleChangeBlock,
  roleLabel,
  sortProfiles,
  suspendBlock,
} from "./userAccounts";

const ME = "me";

describe("roles", () => {
  it("admin se reconoce sin distinguir mayúsculas", () => {
    expect(isAdminRole("admin")).toBe(true);
    expect(isAdminRole("ADMIN")).toBe(true);
    expect(isAdminRole("user")).toBe(false);
    expect(isAdminRole(undefined)).toBe(false);
  });

  it("todo lo que no es admin se muestra como usuario", () => {
    expect(roleLabel("Admin")).toBe("Admin");
    expect(roleLabel("user")).toBe("Usuario");
    expect(roleLabel("supervisor")).toBe("Usuario");
    expect(roleLabel(null)).toBe("Usuario");
  });
});

describe("accessOf", () => {
  it("sin perfil no hay acceso", () => {
    expect(accessOf(null)).toBe("none");
    expect(accessOf(undefined)).toBe("none");
  });

  it("un perfil suspendido no tiene acceso", () => {
    expect(accessOf({ role: "user", disabled: true })).toBe("disabled");
  });

  it("cualquier otro perfil tiene acceso", () => {
    expect(accessOf({ role: "user" })).toBe("ok");
    expect(accessOf({ role: "admin", disabled: false })).toBe("ok");
    expect(accessOf({})).toBe("ok");
  });
});

describe("cambiar rol", () => {
  it("nunca el propio", () => {
    expect(roleChangeBlock({ id: ME, role: "admin" }, ME)).toMatch(/propio rol/);
  });

  it("una cuenta suspendida no pasa a admin", () => {
    expect(roleChangeBlock({ id: "u1", role: "user", disabled: true }, ME)).toMatch(/Reactiva/);
  });

  it("el resto se puede cambiar", () => {
    expect(roleChangeBlock({ id: "u1", role: "user" }, ME)).toBeNull();
    expect(roleChangeBlock({ id: "a2", role: "admin" }, ME)).toBeNull();
  });
});

describe("suspender", () => {
  it("nunca la propia cuenta", () => {
    expect(suspendBlock({ id: ME, role: "user" }, ME)).toMatch(/propia cuenta/);
  });

  it("un admin activo no se suspende", () => {
    expect(suspendBlock({ id: "a2", role: "ADMIN" }, ME)).toMatch(/rol de admin/);
  });

  it("un usuario se suspende y se reactiva", () => {
    expect(suspendBlock({ id: "u1", role: "user" }, ME)).toBeNull();
    expect(suspendBlock({ id: "u1", role: "user", disabled: true }, ME)).toBeNull();
  });
});

describe("restablecer contraseña", () => {
  it("necesita el correo del perfil", () => {
    expect(passwordResetBlock({ id: "u1" })).toMatch(/Sin correo/);
    expect(passwordResetBlock({ id: "u1", email: "u1@terra.test" })).toBeNull();
  });
});

describe("lastSeenLabel", () => {
  const now = new Date(2026, 9, 8, 12, 0);
  const minutesAgo = (m) => new Date(now.getTime() - m * 60000);

  it("sin fecha no hay registro", () => {
    expect(lastSeenLabel(null, now)).toBe("Sin registro");
    expect(lastSeenLabel(new Date("x"), now)).toBe("Sin registro");
  });

  it("minutos, horas y días", () => {
    expect(lastSeenLabel(minutesAgo(0), now)).toBe("recién");
    expect(lastSeenLabel(minutesAgo(5), now)).toBe("hace 5 min");
    expect(lastSeenLabel(minutesAgo(180), now)).toBe("hace 3 h");
    expect(lastSeenLabel(minutesAgo(60 * 24), now)).toBe("hace 1 día");
    expect(lastSeenLabel(minutesAgo(60 * 24 * 6), now)).toBe("hace 6 días");
  });

  it("desde la semana, la fecha", () => {
    expect(lastSeenLabel(new Date(2026, 8, 3, 9, 30), now)).toBe("03-09-2026");
  });
});

describe("sortProfiles", () => {
  it("la cuenta propia, admins, usuarios y suspendidas, cada grupo por correo", () => {
    const list = [
      { id: "s1", role: "user", disabled: true, email: "a@x" },
      { id: "u2", role: "user", email: "z@x" },
      { id: "a1", role: "admin", email: "m@x" },
      { id: ME, role: "user", email: "y@x" },
      { id: "u1", role: "user", email: "b@x" },
      { id: "u3", role: "user" },
    ];
    expect(sortProfiles(list, ME).map((p) => p.id)).toEqual([ME, "a1", "u1", "u3", "u2", "s1"]);
  });

  it("no modifica la lista original", () => {
    const list = [{ id: "b" }, { id: "a" }];
    sortProfiles(list, ME);
    expect(list.map((p) => p.id)).toEqual(["b", "a"]);
  });
});
