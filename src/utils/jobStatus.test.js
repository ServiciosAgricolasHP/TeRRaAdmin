import { describe, it, expect } from "vitest";
import { jobStateOf, jobsByState } from "./jobStatus";

const TODAY = "2026-11-12";

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
    expect(jobStateOf([{ createdAt: { seconds: Date.UTC(2026, 10, 9) / 1000, nanoseconds: 0 } }], TODAY)).toBe("active");
    expect(jobStateOf([{ days: [] }], TODAY)).toBe("paused");
  });
});

describe("jobsByState", () => {
  it("reparte las faenas por estado y conserva su orden", () => {
    const jobs = [{ id: "F3" }, { id: "F1" }, { id: "F2" }, { id: "F4" }];
    const cycles = [
      { faenaId: "F1", days: ["2026-11-10"] },
      { faenaId: "F2", days: ["2026-09-01"] },
      { faenaId: "F3", days: ["2026-11-01"] },
    ];
    const out = jobsByState(jobs, cycles, TODAY);
    expect(out.active.map((j) => j.id)).toEqual(["F3", "F1"]);
    expect(out.paused.map((j) => j.id)).toEqual(["F2"]);
    expect(out.closed.map((j) => j.id)).toEqual(["F4"]);
  });
});
