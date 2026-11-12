// Capturas de la guía "El resumen del ciclo"
// (src/screens/help/guides/resumen-del-ciclo.md): el botón, el resumen para
// pagar, las tarifas para cobrar, un día agregado a mano, el total con IVA y
// el aviso para bloquear antes de copiar.
import { DEMO_CYCLE, seedDayNote } from "../seed.mjs";

// El modal abierto con ese título.
const modal = (page, title) =>
  page.getByRole("heading", { name: title }).locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");

export async function run({ page, base, login, shot }) {
  await seedDayNote();
  await login();
  await page.goto(`${base}/cycles/${DEMO_CYCLE}`);
  await page.getByText("Ana Pérez Soto").first().waitFor({ timeout: 120000 });

  // El botón, en la barra del ciclo.
  const open = page.getByRole("button", { name: "📊 Resumen ciclo" });
  await shot(page, "01-abrir", open.locator("xpath=.."), { pad: 8, marks: [open] });

  // Para pagar.
  await open.click();
  const summary = modal(page, /Resumen ciclo —/);
  await summary.getByText("TOTAL GENERAL").first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(1000);
  await shot(page, "02-pagar", summary, { pad: 0 });

  // Para cobrar, en edición, con la tarifa acordada.
  const charge = summary.getByRole("button", { name: "Para cobrar", exact: true });
  await charge.click();
  const editing = summary.getByRole("button", { name: "✏️ Editando" });
  await editing.click();
  // El panel de tarifas se abre solo al editar.
  const ratesToggle = summary.getByRole("button", { name: /Editar tarifas cobro/ });
  const editor = summary.getByText("Tarifas para cobrar (compartidas con el equipo)").locator("xpath=..");
  const rate = editor.locator("tbody input[type=number]").first();
  await rate.fill("35000");
  await page.waitForTimeout(800);
  await shot(page, "03-tarifas", [charge.locator("xpath=../.."), editor], { pad: 6, marks: [editing, rate] });
  await ratesToggle.click();

  // Un día agregado a mano.
  const addRow = summary.getByRole("button", { name: "+ Agregar día / ajuste manual" });
  await addRow.click();
  const table = addRow.locator("xpath=ancestor::table[1]");
  const extra = table.locator("tr", { has: page.locator("input[type=date]") }).last();
  await extra.locator("input[type=date]").fill("2026-10-10");
  await extra.locator("input[type=text]").fill("Riego nocturno");
  await extra.locator("input[type=number]").first().fill("6");
  await page.waitForTimeout(800);
  await shot(page, "04-ajustar", table, { pad: 8, marks: [addRow] });

  // Con IVA y bloqueado: el total a facturar.
  const vat = summary.getByRole("button", { name: "🚫 Sin IVA" });
  if (await vat.isVisible().catch(() => false)) await vat.click();
  await summary.getByRole("button", { name: "🔒 Bloqueado" }).click();
  const totals = summary.getByText("TOTAL A FACTURAR").first().locator("xpath=ancestor::table[1]");
  await totals.waitFor();
  await page.waitForTimeout(500);
  await shot(page, "05-total", totals, { pad: 8 });

  // En edición, copiar pide bloquear antes.
  await editing.click();
  await summary.getByRole("button", { name: "📋 Copiar imagen" }).click();
  const ask = modal(page, "El resumen está en modo edición");
  await ask.waitFor();
  await shot(page, "06-bloquear", ask, { pad: 0 });
  await ask.getByRole("button", { name: "Cancelar", exact: true }).click();
}
