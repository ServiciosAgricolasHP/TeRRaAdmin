// Capturas de la guía "Generar y pagar una nómina"
// (src/screens/help/guides/nomina.md): arma una nómina con el ciclo de demo,
// la guarda, la revisa y la paga.
import { pinPayrollDates, seedCashWorkers } from "../seed.mjs";

// El modal abierto con ese título.
const modal = (page, title) =>
  page.getByRole("heading", { name: title, exact: true }).locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");

export async function run({ page, base, login, shot }) {
  await seedCashWorkers();
  await login();
  await page.goto(`${base}/payroll`);
  await page.getByText("Ciclos con pendiente").first().waitFor({ timeout: 120000 });
  await page.waitForTimeout(1000);

  // Elegir los ciclos.
  const cycleBox = page.getByRole("checkbox").first();
  await cycleBox.check();
  const proceed = page.getByRole("button", { name: "Continuar →" });
  const search = page.getByPlaceholder("Buscar ciclo o faena...");
  const list = page.locator("div", { has: page.getByText("Fundo Los Aromos/Cuartel Norte/Ciclo 1") }).filter({ has: page.getByText("1 ciclo") }).last();
  await shot(page, "01-elegir-ciclos", [search.locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]"), list], { pad: 6, marks: [cycleBox] });
  await shot(page, "02-continuar", proceed.locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]"), { pad: 0, marks: [proceed] });

  // La vista previa.
  await proceed.click();
  const save = page.getByRole("button", { name: "Guardar nómina" });
  await save.waitFor({ timeout: 60000 });
  await page.waitForTimeout(1000);
  const lastRow = page.getByText("Felipe Torres", { exact: false }).last();
  await shot(page, "03-vista-previa", [save.locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]"), lastRow], { pad: 8, marks: [save] });

  // Guardar y ver el historial.
  await save.click();
  await page.getByText("Marcar pagada").first().waitFor({ timeout: 60000 });
  await pinPayrollDates();
  await page.getByRole("button", { name: /Recargar datos/ }).click();
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: /Historial Nómina/ }).click();
  const markPaid = page.getByRole("button", { name: "✓ Marcar pagada" }).first();
  await markPaid.waitFor();
  const more = page.getByRole("button", { name: "Más acciones" }).first();
  await shot(page, "04-historial", [page.locator("thead").first(), markPaid.locator("xpath=ancestor::tr[1]")], { pad: 0, marks: [markPaid, more] });

  // El menú ⋯ de la nómina.
  await more.click();
  const bankOnly = page.getByText("Solo transferencias").first();
  await bankOnly.waitFor();
  const menu = bankOnly.locator("xpath=ancestor::div[contains(@class,'shadow')][1]");
  await shot(page, "05-mas-acciones", menu, { pad: 4 });
  await more.click();
  await menu.waitFor({ state: "detached" });

  // El detalle: resumen, imprimir y descargar.
  await page.getByText("2026OctubreSemana41").first().click();
  const detailTitle = page.getByRole("heading", { name: "2026OctubreSemana41" });
  await detailTitle.waitFor();
  await page.waitForTimeout(1500);
  const detail = detailTitle.locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
  await shot(page, "06-detalle", detail, { pad: 0 });
  const download = page.getByRole("button", { name: /Descargar/ }).last();
  await download.click();
  const xlsx = page.getByText("XLSX completo").first();
  await xlsx.waitFor();
  await shot(page, "07-descargar", xlsx.locator("xpath=ancestor::div[contains(@class,'shadow')][1]"), { pad: 4 });
  await download.click();
  await xlsx.waitFor({ state: "detached" });
  const print = page.getByRole("button", { name: /Imprimir/ }).last();
  await print.click();
  const receipts = page.getByText("Comprobantes efectivo").first();
  await receipts.waitFor();
  await shot(page, "08-imprimir", receipts.locator("xpath=ancestor::div[contains(@class,'shadow')][1]"), { pad: 4 });
  await print.click();
  await receipts.waitFor({ state: "detached" });
  await detail.getByRole("button", { name: /Cerrar/ }).first().click();
  await detail.waitFor({ state: "detached" });

  // Marcar pagada y cerrar el ciclo.
  await markPaid.click();
  const payModal = modal(page, "Marcar como pagada");
  await payModal.locator("input").first().fill("Pagado");
  await shot(page, "09-marcar-pagada", payModal, { pad: 0 });
  await payModal.getByRole("button", { name: "Confirmar", exact: true }).click();
  const closeModal = modal(page, "🔒 Cerrar ciclos pagados");
  await closeModal.waitFor({ timeout: 60000 });
  await shot(page, "10-cerrar-ciclos", closeModal, { pad: 0 });
  await closeModal.getByRole("button", { name: "Ahora no", exact: true }).click();
}
