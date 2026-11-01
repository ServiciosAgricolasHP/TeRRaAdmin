import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { HELP_GUIDE_BY_PATH } from "../../components/layout/helpLinks";
import { parseGuide } from "../../utils/helpGuides";
import { buildHelpIndex, searchHelp } from "../../utils/helpSearch";
import { GUIDES } from "./guides";
import imageSizes from "./imageSizes.json";

const parsed = GUIDES.map((g) => parseGuide(g.id, g.source));
const index = buildHelpIndex(parsed);
const top = (q) => searchHelp(index, q, { isAdmin: true })[0]?.id;

describe("las guías de la ayuda", () => {
  it("cada guía tiene título y secciones, y cada sección sus preguntas de ejemplo", () => {
    for (const g of parsed) {
      expect(g.title, g.id).not.toBe(g.id);
      expect(g.sections.length, g.id).toBeGreaterThan(0);
      for (const s of g.sections) expect(s.questions.length, `${g.id}#${s.id}`).toBeGreaterThan(0);
    }
  });

  it("cada imagen existe en public/help y tiene su ancho y alto anotados", () => {
    for (const g of parsed) {
      for (const s of g.sections) {
        for (const [, src] of s.body.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
          expect(fs.existsSync(new URL(`../../../public/${src}`, import.meta.url)), src).toBe(true);
          expect(imageSizes[src], src).toHaveLength(2);
        }
      }
    }
  });

  it("el botón ? de cada pantalla apunta a una guía que existe", () => {
    const ids = new Set(GUIDES.map((g) => g.id));
    for (const [, guideId] of HELP_GUIDE_BY_PATH) expect(ids.has(guideId), guideId).toBe(true);
  });
});

describe("preguntas típicas", () => {
  it.each([
    ["cómo anoto el monto de un día", "grilla-del-ciclo#anotar-el-monto-de-un-dia"],
    ["cómo agrego un trabajador al ciclo", "grilla-del-ciclo#agregar-a-una-persona-a-la-labor"],
    ["pegar una columna desde excel", "grilla-del-ciclo#anotar-o-borrar-varias-celdas-de-una-vez"],
    ["me equivoqué y quiero volver atrás", "grilla-del-ciclo#deshacer-un-cambio"],
    ["trabajador con sueldo mensual", "grilla-del-ciclo#sueldo-mensual-solo-asistencia"],
    ["no me deja escribir en la celda", "grilla-del-ciclo#si-algo-no-se-deja-editar"],
    ["olvidé mi contraseña", "primeros-pasos#entrar-a-terra"],
    ["cómo pongo el modo oscuro", "primeros-pasos#cambiar-los-colores"],
    ["instalar la app en el celular", "primeros-pasos#usar-terra-en-el-telefono"],
  ])("«%s» encuentra su sección primero", (question, expected) => {
    expect(top(question)).toBe(expected);
  });
});
