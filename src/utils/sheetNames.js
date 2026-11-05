// Nombres de hoja de Excel que ExcelJS y Excel aceptan: sin * ? : \ / [ ]
// (van como _), sin apóstrofe al principio ni al final, de 31 caracteres como
// mucho, distintos entre sí sin importar mayúsculas y nunca "History", que
// Excel reserva. Un nombre vacío pasa a ser "Hoja".

const INVALID = /[*?:/\\[\]]/g;
const MAX = 31;

const clean = (raw) =>
  String(raw ?? "")
    .replace(INVALID, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^'+|'+$/g, "")
    .trim();

// Un nombrador por libro: recuerda los nombres ya usados y a uno repetido le
// suma " 2", " 3"…, recortando el nombre para que entre.
export function sheetNamer() {
  const used = new Set();
  return (raw) => {
    let base = clean(clean(raw).slice(0, MAX)) || "Hoja";
    if (base.toLowerCase() === "history") base = "History_";
    let name = base;
    for (let i = 2; used.has(name.toLowerCase()); i += 1) {
      const suffix = ` ${i}`;
      name = clean(base.slice(0, MAX - suffix.length)) + suffix;
    }
    used.add(name.toLowerCase());
    return name;
  };
}

// El nombre de la única hoja de un libro.
export const sheetName = (raw) => sheetNamer()(raw);
