// La animación de la pantalla de carga que toca cada día. Los archivos viven en
// `public/loaders/`. Manda el cumpleaños de quien mira, después una fecha
// especial, después la lluvia (día por medio en los meses de lluvia), después
// la estación del año y, en primavera o sin nada que celebrar, la general, que
// se turna por día con otras dos.
import { isBirthdayOn } from "./userAccounts";

export const SCREEN_LOADER_FILES = {
  default: "cat-default.webp",
  sleeping: "cat-sleeping.webp",
  pushingBox: "cat-pushing-box.webp",
  birthday: "cat-birthday.webp",
  valentinesDay: "cat-valentines-day.webp",
  backToSchool: "cat-back-to-school.webp",
  womensDay: "cat-womens-day.webp",
  walkingLeft: "cat-walking-left.webp",
  independenceDay: "cat-independence-day.webp",
  halloween: "cat-halloween.webp",
  secretariesDay: "cat-secretaries-day.webp",
  christmas: "cat-christmas.webp",
  easter: "cat-easter.webp",
  rain: "cat-rain.webp",
  summer: "cat-summer.webp",
  autumn: "cat-autumn.webp",
  winter: "cat-winter.webp",
};

// La animación de un proceso largo (generar o eliminar una nómina), en vez de
// un spinner.
export const BUSY_LOADER_FILE = "cat-chasing-tail.webp";

// Rangos `MM-DD`, los dos días incluidos. Uno con `from` mayor que `to` cruza
// el año nuevo.
const FESTIVITIES = [
  { id: "valentinesDay", from: "02-08", to: "02-14" },
  { id: "backToSchool", from: "03-01", to: "03-07" },
  { id: "womensDay", from: "03-08", to: "03-08" },
  { id: "walkingLeft", from: "09-09", to: "09-09" },
  { id: "independenceDay", from: "09-10", to: "09-20" },
  { id: "halloween", from: "10-25", to: "10-31" },
  { id: "secretariesDay", from: "12-03", to: "12-03" },
  { id: "christmas", from: "12-15", to: "12-31" },
];

// Los meses de lluvia en la zona central: ahí la lluvia se turna por día con la
// estación.
const RAINY_MONTHS = { from: "05-01", to: "08-31" };

// La general se turna por día con estas, en este orden.
const GENERAL_ROTATION = ["default", "sleeping", "pushingBox"];

// Las estaciones en Chile.
const SEASONS = [
  { id: "summer", from: "12-21", to: "03-20" },
  { id: "autumn", from: "03-21", to: "06-20" },
  { id: "winter", from: "06-21", to: "09-22" },
];

const inRange = (md, { from, to }) => (from <= to ? md >= from && md <= to : md >= from || md <= to);

const pad = (n) => String(n).padStart(2, "0");

// El Domingo de Pascua de `year`, como `MM-DD` (algoritmo de Meeus, Jones y
// Butcher para el calendario gregoriano).
export function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${pad(month)}-${pad(day)}`;
}

// Semana Santa: del Domingo de Ramos al Domingo de Pascua. La Pascua cae
// entre el 22 de marzo y el 25 de abril, así que Ramos cae en marzo o abril.
export function holyWeekOf(year) {
  const to = easterSunday(year);
  const [month, day] = to.split("-").map(Number);
  const from = day > 7 ? `${pad(month)}-${pad(day - 7)}` : `03-${pad(31 + day - 7)}`;
  return { from, to };
}

// Días desde el 1 de enero de 1970. Los turnos (la lluvia, la general) van por
// este número y no por el día del mes, así el 31 y el 1 no repiten.
const dayNumber = (isoDate) => {
  const [y, m, d] = isoDate.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
};

// `{ id, file }` de la animación del día. `isoDate`: `YYYY-MM-DD`;
// `birthday`: el `MM-DD` del perfil de quien mira, o vacío.
export function screenLoaderFor(isoDate, birthday) {
  const pick = (id) => ({ id, file: SCREEN_LOADER_FILES[id] });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(isoDate || ""))) return pick("default");
  if (isBirthdayOn(birthday, isoDate)) return pick("birthday");
  const md = isoDate.slice(5);
  const festivity = FESTIVITIES.find((f) => inRange(md, f));
  if (festivity) return pick(festivity.id);
  if (inRange(md, holyWeekOf(Number(isoDate.slice(0, 4))))) return pick("easter");
  if (inRange(md, RAINY_MONTHS) && dayNumber(isoDate) % 2 === 0) return pick("rain");
  const season = SEASONS.find((s) => inRange(md, s));
  if (season) return pick(season.id);
  return pick(GENERAL_ROTATION[dayNumber(isoDate) % GENERAL_ROTATION.length]);
}
