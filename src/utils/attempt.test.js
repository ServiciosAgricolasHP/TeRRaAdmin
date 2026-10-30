import { describe, it, expect } from "vitest";
import { attempt } from "./attempt";

describe("attempt", () => {
  it("devuelve el valor de una función asíncrona", async () => {
    expect(await attempt(async () => 3)).toEqual({ value: 3 });
  });

  it("devuelve el valor de una función sincrónica", async () => {
    expect(await attempt(() => "ok")).toEqual({ value: "ok" });
  });

  it("devuelve el error en vez de lanzar", async () => {
    const boom = new Error("falló");
    expect(await attempt(async () => { throw boom; })).toEqual({ error: boom });
    expect(await attempt(() => { throw boom; })).toEqual({ error: boom });
  });

  it("un valor undefined sigue siendo un resultado sin error", async () => {
    const r = await attempt(async () => {});
    expect(r).toEqual({ value: undefined });
    expect(r.error).toBeUndefined();
  });
});
