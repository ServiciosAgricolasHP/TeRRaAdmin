// Capturas de la guía "Administración" (src/screens/help/guides/administracion.md):
// las cuentas, las sesiones de la auditoría y la consola.
import { seedAdmin } from "../seed.mjs";

export async function run({ page, base, login, shot }) {
  await seedAdmin();
  await login();

  await page.goto(`${base}/admin/users`);
  await page.getByText("secretaria@terra.test").first().waitFor({ timeout: 120000 });
  await page.waitForTimeout(1000);
  await shot(page, "01-usuarios", page.locator("main"), { pad: 0, marks: [page.getByRole("button", { name: "+ Nueva cuenta" })] });

  await page.goto(`${base}/audit`);
  await page.getByRole("button", { name: "▶ Cargar" }).first().click();
  await page.getByText("secretaria@terra.test").first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(800);
  await shot(page, "02-auditoria", page.locator("main"), { pad: 0 });

  await page.goto(`${base}/admin/console`);
  await page.getByText("🧪 Ping al backend").first().waitFor({ timeout: 120000 });
  await page.waitForTimeout(500);
  await shot(page, "03-consola", page.locator("main"), { pad: 0 });
}
