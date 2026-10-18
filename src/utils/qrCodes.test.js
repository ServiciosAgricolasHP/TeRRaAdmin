import { describe, it, expect } from "vitest";
import { prefixOfCode, codesToRelease, codesOfWorker, ownerOfCode, suggestFreeCodes } from "./qrCodes";

describe("prefixOfCode", () => {
  it("toma lo que va antes del primer guion, en mayúsculas", () => {
    expect(prefixOfCode("xx-0123")).toBe("XX");
    expect(prefixOfCode(" hp-1-2 ")).toBe("HP");
  });

  it("sin guion o sin nada antes del guion no hay prefijo", () => {
    expect(prefixOfCode("HP")).toBe("");
    expect(prefixOfCode("-12")).toBe("");
    expect(prefixOfCode(null)).toBe("");
  });
});

describe("codesToRelease", () => {
  it("suelta los otros códigos del mismo prefijo", () => {
    expect(codesToRelease(["XX-19", "YY-3", "XX-21"], "XX-21")).toEqual(["XX-19"]);
  });

  it("un código sin prefijo no suelta nada", () => {
    expect(codesToRelease(["XX-19"], "21")).toEqual([]);
  });
});

describe("codesOfWorker", () => {
  it("limpia, pasa a mayúsculas y descarta los vacíos", () => {
    expect(codesOfWorker({ idQr: [" xx-1", "", null, "YY-2"] })).toEqual(["XX-1", "YY-2"]);
  });

  it("sin trabajador o sin códigos devuelve una lista vacía", () => {
    expect(codesOfWorker(undefined)).toEqual([]);
    expect(codesOfWorker({})).toEqual([]);
  });
});

describe("ownerOfCode", () => {
  const ana = { id: "1", idQr: ["XX-5"] };
  const beto = { id: "2", idQr: ["YY-1"] };

  it("encuentra a quien tiene el código, sin distinguir mayúsculas ni espacios", () => {
    expect(ownerOfCode([ana, beto], " xx-5 ")).toBe(ana);
  });

  it("un código vacío o que no tiene nadie no tiene dueño", () => {
    expect(ownerOfCode([ana, beto], "")).toBeNull();
    expect(ownerOfCode([ana, beto], "XX-6")).toBeNull();
  });
});

describe("suggestFreeCodes", () => {
  it("ofrece los huecos de la serie con el relleno más usado y marca los que tienen pesajes", () => {
    const workers = [{ idQr: ["XX-001"] }, { idQr: ["XX-003", "YY-002"] }];
    expect(suggestFreeCodes(workers, "XX", new Set(["XX-004"]))).toEqual([
      { code: "XX-002", impreso: false },
      { code: "XX-004", impreso: true },
    ]);
  });

  it("sin huecos sugiere el siguiente al mayor, fuera de rango", () => {
    const workers = [{ idQr: ["XX-1"] }, { idQr: ["XX-2"] }];
    expect(suggestFreeCodes(workers, "XX", new Set())).toEqual([{ code: "XX-3", impreso: false, fueraDeRango: true }]);
  });

  it("no ofrece más de `max` códigos", () => {
    const workers = [{ idQr: ["XX-10"] }];
    expect(suggestFreeCodes(workers, "XX", new Set(), 2).map((c) => c.code)).toEqual(["XX-01", "XX-02"]);
  });

  it("sin prefijo no sugiere nada", () => {
    expect(suggestFreeCodes([{ idQr: ["XX-1"] }], "", new Set())).toEqual([]);
  });
});
