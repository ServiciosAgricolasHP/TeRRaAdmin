import { describe, it, expect } from "vitest";
import { jobDates, jobStateGroupOf, jobStateOf, jobsByStateGroup, sinceLabel } from "./jobStatus";

const TODAY = "2026-11-12";
// Un Timestamp guardado (`{ seconds }`) del mediodía local de ese día.
const at = (y, m, d) => ({ seconds: new Date(y, m - 1, d, 12).getTime() / 1000, nanoseconds: 0 });

describe("jobStateOf", () => {
  it("sin ciclos abiertos está cerrada", () => {
    expect(jobStateOf([], TODAY)).toBe("closed");
    expect(jobStateOf([{ status: "closed", days: ["2026-11-11"] }], TODAY)).toBe("closed");
  });

  it("con un ciclo abierto con movimiento en los últimos 15 días está activa", () => {
    expect(jobStateOf([{ days: ["2026-10-01", "2026-10-28"] }], TODAY)).toBe("active");
    expect(jobStateOf([{ days: ["2026-09-01"] }, { days: ["2026-11-10"] }], TODAY)).toBe("active");
  });

  it("con ciclos abiertos sin movimiento hace más de 15 días está pausada", () => {
    expect(jobStateOf([{ days: ["2026-10-27"] }], TODAY)).toBe("paused");
    // El movimiento de un ciclo cerrado no cuenta.
    expect(jobStateOf([{ days: ["2026-09-01"] }, { status: "closed", days: ["2026-11-10"] }], TODAY)).toBe("paused");
  });

  it("un ciclo abierto sin días cuenta desde su inicio o su creación", () => {
    expect(jobStateOf([{ days: [], startDate: "2026-11-05" }], TODAY)).toBe("active");
    expect(jobStateOf([{ createdAt: at(2026, 11, 9) }], TODAY)).toBe("active");
    expect(jobStateOf([{ days: [] }], TODAY)).toBe("paused");
  });
});

describe("jobDates", () => {
  it("el movimiento sale de los ciclos abiertos y la edición de todos, sin pasar de hoy", () => {
    const cycles = [
      { days: ["2026-11-01", "2026-11-20"], updatedAt: at(2026, 11, 3) },
      { status: "closed", days: ["2026-11-10"], updatedAt: at(2026, 11, 11) },
    ];
    expect(jobDates(cycles, TODAY)).toEqual({ movement: TODAY, edited: "2026-11-11" });
  });

  it("sin ciclos abiertos, el movimiento es el de todos; sin `updatedAt`, la edición es el movimiento", () => {
    expect(jobDates([{ status: "closed", days: ["2026-10-02"] }], TODAY)).toEqual({ movement: "2026-10-02", edited: "2026-10-02" });
    expect(jobDates([], TODAY)).toEqual({ movement: "", edited: "" });
  });
});

describe("jobStateGroupOf", () => {
  it("separa cada estado en dos tramos", () => {
    expect(jobStateGroupOf([{ days: ["2026-11-05"] }], TODAY)).toBe("active-week");
    expect(jobStateGroupOf([{ days: ["2026-11-04"] }], TODAY)).toBe("active-recent");
    expect(jobStateGroupOf([{ days: ["2026-10-27"] }], TODAY)).toBe("paused");
    expect(jobStateGroupOf([{ days: ["2026-09-28"] }], TODAY)).toBe("paused");
    expect(jobStateGroupOf([{ days: ["2026-09-27"] }], TODAY)).toBe("paused-to-close");
    expect(jobStateGroupOf([{ status: "closed", days: ["2026-08-01"], updatedAt: at(2026, 10, 20) }], TODAY)).toBe("closed-recent");
    expect(jobStateGroupOf([{ status: "closed", days: ["2026-08-01"], updatedAt: at(2026, 10, 12) }], TODAY)).toBe("closed-archive");
    expect(jobStateGroupOf([], TODAY)).toBe("closed-archive");
  });
});

describe("jobsByStateGroup", () => {
  const jobs = [{ id: "F1" }, { id: "F2" }, { id: "F3" }, { id: "F4" }];
  const cycles = [
    { faenaId: "F1", days: ["2026-11-06"], updatedAt: at(2026, 11, 11) },
    { faenaId: "F2", days: ["2026-11-10"], updatedAt: at(2026, 11, 7) },
    { faenaId: "F3", days: ["2026-11-08"] },
  ];

  it("ordena cada sección por el último movimiento, de la más reciente a la más antigua", () => {
    const { jobsByGroup, dateOf } = jobsByStateGroup(jobs, cycles, TODAY);
    expect(jobsByGroup["active-week"].map((j) => j.id)).toEqual(["F2", "F3", "F1"]);
    expect(jobsByGroup["closed-archive"].map((j) => j.id)).toEqual(["F4"]);
    expect(dateOf).toEqual({ F1: "2026-11-06", F2: "2026-11-10", F3: "2026-11-08", F4: "" });
  });

  it("o por la última edición", () => {
    const { jobsByGroup, dateOf } = jobsByStateGroup(jobs, cycles, TODAY, "edited");
    expect(jobsByGroup["active-week"].map((j) => j.id)).toEqual(["F1", "F3", "F2"]);
    expect(dateOf.F1).toBe("2026-11-11");
  });
});

describe("sinceLabel", () => {
  it("dice hace cuánto, en días o en meses", () => {
    expect(sinceLabel(TODAY, TODAY)).toBe("hoy");
    expect(sinceLabel("2026-11-11", TODAY)).toBe("ayer");
    expect(sinceLabel("2026-11-02", TODAY)).toBe("hace 10 días");
    expect(sinceLabel("2026-08-01", TODAY)).toBe("hace 3 meses");
    expect(sinceLabel("", TODAY)).toBe("");
  });
});
