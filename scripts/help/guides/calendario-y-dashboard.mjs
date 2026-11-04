// Capturas de la guía "Calendario y Dashboard"
// (src/screens/help/guides/calendario-y-dashboard.md): el mes, el detalle de
// un día con los trabajadores de una labor y las tarjetas del Dashboard.
import { seedBilling, seedCommitments, seedLaborTypes, seedPayrollHistory, seedTransports } from "../seed.mjs";

export async function run({ page, base, login, shot }) {
  await seedLaborTypes();
  await seedTransports();
  await seedCommitments();
  await seedBilling();
  await seedPayrollHistory();
  await login();

  // El mes de octubre.
  await page.goto(`${base}/calendar`);
  const bar = page.getByRole("button", { name: "Cuartel Norte", exact: true }).first();
  await bar.waitFor({ timeout: 120000 });
  await page.waitForTimeout(800);
  await shot(page, "01-calendario", page.locator("main"), { pad: 0 });

  // El 5 de octubre en Cuartel Norte, con la gente de la labor.
  await bar.click();
  await page.getByText(/Por labor \(/).waitFor({ timeout: 60000 });
  await page.locator("tr", { hasText: "Principal" }).first().click();
  await page.getByText("Ana Pérez Soto").first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(500);
  await shot(page, "02-dia");
  await page.keyboard.press("Escape");

  // Las tarjetas del Dashboard.
  await page.goto(`${base}/dashboard`);
  await page.getByText("Plata pagada a trabajadores").waitFor({ timeout: 120000 });
  await page.getByText("Nómina 16-30 de Septiembre").first().waitFor({ timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await shot(page, "03-dashboard", page.locator("main"), { pad: 0 });
}
