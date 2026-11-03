// Capturas de la guía "Transportes" (src/screens/help/guides/transportes.md):
// los transportistas, uno nuevo, las vueltas de un día del ciclo, una vuelta
// nueva, la lista de vueltas, las vueltas sin precio, el resumen de un
// transportista y la lista en el teléfono.
import { PHONE, login as loginOn, preparePage } from "../lib.mjs";
import { DEMO_CYCLE, DEMO_DAYS, seedLaborTypes, seedTransports } from "../seed.mjs";

// El modal abierto con ese título.
const modal = (page, title) =>
  page.getByRole("heading", { name: title }).locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");

// El campo con esa etiqueta.
const field = (scope, label) => scope.locator("label", { hasText: new RegExp(`^${label}`) }).locator("input, select").first();

// Cierra un formulario sin guardar.
async function discard(page, form, button = "Cancelar") {
  await form.getByRole("button", { name: button, exact: true }).click();
  const confirm = page.getByRole("button", { name: "Descartar cambios", exact: true });
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await form.waitFor({ state: "detached" });
}

export async function run({ browser, page, base, login, shot }) {
  await seedLaborTypes();
  await seedTransports();
  await login();
  await page.goto(`${base}/transports`);
  await page.getByText("Transportes Ríos Ltda.").first().waitFor({ timeout: 120000 });
  await page.waitForTimeout(800);

  // Las tarjetas de los transportistas.
  const addCarrier = page.getByRole("button", { name: "+ Transportista" });
  const unpriced = page.getByRole("button", { name: /Vueltas sin precio/ });
  const cards = page.getByText("Transportes Ríos Ltda.").first().locator("xpath=ancestor::div[contains(@class,'grid')][1]");
  await shot(page, "01-transportistas", [page.getByRole("heading", { name: "Transportes" }), cards], { pad: 8, marks: [unpriced, addCarrier] });

  // Un transportista nuevo, con su vehículo.
  await addCarrier.click();
  const carrierForm = modal(page, "Nuevo transportista");
  await field(carrierForm, "Alias").fill("Buses Maipo");
  await field(carrierForm, "Nombre").fill("Buses Maipo SpA");
  await field(carrierForm, "Tarifa por defecto").fill("22000");
  // El alias del vehículo se pide en un aviso del navegador.
  page.once("dialog", (d) => d.accept("Bus A"));
  await carrierForm.getByRole("button", { name: "+ Vehículo" }).click();
  await carrierForm.getByPlaceholder("alias").last().waitFor();
  await carrierForm.getByPlaceholder("patente (opc.)").last().fill("PRTS45");
  await carrierForm.getByPlaceholder("capacidad").last().fill("44");
  await shot(page, "02-transportista", carrierForm, { pad: 0 });
  await discard(page, carrierForm);

  // Las vueltas de un día del ciclo.
  await page.goto(`${base}/cycles/${DEMO_CYCLE}`);
  await page.getByText("Ana Pérez Soto").first().waitFor({ timeout: 120000 });
  await page.getByRole("button", { name: "🚐 Transportes" }).click();
  const cycleTrips = modal(page, /^🚐 Transportes —/);
  const day = cycleTrips.getByRole("button", { name: new RegExp(DEMO_DAYS[0]) });
  await day.click();
  await cycleTrips.getByText("Ríos").first().waitFor({ timeout: 60000 });
  const addTrip = cycleTrips.getByRole("button", { name: "+ Agregar vuelta" });
  await page.waitForTimeout(500);
  await shot(page, "03-vueltas-del-ciclo", cycleTrips, { pad: 0, marks: [day, addTrip] });

  // Una vuelta nueva.
  await addTrip.click();
  const tripForm = modal(page, "Agregar vuelta");
  await tripForm.getByPlaceholder("Buscar por alias, nombre o vehículo…").fill("Furgón");
  await page.keyboard.press("Enter");
  await field(tripForm, "Lugar").fill("Requínoa");
  await field(tripForm, "Destino").fill("Fundo Los Aromos");
  await field(tripForm, "N° personas").fill("9");
  await field(tripForm, "Cantidad de vueltas").fill("1");
  await page.waitForTimeout(500);
  await shot(page, "04-agregar-vuelta", tripForm, { pad: 0 });
  await tripForm.getByRole("button", { name: "Guardar", exact: true }).click();
  await tripForm.waitFor({ state: "detached", timeout: 60000 });
  await page.keyboard.press("Escape");
  await cycleTrips.waitFor({ state: "detached" });

  // La lista de vueltas.
  await page.goto(`${base}/transports`);
  await page.getByRole("button", { name: "Vueltas", exact: true }).click();
  await page.getByText("Total filtrado").waitFor({ timeout: 60000 });
  const expandAll = page.getByRole("button", { name: /Expandir todos/ });
  await expandAll.click();
  await page.waitForTimeout(800);
  await shot(page, "05-vueltas", page.locator("main"), { pad: 0, marks: [expandAll] });

  // Las vueltas sin precio.
  await page.getByRole("button", { name: "Transportistas", exact: true }).click();
  await page.getByRole("button", { name: /Vueltas sin precio/ }).click();
  const unpricedModal = modal(page, /Vueltas sin precio/);
  const useDefault = unpricedModal.getByRole("button", { name: /^Usar / }).first();
  await useDefault.click();
  await page.waitForTimeout(500);
  await shot(page, "06-sin-precio", unpricedModal, { pad: 0, marks: [useDefault, unpricedModal.getByRole("button", { name: /^Guardar/ })] });
  await discard(page, unpricedModal, "Cerrar");

  // El resumen de un transportista.
  await page.getByText("Transportes Ríos Ltda.").first().click();
  const summary = modal(page, "📊 Resumen — Ríos");
  await summary.getByText(/Vueltas sin resumen/).first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(800);
  await shot(page, "07-resumen-transportista", summary, { pad: 0 });

  // En el teléfono: las vueltas en tarjetas.
  const phone = await browser.newContext({ viewport: PHONE, locale: "es-CL", timezoneId: "America/Santiago", isMobile: true, hasTouch: true });
  const p = await phone.newPage();
  await preparePage(p);
  await loginOn(p, base);
  await p.goto(`${base}/transports`);
  await p.getByRole("button", { name: "Vueltas", exact: true }).click();
  await p.getByText("Total filtrado").waitFor({ timeout: 120000 });
  await p.getByRole("button", { name: /Expandir todos/ }).click();
  await p.getByRole("button", { name: /Expandir todos/ }).evaluate((el) => el.scrollIntoView({ block: "start" }));
  await p.waitForTimeout(800);
  await shot(p, "08-telefono", null);
  await phone.close();
}
