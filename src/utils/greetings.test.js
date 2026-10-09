import { describe, it, expect } from "vitest";
import { greeting, GREETING_SLOTS } from "./greetings";

const SLOT = GREETING_SLOTS.workerAlreadyInLabor;

describe("greeting", () => {
  it("devuelve el saludo del usuario cuando lo tiene cargado", () => {
    const user = { uid: "u1", greetings: { [SLOT]: "Hola de nuevo" } };
    expect(greeting(user, SLOT, "Ya en la labor")).toBe("Hola de nuevo");
  });

  it("cae al fallback cuando el usuario no tiene ninguno", () => {
    expect(greeting({ uid: "u1" }, SLOT, "Ya en la labor")).toBe("Ya en la labor");
    expect(greeting({ uid: "u1", greetings: {} }, SLOT, "Ya en la labor")).toBe("Ya en la labor");
  });

  it("cae al fallback para una ranura que ese usuario no tiene", () => {
    const user = { greetings: { otraCosa: "Hola" } };
    expect(greeting(user, SLOT, "Ya en la labor")).toBe("Ya en la labor");
  });

  it("un texto vacío o en blanco cuenta como sin saludo", () => {
    // Así borrar el easter egg es vaciar el campo, sin tener que eliminarlo
    // del documento.
    expect(greeting({ greetings: { [SLOT]: "" } }, SLOT, "Ya en la labor")).toBe("Ya en la labor");
    expect(greeting({ greetings: { [SLOT]: "   " } }, SLOT, "Ya en la labor")).toBe("Ya en la labor");
  });

  it("un valor que no es texto no se muestra", () => {
    // Lo que no es texto cae al fallback y no rompe el render.
    expect(greeting({ greetings: { [SLOT]: 42 } }, SLOT, "Ya en la labor")).toBe("Ya en la labor");
    expect(greeting({ greetings: { [SLOT]: { a: 1 } } }, SLOT, "Ya en la labor")).toBe("Ya en la labor");
    expect(greeting({ greetings: { [SLOT]: null } }, SLOT, "Ya en la labor")).toBe("Ya en la labor");
  });

  it("sin usuario tampoco revienta", () => {
    // El primer render corre antes de que AuthContext resuelva el perfil.
    expect(greeting(null, SLOT, "Ya en la labor")).toBe("Ya en la labor");
    expect(greeting(undefined, SLOT, "Ya en la labor")).toBe("Ya en la labor");
  });

  it("sin fallback devuelve vacío, no undefined", () => {
    expect(greeting(null, SLOT)).toBe("");
  });

  it("las ranuras tienen el mismo nombre que su clave", () => {
    // El valor de cada ranura es el nombre del campo en `users/{uid}.greetings`.
    for (const [clave, valor] of Object.entries(GREETING_SLOTS)) {
      expect(valor).toBe(clave);
    }
  });
});
