// Capturas de la guía "Cheques y pagos" (src/screens/help/guides/cheques-y-pagos.md):
// los próximos vencimientos, un cheque emitido, un crédito en cuotas, el menú
// de un pago vencido, marcarlo pagado con interés, un abono a una deuda
// personal y el informe de deudas.
import { seedCommitments } from "../seed.mjs";

const modal = (page, title) =>
  page.getByRole("heading", { name: title }).locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");

// El campo que sigue a la etiqueta que empieza con `label`.
const field = (scope, label) =>
  scope.locator(`xpath=.//label[starts-with(normalize-space(), "${label}")]/following-sibling::*[self::input or self::select][1]`);

// Cierra un formulario sin guardar, pasando por el aviso de cambios.
async function discard(page, form) {
  await form.getByRole("button", { name: "Cancelar", exact: true }).click();
  const confirm = page.getByRole("button", { name: "Descartar cambios" });
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await form.waitFor({ state: "detached" });
}

const row = (page, text) => page.locator("tr", { hasText: text }).first();

export async function run({ page, base, login, shot }) {
  await seedCommitments();
  await login();
  await page.goto(`${base}/cheques-pagos`);
  await page.getByText("Inmobiliaria Los Olmos Ltda.").first().waitFor({ timeout: 120000 });
  await page.waitForTimeout(800);
  await shot(page, "01-proximos", page.locator("main"), { pad: 0 });

  // Un cheque emitido para el transportista.
  await page.getByRole("button", { name: "+ Agregar documento" }).click();
  const cheque = modal(page, "Agregar documento");
  await cheque.getByRole("button", { name: "📤 Cheque emitido" }).click();
  await field(cheque, "Beneficiario").fill("Transportes Ríos Ltda.");
  await field(cheque, "Concepto").fill("Quincena 1-15 de octubre");
  await field(cheque, "Monto").fill("175000");
  await field(cheque, "Fecha del cheque (cuándo se cobra)").fill("2026-10-16");
  await field(cheque, "Banco").selectOption("012");
  await field(cheque, "N° de cheque").fill("004513");
  const save = cheque.getByRole("button", { name: "Guardar", exact: true });
  await shot(page, "02-cheque", cheque, { pad: 0, marks: [save] });
  await save.click();
  await cheque.waitFor({ state: "detached", timeout: 60000 });

  // Un crédito de doce cuotas, sin guardarlo.
  await page.getByRole("button", { name: "+ Agregar documento" }).click();
  const credit = modal(page, "Agregar documento");
  await credit.getByRole("button", { name: "🏦 Crédito en cuotas" }).click();
  await field(credit, "Acreedor (banco, proveedor…)").fill("Banco de Chile");
  await field(credit, "Concepto").fill("Crédito de la camioneta");
  await field(credit, "Cada cuota").fill("280000");
  await field(credit, "Primera cuota").fill("2026-11-05");
  await field(credit, "Número de cuotas").fill("12");
  const create = credit.getByRole("button", { name: /^Crear 12 vencimiento/ });
  await create.waitFor();
  await shot(page, "03-credito", credit, { pad: 0, marks: [create] });
  await discard(page, credit);

  // El menú del pago vencido.
  // El menú se cierra con cualquier desplazamiento: la fila va a la vista
  // antes de abrirlo, y la captura parte por el menú.
  const fuel = row(page, "Combustibles del Valle");
  await fuel.scrollIntoViewIfNeeded();
  await fuel.getByRole("button", { name: "Más acciones" }).click();
  const menu = page.getByRole("menu");
  await menu.waitFor();
  await shot(page, "05-menu", [menu, fuel], { pad: 6 });
  await page.keyboard.press("Escape");
  await menu.waitFor({ state: "detached" });

  // Marcarlo pagado, con $9.000 de interés.
  await fuel.getByRole("button", { name: "Marcar como pagado" }).click();
  const pay = modal(page, "Marcar como pagado");
  await field(pay, "Monto pagado").fill("490000");
  const confirm = pay.getByRole("button", { name: "Confirmar", exact: true });
  await shot(page, "04-pagar", pay, { pad: 0, marks: [confirm] });
  await confirm.click();
  await pay.waitFor({ state: "detached", timeout: 60000 });

  // Un abono a la deuda personal.
  await row(page, "Mario Fuentes").getByRole("button", { name: "Más acciones" }).click();
  await page.getByRole("menuitem", { name: /Abonos/ }).click();
  const partial = modal(page, /^Abonos · Mario Fuentes/);
  await field(partial, "Monto").fill("50000");
  await field(partial, "Nota (opcional)").fill("Transferencia");
  const register = partial.getByRole("button", { name: "Registrar abono" });
  await shot(page, "06-abono", partial, { pad: 0, marks: [register] });
  await register.click();
  await partial.getByText("Transferencia").first().waitFor({ timeout: 60000 });
  await partial.getByRole("button", { name: "Cerrar", exact: true }).last().click();
  await partial.waitFor({ state: "detached" });

  // El informe de deudas.
  await page.getByRole("button", { name: "📄 Informe de deudas" }).click();
  const report = modal(page, "Informe de deudas");
  await report.getByText("Banco del Estado").first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(800);
  await shot(page, "07-informe", report, { pad: 0 });
}
