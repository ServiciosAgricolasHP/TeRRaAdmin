// Las guías de la ayuda se escriben en Markdown y se leen por secciones: cada
// `## ` es una sección con su propio enlace, que es lo que sugiere la búsqueda.
// Las preguntas con que alguien buscaría una sección van escondidas debajo de
// su título: `<!-- preguntas: cómo agrego a alguien; sumar una persona -->`.

const QUESTIONS_RE = /<!--\s*preguntas:([\s\S]*?)-->/gi;

// "Agregar a una persona" → "agregar-a-una-persona".
export function slugOf(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function questionsIn(text) {
  const out = [];
  for (const m of text.matchAll(QUESTIONS_RE)) {
    for (const q of m[1].split(";")) {
      const t = q.trim();
      if (t) out.push(t);
    }
  }
  return out;
}

const withoutQuestions = (text) => text.replace(QUESTIONS_RE, "").replace(/\n{3,}/g, "\n\n").trim();

// Texto plano de un trozo de Markdown, para buscar y para el extracto.
export function plainText(markdown) {
  return String(markdown || "")
    .replace(QUESTIONS_RE, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[>#|]/g, " ")
    .replace(/^\s*[-+]\s+/gm, " ")
    .replace(/^\s*\d+\.\s+/gm, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Una guía: `# Título`, la introducción (lo que va antes de la primera
// sección) y sus secciones `## `. Un `### ` queda dentro de su sección.
export function parseGuide(id, markdown) {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  let title = id;
  const intro = [];
  const sections = [];
  let current = null;
  for (const line of lines) {
    const h1 = /^# (.+)$/.exec(line);
    const h2 = /^## (.+)$/.exec(line);
    if (h1 && !current && intro.length === 0) {
      title = h1[1].trim();
    } else if (h2) {
      current = { title: h2[1].trim(), lines: [] };
      sections.push(current);
    } else if (current) {
      current.lines.push(line);
    } else {
      intro.push(line);
    }
  }
  const introText = intro.join("\n");
  const used = new Set();
  return {
    id,
    title,
    intro: withoutQuestions(introText),
    questions: questionsIn(introText),
    sections: sections.map((s) => {
      const raw = s.lines.join("\n");
      let sectionId = slugOf(s.title) || "seccion";
      for (let n = 2; used.has(sectionId); n++) sectionId = `${slugOf(s.title)}-${n}`;
      used.add(sectionId);
      return { id: sectionId, title: s.title, body: withoutQuestions(raw), questions: questionsIn(raw) };
    }),
  };
}
