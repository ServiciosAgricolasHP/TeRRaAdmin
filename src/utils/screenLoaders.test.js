import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BUSY_LOADER_FILE, easterSunday, holyWeekOf, SCREEN_LOADER_FILES, screenLoaderFor, UNDO_LOADER_FILE } from "./screenLoaders";

const idOn = (isoDate, birthday) => screenLoaderFor(isoDate, birthday).id;
const ROTATION = ["default", "pushingBox", "working", "paperwork", "wheel"];
// "semana" por cualquiera de las que salen según el día de la semana.
const WEEKLY = ["sleeping", "rain", "summer", "autumn", "winter", "spring", ...ROTATION];
const kindOn = (isoDate, birthday) => (WEEKLY.includes(idOn(isoDate, birthday)) ? "semana" : idOn(isoDate, birthday));

describe("screenLoaderFor", () => {
  it("cada animación de la lista tiene su archivo, y cada archivo está en la lista", () => {
    const files = readdirSync(new URL("../../public/loaders/", import.meta.url));
    expect([...files].sort()).toEqual([...Object.values(SCREEN_LOADER_FILES), BUSY_LOADER_FILE, UNDO_LOADER_FILE].sort());
  });

  it("devuelve el archivo de la animación", () => {
    expect(screenLoaderFor("2026-10-31")).toEqual({ id: "halloween", file: "cat-halloween.webp" });
  });

  it("sin nada que celebrar: domingo la que duerme, lunes y martes la estación, de miércoles a sábado la rotación", () => {
    // Del domingo 1 al sábado 7 de noviembre de 2026, en primavera.
    const week = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"].map((d) => idOn(d));
    expect(week.slice(0, 3)).toEqual(["sleeping", "spring", "spring"]);
    expect(week.slice(3).every((id) => ROTATION.includes(id))).toBe(true);
  });

  it("la rotación sigue de una semana a la siguiente y pasan todas", () => {
    const turns = ["2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14"].map((d) => idOn(d));
    const start = ROTATION.indexOf(turns[0]);
    expect(turns).toEqual(turns.map((_, i) => ROTATION[(start + i) % ROTATION.length]));
    expect(new Set(turns.slice(0, 5)).size).toBe(5);
  });

  it("las estaciones de Chile el lunes y el martes; en invierno, el martes llueve", () => {
    expect([idOn("2026-03-16"), idOn("2026-03-23"), idOn("2026-04-27"), idOn("2026-04-28")]).toEqual(["summer", "autumn", "autumn", "autumn"]);
    expect([idOn("2026-06-15"), idOn("2026-06-16"), idOn("2026-06-22"), idOn("2026-06-23")]).toEqual(["autumn", "autumn", "winter", "rain"]);
    expect([idOn("2026-07-05"), idOn("2026-07-06"), idOn("2026-07-07")]).toEqual(["sleeping", "winter", "rain"]);
    expect([idOn("2026-09-21"), idOn("2026-09-22"), idOn("2026-11-02")]).toEqual(["winter", "rain", "spring"]);
    expect([idOn("2027-01-11"), idOn("2027-01-12")]).toEqual(["summer", "summer"]);
  });

  it("las festividades, con sus dos bordes, ganan a la semana, también el domingo", () => {
    expect([kindOn("2026-09-08"), kindOn("2026-09-09"), kindOn("2026-09-10"), kindOn("2026-09-20"), kindOn("2026-09-21")]).toEqual(["semana", "walkingLeft", "independenceDay", "independenceDay", "semana"]);
    expect([kindOn("2026-10-24"), kindOn("2026-10-25"), kindOn("2026-10-31"), kindOn("2026-11-01")]).toEqual(["semana", "halloween", "halloween", "semana"]);
    expect([kindOn("2026-12-02"), kindOn("2026-12-03"), kindOn("2026-12-04")]).toEqual(["semana", "secretariesDay", "semana"]);
    expect([kindOn("2026-12-14"), kindOn("2026-12-15"), kindOn("2026-12-31"), kindOn("2027-01-01")]).toEqual(["semana", "christmas", "christmas", "semana"]);
    expect([kindOn("2027-02-07"), kindOn("2027-02-08"), kindOn("2027-02-14"), kindOn("2027-02-15")]).toEqual(["semana", "valentinesDay", "valentinesDay", "semana"]);
    expect([kindOn("2027-02-28"), kindOn("2027-03-01"), kindOn("2027-03-07"), kindOn("2027-03-08"), kindOn("2027-03-09")]).toEqual(["semana", "backToSchool", "backToSchool", "womensDay", "semana"]);
    // El 25 de octubre de 2026 es domingo.
    expect(idOn("2026-10-25")).toBe("halloween");
  });

  it("una fecha de un día gana a las de varios días y al domingo", () => {
    // El 6 de abril: lunes en 2026, domingo en 2025, y Domingo de Ramos en 2031.
    expect([idOn("2026-04-06"), idOn("2025-04-06"), idOn("2026-03-08")]).toEqual(["bossDay", "bossDay", "womensDay"]);
    expect(easterSunday(2031)).toBe("04-13");
    expect([idOn("2031-04-06"), idOn("2031-04-07")]).toEqual(["bossDay", "easter"]);
  });

  it("Semana Santa, del Domingo de Ramos al de Pascua", () => {
    // Pascua 2026: 5 de abril, así que Ramos cae en marzo.
    expect([kindOn("2026-03-28"), kindOn("2026-03-29"), kindOn("2026-04-05"), kindOn("2026-04-06")]).toEqual(["semana", "easter", "easter", "bossDay"]);
    // Pascua 2027: 28 de marzo.
    expect([kindOn("2027-03-20"), kindOn("2027-03-21"), kindOn("2027-03-28")]).toEqual(["semana", "easter", "easter"]);
  });

  it("el cumpleaños de quien mira va por encima de todo", () => {
    expect(idOn("2026-05-01", "05-01")).toBe("birthday");
    expect(idOn("2026-10-31", "10-31")).toBe("birthday");
    expect(idOn("2026-04-05", "04-05")).toBe("birthday");
    expect(idOn("2026-04-06", "04-06")).toBe("birthday");
    expect(idOn("2026-11-01", "11-01")).toBe("birthday");
    expect(idOn("2026-10-30", "10-31")).toBe("halloween");
    expect(idOn("2026-10-31", "")).toBe("halloween");
    expect(idOn("2026-10-31", "13-40")).toBe("halloween");
  });

  it("el 29 de febrero se celebra el 28 en los años que no son bisiestos", () => {
    expect([kindOn("2027-02-28", "02-29"), kindOn("2028-02-28", "02-29"), kindOn("2028-02-29", "02-29")]).toEqual(["birthday", "semana", "birthday"]);
  });

  it("sin fecha válida, la general", () => {
    expect(idOn("")).toBe("default");
    expect(idOn(undefined, "10-31")).toBe("default");
  });
});

describe("easterSunday y holyWeekOf", () => {
  it("las fechas conocidas", () => {
    expect([2024, 2025, 2026, 2027, 2038, 2285].map(easterSunday)).toEqual(["03-31", "04-20", "04-05", "03-28", "04-25", "03-22"]);
  });

  it("Ramos es una semana antes, también cuando cambia de mes", () => {
    expect(holyWeekOf(2025)).toEqual({ from: "04-13", to: "04-20" });
    expect(holyWeekOf(2026)).toEqual({ from: "03-29", to: "04-05" });
    expect(holyWeekOf(2285)).toEqual({ from: "03-15", to: "03-22" });
  });
});
