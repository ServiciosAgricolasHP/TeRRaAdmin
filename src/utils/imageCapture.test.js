import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("html-to-image", () => ({ toBlob: vi.fn(), toPng: vi.fn() }));
const { LIGHT_PALETTE } = await import("./imageCapture");

// Las variables de color del bloque `:root` de index.css.
function rootColors() {
  const css = readFileSync(new URL("../index.css", import.meta.url), "utf8");
  const block = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
  return Object.fromEntries([...block.matchAll(/(--color-[a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

describe("LIGHT_PALETTE", () => {
  it("es la paleta del tema claro de index.css", () => {
    expect(LIGHT_PALETTE).toEqual(rootColors());
  });
});
