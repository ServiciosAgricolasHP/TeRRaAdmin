// Capturas de la guía "Precios del día y piso"
// (src/screens/help/guides/precios-del-dia.md), sobre el ciclo con una labor
// de cada tipo (`seedLaborTypes`).
import { LABOR_TYPES_CYCLE, seedLaborTypes } from "../seed.mjs";

// El modal abierto con ese título.
const modal = (page, title) =>
  page.getByRole("heading", { name: title, exact: true }).locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");

// La tarjeta de un día del panel de precios: el contenedor más cercano de
// `anchor` que muestra la fecha.
const dayCard = (anchor, date) => anchor.locator(`xpath=ancestor::div[.//*[normalize-space(text())='${date}']][1]`);

export async function run({ page, base, login, shot }) {
  await seedLaborTypes();
  await login();
  await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("cycleDetail.")) localStorage.removeItem(k); });
  await page.goto(`${base}/cycles/${LABOR_TYPES_CYCLE}`);
  await page.getByText("Ana Pérez Soto").first().waitFor({ timeout: 120000 });
  await page.waitForTimeout(1500);
  const tab = async (name) => {
    await page.getByRole("button", { name: new RegExp(`^${name}`) }).first().click();
    await page.waitForTimeout(800);
  };

  // Agregar una labor: el formulario con el tipo de horas extras.
  await page.getByRole("button", { name: "+ Labor", exact: true }).click();
  const laborModal = modal(page, "Nueva labor");
  await laborModal.getByLabel("Nombre").fill("Riego nocturno");
  await laborModal.locator("select").first().selectOption("tratoHE");
  await laborModal.getByLabel("Nombre").blur();
  await shot(page, "01-nueva-labor", laborModal, { pad: 0 });
  await laborModal.getByRole("button", { name: "Cancelar", exact: true }).click();
  const discard = page.getByRole("button", { name: "Descartar cambios", exact: true });
  if (await discard.isVisible().catch(() => false)) await discard.click();
  await laborModal.waitFor({ state: "detached" });

  // Cosecha: un precio por calidad y envase.
  await tab("Cosecha");
  const addType = page.getByRole("button", { name: "+ tipo", exact: true }).first();
  await shot(page, "02-cosecha", dayCard(addType, "2026-10-05"), { pad: 6, marks: [addType] });
  await addType.click();
  const comboModal = modal(page, "Agregar tipo de cosecha · 2026-10-05");
  await shot(page, "03-agregar-tipo", comboModal, { pad: 0 });
  await page.keyboard.press("Escape");
  await comboModal.waitFor({ state: "detached" });

  // A trato: varios precios en un día.
  await tab("Poda");
  const addPrice = page.getByRole("button", { name: "+ Agregar precio", exact: true }).first();
  await shot(page, "04-trato", dayCard(addPrice, "2026-10-05"), { pad: 6, marks: [addPrice] });

  // Piso: se agrega en el segundo día y se asigna a todos.
  const addFloor = page.getByRole("button", { name: "+ piso", exact: true }).nth(1);
  await addFloor.click();
  await page.keyboard.type("5000");
  await page.keyboard.press("Enter");
  const applyAll = page.getByRole("button", { name: /a todos \(4\)/ });
  await applyAll.waitFor();
  await shot(page, "05-piso", dayCard(applyAll, "2026-10-06"), { pad: 6, marks: [applyAll] });
  await applyAll.click();
  const floorModal = modal(page, "Asignar piso a todos");
  await shot(page, "06-piso-a-todos", floorModal, { pad: 0 });
  await floorModal.getByRole("button", { name: "Asignar piso", exact: true }).click();
  await floorModal.waitFor({ state: "detached" });
  await page.waitForTimeout(1500);
  await shot(page, "07-piso-grilla", [
    page.locator(".ag-header").first(),
    page.locator(".ag-pinned-left-cols-container .ag-row").last(),
    page.locator(".ag-pinned-right-cols-container .ag-row").last(),
  ], { pad: 4 });

  // Piso por envase, en la cosecha: el de bandeja el segundo día, asignado a
  // quienes cosecharon en bandeja.
  await tab("Cosecha");
  await page.getByRole("button", { name: "+ piso bandeja", exact: true }).nth(1).click();
  await page.keyboard.type("8000");
  await page.keyboard.press("Enter");
  const containerFloor = page.getByText(/🪙 Piso bandeja/).first().locator("xpath=..");
  const containerAll = containerFloor.getByRole("button", { name: /a todos \(\d+\)/ });
  await containerAll.click();
  const containerModal = modal(page, "Asignar piso a todos");
  await containerModal.getByRole("button", { name: "Asignar piso", exact: true }).click();
  await containerModal.waitFor({ state: "detached" });
  await page.waitForTimeout(1500);
  await shot(page, "07-piso-por-envase", dayCard(containerFloor, "2026-10-06"), { pad: 6, marks: [containerFloor] });

  // A trato por etapas.
  await tab("Embalaje");
  const stage = page.getByText("Armado", { exact: true }).first();
  await shot(page, "08-etapas", dayCard(stage, "2026-10-05"), { pad: 6 });
  await page.getByRole("button", { name: "Editar labor", exact: true }).click();
  const editModal = modal(page, "Editar labor");
  await shot(page, "09-etapas-editar", editModal, { pad: 0 });
  await editModal.getByRole("button", { name: "Cancelar", exact: true }).click();
  await editModal.waitFor({ state: "detached" });

  // Jornadas con horas extras: la configuración de cada día.
  await tab("Riego");
  const editDay = page.getByTitle("Editar configuración del día").last();
  const config = editDay.locator(`xpath=ancestor::div[.//*[normalize-space(text())='2026-10-05']][.//*[normalize-space(text())='2026-10-07']][1]`);
  await shot(page, "10-horas-extras", config, { pad: 6, marks: [config.getByText("editar", { exact: true }).last()] });
  await editDay.click();
  const dayModal = modal(page, "Configurar día · 2026-10-07");
  await shot(page, "11-configurar-dia", dayModal, { pad: 0 });
  await page.keyboard.press("Escape");
}
