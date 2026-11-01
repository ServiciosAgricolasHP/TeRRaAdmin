import { describe, expect, it } from "vitest";
import { parseGuide } from "./helpGuides";
import { buildHelpIndex, searchHelp, snippetOf, stem, termKeys } from "./helpSearch";

describe("stem", () => {
  it("lleva las formas de un verbo a la misma raíz", () => {
    const forms = ["agrego", "agregar", "agregué", "agregado", "agregando", "agregue"];
    expect(new Set(forms.map(stem))).toEqual(new Set(["agreg"]));
    expect(stem("saqué")).toBe(stem("sacar"));
  });

  it("junta singular y plural, con y sin tildes", () => {
    expect(stem("nómina")).toBe(stem("nominas"));
    expect(stem("día")).toBe(stem("días"));
    expect(stem("trabajadores")).toBe(stem("trabajador"));
  });

  it("no deja raíces de menos de 3 letras", () => {
    expect(stem("mes")).toBe("mes");
    expect(stem("dia")).toBe("dia");
  });
});

describe("termKeys", () => {
  const share = (a, b) => termKeys(a).some((k) => termKeys(b).includes(k));

  it("descarta las palabras vacías", () => {
    expect(["cómo", "a", "una", "la", "de", "puedo"].map(termKeys)).toEqual([null, null, null, null, null, null]);
  });

  it("lleva los sinónimos a una sola forma", () => {
    expect(share("trabajador", "persona")).toBe(true);
    expect(share("alguien", "persona")).toBe(true);
    expect(share("sumar", "agregar")).toBe(true);
    expect(share("quité", "sacar")).toBe(true);
    expect(share("viajes", "vuelta")).toBe(true);
  });

  it("calzan las formas de un verbo aunque la raíz corta difiera", () => {
    expect(share("olvidó", "olvidé")).toBe(true);
    expect(share("pagado", "pagar")).toBe(true);
    expect(share("pagado", "olvidé")).toBe(false);
  });
});

const payroll = parseGuide("nomina", `# Nómina

## Agregar a una persona suelta
<!-- preguntas: cómo agrego a alguien al generar la nómina; sumar una persona con días puntuales -->
Al generar, toca **+ Agregar persona** y elige sus días.

## Agregar a una persona a una nómina ya creada
<!-- preguntas: se me olvidó una persona en la nómina; sumar un trabajador a una nómina ya hecha -->
En el detalle de la nómina, toca **+ Agregar persona**.

## Pagar en efectivo
<!-- preguntas: cómo pago en efectivo; marcar pagado -->
Marca lo que se entregó en efectivo.
`);
const users = { ...parseGuide("usuarios", `# Usuarios

## Suspender una cuenta
<!-- preguntas: cómo bloqueo a una persona -->
Toca **Suspender**.
`), adminOnly: true };
const index = buildHelpIndex([payroll, users]);
const ids = (results) => results.map((r) => r.id);

describe("searchHelp", () => {
  it("una pregunta trae las secciones que la responden, aunque use otras palabras", () => {
    const top = ids(searchHelp(index, "cómo agrego a una persona a nómina")).slice(0, 2);
    expect(top.sort()).toEqual(["nomina#agregar-a-una-persona-a-una-nomina-ya-creada", "nomina#agregar-a-una-persona-suelta"]);
  });

  it("encuentra por sinónimo y por las preguntas de ejemplo", () => {
    expect(ids(searchHelp(index, "olvidé sumar un trabajador"))[0]).toBe("nomina#agregar-a-una-persona-a-una-nomina-ya-creada");
  });

  it("tolera errores de tipeo y palabras a medio escribir", () => {
    expect(ids(searchHelp(index, "agrgar persona nomna"))).toContain("nomina#agregar-a-una-persona-suelta");
    expect(ids(searchHelp(index, "efecti"))[0]).toBe("nomina#pagar-en-efectivo");
  });

  it("las guías de admin solo salen para un admin", () => {
    expect(ids(searchHelp(index, "suspender cuenta"))).toEqual([]);
    expect(ids(searchHelp(index, "suspender cuenta", { isAdmin: true }))).toEqual(["usuarios#suspender-una-cuenta"]);
  });

  it("sin pregunta, o solo con palabras vacías, no trae nada", () => {
    expect(searchHelp(index, "   ")).toEqual([]);
    expect(searchHelp(index, "cómo la de")).toEqual([]);
  });

  it("guarda lo necesario para dibujar la sugerencia", () => {
    const [r] = searchHelp(index, "pagar efectivo");
    expect(r).toMatchObject({ guideId: "nomina", sectionId: "pagar-en-efectivo", guideTitle: "Nómina", title: "Pagar en efectivo" });
  });
});

describe("snippetOf", () => {
  it("elige la frase con más palabras de la pregunta y las marca", () => {
    const parts = snippetOf("Abre el detalle. Toca Agregar persona y elige sus días.", "agregar persona");
    expect(parts.map((p) => p.text).join("")).toBe("Toca Agregar persona y elige sus días.");
    expect(parts.filter((p) => p.hit).map((p) => p.text)).toEqual(["Agregar", "persona"]);
  });

  it("corta una frase larga en una palabra entera", () => {
    const text = `${"palabra ".repeat(40)}final.`;
    const out = snippetOf(text, "final", 30).map((p) => p.text).join("");
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(31);
  });
});
