import { describe, it, expect, vi } from "vitest";
import { errorText } from "./errorText";

describe("errorText", () => {
  it("traduce los errores de Firebase por su código", () => {
    expect(errorText({ code: "permission-denied", message: "Missing or insufficient permissions." })).toBe("No tienes permiso para hacer esto.");
    expect(errorText({ code: "auth/network-request-failed", message: "Firebase: Error (auth/network-request-failed)." })).toMatch(/^No hay conexión/);
  });

  it("traduce los del navegador por su nombre", () => {
    expect(errorText({ name: "NotAllowedError", message: "Document is not focused." })).toMatch(/^El navegador no dio permiso/);
  });

  it("traduce los de Authentication", () => {
    expect(errorText({ code: "auth/invalid-credential", message: "Firebase: Error (auth/invalid-credential)." })).toBe("El correo o la contraseña no son correctos.");
    expect(errorText({ code: "auth/too-many-requests" })).toMatch(/^Demasiados intentos/);
  });

  it("deja tal cual un mensaje en español", () => {
    expect(errorText(new Error("El ciclo está cerrado. Reábrelo para poder importar."))).toBe("El ciclo está cerrado. Reábrelo para poder importar.");
  });

  it("reconoce un mensaje corto de la app", () => {
    expect(errorText(new Error("RUT inválido"))).toBe("RUT inválido");
    expect(errorText(new Error("Trabajador inválido"))).toBe("Trabajador inválido");
    expect(errorText(new Error("Elige al menos un anticipo."))).toBe("Elige al menos un anticipo.");
  });

  it("un mensaje en inglés sin tildes pasa al texto de reemplazo", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(errorText(new Error("Network Error"))).toBe("Ocurrió un error inesperado.");
    expect(errorText(new TypeError("x.map is not a function"))).toBe("Ocurrió un error inesperado.");
    expect(errorText(new Error("Missing or insufficient permissions."))).toBe("Ocurrió un error inesperado.");
    log.mockRestore();
  });

  it("un mensaje en inglés de una librería pasa al texto de reemplazo y queda en la consola", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    // Aunque traiga un nombre con tildes.
    const err = new Error("Worksheet name Resumen Nómina 1/10 cannot include any of the following characters: * ? : \\ / [ ]");
    expect(errorText(err)).toBe("Ocurrió un error inesperado.");
    expect(errorText(err, "Revisa la consola.")).toBe("Revisa la consola.");
    expect(log).toHaveBeenCalledWith(err);
    log.mockRestore();
  });
});
