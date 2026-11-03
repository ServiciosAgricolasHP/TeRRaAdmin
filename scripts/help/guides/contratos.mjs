// Capturas de la guía "Contratos, honorarios e imposiciones"
// (src/screens/help/guides/contratos.md): los empleadores, contratar a la
// gente de un ciclo, terminar un contrato, los finiquitos, el historial en la
// ficha, la grilla por contrato, la lista de honorarios con sus boletas y la
// de imposiciones del mes.
import { PHONE, login as loginOn, preparePage } from "../lib.mjs";
import { DEMO_CYCLE, seedEmployments } from "../seed.mjs";

// El modal abierto con ese título.
const modal = (page, title) =>
  page.getByRole("heading", { name: title }).locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");

// El campo con esa etiqueta.
const field = (scope, label) => scope.locator("label", { hasText: new RegExp(`^${label}`) }).locator("input, select").first();

const EMPLOYER = "Agrícola Los Aromos SpA";

export async function run({ browser, page, base, login, shot }) {
  await seedEmployments();
  await login();
  await page.goto(`${base}/workers`);
  await page.getByRole("tab", { name: "📄 Contratos" }).click();
  await page.getByText("Ana Pérez Soto").first().waitFor({ timeout: 120000 });

  // Los empleadores.
  await page.getByRole("button", { name: "⚙ Empleadores" }).click();
  const employers = modal(page, "Empleadores");
  await employers.getByText(EMPLOYER).waitFor();
  await shot(page, "01-empleadores", employers, { pad: 0 });
  await page.keyboard.press("Escape");
  await employers.waitFor({ state: "detached" });

  // Contratar a la gente del ciclo que no tiene nada desde su primer día.
  await page.getByRole("button", { name: "+ Contratar" }).click();
  const hire = modal(page, "Contratar");
  await field(hire, "Empleador").selectOption({ label: EMPLOYER });
  await field(hire, "Desde").fill("2026-10-05");
  await field(hire, "Desde").blur();
  const fromCycle = field(hire, "O desde un ciclo abierto");
  await fromCycle.selectOption({ label: "Fundo Los Aromos/Cuartel Norte/Ciclo 1" });
  await hire.getByText("Felipe Torres Lagos").waitFor();
  await page.waitForTimeout(500);
  const review = hire.getByRole("button", { name: /^Contratar \(/ });
  await shot(page, "02-contratar", hire, { pad: 0, marks: [fromCycle, review] });
  // Nadie queda afuera, así que guarda de una.
  await review.click();
  await hire.waitFor({ state: "detached", timeout: 60000 });
  await page.getByText("Felipe Torres Lagos").first().waitFor();
  await page.waitForTimeout(800);

  // Elegir a Felipe para terminar su contrato.
  const felipe = page.getByRole("checkbox", { name: "Elegir a Felipe Torres Lagos" }).first();
  await felipe.check();
  const endButton = page.getByRole("button", { name: /^Terminar \(/ });
  await endButton.waitFor();
  await shot(page, "03-vigentes", [page.getByText(/con contrato ·/), page.locator("tbody tr").last()], { pad: 8, marks: [felipe, endButton] });
  await endButton.click();
  const end = modal(page, "Terminar período");
  await end.getByText("El contrato queda con el finiquito pendiente.").waitFor();
  await shot(page, "04-terminar", end, { pad: 0 });
  await end.getByRole("button", { name: /^Terminar 1$/ }).click();
  await end.waitFor({ state: "detached", timeout: 60000 });
  await page.waitForTimeout(800);

  // Los finiquitos: el de Felipe, pendiente, y el de Gloria, solicitado.
  await page.getByRole("button", { name: /^Finiquitos/ }).click();
  await page.getByText("Gloria Herrera Pino").first().waitFor();
  await page.getByRole("checkbox", { name: "Elegir a Felipe Torres Lagos" }).first().check();
  const requested = page.getByRole("button", { name: "Marcar solicitado" });
  await shot(page, "05-finiquitos", [page.getByText(/con contrato ·/), page.locator("tbody tr").last()], {
    pad: 8, marks: [requested, page.getByRole("button", { name: "Marcar listo" })],
  });
  await page.getByRole("button", { name: "Quitar selección" }).click();

  // El historial de Gloria, en su ficha.
  await page.getByRole("button", { name: "Gloria Herrera Pino" }).first().click();
  const card = modal(page, /^Editar /);
  const history = card.getByRole("heading", { name: "Contrato u honorarios" }).locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");
  await history.getByText(/sin contrato ni honorarios/).waitFor({ timeout: 30000 });
  await history.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await shot(page, "06-historial", history, { pad: 6 });
  await card.getByRole("button", { name: "Cancelar", exact: true }).click();
  await card.waitFor({ state: "detached" });

  // La grilla del ciclo, por contrato.
  await page.goto(`${base}/cycles/${DEMO_CYCLE}`);
  await page.getByText("Ana Pérez Soto").first().waitFor({ timeout: 120000 });
  const byContract = page.getByRole("button", { name: "Por contrato", exact: true }).first();
  await byContract.click();
  await page.getByText("A honorarios").first().waitFor();
  await page.waitForTimeout(1000);
  await shot(page, "07-grilla-por-contrato", [byContract.locator("xpath=../.."), page.locator(".ag-root-wrapper").first()], { pad: 8, marks: [byContract] });

  // La lista de honorarios del mes, de Carla y Diego.
  await page.goto(`${base}/workers`);
  await page.getByRole("tab", { name: "🧾 Honorarios" }).click();
  await page.getByRole("button", { name: "+ Generar lista" }).click();
  const fees = modal(page, "Generar lista de honorarios");
  await field(fees, "Empleador").selectOption({ label: EMPLOYER });
  // Se habilita cuando llega la tarifa de la configuración.
  await fees.getByRole("button", { name: "Calcular días" }).click();
  await fees.getByText(/jornadas leídas/).waitFor({ timeout: 60000 });
  await page.waitForTimeout(500);
  await shot(page, "08-generar-honorarios", fees, { pad: 0 });
  await fees.getByRole("button", { name: "Guardar lista" }).click();

  // La lista guardada: la boleta de Carla, con su folio.
  const feeList = modal(page, `Honorarios · ${EMPLOYER}`);
  await feeList.waitFor({ timeout: 60000 });
  const folio = feeList.getByRole("textbox", { name: "Folio de Carla Rojas Fuentes" }).first();
  await folio.fill("1045");
  const saveFees = feeList.getByRole("button", { name: "Guardar", exact: true });
  await shot(page, "09-boletas", feeList, { pad: 0, marks: [folio, saveFees] });
  await saveFees.click();
  await feeList.waitFor({ state: "detached", timeout: 60000 });

  // La lista de imposiciones de octubre.
  await page.getByRole("tab", { name: "🏛 Imposiciones" }).click();
  await page.getByRole("button", { name: "+ Generar lista" }).click();
  const contributions = modal(page, "Generar lista de imposiciones");
  await field(contributions, "Empleador").selectOption({ label: EMPLOYER });
  await field(contributions, "Mes").fill("2026-10");
  await contributions.getByRole("button", { name: "Calcular días" }).click();
  await contributions.getByText(/jornadas leídas/).waitFor({ timeout: 60000 });
  await page.waitForTimeout(500);
  await shot(page, "10-generar-imposiciones", contributions, { pad: 0 });
  await contributions.getByRole("button", { name: "Guardar lista" }).click();
  const saved = modal(page, /^Imposiciones /);
  await saved.waitFor({ timeout: 60000 });
  await page.waitForTimeout(500);
  await shot(page, "11-enviar-imposiciones", saved, {
    pad: 0, marks: [saved.getByRole("button", { name: "📊 Excel" }), saved.getByRole("button", { name: "Marcar enviada al contador" })],
  });

  // En el teléfono: los contratos en tarjetas.
  const phone = await browser.newContext({ viewport: PHONE, locale: "es-CL", timezoneId: "America/Santiago", isMobile: true, hasTouch: true });
  const p = await phone.newPage();
  await preparePage(p);
  await loginOn(p, base);
  await p.goto(`${base}/workers`);
  await p.getByRole("tab", { name: "📄 Contratos" }).click();
  // La tabla de escritorio también está, oculta: se espera la tarjeta.
  await p.locator("text=Ana Pérez Soto >> visible=true").first().waitFor({ timeout: 120000 });
  await p.waitForTimeout(800);
  await shot(p, "12-telefono", null);
  await phone.close();
}
