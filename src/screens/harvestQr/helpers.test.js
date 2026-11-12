import { describe, it, expect, vi, afterEach } from "vitest";
import { nextSyncRange } from "./helpers";

afterEach(() => vi.useRealTimers());

const today = (iso) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${iso}T15:00:00`));
};

describe("nextSyncRange", () => {
  it("empieza en el último día sincronizado, incluido: pudo quedar a media jornada", () => {
    today("2026-03-10");
    expect(nextSyncRange({ days: ["2026-03-08", "2026-03-09"] })).toEqual({ from: "2026-03-09", to: "2026-03-10" });
  });

  it("no pasa de hoy, ni de 14 días desde el inicio", () => {
    today("2026-04-30");
    expect(nextSyncRange({ days: ["2026-03-01"] })).toEqual({ from: "2026-03-01", to: "2026-03-15" });
    today("2026-03-10");
    expect(nextSyncRange({ days: ["2026-03-10"] })).toEqual({ from: "2026-03-10", to: "2026-03-10" });
  });

  it("sin sincronizaciones previas, los últimos 14 días", () => {
    today("2026-03-20");
    expect(nextSyncRange(null)).toEqual({ from: "2026-03-06", to: "2026-03-20" });
  });
});
