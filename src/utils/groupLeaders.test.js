import { describe, expect, it } from "vitest";
import { enabledLeaderNames, leaderIndex, leaderNameOf } from "./groupLeaders";

describe("leaderNameOf", () => {
  it("toma el nombre, o el de los documentos viejos, en mayúsculas", () => {
    expect(leaderNameOf({ name: " juan " })).toBe("JUAN");
    expect(leaderNameOf({ nombre: "Ana" })).toBe("ANA");
    expect(leaderNameOf({ id: "CHILENOS" })).toBe("CHILENOS");
    expect(leaderNameOf(null)).toBe("");
  });
});

describe("leaderIndex", () => {
  it("guarda si cada líder está habilitado, y con dos del mismo nombre basta uno", () => {
    const index = leaderIndex([
      { name: "JUAN", habilitado: true },
      { name: "ANA", habilitado: false },
      { name: "pedro", habilitado: false },
      { name: "PEDRO", habilitado: true },
    ]);
    expect(index.get("JUAN")).toBe(true);
    expect(index.get("ANA")).toBe(false);
    expect(index.get("PEDRO")).toBe(true);
    expect(index.has("LUIS")).toBe(false);
  });
});

describe("enabledLeaderNames", () => {
  it("da los habilitados sin repetir y en orden", () => {
    const leaders = [{ name: "luis", habilitado: true }, { name: "ANA", habilitado: true }, { name: "LUIS", habilitado: true }, { name: "EVA" }];
    expect(enabledLeaderNames(leaders)).toEqual(["ANA", "LUIS"]);
    expect(enabledLeaderNames(null)).toEqual([]);
  });
});
