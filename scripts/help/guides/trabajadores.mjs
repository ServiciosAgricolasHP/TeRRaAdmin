// Capturas de la guía "Trabajadores" (src/screens/help/guides/trabajadores.md):
// la lista con sus filtros, un trabajador nuevo con un posible duplicado, la
// forma de pago de quien cobra en la cuenta de otra persona, los datos
// personales, el resumen de una persona y la lista en el teléfono.
import { PHONE, login as loginOn, preparePage } from "../lib.mjs";
import { rut, seedCashWorkers, seedWorkerDetails } from "../seed.mjs";

// El modal abierto con ese título.
const modal = (page, title) =>
  page.getByRole("heading", { name: title }).locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");

// La caja de la ficha que lleva ese título.
const boxOf = (scope, title) =>
  scope.getByRole("heading", { name: title, exact: true }).locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");

// Cierra un formulario sin guardar.
async function cancel(page, form) {
  await form.getByRole("button", { name: "Cancelar", exact: true }).click();
  const discard = page.getByRole("button", { name: "Descartar cambios", exact: true });
  if (await discard.isVisible().catch(() => false)) await discard.click();
  await form.waitFor({ state: "detached" });
}

export async function run({ browser, page, base, login, shot }) {
  await seedCashWorkers();
  await seedWorkerDetails();
  await login();
  await page.goto(`${base}/workers`);
  await page.getByText(/· 7 trabajadores/).waitFor({ timeout: 120000 });

  // La lista con quienes cobran por transferencia, corrida hasta el titular.
  // La grilla dibuja solo las columnas a la vista: se corre antes de esperar
  // al titular.
  await page.getByRole("button", { name: "🏦 Transferencia", exact: true }).click();
  await page.getByText("Bruno Díaz Mella").first().waitFor();
  await page.locator(".ag-center-cols-viewport").first().hover();
  await page.mouse.wheel(3000, 0);
  await page.getByText("Rosa Mella Díaz").first().waitFor();
  await page.waitForTimeout(800);
  const search = page.getByPlaceholder("Buscar por nombre, apellido o RUT…");
  const add = page.getByRole("button", { name: "+ Nuevo trabajador" });
  await shot(page, "01-lista", [page.getByText(/resultado\(s\)/), add, page.locator(".ag-pinned-right-cols-container .ag-row").last()], {
    pad: 8, marks: [search, page.getByRole("button", { name: /Sin titular/ }), add],
  });

  // Un trabajador nuevo con un nombre muy parecido a otro.
  await add.click();
  const newForm = modal(page, "Nuevo trabajador");
  await newForm.getByPlaceholder("12345678-K o 12345678-B").fill(rut(22345671));
  await newForm.locator("label", { hasText: /^Nombre\*?$/ }).locator("input").fill("Ana Peres Soto");
  await newForm.getByText("Posibles duplicados").waitFor();
  await page.waitForTimeout(500);
  await shot(page, "02-nuevo", newForm, { pad: 0 });
  await cancel(page, newForm);

  // La forma de pago de Bruno, que cobra en la cuenta de otra persona.
  await search.fill("Bruno");
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Editar", exact: true }).first().click();
  const brunoForm = modal(page, /^Editar /);
  await brunoForm.waitFor();
  const payment = boxOf(brunoForm, "Forma de pago");
  await shot(page, "03-forma-de-pago", payment, {
    pad: 6, marks: [payment.getByRole("button", { name: /Asignar Cuenta RUT/ }), payment.getByRole("button", { name: "🏦 Banco" }).locator("xpath=..")],
  });
  await cancel(page, brunoForm);

  // Los datos personales de Ana.
  await search.fill("Ana");
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Editar", exact: true }).first().click();
  const anaForm = modal(page, /^Editar /);
  await anaForm.waitFor();
  const personal = boxOf(anaForm, "Datos personales");
  await personal.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await shot(page, "04-datos-personales", personal, { pad: 6 });
  await cancel(page, anaForm);

  // El resumen de Ana.
  await page.getByTitle("Ver resumen del trabajador").first().click();
  const summary = modal(page, "📊 Resumen — Ana Pérez Soto");
  await summary.getByText("Total general").first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(800);
  await shot(page, "05-resumen", summary, { pad: 0 });
  await summary.getByRole("button", { name: "Cerrar", exact: true }).click();

  // En el teléfono: las tarjetas.
  const phone = await browser.newContext({ viewport: PHONE, locale: "es-CL", timezoneId: "America/Santiago", isMobile: true, hasTouch: true });
  const p = await phone.newPage();
  await preparePage(p);
  await loginOn(p, base);
  await p.goto(`${base}/workers`);
  await p.getByText(/· 7 trabajadores/).waitFor({ timeout: 120000 });
  await p.getByRole("button", { name: "🏦 Transferencia", exact: true }).click();
  await p.getByText("Rosa Mella Díaz").first().waitFor();
  await p.waitForTimeout(800);
  await shot(p, "06-telefono", null);
  await phone.close();
}
