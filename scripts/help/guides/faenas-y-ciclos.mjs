// Capturas de la guía "Faenas, subfaenas y ciclos"
// (src/screens/help/guides/faenas-y-ciclos.md): crea una faena nueva con su
// subfaena y su primer ciclo, lo cierra y lo reabre.

// El modal abierto con ese título.
const modal = (page, title) =>
  page.getByRole("heading", { name: title, exact: true }).locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");

export async function run({ page, login, shot }) {
  await login();

  // Nueva faena.
  const newJob = page.getByRole("button", { name: "+ Nueva faena", exact: true });
  await shot(page, "01-nueva-faena", newJob.locator("xpath=.."), { pad: 10, marks: [newJob] });
  await newJob.click();
  const jobModal = modal(page, "Nueva faena");
  await jobModal.getByLabel("Nombre").fill("Fundo El Peumo");
  await jobModal.getByLabel("Ubicación").fill("Rengo");
  await jobModal.getByLabel("Ubicación").blur();
  await shot(page, "02-datos-faena", jobModal, { pad: 0 });
  await jobModal.getByRole("button", { name: "Guardar", exact: true }).click();
  await jobModal.waitFor({ state: "detached" });

  // La faena elegida, todavía sin subfaenas.
  await page.locator("[draggable]").filter({ hasText: "Fundo El Peumo" }).first().click();
  const newSubjob = page.getByRole("button", { name: "+ Subfaena", exact: true }).first();
  await newSubjob.waitFor();
  const detail = newSubjob.locator("xpath=ancestor::div[contains(@class,'mt-6') and contains(@class,'rounded-lg')][1]");
  await shot(page, "03-faena-sin-subfaenas", detail, { pad: 0, marks: [newSubjob] });

  // Nueva subfaena y la oferta del primer ciclo.
  await newSubjob.click();
  const subjobModal = modal(page, "Nueva subfaena");
  await subjobModal.getByLabel("Nombre").fill("Cuartel Sur");
  await subjobModal.getByRole("button", { name: "Guardar", exact: true }).click();
  const offer = modal(page, "¿Crear el primer ciclo?");
  await offer.waitFor();
  await shot(page, "04-primer-ciclo", offer, { pad: 0, marks: [offer.getByRole("button", { name: "Crear ciclo", exact: true })] });
  await offer.getByRole("button", { name: "Crear ciclo", exact: true }).click();

  // El formulario del ciclo.
  const cycleModal = modal(page, "Nuevo ciclo");
  await cycleModal.getByPlaceholder("Ciclo 1").fill("Ciclo 1");
  await cycleModal.getByLabel("Fecha inicio").fill("2026-10-06");
  await cycleModal.getByLabel("Fecha inicio").blur();
  await shot(page, "05-nuevo-ciclo", cycleModal, { pad: 0 });
  await cycleModal.getByRole("button", { name: "Guardar", exact: true }).click();
  await cycleModal.waitFor({ state: "detached" });

  // La fila del ciclo, con sus botones.
  const row = page.locator("li", { hasText: "Fundo El Peumo/Cuartel Sur/Ciclo 1" }).first();
  await row.waitFor();
  await shot(page, "06-fila-del-ciclo", row, { pad: 6 });

  // Cerrar el ciclo y no encadenar otro.
  await row.getByRole("button", { name: "Cerrar", exact: true }).click();
  const closeModal = modal(page, "Cerrar ciclo");
  await shot(page, "07-cerrar-ciclo", closeModal, { pad: 0 });
  await closeModal.getByRole("button", { name: "Cerrar ciclo", exact: true }).click();
  const nextModal = modal(page, "¿Crear nuevo ciclo?");
  await nextModal.waitFor();
  await shot(page, "08-ciclo-siguiente", nextModal, { pad: 0 });
  await nextModal.getByRole("button", { name: "No, gracias", exact: true }).click();
  await nextModal.waitFor({ state: "detached" });

  // El ciclo cerrado, con Reabrir.
  const reopen = row.getByRole("button", { name: "↻ Reabrir", exact: true });
  await reopen.waitFor();
  await shot(page, "09-reabrir", row, { pad: 6, marks: [reopen] });
}
