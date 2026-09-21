import { describe, it, expect } from "vitest";
import { isPrefixSyncing, qrLockedLaborsOf } from "./harvestSync";

const pfx = (over = {}) => ({ id: "HP", cycleId: "c1", laborId: "l1", label: "Huerto", ...over });

describe("isPrefixSyncing", () => {
  it("un prefijo activo apuntado a este ciclo con labor sincroniza", () => {
    expect(isPrefixSyncing(pfx(), "c1")).toBe(true);
  });

  it("un prefijo de otro ciclo no bloquea nada acá", () => {
    // Es el caso normal: los prefijos se reapuntan al abrir un ciclo nuevo, así
    // que el ciclo viejo queda con pesajes ya sincronizados pero editable.
    expect(isPrefixSyncing(pfx({ cycleId: "c2" }), "c1")).toBe(false);
  });

  it("un prefijo desactivado no bloquea", () => {
    expect(isPrefixSyncing(pfx({ active: false }), "c1")).toBe(false);
  });

  it("`active` ausente cuenta como activo", () => {
    // Los documentos anteriores al campo no lo traen, y la pantalla de Pesajes
    // QR los muestra como activos. Si acá contaran como inactivos, una labor
    // que sí se sincroniza quedaría editable a mano.
    const { active: _drop, ...sinCampo } = pfx({ active: true });
    expect(sinCampo.active).toBeUndefined();
    expect(isPrefixSyncing(sinCampo, "c1")).toBe(true);
  });

  it("sin labor apuntada no bloquea", () => {
    expect(isPrefixSyncing(pfx({ laborId: null }), "c1")).toBe(false);
    expect(isPrefixSyncing(pfx({ laborId: "" }), "c1")).toBe(false);
  });

  it("sin ciclo o sin prefijo devuelve false, no revienta", () => {
    expect(isPrefixSyncing(null, "c1")).toBe(false);
    expect(isPrefixSyncing(pfx(), null)).toBe(false);
    expect(isPrefixSyncing(undefined, undefined)).toBe(false);
  });
});

describe("qrLockedLaborsOf", () => {
  it("indexa por labor solo los prefijos de este ciclo", () => {
    const m = qrLockedLaborsOf(
      [pfx(), pfx({ id: "SC", cycleId: "c2", laborId: "l9" })],
      "c1",
    );
    expect([...m.keys()]).toEqual(["l1"]);
    expect(m.get("l1").id).toBe("HP");
  });

  it("dos prefijos sobre la misma labor la bloquean igual", () => {
    const m = qrLockedLaborsOf([pfx(), pfx({ id: "SC" })], "c1");
    expect(m.size).toBe(1);
    expect(m.get("l1").id).toBe("HP");
  });

  it("varias labores del mismo ciclo se bloquean por separado", () => {
    const m = qrLockedLaborsOf([pfx(), pfx({ id: "SC", laborId: "l2" })], "c1");
    expect([...m.keys()].sort()).toEqual(["l1", "l2"]);
  });

  it("sin prefijos o sin ciclo devuelve un mapa vacío", () => {
    expect(qrLockedLaborsOf([], "c1").size).toBe(0);
    expect(qrLockedLaborsOf([pfx()], null).size).toBe(0);
    expect(qrLockedLaborsOf().size).toBe(0);
  });
});
