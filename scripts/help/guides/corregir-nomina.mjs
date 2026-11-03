// Capturas de la guía "Corregir una nómina"
// (src/screens/help/guides/corregir-nomina.md): genera una nómina con el
// ciclo de demo, la recalcula después de una corrección en la grilla, le
// cambia un ciclo por otro sin una de sus labores y muestra cómo sacar o
// agregar a una persona.
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
  const editCycles = detail.getByRole("button", { name: "✎ Editar ciclos" });
  const addPerson = detail.getByRole("button", { name: "+ Agregar persona" });
  await editCycles.waitFor();
  await shot(page, "03-editar-contenido", editCycles.locator("xpath=.."), { pad: 8, marks: [editCycles, addPerson] });
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

  // Editar los ciclos: sale el de Los Aromos y entra el de Santa Elena sin
  // Embalaje, en un solo paso.
  await editCycles.click();
  const editModal = modal(page, "Ciclos de la nómina");
  await editModal.waitFor();
  await page.waitForTimeout(800);
  const leaving = checkboxOf(editModal, "Fundo Los Aromos/Cuartel Norte/Ciclo 1");
  const entering = checkboxOf(editModal, "Agrícola Santa Elena/Parronal/Ciclo 1");
  await leaving.uncheck();
  await entering.check();
  const withoutLabor = checkboxOf(editModal, "Embalaje");
  await withoutLabor.uncheck();
  await page.waitForTimeout(800);
  await shot(page, "05-editar-ciclos", editModal, { pad: 0, marks: [leaving, entering, withoutLabor] });
  await editModal.getByRole("button", { name: "Revisar cambios", exact: true }).click();
  const changesModal = modal(page, "Cambiar los ciclos y recalcular");
  await changesModal.waitFor({ timeout: 60000 });
  await page.waitForTimeout(500);
  await shot(page, "06-revisar-cambios", changesModal, { pad: 0 });
  await changesModal.getByRole("button", { name: "Aplicar cambios", exact: true }).click();
  await changesModal.waitFor({ state: "detached", timeout: 60000 });
  await editModal.waitFor({ state: "detached", timeout: 60000 });
  await page.waitForTimeout(1500);

  // Sacar a una persona.
  const removeWorker = detail.getByTitle("Sacar trabajador de la nómina").first();
  await removeWorker.scrollIntoViewIfNeeded();
  await shot(page, "07-sacar-persona", removeWorker.locator("xpath=ancestor::tr[1]"), { pad: 4, marks: [removeWorker] });
  await removeWorker.click();
  const confirmModal = modal(page, "Sacar trabajador de la nómina");
  await shot(page, "08-confirmar-sacar", confirmModal, { pad: 0 });
  await confirmModal.getByRole("button", { name: "Cancelar", exact: true }).click();
}
