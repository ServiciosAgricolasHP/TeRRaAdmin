// Capturas de la guía "Anticipos y bonos"
// (src/screens/help/guides/anticipos-y-bonos.md): la lista con un anticipo en
// cuotas, uno sin cuotas y un bono, el formulario, cómo los descuenta la
// nómina, su lista en el detalle de la nómina y cómo se edita un bono ya
// aplicado.
import { seedAdvances, seedCashWorkers } from "../seed.mjs";

// El modal abierto con ese título.
const modal = (page, title) =>
  page.getByRole("heading", { name: title, exact: true }).locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");

export async function run({ page, base, login, shot }) {
  await seedCashWorkers();
  await seedAdvances();
  await login();
  await page.goto(`${base}/advances`);
  await page.getByText("Arreglo de la bicicleta").first().waitFor({ timeout: 120000 });
  await page.waitForTimeout(1000);
  // La lista, con los botones para agregar.
  const addAdvance = page.getByRole("button", { name: /\+ Anticipo/ });
  const addBonus = page.getByRole("button", { name: /\+ Bono/ });
  const lastRow = page.locator("tr", { hasText: "Ana Pérez Soto" }).first();
  await shot(page, "01-lista", [page.getByRole("heading", { name: "Anticipos y Bonos" }), addBonus, lastRow], { pad: 8, marks: [addAdvance, addBonus] });

  // Un anticipo nuevo, en cuotas.
  await addAdvance.click();
  const form = modal(page, "Nuevo anticipo");
  await form.getByPlaceholder(/Buscar por nombre, apellido o RUT/).fill("Diego");
  await form.getByText("Diego Muñoz Vera").first().click();
  await form.getByPlaceholder("0").first().fill("30000");
  await form.getByText("Descontar en cuotas").click();
  await page.waitForTimeout(500);
  await form.getByPlaceholder(/Motivo, referencia/).fill("Compra de botas");
  await form.getByPlaceholder(/Motivo, referencia/).blur();
  await shot(page, "02-nuevo-anticipo", form, { pad: 0 });
  await form.getByRole("button", { name: "Cancelar", exact: true }).click();
  const discard = page.getByRole("button", { name: "Descartar cambios", exact: true });
  if (await discard.isVisible().catch(() => false)) await discard.click();
  await form.waitFor({ state: "detached" });

  // La nómina los descuenta: la vista previa.
  await page.goto(`${base}/payroll`);
  await page.getByText("Ciclos con pendiente").first().waitFor({ timeout: 120000 });
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Continuar →" }).click();
  const save = page.getByRole("button", { name: "Guardar nómina" });
  await save.waitFor({ timeout: 60000 });
  await page.waitForTimeout(1000);
  await shot(page, "03-vista-previa", [page.locator("thead").first(), page.locator("tr", { hasText: "Carla Rojas" }).first()], { pad: 4 });

  // Las cuotas se confirman al guardar.
  await save.click();
  const installments = modal(page, "Confirmar cuotas de anticipos");
  await installments.waitFor({ timeout: 60000 });
  await shot(page, "04-confirmar-cuotas", installments, { pad: 0 });
  await installments.getByRole("button", { name: "Confirmar y generar" }).click();
  await page.getByText("Marcar pagada").first().waitFor({ timeout: 60000 });

  // Después de la nómina: aplicados y parciales.
  await page.goto(`${base}/advances`);
  await page.getByText("Arreglo de la bicicleta").first().waitFor({ timeout: 120000 }).catch(() => {});
  await page.locator("select").first().selectOption({ label: "Todos" });
  await page.getByText("Arreglo de la bicicleta").first().waitFor();
  await page.waitForTimeout(800);
  await shot(page, "05-despues-de-la-nomina", [page.locator("thead").first(), page.locator("tr", { hasText: "Ana Pérez Soto" }).first()], { pad: 4 });

  // Los anticipos y bonos de la nómina, desde su detalle.
  await page.goto(`${base}/payroll`);
  await page.getByRole("button", { name: /Historial Nómina/ }).click();
  await page.getByText("2026OctubreSemana41").first().waitFor({ timeout: 120000 });
  await page.getByText("2026OctubreSemana41").first().click();
  const openList = page.getByRole("button", { name: "📋 Ver anticipos y bonos" });
  await openList.waitFor({ timeout: 60000 });
  await page.waitForTimeout(1500);
  await openList.click();
  const list = modal(page, /Anticipos y bonos de la nómina/);
  await list.getByText("Carla Rojas Fuentes").waitFor({ timeout: 60000 });
  await shot(page, "06-en-la-nomina", list, { pad: 0 });

  // Editar el bono desde la nómina: sube y cambia su nota.
  await list.getByRole("button", { name: "✎ Editar" }).first().click();
  const bonusModal = modal(page, "🎁 Editar el bono");
  const amount = bonusModal.getByRole("textbox").first();
  await amount.waitFor({ timeout: 60000 });
  await amount.fill("20000");
  await bonusModal.getByPlaceholder("Para qué es el bono").fill("Bono de asistencia y puntualidad");
  await page.waitForTimeout(500);
  await shot(page, "07-editar-bono", bonusModal, { pad: 0 });
  await bonusModal.getByRole("button", { name: "Cancelar", exact: true }).click();
  const discardBonus = page.getByRole("button", { name: "Descartar cambios", exact: true });
  if (await discardBonus.isVisible().catch(() => false)) await discardBonus.click();
}
