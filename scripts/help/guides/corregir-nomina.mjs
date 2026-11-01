// Capturas de la guía "Corregir una nómina"
// (src/screens/help/guides/corregir-nomina.md): genera una nómina con el
// ciclo de demo, la recalcula después de una corrección en la grilla, le
// agrega un ciclo, le saca una labor y muestra cómo sacar o agregar a una
// persona.
import { correctDemoDay, pinPayrollDates, seedCashWorkers, seedLaborTypes } from "../seed.mjs";

// El modal abierto con ese título.
const modal = (page, title) =>
  page.getByRole("heading", { name: title, exact: true }).locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");

// La casilla de la fila que dice `text`.
const checkboxOf = (scope, text) =>
  scope.getByText(text, { exact: true }).first().locator("xpath=ancestor::*[.//input[@type='checkbox']][1]").locator("input[type=checkbox]").first();

export async function run({ page, base, login, shot }) {
  await seedCashWorkers();
  await seedLaborTypes();
  await login();

  // Una nómina con el ciclo 1 de Fundo Los Aromos.
  await page.goto(`${base}/payroll`);
  await page.getByText("Ciclos con pendiente").first().waitFor({ timeout: 120000 });
  await checkboxOf(page, "Fundo Los Aromos/Cuartel Norte/Ciclo 1").check();
  await page.getByRole("button", { name: "Continuar →" }).click();
  await page.getByRole("button", { name: "Guardar nómina" }).click();
  await page.getByText("Marcar pagada").first().waitFor({ timeout: 60000 });
  await pinPayrollDates();
  await correctDemoDay();
  await page.getByRole("button", { name: /Recargar datos/ }).click();
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: /Historial Nómina/ }).click();
  await page.getByText("2026OctubreSemana41").first().click();
  const detail = page.getByRole("heading", { name: "2026OctubreSemana41" }).locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
  await detail.waitFor();
  await page.waitForTimeout(1500);

  // Los botones de arriba del detalle.
  const recalc = detail.getByRole("button", { name: /Recalcular/ }).first();
  const editContent = detail.getByRole("button", { name: /Editar contenido/ }).first();
  await shot(page, "01-botones", editContent.locator("xpath=.."), { pad: 8, marks: [editContent, recalc] });

  // Recalcular trae la corrección de la grilla.
  await recalc.click();
  const recalcModal = modal(page, "Recalcular nómina");
  await recalcModal.waitFor({ timeout: 60000 });
  await shot(page, "02-recalcular", recalcModal, { pad: 0 });
  await recalcModal.getByRole("button", { name: "Aplicar cambios", exact: true }).click();
  await recalcModal.waitFor({ state: "detached", timeout: 60000 });
  await page.waitForTimeout(1500);

  // Editar contenido: agregar a una persona, con sus días de otro ciclo.
  await editContent.click();
  const addCycle = detail.getByRole("button", { name: "+ Agregar ciclo" });
  const addPerson = detail.getByRole("button", { name: "+ Agregar persona" });
  await addCycle.waitFor();
  await shot(page, "03-editar-contenido", addCycle.locator("xpath=.."), { pad: 8, marks: [addCycle, addPerson] });
  await addPerson.click();
  const personModal = modal(page, "Agregar persona a la nómina");
  await personModal.getByPlaceholder("🔍 Buscar por nombre o RUT…").fill("Ana");
  await personModal.getByText("Ana Pérez Soto").first().click();
  await personModal.getByText("Agrícola Santa Elena/Parronal/Ciclo 1").first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(1000);
  await shot(page, "04-agregar-persona", personModal, { pad: 0 });
  await personModal.getByRole("button", { name: "Cancelar", exact: true }).click();
  const discard = page.getByRole("button", { name: "Descartar cambios", exact: true });
  if (await discard.isVisible().catch(() => false)) await discard.click();
  await personModal.waitFor({ state: "detached" });

  // Agregar un ciclo.
  await addCycle.click();
  const addModal = modal(page, "Agregar ciclos o labores a la nómina");
  await checkboxOf(addModal, "Agrícola Santa Elena/Parronal/Ciclo 1").check();
  await page.waitForTimeout(800);
  await shot(page, "05-agregar-ciclo", addModal, { pad: 0 });
  await addModal.getByRole("button", { name: /^Agregar \(/ }).click();
  await addModal.waitFor({ state: "detached", timeout: 60000 });
  await page.waitForTimeout(2000);

  // El detalle se vuelve a abrir: los montos por labor de lo agregado salen
  // de su respaldo, que se lee al abrirlo.
  await detail.getByRole("button", { name: /Cerrar/ }).first().click();
  await detail.waitFor({ state: "detached" });
  await page.getByText("2026OctubreSemana41").first().click();
  await detail.waitFor();
  await page.waitForTimeout(1500);
  await detail.getByRole("button", { name: /Editar contenido/ }).first().click();
  await page.waitForTimeout(800);

  // Sacar una labor: se destilda y se recalcula sin ella.
  const cycleCard = detail.getByText("Agrícola Santa Elena/Parronal/Ciclo 1", { exact: true }).last()
    .locator("xpath=ancestor::li[1]");
  await cycleCard.scrollIntoViewIfNeeded();
  await checkboxOf(cycleCard, "Embalaje").uncheck();
  const recalcWithout = detail.getByRole("button", { name: "🔄 Recalcular sin esto" });
  await recalcWithout.waitFor();
  await shot(page, "06-sacar-labor", [cycleCard, recalcWithout], { pad: 6, marks: [checkboxOf(cycleCard, "Embalaje"), recalcWithout] });
  await recalcWithout.click();
  const removeModal = modal(page, "Sacar de la nómina y recalcular");
  await removeModal.waitFor({ timeout: 60000 });
  await shot(page, "07-sacar-y-recalcular", removeModal, { pad: 0 });
  await removeModal.getByRole("button", { name: "Aplicar cambios", exact: true }).click();
  await removeModal.waitFor({ state: "detached", timeout: 60000 });
  await page.waitForTimeout(1500);

  // Sacar a una persona.
  const removeWorker = detail.getByTitle("Sacar trabajador de la nómina").first();
  await removeWorker.scrollIntoViewIfNeeded();
  await shot(page, "08-sacar-persona", removeWorker.locator("xpath=ancestor::tr[1]"), { pad: 4, marks: [removeWorker] });
  await removeWorker.click();
  const confirmModal = modal(page, "Sacar trabajador de la nómina");
  await shot(page, "09-confirmar-sacar", confirmModal, { pad: 0 });
  await confirmModal.getByRole("button", { name: "Cancelar", exact: true }).click();
}
