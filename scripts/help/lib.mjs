// Herramientas de los guiones de captura de la ayuda.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { DEMO_USER } from "./seed.mjs";

export const DESKTOP = { width: 1440, height: 900 };
export const PHONE = { width: 412, height: 900 };
// Fecha fija: las capturas no cambian con el día en que se generan.
export const FIXED_NOW = new Date("2026-10-09T10:30:00-03:00");

// Tema claro, fecha fija y esperas largas: la primera carga de Vite compila
// los módulos en frío.
export async function preparePage(page) {
  await page.clock.setFixedTime(FIXED_NOW);
  await page.addInitScript(() => {
    try { localStorage.setItem("af.theme", "light"); } catch { /* sin almacenamiento */ }
  });
  page.setDefaultNavigationTimeout(240000);
  page.setDefaultTimeout(30000);
}

export async function login(page, base) {
  await page.goto(`${base}/login`);
  await page.fill('input[type="email"]', DEMO_USER.email);
  await page.fill('input[type="password"]', DEMO_USER.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/faenas/, { timeout: 120000 });
}

// La versión del encabezado cambia con cada commit: en las capturas va sin número.
async function hideVersion(page) {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll("header span")) {
      if (/^TeRRA v/.test(el.textContent || "")) el.textContent = "TeRRA";
    }
  });
}

// Un borde y un número sobre cada elemento a tocar, encima de todo.
async function addMarks(page, marks) {
  const boxes = [];
  for (const m of marks) {
    const box = await m.boundingBox();
    if (box) boxes.push(box);
  }
  await page.evaluate((list) => {
    list.forEach((b, i) => {
      const ring = document.createElement("div");
      ring.dataset.helpMark = "";
      Object.assign(ring.style, {
        position: "fixed", left: `${b.x - 4}px`, top: `${b.y - 4}px`, width: `${b.width + 8}px`, height: `${b.height + 8}px`,
        border: "3px solid var(--color-danger)", borderRadius: "8px", zIndex: "2147483647", pointerEvents: "none",
      });
      document.body.appendChild(ring);
      if (list.length > 1) {
        const badge = document.createElement("div");
        badge.dataset.helpMark = "";
        badge.textContent = String(i + 1);
        Object.assign(badge.style, {
          position: "fixed", left: `${b.x - 14}px`, top: `${b.y - 14}px`, width: "22px", height: "22px",
          borderRadius: "11px", background: "var(--color-danger)", color: "#fff", font: "bold 13px/22px sans-serif",
          textAlign: "center", zIndex: "2147483647", pointerEvents: "none",
        });
        document.body.appendChild(badge);
      }
    });
  }, boxes);
}

const removeMarks = (page) => page.evaluate(() => document.querySelectorAll("[data-help-mark]").forEach((el) => el.remove()));

// La zona de `area` con un margen, sin salirse de la ventana.
function clipOf(box, pad, viewport) {
  const x = Math.max(0, Math.floor(box.x - pad));
  const y = Math.max(0, Math.floor(box.y - pad));
  const right = Math.min(viewport.width, Math.ceil(box.x + box.width + pad));
  const bottom = Math.min(viewport.height, Math.ceil(box.y + box.height + pad));
  return { x, y, width: right - x, height: bottom - y };
}

// La caja que cubre todos los elementos de `areas`.
async function unionBox(areas) {
  const boxes = [];
  for (const a of areas) {
    const b = await a.boundingBox();
    if (b) boxes.push(b);
  }
  if (!boxes.length) return null;
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.width));
  const bottom = Math.max(...boxes.map((b) => b.y + b.height));
  return { x, y, width: right - x, height: bottom - y };
}

// Guarda las capturas de una guía en `public/help/<guía>/<nombre>.webp` y
// anota su ancho y alto en `sizes` (la clave es la ruta que usa el Markdown).
// `area` es un elemento o una lista: la captura cubre todos; sin `area`, la
// ventana entera.
export function shooterFor({ guideId, root, sizes }) {
  const outDir = path.join(root, "public", "help", guideId);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  for (const key of Object.keys(sizes)) if (key.startsWith(`help/${guideId}/`)) delete sizes[key];

  return async function shot(page, name, area, { marks = [], pad = 12 } = {}) {
    const areas = area ? [].concat(area) : [];
    if (areas.length) await areas[0].scrollIntoViewIfNeeded();
    // El mouse fuera de todo, para que no quede un tooltip en la captura.
    await page.mouse.move(1, 1);
    await page.waitForTimeout(300);
    await hideVersion(page);
    await addMarks(page, marks);
    const box = areas.length ? await unionBox(areas) : null;
    const clip = box ? clipOf(box, pad, page.viewportSize()) : undefined;
    const png = await page.screenshot({ clip, animations: "disabled", caret: "hide" });
    await removeMarks(page);
    const rel = `help/${guideId}/${name}.webp`;
    const info = await sharp(png).webp({ quality: 82 }).toFile(path.join(outDir, `${name}.webp`));
    sizes[rel] = [info.width, info.height];
    return rel;
  };
}
