import { describe, expect, it } from "vitest";
import { parseGuide, plainText, slugOf } from "./helpGuides";

const md = `# Nómina

Cómo se arma y se paga una nómina.
<!-- preguntas: qué es la nómina -->

## Agregar a una persona suelta
<!-- preguntas: cómo agrego a alguien al generar; sumar una persona -->

Toca **+ Agregar persona** y elige sus días.

![El botón](help/nomina/01-agregar.webp)

## Pagar en efectivo

### Paso a paso

1. Abre el detalle.
2. Marca lo pagado.

## Pagar en efectivo
`;

describe("slugOf", () => {
  it("deja minúsculas sin tildes, con guiones entre palabras", () => {
    expect(slugOf("Agregar a una persona: ¿cómo?")).toBe("agregar-a-una-persona-como");
    expect(slugOf("  Ñandú  ")).toBe("nandu");
  });
});

describe("parseGuide", () => {
  const g = parseGuide("nomina", md);

  it("toma el título, la introducción y sus preguntas", () => {
    expect(g.title).toBe("Nómina");
    expect(g.intro).toBe("Cómo se arma y se paga una nómina.");
    expect(g.questions).toEqual(["qué es la nómina"]);
  });

  it("parte en secciones `##`, con las preguntas fuera del cuerpo", () => {
    expect(g.sections.map((s) => s.id)).toEqual(["agregar-a-una-persona-suelta", "pagar-en-efectivo", "pagar-en-efectivo-2"]);
    expect(g.sections[0].questions).toEqual(["cómo agrego a alguien al generar", "sumar una persona"]);
    expect(g.sections[0].body).not.toContain("preguntas");
    expect(g.sections[0].body).toContain("+ Agregar persona");
  });

  it("un `###` queda dentro de su sección", () => {
    expect(g.sections[1].body).toContain("### Paso a paso");
  });

  it("acepta fines de línea de Windows", () => {
    expect(parseGuide("x", "# Uno\r\n\r\n## Dos\r\nTexto").sections[0]).toMatchObject({ id: "dos", body: "Texto" });
  });
});

describe("plainText", () => {
  it("quita las negritas y el código sin dejar espacios sueltos ni tocar un * suelto", () => {
    expect(plainText("Están el **sueldo base**, el **día** y `=350*54`.")).toBe("Están el sueldo base, el día y =350*54.");
  });

  it("quita imágenes, marcas y viñetas, y deja el texto de los enlaces", () => {
    expect(plainText("1. Toca **Guardar** en [la ficha](/ayuda/x).\n![img](a.webp)\n- Listo")).toBe("Toca Guardar en la ficha. Listo");
  });
});
