// La animación de la pantalla de carga que toca cada día. Los archivos viven en
// `public/loaders/`. Manda el cumpleaños de quien mira, después una fecha
// especial de un día, después una festividad de varios días y, sin nada que
// celebrar, el día de la semana: lunes y martes la estación (el martes de
// invierno, la lluvia), de miércoles a sábado una rotación y el domingo la que
// duerme.
import { isBirthdayOn } from "./userAccounts";

export const SCREEN_LOADER_FILES = {
  default: "cat-default.webp",
  sleeping: "cat-sleeping.webp",
  pushingBox: "cat-pushing-box.webp",
  working: "cat-working.webp",
  paperwork: "cat-paperwork.webp",
  wheel: "cat-wheel.webp",
  birthday: "cat-birthday.webp",
  bossDay: "cat-boss.webp",
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
  spring: "cat-spring.webp",
};

// La animación de un proceso largo (generar o pagar una nómina), en vez de un
// spinner.
export const BUSY_LOADER_FILE = "cat-wheel-fall.webp";

// La de un proceso largo que deshace algo (eliminar una nómina, revertir su
// pago o sus transferencias).
export const UNDO_LOADER_FILE = "cat-chasing-tail.webp";

// Rangos `MM-DD`, los dos días incluidos. Uno con `from` mayor que `to` cruza
// el año nuevo. Las fechas de un solo día ganan a las de varios días.
const FESTIVITIES = [
  { id: "valentinesDay", from: "02-08", to: "02-14" },
  { id: "backToSchool", from: "03-01", to: "03-07" },
  { id: "womensDay", from: "03-08", to: "03-08" },
  { id: "bossDay", from: "04-06", to: "04-06" },
  { id: "walkingLeft", from: "09-09", to: "09-09" },
  { id: "independenceDay", from: "09-10", to: "09-20" },
  { id: "halloween", from: "10-25", to: "10-31" },
  { id: "secretariesDay", from: "12-03", to: "12-03" },
  { id: "christmas", from: "12-15", to: "12-31" },
];

// La rotación de miércoles a sábado, en este orden. Sigue de una semana a la
// siguiente, así salen todas aunque sean más que esos cuatro días.
const ROTATION = ["default", "pushingBox", "working", "paperwork", "wheel"];

// Las estaciones en Chile.
const SEASONS = [
  { id: "summer", from: "12-21", to: "03-20" },
  { id: "autumn", from: "03-21", to: "06-20" },
  { id: "winter", from: "06-21", to: "09-22" },
  { id: "spring", from: "09-23", to: "12-20" },
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

// Días desde el 1 de enero de 1970, que fue jueves. De ahí salen el día de la
// semana y los turnos de la rotación, sin zona horaria.
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
  const oneDay = FESTIVITIES.find((f) => f.from === f.to && f.from === md);
  if (oneDay) return pick(oneDay.id);
  const festivity = FESTIVITIES.find((f) => f.from !== f.to && inRange(md, f));
  if (festivity) return pick(festivity.id);
  if (inRange(md, holyWeekOf(Number(isoDate.slice(0, 4))))) return pick("easter");

  // Semanas que empiezan el domingo: el día 0 fue jueves.
  const days = dayNumber(isoDate) + 4;
  const weekday = days % 7; // 0 = domingo
  if (weekday === 0) return pick("sleeping");
  if (weekday <= 2) {
    const season = SEASONS.find((s) => inRange(md, s));
    return pick(season.id === "winter" && weekday === 2 ? "rain" : season.id);
  }
  const turn = Math.floor(days / 7) * 4 + (weekday - 3);
  return pick(ROTATION[turn % ROTATION.length]);
}
