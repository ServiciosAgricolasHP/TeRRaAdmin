// Capturas de la guía "Cosecha QR" (src/screens/help/guides/cosecha-qr.md):
// el prefijo de Santa Elena, el resultado de sincronizar sus pesajes, los
// pesajes por trabajador y asignar un QR.
import { DEMO_WORKERS, seedHarvestQr, seedLaborTypes } from "../seed.mjs";

const modal = (page, title) =>
  page.getByRole("heading", { name: title }).locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");

const tab = (page, name) => page.getByRole("button", { name, exact: true }).click();

export async function run({ page, base, login, shot }) {
  await seedLaborTypes();
  await seedHarvestQr();
  await login();
  await page.goto(`${base}/harvest-qr`);
  const prefixRow = page.locator("tr", { hasText: "SE — Santa Elena" });
  await prefixRow.waitFor({ timeout: 120000 });

  // El prefijo apuntado a la cosecha.
  await prefixRow.getByRole("button", { name: "Editar", exact: true }).click();
  const form = modal(page, "Editar prefijo SE");
  await form.getByText("Labor de cosecha vigente").waitFor();
  await page.waitForTimeout(800);
  await shot(page, "01-prefijo", form, { pad: 0, marks: [form.getByRole("button", { name: "Guardar", exact: true })] });
  await form.getByRole("button", { name: "Cancelar", exact: true }).click();
  await form.waitFor({ state: "detached" });

  // Sincronizar los pesajes del 7 de octubre.
  await prefixRow.getByRole("button", { name: "🔄 Sincronizar" }).click();
  const sync = modal(page, "Sincronizar pesajes — SE");
  await sync.getByRole("button", { name: "Sincronizar", exact: true }).click();
  await sync.getByText(/Jornadas escritas/).waitFor({ timeout: 120000 });
  await page.waitForTimeout(500);
  await shot(page, "02-sincronizar", sync, { pad: 0 });
  await sync.getByRole("button", { name: "Cerrar", exact: true }).last().click();
  await sync.waitFor({ state: "detached" });

  // Los pesajes por trabajador.
  await tab(page, "⚖️ Pesajes");
  await page.getByText("Ana Pérez Soto").first().waitFor({ timeout: 60000 });
  await page.getByText(/pesaje\(s\)/).first().waitFor({ state: "hidden", timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(800);
  await shot(page, "03-pesajes", page.locator("main"), { pad: 0 });

  // Un QR para Felipe.
  await tab(page, "📱 Gestión QRs");
  await page.getByRole("button", { name: "+ Asignar QR" }).click();
  const assign = modal(page, "Asignar QR");
  await assign.getByPlaceholder("XX-0123").fill("SE-106");
  await assign.getByPlaceholder("RUT").fill(DEMO_WORKERS[5].id);
  // El nombre también está en las opciones de la lista, que no se ven.
  await assign.getByText(DEMO_WORKERS[5].name, { exact: true }).last().waitFor();
  const save = assign.getByRole("button", { name: "Asignar", exact: true });
  await shot(page, "04-asignar", assign, { pad: 0, marks: [save] });
  await assign.getByRole("button", { name: "Cancelar", exact: true }).click();
}
