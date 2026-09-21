import { describe, it, expect } from "vitest";
import { LABOR_TYPES, laborTypeLabel, laborDefaultName, initialLaborPlan } from "./laborTypes";

describe("LABOR_TYPES", () => {
  it("cubre los siete tipos que entiende la grilla del ciclo", () => {
    // Si acá falta uno, el select de crear ciclo no lo ofrece y la labor hay
    // que cambiarla a mano después. Si sobra uno, se puede crear un ciclo con
    // un tipo que CycleDetail no sabe dibujar.
    expect(LABOR_TYPES.map((t) => t.value)).toEqual([
      "main",
      "supervision",
      "extra",
      "cosecha",
      "trato",
      "tratoEtapas",
      "tratoHE",
    ]);
  });

  it("no hay valores repetidos ni etiquetas vacías", () => {
    const valores = LABOR_TYPES.map((t) => t.value);
    expect(new Set(valores).size).toBe(valores.length);
    for (const t of LABOR_TYPES) expect(t.label.trim()).not.toBe("");
  });
});

describe("laborTypeLabel", () => {
  it("traduce el valor guardado al rótulo que se muestra", () => {
    expect(laborTypeLabel("main")).toBe("Pago al día");
    expect(laborTypeLabel("tratoEtapas")).toBe("A trato por etapas");
  });

  it("un tipo desconocido devuelve vacío, no `undefined`", () => {
    // El valor sale de documentos de Firestore escritos por versiones viejas;
    // un `undefined` acá termina impreso como "undefined" en la pantalla.
    expect(laborTypeLabel("inventado")).toBe("");
    expect(laborTypeLabel(undefined)).toBe("");
  });
});

describe("laborDefaultName", () => {
  it("`main` se sigue llamando Principal", () => {
    // Es como se llamaban todas antes de poder elegir el tipo; renombrarlas
    // cambiaría el encabezado de ciclos que la gente ya conoce.
    expect(laborDefaultName("main")).toBe("Principal");
  });

  it("el resto toma el nombre de su tipo", () => {
    expect(laborDefaultName("cosecha")).toBe("Cosecha");
    expect(laborDefaultName("tratoHE")).toBe("Jornadas con horas extras");
  });

  it("un tipo desconocido no deja la labor sin nombre", () => {
    expect(laborDefaultName("inventado")).toBe("Principal");
    expect(laborDefaultName(undefined)).toBe("Principal");
  });
});

describe("initialLaborPlan", () => {
  it("por defecto es una sola labor al día, como antes", () => {
    expect(initialLaborPlan()).toEqual([{ name: "Principal", type: "main" }]);
  });

  it("respeta el tipo elegido", () => {
    expect(initialLaborPlan({ type: "cosecha" })).toEqual([{ name: "Cosecha", type: "cosecha" }]);
  });

  it("con el check agrega supervisión después de la principal", () => {
    const plan = initialLaborPlan({ type: "cosecha", withSupervision: true });
    expect(plan).toEqual([
      { name: "Cosecha", type: "cosecha" },
      { name: "Supervisión", type: "supervision" },
    ]);
  });

  it("no duplica supervisión si la labor elegida ya es de supervisión", () => {
    // Si no, el ciclo nace con dos labores idénticas y hay que borrar una.
    const plan = initialLaborPlan({ type: "supervision", withSupervision: true });
    expect(plan).toEqual([{ name: "Supervisión", type: "supervision" }]);
  });

  it("los descriptores van sin `id`: lo pone quien crea el ciclo", () => {
    for (const l of initialLaborPlan({ type: "trato", withSupervision: true })) {
      expect(l).not.toHaveProperty("id");
    }
  });
});
