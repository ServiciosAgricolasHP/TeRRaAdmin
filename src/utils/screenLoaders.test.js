import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { easterSunday, holyWeekOf, SCREEN_LOADER_FILES, screenLoaderFor } from "./screenLoaders";

const idOn = (isoDate, birthday) => screenLoaderFor(isoDate, birthday).id;
// "general" por cualquiera de las tres que se turnan.
const GENERAL = ["default", "sleeping", "pushingBox"];
const kindOn = (isoDate, birthday) => (GENERAL.includes(idOn(isoDate, birthday)) ? "general" : idOn(isoDate, birthday));

describe("screenLoaderFor", () => {
  it("cada animación de la lista tiene su archivo, y cada archivo está en la lista", () => {
    const files = readdirSync(new URL("../../public/loaders/", import.meta.url));
    expect([...files].sort()).toEqual(Object.values(SCREEN_LOADER_FILES).sort());
  });

  it("devuelve el archivo de la animación", () => {
    expect(screenLoaderFor("2026-10-31")).toEqual({ id: "halloween", file: "cat-halloween.webp" });
  });

  it("las fiestas, con sus dos bordes", () => {
    expect([idOn("2026-09-08"), idOn("2026-09-09"), idOn("2026-09-10"), idOn("2026-09-20"), idOn("2026-09-21")]).toEqual(["winter", "walkingLeft", "independenceDay", "independenceDay", "winter"]);
    expect([kindOn("2026-10-24"), kindOn("2026-10-25"), kindOn("2026-10-31"), kindOn("2026-11-01")]).toEqual(["general", "halloween", "halloween", "general"]);
    expect([kindOn("2026-12-02"), kindOn("2026-12-03"), kindOn("2026-12-04")]).toEqual(["general", "secretariesDay", "general"]);
    expect([kindOn("2026-12-14"), kindOn("2026-12-15"), kindOn("2026-12-31"), kindOn("2027-01-01")]).toEqual(["general", "christmas", "christmas", "summer"]);
    expect([idOn("2027-02-07"), idOn("2027-02-08"), idOn("2027-02-14"), idOn("2027-02-15")]).toEqual(["summer", "valentinesDay", "valentinesDay", "summer"]);
    expect([idOn("2027-02-28"), idOn("2027-03-01"), idOn("2027-03-07"), idOn("2027-03-08"), idOn("2027-03-09")]).toEqual(["summer", "backToSchool", "backToSchool", "womensDay", "summer"]);
  });

  it("las estaciones de Chile; la primavera usa la general", () => {
    expect([idOn("2026-03-20"), idOn("2026-03-21")]).toEqual(["summer", "autumn"]);
    // Días sin lluvia (ver la lluvia, abajo).
    expect([idOn("2026-06-19"), idOn("2026-06-21")]).toEqual(["autumn", "winter"]);
    expect([kindOn("2026-09-22"), kindOn("2026-09-23")]).toEqual(["winter", "general"]);
    // El verano empieza el 21 de diciembre, pero hasta fin de año manda la Navidad.
    expect([kindOn("2026-12-14"), kindOn("2026-12-21")]).toEqual(["general", "christmas"]);
    expect(idOn("2027-02-20")).toBe("summer");
  });

  it("la general se turna por día con la que duerme y la que empuja la caja, también al cambiar de mes", () => {
    expect(["2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26"].map((d) => idOn(d))).toEqual(["sleeping", "pushingBox", "default", "sleeping"]);
    expect(["2026-11-30", "2026-12-01"].map((d) => idOn(d))).toEqual(["default", "sleeping"]);
    // Las estaciones no se turnan.
    expect(["2027-01-10", "2027-01-11", "2027-01-12"].map((d) => idOn(d))).toEqual(["summer", "summer", "summer"]);
  });

  it("Semana Santa, del Domingo de Ramos al de Pascua", () => {
    // Pascua 2026: 5 de abril, así que Ramos cae en marzo.
    expect([idOn("2026-03-28"), idOn("2026-03-29"), idOn("2026-04-05"), idOn("2026-04-06")]).toEqual(["autumn", "easter", "easter", "autumn"]);
    // Pascua 2027: 28 de marzo; antes del 21 de marzo sigue el verano.
    expect([idOn("2027-03-20"), idOn("2027-03-21"), idOn("2027-03-28")]).toEqual(["summer", "easter", "easter"]);
  });

  it("de mayo a agosto, la lluvia día por medio con la estación, también al cambiar de mes", () => {
    expect([idOn("2026-05-01"), idOn("2026-05-02"), idOn("2026-05-31"), idOn("2026-06-01"), idOn("2026-06-02")]).toEqual(["rain", "autumn", "rain", "autumn", "rain"]);
    expect([idOn("2026-07-14"), idOn("2026-07-15"), idOn("2026-08-30"), idOn("2026-08-31")]).toEqual(["rain", "winter", "winter", "rain"]);
    // Fuera de esos meses no llueve, ni en el día que tocaría.
    expect([idOn("2026-04-29"), idOn("2026-09-02")]).toEqual(["autumn", "winter"]);
  });

  it("el cumpleaños de quien mira va por encima de todo", () => {
    expect(idOn("2026-05-01", "05-01")).toBe("birthday");
    expect(idOn("2026-10-31", "10-31")).toBe("birthday");
    expect(idOn("2026-04-05", "04-05")).toBe("birthday");
    expect(idOn("2026-10-30", "10-31")).toBe("halloween");
    expect(idOn("2026-10-31", "")).toBe("halloween");
    expect(idOn("2026-10-31", "13-40")).toBe("halloween");
  });

  it("el 29 de febrero se celebra el 28 en los años que no son bisiestos", () => {
    expect([idOn("2027-02-28", "02-29"), idOn("2028-02-28", "02-29"), idOn("2028-02-29", "02-29")]).toEqual(["birthday", "summer", "birthday"]);
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
