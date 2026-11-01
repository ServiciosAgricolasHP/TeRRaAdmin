// Capturas de la guía "Anotar jornadas en la grilla del ciclo"
// (src/screens/help/guides/grilla-del-ciclo.md), sobre el ciclo de demo.
import { PHONE, login as loginOn, preparePage } from "../lib.mjs";
import { DEMO_CYCLE } from "../seed.mjs";

export async function run({ browser, page, base, login, shot }) {
  await login();
  await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("cycleDetail.")) localStorage.removeItem(k); });

  // Abrir un ciclo desde Faenas.
  await page.locator("[draggable]").filter({ hasText: "Fundo Los Aromos" }).first().click();
  await page.getByText("Cuartel Norte").first().waitFor();
  const open = page.getByRole("link", { name: "Abrir", exact: true }).first();
  await open.waitFor();
  await shot(page, "01-abrir-ciclo", page.locator("main"), { pad: 0, marks: [open] });
  await open.click();
  await page.waitForURL(new RegExp(`/cycles/${DEMO_CYCLE}$`));
  await page.getByText("Ana Pérez Soto").first().waitFor({ timeout: 120000 });
  await page.waitForTimeout(1500);

  // Helpers de la grilla: una celda por nombre y día, y la fila de la derecha.
  const rowIndexOf = (name) => page.locator(".ag-pinned-left-cols-container .ag-row", { hasText: name }).first().getAttribute("row-index");
  const cell = async (name, day) => page.locator(`.ag-center-cols-container .ag-row[row-index="${await rowIndexOf(name)}"] .ag-cell[col-id="${day}"]`).first();
  const nameCell = async (name) => page.locator(`.ag-pinned-left-cols-container .ag-row[row-index="${await rowIndexOf(name)}"]`).first();
  const rightCell = async (name) => page.locator(`.ag-pinned-right-cols-container .ag-row[row-index="${await rowIndexOf(name)}"]`).first();
  const header = (colId) => page.locator(`.ag-header-cell[col-id="${colId}"]`).first();
  const nameHeader = page.locator(".ag-pinned-left-header").first();

  // La pantalla: labores, precios por día y grilla.
  const tabs = page.getByRole("button", { name: "+ Labor", exact: true }).locator("xpath=..");
  const prices = page.getByText("Precios por día", { exact: false }).first().locator("xpath=ancestor::div[contains(@class,'rounded')][1]");
  const grid = page.locator(".ag-root-wrapper").first();
  await shot(page, "02-pantalla", page.locator("main"), { pad: 0, marks: [tabs, prices, grid] });

  // El precio sugerido en una celda vacía.
  const suggested = (await cell("Ana Pérez Soto", "2026-10-08")).locator('[title^="Click: usar precio sugerido"]');
  await suggested.waitFor();
  await shot(page, "03-precio-sugerido", [
    nameHeader, header("2026-10-07"), await cell("Carla Rojas Fuentes", "2026-10-09"),
  ], { pad: 6, marks: [suggested] });

  // Los precios por día, con el del 8 de octubre marcado.
  const dayPrice = prices.locator("input").nth(1);
  // Las tres primeras tarjetas, con su "personas" abajo.
  const people = prices.getByText(/personas/);
  await shot(page, "04-precios-del-dia", [prices.getByText("Precios por día", { exact: false }).first(), people.first(), people.nth(2), prices.locator("input").nth(2)], { pad: 14, marks: [dayPrice] });

  // Varias celdas elegidas con Shift.
  await (await cell("Ana Pérez Soto", "2026-10-07")).click({ position: { x: 6, y: 6 } });
  await (await cell("Diego Muñoz Vera", "2026-10-07")).click({ position: { x: 6, y: 6 }, modifiers: ["Shift"] });
  await shot(page, "05-varias-celdas", [
    nameHeader, header("2026-10-06"), await cell("Diego Muñoz Vera", "2026-10-08"),
  ], { pad: 6 });
  await page.keyboard.press("Escape");

  // Agregar a una persona: el buscador con un resultado.
  await page.getByRole("button", { name: "+ Trabajador", exact: true }).first().click();
  const picker = page.getByRole("heading", { name: "Agregar trabajador" }).locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
  await picker.getByLabel("Buscar por RUT, nombre o apellido").fill("Gloria");
  const result = picker.getByText("Gloria Herrera Pino").first();
  await result.waitFor();
  await shot(page, "06-agregar-persona", picker, { pad: 0, marks: [result] });
  await page.keyboard.press("Escape");
  await picker.waitFor({ state: "detached" });

  // Agregar y quitar días.
  const addDay = page.getByRole("button", { name: "+ Día", exact: true }).first();
  const removeDay = page.getByTitle(/Click para quitar el día/).first();
  await shot(page, "07-agregar-dia", addDay.locator("xpath=.."), { pad: 10, marks: [addDay] });
  await shot(page, "07-quitar-dia", [removeDay, page.getByTitle(/Click para quitar el día/).last()], { pad: 10, marks: [removeDay] });

  // Una nota del día: el modal con el texto escrito, y se guarda.
  await page.locator(".ag-header-cell", { hasText: "2026-10-05" }).getByTitle("Agregar anotación del día").click();
  const note = page.getByPlaceholder(/día con lluvia leve/);
  await note.fill("Llovió en la tarde; se trabajó hasta las 15:00.");
  const noteModal = note.locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
  await shot(page, "08-nota-del-dia", noteModal, { pad: 0 });
  await noteModal.getByRole("button", { name: "Guardar", exact: true }).click();
  await noteModal.waitFor({ state: "detached" });

  // Sueldo mensual: la fila con la M verde y la asistencia.
  const elenaM = (await rightCell("Elena Castro Paz")).getByTitle(/Pago mensual activo/);
  await shot(page, "09-mensual", [
    nameHeader, await nameCell("Elena Castro Paz"), await rightCell("Elena Castro Paz"),
  ], { pad: 6, marks: [elenaM] });

  // Por grupo y con producción.
  const byGroup = page.getByRole("button", { name: "Por grupo", exact: true }).first();
  await byGroup.click();
  await page.getByText("GRUPO NORTE").first().waitFor();
  const views = byGroup.locator("xpath=../..");
  await shot(page, "10-por-grupo", [views, grid], {
    pad: 8, marks: [byGroup, page.getByRole("button", { name: "Con producción", exact: true }).first()],
  });
  await page.getByRole("button", { name: "Todos", exact: true }).first().click();

  // En el teléfono: la lista de personas.
  const phone = await browser.newContext({ viewport: PHONE, locale: "es-CL", timezoneId: "America/Santiago", isMobile: true, hasTouch: true });
  const p = await phone.newPage();
  await preparePage(p);
  await loginOn(p, base);
  await p.goto(`${base}/cycles/${DEMO_CYCLE}`);
  await p.getByText("Ana Pérez Soto").first().waitFor({ timeout: 120000 });
  // La lista arriba, desde "Ver grilla completa".
  await p.getByRole("button", { name: /Ver grilla completa/ }).evaluate((el) => el.scrollIntoView({ block: "start" }));
  await p.waitForTimeout(800);
  await shot(p, "11-telefono", null);
  await phone.close();
}
