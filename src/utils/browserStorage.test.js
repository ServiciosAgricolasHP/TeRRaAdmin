import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readStored, writeStored, readStoredJson, writeStoredJson } from "./browserStorage";

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

const blocked = {
  getItem: () => { throw new Error("SecurityError"); },
  setItem: () => { throw new Error("QuotaExceededError"); },
  removeItem: () => { throw new Error("SecurityError"); },
};

describe("browserStorage", () => {
  beforeEach(() => {
    globalThis.localStorage = memoryStorage();
  });
  afterEach(() => {
    delete globalThis.localStorage;
  });

  it("lee lo que se escribió, como texto", () => {
    writeStored("k", 1);
    expect(readStored("k")).toBe("1");
  });

  it("una clave que no existe da el valor por defecto", () => {
    expect(readStored("nada", "x")).toBe("x");
    expect(readStored("nada")).toBeNull();
  });

  it("null o undefined borran la clave", () => {
    writeStored("k", "a");
    writeStored("k", null);
    expect(readStored("k", "def")).toBe("def");
  });

  it("JSON de ida y vuelta, y uno roto da el valor por defecto", () => {
    writeStoredJson("j", { a: [1, 2] });
    expect(readStoredJson("j")).toEqual({ a: [1, 2] });
    writeStored("j", "{roto");
    expect(readStoredJson("j", {})).toEqual({});
  });

  it("con el almacenamiento bloqueado no lanza y da el valor por defecto", () => {
    globalThis.localStorage = blocked;
    expect(readStored("k", "def")).toBe("def");
    expect(readStoredJson("k", [])).toEqual([]);
    expect(() => writeStored("k", "v")).not.toThrow();
    expect(() => writeStoredJson("k", { a: 1 })).not.toThrow();
  });

  it("sin localStorage (fuera del navegador) tampoco lanza", () => {
    delete globalThis.localStorage;
    expect(readStored("k", "def")).toBe("def");
    expect(() => writeStored("k", "v")).not.toThrow();
  });
});
