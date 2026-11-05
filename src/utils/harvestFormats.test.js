import { describe, it, expect } from "vitest";
import { HARVEST_FORMATS, parseHarvestFile } from "./harvestFormats";
import { rowsOfSheet } from "./harvestImport";

// Un archivo de Laguada con datos inventados.
const laguada = (over = {}) => ({
  formato: "harvestLaguada",
  version: 1,
  archivo: "Cerezas semana 1.xlsx",
  semana: "2026-S01",
  estado: "OK",
  periodo: { desde: "2025-12-29", hasta: "2025-12-30" },
  unidad_pago: "caja",
  cosechas: [{ hoja: "Hoja1", especies: ["CEREZOS"] }],
  produccion: [
    { rut: "11.111.111-1", nombre: "ANA PEREZ SOTO", contratista: "UNO", hoja: "Hoja1", fecha: "2025-12-29", campo: "C1", especie: "CEREZOS", calidad: "EXP", envase: "CAPACHO CZ", kilos: 45, cajas: 10, precio_empresa: 1100 },
    { rut: "22.222.222-2", nombre: "BETO RUIZ", contratista: "UNO", hoja: "Hoja1", fecha: "2025-12-30", campo: "C1", especie: "CEREZOS", calidad: "EXP", envase: "TOTEM CZ", kilos: 30, cajas: 6, precio_empresa: null },
  ],
  pisos: [
    { rut: "11.111.111-1", nombre: "ANA PEREZ SOTO", fecha: "2025-12-29", monto: 15000, por: "envase", grupo: "CAPACHO CZ", regla: "" },
    { rut: "11.111.111-1", nombre: "ANA PEREZ SOTO", fecha: "2025-12-30", monto: 5000, por: "calidad", grupo: "EXP", regla: "" },
    { rut: "22.222.222-2", nombre: "BETO RUIZ", fecha: null, monto: 30000, por: null, grupo: null, regla: "BONO" },
    { rut: "22.222.222-2", nombre: "BETO RUIZ", fecha: "2025-12-30", monto: 0, por: null, grupo: null, regla: "" },
  ],
  advertencias: ["Un aviso del script"],
  ...over,
});

describe("los formatos del archivo de cosecha", () => {
  it("reconoce el archivo por su formato y lo traduce a la forma común", () => {
    const { file } = parseHarvestFile(laguada());
    expect(file).toMatchObject({ format: "harvestLaguada", name: "Cerezas semana 1.xlsx", defaultMeasure: "units", warnings: ["Un aviso del script"] });
    expect(file.formatLabel).toMatch(/Laguada/);
    expect(file.rows[0]).toMatchObject({ rut: "11111111-1", date: "2025-12-29", container: "CAPACHO CZ", kilos: 45, units: 10, companyPrice: 1100 });
    expect(file.rows[1].companyPrice).toBe(null);
  });

  it("los pisos: por envase, por otra cosa o del día, y sin los de monto 0", () => {
    const { file } = parseHarvestFile(laguada());
    expect(file.floors.map((f) => [f.by, f.group, f.date])).toEqual([
      ["container", "CAPACHO CZ", "2025-12-29"],
      ["other", "EXP", "2025-12-30"],
      [null, null, null],
    ]);
  });

  it("si la empresa paga por kilo, la cantidad por defecto son los kilos", () => {
    expect(parseHarvestFile(laguada({ unidad_pago: "kilo" })).file.defaultMeasure).toBe("kilos");
  });

  it("rechaza lo que no es un archivo de cosecha conocido, con los formatos que acepta", () => {
    expect(parseHarvestFile(null).error).toBeTruthy();
    expect(parseHarvestFile([]).error).toBeTruthy();
    const unknown = parseHarvestFile({ formato: "otro" }).error;
    for (const f of HARVEST_FORMATS) expect(unknown).toContain(f.label);
    expect(parseHarvestFile(laguada({ version: 2 })).error).toMatch(/versión/);
    expect(parseHarvestFile(laguada({ produccion: undefined })).error).toMatch(/producción/);
    expect(parseHarvestFile(laguada({ produccion: [{ rut: "", fecha: "2025-12-29" }] })).error).toMatch(/filas/);
  });

  it("separa las hojas cuando el archivo trae varias cosechas", () => {
    const rows = laguada().produccion;
    const { file } = parseHarvestFile(laguada({ produccion: [...rows, { ...rows[0], hoja: "Hoja2", especie: "ARANDANOS" }] }));
    expect(rowsOfSheet(file, "Hoja2")).toHaveLength(1);
    expect(rowsOfSheet(file, "")).toHaveLength(3);
  });

  it("cada formato tiene id, nombre y sus funciones", () => {
    for (const f of HARVEST_FORMATS) {
      expect(f.id).toBeTruthy();
      expect(f.label).toBeTruthy();
      expect(typeof f.matches).toBe("function");
      expect(typeof f.parse).toBe("function");
    }
  });
});
