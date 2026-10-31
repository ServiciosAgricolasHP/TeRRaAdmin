// Capturas de la guía "Primeros pasos" (src/screens/help/guides/primeros-pasos.md).
import { PHONE, login as loginOn, preparePage } from "../lib.mjs";

export async function run({ browser, page, base, login, shot }) {
  // Entrar: la tarjeta de la pantalla de inicio de sesión.
  await page.goto(`${base}/login`);
  const loginCard = page.getByText("Gestión de faenas").locator("xpath=ancestor::div[.//form][1]");
  await loginCard.waitFor();
  await shot(page, "01-entrar", loginCard, { pad: 24 });

  await login();

  // El menú de la izquierda, con ☰ y la sección Admin marcados.
  const sidebar = page.locator("aside").first();
  const menuButton = page.getByRole("button", { name: /barra lateral/ }).first();
  await shot(page, "02-menu", [sidebar, menuButton], {
    pad: 0,
    marks: [menuButton, page.getByRole("button", { name: /Admin/ }).first()],
  });

  // El botón ? de la barra de arriba.
  const helpLink = page.getByRole("link", { name: "Ayuda de esta pantalla" });
  await shot(page, "03-boton-ayuda", helpLink.locator("xpath=.."), { pad: 16, marks: [helpLink] });

  // Buscar en la ayuda escribiendo una pregunta.
  await helpLink.click();
  const search = page.getByLabel("¿Qué quieres hacer?");
  await search.fill("cómo anoto el monto de un día");
  await page.getByRole("link", { name: /Anotar el monto de un día/ }).waitFor();
  await shot(page, "04-buscar", search.locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]"), { pad: 8 });
  await search.fill("");

  // El selector de colores, abierto.
  const themeButton = page.getByRole("button", { name: /Light/ }).first();
  await themeButton.click();
  const themeMenu = page.locator("div.absolute.right-0.w-48").first();
  await themeMenu.waitFor();
  await shot(page, "05-tema", [themeButton, themeMenu], { pad: 12 });
  await themeButton.click();
  await themeMenu.waitFor({ state: "detached" });

  // Los valores de referencia, con ✎ marcado.
  const edit = page.getByTitle("Editar indicadores").filter({ visible: true }).first();
  await shot(page, "06-indicadores", edit.locator("xpath=.."), { pad: 10, marks: [edit] });

  // El menú en el teléfono.
  const phone = await browser.newContext({ viewport: PHONE, locale: "es-CL", timezoneId: "America/Santiago", isMobile: true, hasTouch: true });
  const p = await phone.newPage();
  await preparePage(p);
  await loginOn(p, base);
  await p.getByRole("button", { name: /barra lateral/ }).first().click();
  await p.locator("aside").last().waitFor();
  await shot(p, "07-menu-telefono", null);
  await phone.close();
}
