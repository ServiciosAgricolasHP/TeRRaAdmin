// Capturas de la guía "Agenda, precios y links"
// (src/screens/help/guides/agenda-precios-y-links.md): las fichas con datos
// bancarios, la agenda telefónica, el Libro de Precios y los links útiles.
import { seedInfoAndLinks } from "../seed.mjs";

export async function run({ page, base, login, shot }) {
  await seedInfoAndLinks();
  await login();

  await page.goto(`${base}/info-cuentas`);
  await page.getByText("Transportes Ríos Ltda.").first().waitFor({ timeout: 120000 });
  await page.waitForTimeout(800);
  await shot(page, "01-ficha", page.locator("main"), { pad: 0 });

  await page.getByRole("tab", { name: /Agenda telefónica/ }).click();
  await page.getByText("Carolina Muñoz").first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(800);
  await shot(page, "02-agenda", page.locator("main"), { pad: 0 });

  await page.goto(`${base}/price-book`);
  await page.getByText("Fundo Los Alerces — 2025").first().waitFor({ timeout: 120000 });
  for (const name of [/Fundo Los Aromos/, /Fundo Los Alerces/]) await page.getByRole("button", { name }).first().click();
  await page.getByText("Temporada 2025-2026").first().waitFor();
  await page.waitForTimeout(800);
  await shot(page, "03-libro-de-precios", page.locator("main"), { pad: 0 });

  await page.goto(`${base}/links`);
  await page.getByText("Previred").first().waitFor({ timeout: 120000 });
  await page.waitForTimeout(500);
  await shot(page, "04-links", page.locator("main"), { pad: 0 });
}
