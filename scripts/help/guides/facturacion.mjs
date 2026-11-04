// Capturas de la guía "Facturación" (src/screens/help/guides/facturacion.md):
// las empresas, importar un mes de ventas, la lista, una nota de crédito que
// anula una factura, un abono, los pendientes, un centro de costo y el
// resumen del año.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEMO_COMPANY, rut, seedBilling } from "../seed.mjs";

const modal = (page, title) =>
  page.getByRole("heading", { name: title }).locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");

// Escape cierra el modal de arriba.
const close = async (dialog) => {
  await dialog.page().keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
};

// Un registro de ventas de julio, como lo baja el SII, con el RUT de la
// empresa en el nombre.
function salesCsv() {
  const rows = [
    "Nro;Tipo Doc;Tipo Venta;Rut cliente;Razon Social;Folio;Fecha Docto;Monto Exento;Monto Neto;Monto IVA;Monto Total",
    `1;33;Del Giro;${rut(96123450)};Frutícola Cerro Verde S.A.;1150;10/07/2026;0;1800000;342000;2142000`,
    `2;33;Del Giro;${rut(77234561)};Exportadora Las Brisas SpA;1151;18/07/2026;0;1200000;228000;1428000`,
    `3;33;Del Giro;${rut(78345672)};Agrícola San Pedro Ltda.;1152;25/07/2026;0;650000;123500;773500`,
  ];
  const file = path.join(os.tmpdir(), `RCV_VENTA_${DEMO_COMPANY.rut}_202607.csv`);
  fs.writeFileSync(file, `${rows.join("\n")}\n`, "utf8");
  return file;
}

export async function run({ page, base, login, shot }) {
  await seedBilling();
  await login();
  await page.goto(`${base}/facturacion`);
  await page.getByText("Frutícola Cerro Verde S.A.").first().waitFor({ timeout: 120000 });

  // Las empresas.
  await page.getByRole("button", { name: /^🏢 Empresas/ }).click();
  const companies = modal(page, "Empresas");
  await companies.getByText(DEMO_COMPANY.razonSocial).first().waitFor();
  await shot(page, "01-empresas", companies, { pad: 0, marks: [companies.getByRole("button", { name: "+ Nueva empresa" })] });
  await close(companies);

  // Importar las ventas de julio.
  await page.getByRole("button", { name: "📥 Importar CSV del SII" }).click();
  const pick = modal(page, "Importar CSV del SII");
  await pick.locator("input[type=file]").setInputFiles(salesCsv());
  const preview = modal(page, /^Importar 1 archivo/);
  const confirm = preview.getByRole("button", { name: /^Confirmar/ });
  await confirm.waitFor();
  await page.waitForTimeout(500);
  await shot(page, "02-importar", preview, { pad: 0, marks: [confirm] });
  await confirm.click();
  await preview.waitFor({ state: "detached", timeout: 60000 });
  await page.getByText(/archivo procesado/).first().waitFor({ state: "hidden", timeout: 30000 }).catch(() => {});

  // Las facturas de octubre.
  await page.waitForTimeout(1000);
  await shot(page, "03-facturas", page.locator("main"), { pad: 0 });

  // La nota de crédito que podría anular la factura 1204.
  await page.getByRole("button", { name: "⚠ NC?" }).first().click();
  const nc = modal(page, /N° 1204/);
  const cancel = nc.getByRole("button", { name: "Marcar como Anulada" });
  await cancel.waitFor();
  await shot(page, "04-nota-de-credito", nc, { pad: 0, marks: [cancel] });
  await close(nc);

  // Un pago por lo que falta de la factura 1202, que ya tiene un abono.
  await page.locator("tr", { hasText: "1202" }).getByRole("button", { name: "ℹ" }).click();
  const doc = modal(page, /N° 1202/);
  await doc.getByRole("button", { name: "+ Registrar pago / abono" }).click();
  await doc.locator("select").filter({ has: page.locator("option[value=total]") }).selectOption("total");
  await doc.getByPlaceholder("opcional").last().fill("Transferencia");
  await page.waitForTimeout(300);
  await shot(page, "05-abono", doc, { pad: 0, marks: [doc.getByRole("button", { name: "Registrar pago", exact: true })] });
  await doc.getByRole("button", { name: "Registrar pago", exact: true }).click();
  await doc.getByText("Saldo:").first().waitFor();
  await close(doc);

  // Lo que falta por cobrar.
  await page.getByRole("button", { name: /⏳ Ver pendientes/ }).click();
  const receivables = modal(page, /^Pendientes — /);
  await receivables.getByText("TOTAL PENDIENTE").first().waitFor();
  await page.waitForTimeout(500);
  await shot(page, "06-pendientes", receivables, { pad: 0 });
  await close(receivables);

  // Los documentos y el gasto informal de Mantención.
  await page.getByRole("button", { name: /Gestionar centros de costo/ }).click();
  const centers = modal(page, "Centros de costo");
  await centers.locator("select").first().selectOption({ label: "🔧 Mantención" });
  await centers.getByText("Soldadura del portón").first().waitFor();
  await page.waitForTimeout(500);
  await shot(page, "07-centros-de-costo", centers, { pad: 0, marks: [centers.getByRole("button", { name: "+ Gasto informal" })] });
  await close(centers);

  // El resumen del año.
  await page.getByRole("button", { name: /Resumen$/ }).click();
  await page.getByText("IVA Débito").first().waitFor();
  await page.waitForTimeout(800);
  await shot(page, "08-resumen", page.locator("main"), { pad: 0 });
}
