// Capturas de la guía "Pagar a los transportistas"
// (src/screens/help/guides/pagar-transportes.md): el pago por faena, los
// resúmenes, pagar uno suelto, un abono, una quincena nueva, su detalle, la confirmación del
// pago, la de liquidar el resumen con el abono, el resumen liquidado, el balance de quincenas
// y sumar las vueltas anotadas después: a un resumen de la quincena y, en un resumen nuevo, a
// la quincena.
import { seedLaborTypes, seedLateTrips, seedTransports } from "../seed.mjs";

// El modal abierto con ese título.
const modal = (page, title) =>
  page.getByRole("heading", { name: title }).locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");

// La casilla de la fila que dice `text`.
const checkboxOf = (scope, text) =>
  scope.getByText(text, { exact: true }).first().locator("xpath=ancestor::label[1]").locator("input[type=checkbox]").first();

const tab = (page, name) => page.getByRole("button", { name, exact: true }).click();

export async function run({ page, base, login, shot }) {
  await seedLaborTypes();
  await seedTransports();
  await login();
  await page.goto(`${base}/transports`);
  await page.getByText("Transportes Ríos Ltda.").first().waitFor({ timeout: 120000 });

  // Pago por faena: el ciclo de Los Aromos.
  await tab(page, "Pago por faena");
  const cycle = checkboxOf(page, "Fundo Los Aromos/Cuartel Norte/Ciclo 1");
  await cycle.check();
  const next = page.getByRole("button", { name: "Continuar →" });
  await page.waitForTimeout(500);
  await shot(page, "01-pago-por-faena", page.locator("main"), { pad: 0, marks: [cycle, next] });
  await next.click();
  const generate = page.getByRole("button", { name: /^Generar \d+ resumen/ });
  await generate.waitFor();
  await page.waitForTimeout(800);
  await shot(page, "02-vista-previa", page.locator("main"), { pad: 0, marks: [generate] });
  await generate.click();
  await page.getByText(/Se generaron/).first().waitFor({ timeout: 60000 });
  await page.getByText(/Se generaron/).first().waitFor({ state: "hidden", timeout: 30000 }).catch(() => {});

  // Los resúmenes.
  await tab(page, "Resúmenes");
  await page.getByText("Balance general de transportes").waitFor({ timeout: 60000 });
  await page.waitForTimeout(1000);
  await shot(page, "03-resumenes", page.locator("main"), { pad: 0 });

  // Un abono en el resumen de Ríos (seis vueltas a $25.000).
  await page.getByRole("button", { name: /📅/ }).filter({ hasText: "$150.000" }).first().click();
  const detail = modal(page, /^Resumen — /);
  await detail.waitFor({ timeout: 60000 });
  await shot(page, "04-pagar-suelto", detail, { pad: 0, marks: [detail.getByRole("button", { name: /Marcar pagado/ })] });
  const abonos = detail.getByText(/💰 Abonos/).locator("xpath=ancestor::div[contains(@class,'rounded-md')][1]");
  await abonos.locator("input[type=number]").last().fill("50000");
  await abonos.getByPlaceholder("ej. transferencia, efectivo, cheque...").fill("Transferencia");
  await abonos.getByRole("button", { name: "+ Abono" }).click();
  await abonos.getByText("Transferencia").first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(800);
  await shot(page, "05-abono", detail, { pad: 0 });
  await detail.getByRole("button", { name: "Cerrar", exact: true }).click();
  await detail.waitFor({ state: "detached" });

  // Una quincena nueva: Ríos en Santa Elena y los resúmenes ya armados.
  await tab(page, "Quincenas");
  await page.getByRole("button", { name: "+ Nueva quincena" }).click();
  const create = modal(page, "Nueva quincena");
  await create.locator("label", { hasText: /^Nombre/ }).locator("input").fill("Quincena 1-15 de octubre");
  await create.locator("label", { hasText: /^Desde/ }).locator("input").fill("2026-10-01");
  await create.locator("label", { hasText: /^Hasta/ }).locator("input").fill("2026-10-15");
  await create.getByText(/Importar resúmenes existentes/).waitFor();
  const importBox = create.getByText(/Importar resúmenes existentes/).locator("xpath=ancestor::div[contains(@class,'p-2')][1]");
  for (const box of await importBox.locator("input[type=checkbox]").all()) await box.check();
  await page.waitForTimeout(500);
  const createButton = create.getByRole("button", { name: /^Crear quincena/ });
  await shot(page, "06-nueva-quincena", create, { pad: 0, marks: [createButton] });
  await createButton.click();
  await create.waitFor({ state: "detached", timeout: 60000 });

  // El balance de quincenas y el detalle de la nueva.
  await page.getByText("Quincena 1-15 de Octubre").first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(1000);
  const balance = page.getByText(/Balance de quincenas/).first().locator("xpath=ancestor::div[contains(@class,'rounded')][1]");
  await shot(page, "10-balance", balance, { pad: 6 });
  await page.getByText("Quincena 1-15 de Octubre").last().click();
  const fortnight = modal(page, /Quincena 1-15 de Octubre/);
  await fortnight.getByText("TOTAL").first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(800);
  const payAll = fortnight.getByRole("button", { name: "💰 Marcar quincena pagada" });
  await shot(page, "07-quincena", fortnight, { pad: 0, marks: [payAll] });

  // Confirmar el pago escribiendo la palabra.
  await payAll.click();
  const confirm = modal(page, "Marcar como pagada");
  await confirm.getByRole("textbox").fill("Pagada");
  await shot(page, "08-confirmar-pago", confirm, { pad: 0 });
  await confirm.getByRole("button", { name: "Cancelar", exact: true }).click();
  await confirm.waitFor({ state: "detached" });

  // Liquidar solo el resumen de Ríos, que ya tiene el abono.
  await fortnight.locator("tr", { hasText: "Ríos" }).filter({ hasText: "$150.000" }).getByRole("button", { name: "💰 Pagar" }).click();
  const settle = modal(page, "Marcar como pagada");
  await settle.getByText(/falta pagar/).waitFor();
  await settle.getByRole("textbox").fill("Pagada");
  await shot(page, "09-liquidar", settle, { pad: 0 });
  await settle.getByRole("button", { name: "Confirmar pago", exact: true }).click();
  await settle.waitFor({ state: "detached", timeout: 60000 });

  // El resumen liquidado: el abono y la liquidación.
  const settledRow = fortnight.locator("tr", { hasText: "Ríos" }).filter({ hasText: "$150.000" })
    .filter({ has: page.getByTitle("Ver detalle del resumen") });
  await settledRow.getByText("Pagado", { exact: true }).waitFor({ timeout: 60000 });
  await settledRow.getByTitle("Ver detalle del resumen").click();
  const settled = modal(page, /^Resumen — /);
  await settled.getByText(/Liquidación/).first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(800);
  const settledAbonos = settled.getByText(/💰 Abonos/).locator("xpath=ancestor::div[contains(@class,'rounded-md')][1]");
  await shot(page, "11-liquidacion", settledAbonos, { pad: 6 });
  await settled.getByRole("button", { name: "Cerrar", exact: true }).click();
  await settled.waitFor({ state: "detached" });

  // Vueltas anotadas después de armar la quincena.
  await seedLateTrips();
  await page.reload();
  await page.getByText("Buses del Sur SpA").first().waitFor({ timeout: 120000 });

  // Furgón Norte ya tiene su resumen en la quincena: la vuelta se suma a él.
  await tab(page, "Quincenas");
  await page.getByText("Quincena 1-15 de Octubre").last().click();
  const open = modal(page, /Quincena 1-15 de Octubre/);
  await open.getByText("TOTAL").first().waitFor({ timeout: 60000 });
  await open.locator("tr", { hasText: "Furgón Norte" }).getByTitle("Ver detalle del resumen").click();
  const summary = modal(page, /^Resumen — /);
  await summary.waitFor({ timeout: 60000 });
  await summary.getByRole("button", { name: "+ Vuelta suelta" }).click();
  const addTrips = modal(page, "+ Agregar vuelta suelta al resumen");
  await addTrips.locator("label", { hasText: "Van" }).locator("input[type=checkbox]").check();
  const addButton = addTrips.getByRole("button", { name: "Agregar (1)" });
  await page.waitForTimeout(500);
  await shot(page, "12-agregar-vuelta", addTrips, { pad: 0, marks: [addButton] });
  await addButton.click();
  await page.getByText("Vueltas agregadas al resumen").first().waitFor({ timeout: 60000 });
  await summary.getByRole("button", { name: "Cerrar", exact: true }).click();
  await summary.waitFor({ state: "detached" });
  await page.keyboard.press("Escape");
  await open.waitFor({ state: "detached" });

  // Buses del Sur no tiene resumen: se genera y se agrega a la quincena.
  await tab(page, "Resúmenes");
  await page.getByRole("button", { name: "+ Generar resumen" }).click();
  const generateOne = modal(page, "Generar resumen de transporte");
  const carrierSelect = generateOne.locator("label", { hasText: /^Transportista/ }).locator("select");
  await carrierSelect.locator("option", { hasText: "Buses del Sur" }).waitFor({ state: "attached", timeout: 60000 });
  await carrierSelect.selectOption({ label: await carrierSelect.locator("option", { hasText: "Buses del Sur" }).innerText() });
  const generateButton = generateOne.getByRole("button", { name: "Generar resumen", exact: true });
  await generateButton.waitFor();
  await page.waitForTimeout(800);
  await generateButton.click();
  await generateOne.waitFor({ state: "detached", timeout: 60000 });

  await tab(page, "Quincenas");
  await page.getByText("Quincena 1-15 de Octubre").last().click();
  const target = modal(page, /Quincena 1-15 de Octubre/);
  await target.getByText("TOTAL").first().waitFor({ timeout: 60000 });
  const addOpen = target.getByRole("button", { name: /\+ Agregar resumen/ });
  await addOpen.click();
  await target.getByRole("button", { name: /Buses del Sur/ }).click();
  const addSummary = target.getByRole("button", { name: "Agregar 1 a la quincena" });
  await page.waitForTimeout(500);
  await shot(page, "13-agregar-resumen", target, { pad: 0, marks: [addOpen, addSummary] });
}
