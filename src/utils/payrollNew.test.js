import { describe, it, expect, vi } from "vitest";

// `payrollItem` importa helpers puros de `advancesService`, que importa
// `../firebase`.
vi.mock("../firebase", () => ({ db: {}, auth: { currentUser: null } }));

const {
  inChosenCycles,
  newPayrollCycleDetails,
  stillFreeWorkdays,
  payrollLaborScope,
  inRecalcScope,
} = await import("./payrollItem");

// Ciclos en el orden en que los lista la pantalla (el más nuevo primero).
const ciclo = (id) => ({
  id,
  label: `Faena/Sub/${id}`,
  faenaId: "F",
  subfaenaId: "S",
  days: ["2026-03-03", "2026-03-02"],
  labors: [{ id: "L1" }, { id: "L2" }],
});
const CICLOS = [ciclo("C"), ciclo("B"), ciclo("A")];
const wd = (id, cycleId, laborId = "L1", extra = {}) => ({ id, cycleId, laborId, workerRut: "ANA", ...extra });
const alcance = (details) => details.map((d) => [d.id, d.laborIds]);

describe("inChosenCycles", () => {
  const elegidos = new Map([
    ["A", undefined],
    ["B", ["L1"]],
    ["C", []],
  ]);

  it("un ciclo elegido entero trae todas sus labores", () => {
    expect(inChosenCycles(wd("1", "A", "L2"), elegidos)).toBe(true);
  });

  it("uno elegido con algunas labores trae solo esas", () => {
    expect(inChosenCycles(wd("1", "B", "L1"), elegidos)).toBe(true);
    expect(inChosenCycles(wd("2", "B", "L2"), elegidos)).toBe(false);
  });

  it("uno marcado sin ninguna labor, o que no se eligió, no trae nada", () => {
    expect(inChosenCycles(wd("1", "C", "L1"), elegidos)).toBe(false);
    expect(inChosenCycles(wd("2", "Z", "L1"), elegidos)).toBe(false);
  });
});

describe("newPayrollCycleDetails", () => {
  it("los ciclos elegidos con alguna labor, con lo elegido; uno entero va sin `laborIds`", () => {
    const out = newPayrollCycleDetails({
      cycles: CICLOS,
      chosen: new Map([
        ["A", undefined],
        ["B", ["L1"]],
        ["C", []],
      ]),
    });
    expect(alcance(out)).toEqual([
      ["B", ["L1"]],
      ["A", undefined],
    ]);
    // Firestore rechaza `undefined`: entero es SIN el campo.
    expect(out[1]).not.toHaveProperty("laborIds");
  });

  it("un ciclo que entra solo por los días de una persona queda con `laborIds: []`", () => {
    const out = newPayrollCycleDetails({
      cycles: CICLOS,
      chosen: new Map([["A", undefined]]),
      workdays: [wd("1", "A"), wd("2", "B", "L2")],
    });
    expect(alcance(out)).toEqual([
      ["B", []],
      ["A", undefined],
    ]);
  });

  it("solo con personas: sin ciclos elegidos, entran los de sus días", () => {
    const out = newPayrollCycleDetails({ cycles: CICLOS, workdays: [wd("1", "C"), wd("2", "C", "L2")] });
    expect(alcance(out)).toEqual([["C", []]]);
  });

  it("el día de una persona en un ciclo elegido no le cambia lo elegido", () => {
    const out = newPayrollCycleDetails({
      cycles: CICLOS,
      chosen: new Map([["B", ["L1"]]]),
      workdays: [wd("1", "B", "L2")],
    });
    expect(alcance(out)).toEqual([["B", ["L1"]]]);
  });

  it("un ciclo marcado sin ninguna labor entra si lo trae una persona, solo con sus días", () => {
    const out = newPayrollCycleDetails({
      cycles: CICLOS,
      chosen: new Map([["A", []]]),
      workdays: [wd("1", "A", "L2")],
    });
    expect(alcance(out)).toEqual([["A", []]]);
  });

  it("guarda lo mismo que `cycleDetailOf`: faena, subfaena y período ordenado", () => {
    const [detalle] = newPayrollCycleDetails({
      cycles: CICLOS,
      chosen: new Map([["A", undefined]]),
      faenas: [{ id: "F", name: "Faena Uno" }],
      subfaenas: [{ id: "S", name: "Sub Uno" }],
    });
    expect(detalle).toEqual({
      id: "A",
      label: "Faena/Sub/A",
      faenaId: "F",
      faenaName: "Faena Uno",
      subfaenaId: "S",
      subfaenaName: "Sub Uno",
      firstDay: "2026-03-02",
      lastDay: "2026-03-03",
    });
  });

  it("Recalcular sobre lo guardado no trae el resto de los días de la persona ni las labores destildadas", () => {
    const cycleDetails = newPayrollCycleDetails({
      cycles: CICLOS,
      chosen: new Map([["A", ["L1"]]]),
      workdays: [wd("elegido", "B", "L1")],
    });
    const scope = payrollLaborScope(cycleDetails);
    const vigentes = [
      wd("cosecha", "A", "L1", { payrollId: "N" }),
      wd("elegido", "B", "L1", { payrollId: "N" }),
      wd("destildada", "A", "L2"),
      wd("otroDiaDeLaPersona", "B", "L1"),
      wd("nuevaEnLaLabor", "A", "L1"),
    ];
    expect(vigentes.filter((x) => inRecalcScope(x, "N", scope)).map((x) => x.id)).toEqual([
      "cosecha",
      "elegido",
      "nuevaEnLaLabor",
    ]);
  });
});

describe("stillFreeWorkdays", () => {
  it("de lo elegido deja lo que sigue libre, y cuenta lo que otra nómina tomó o ya no existe", () => {
    const frescas = [wd("1", "A"), wd("2", "A", "L1", { payrollId: "otra" }), wd("3", "A")];
    const { libres, tomadas } = stillFreeWorkdays(frescas, ["1", "2", "borrado"]);
    // "3" está libre pero no se eligió: no entra.
    expect(libres.map((x) => x.id)).toEqual(["1"]);
    expect(tomadas).toBe(2);
  });
});
