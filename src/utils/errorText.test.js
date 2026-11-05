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

  it("deja tal cual un mensaje en español", () => {
    expect(errorText(new Error("El ciclo está cerrado. Reábrelo para poder importar."))).toBe("El ciclo está cerrado. Reábrelo para poder importar.");
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
