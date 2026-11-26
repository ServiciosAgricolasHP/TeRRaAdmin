// Prueba de humo: abre cada pantalla de la app y sus modales clave en el
// navegador, en escritorio y a 412 px, contra los emuladores con los datos de
// demo de la ayuda. Falla si la página lanza un error o escribe uno en la
// consola, o si una pantalla no llega a mostrar lo que tiene que mostrar. Los
// e2e prueban la capa de servicios y nunca dibujan un componente: esto es lo
// que ve que una pantalla se cae.
//
// Se corre con `npm run test:smoke`, que levanta los emuladores. Usa la misma
// maquinaria que las capturas de la ayuda (`scripts/help/`): Vite contra los
// emuladores, la semilla y el navegador instalado (`HELP_BROWSER` para otro).
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { DESKTOP, PHONE, findBrowser, login, preparePage, requireEmulators, startApp } from "../../scripts/help/lib.mjs";
import {
  DEMO_CYCLE,
  LABOR_TYPES_CYCLE,
  clearDemo,
  seedAdmin,
  seedAdvances,
  seedBilling,
  seedCashWorkers,
  seedCommitments,
  seedDayNote,
  seedDemo,
  seedEmployments,
  seedHarvestQr,
  seedInfoAndLinks,
  seedLaborTypes,
  seedPayrollHistory,
  seedTransports,
  seedWorkerDetails,
} from "../../scripts/help/seed.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = 5198;
const LOAD = { timeout: 120000 };

// Los errores de la consola que vienen del equipo y no de la app: la red que
// cambia o se suspende mientras corre la prueba.
const IGNORED = [/net::ERR_NETWORK_CHANGED/, /net::ERR_NETWORK_IO_SUSPENDED/];

// El primero de los que se ven: una pantalla puede tener en la página otra
// versión escondida para el otro ancho (la tabla del escritorio en el teléfono).
const seen = (locator) => locator.filter({ visible: true }).first();

// Cada ruta con lo que muestra cuando terminó de cargar sus datos.
const SCREENS = [
  { path: "/faenas", shows: (page) => page.getByText("Fundo Los Aromos") },
  { path: `/cycles/${DEMO_CYCLE}`, shows: (page) => page.getByText("Ana Pérez Soto") },
  { path: `/cycles/${LABOR_TYPES_CYCLE}`, shows: (page) => page.getByText("Ana Pérez Soto") },
  { path: "/dashboard", shows: (page) => page.getByText("Plata pagada a trabajadores") },
  { path: "/calendar", shows: (page) => page.getByRole("button", { name: "Cuartel Norte", exact: true }) },
  { path: "/workers", shows: (page) => page.getByText(/· \d+ trabajadores/) },
  { path: "/transports", shows: (page) => page.getByText("Transportes Ríos Ltda.") },
  { path: "/advances", shows: (page) => page.getByText("Arreglo de la bicicleta") },
  { path: "/payroll", shows: (page) => page.getByText("Ciclos con pendiente") },
  { path: "/facturacion", shows: (page) => page.getByText("Frutícola Cerro Verde S.A.") },
  { path: "/cheques-pagos", shows: (page) => page.getByText("Inmobiliaria Los Olmos Ltda.") },
  { path: "/price-book", shows: (page) => page.getByText("Fundo Los Alerces — 2025") },
  { path: "/info-cuentas", shows: (page) => page.getByText("Transportes Ríos Ltda.") },
  { path: "/links", shows: (page) => page.getByText("Previred") },
  { path: "/harvest-qr", shows: (page) => page.getByText("SE — Santa Elena") },
  { path: "/audit", shows: (page) => page.getByRole("heading", { name: "Auditoría" }) },
  { path: "/admin/console", shows: (page) => page.getByText("🧪 Ping al backend") },
  { path: "/admin/users", shows: (page) => page.getByText("secretaria@terra.test") },
  { path: "/admin/migrate-workers", shows: (page) => page.getByRole("heading", { name: "Migrar trabajadores desde CSV" }) },
  { path: "/admin/cleanup-paid-workdays", shows: (page) => page.getByRole("heading", { name: /Limpiar jornadas pagadas/ }) },
  { path: "/ayuda", shows: (page) => page.getByRole("heading", { name: "❓ Ayuda" }) },
  { path: "/ayuda/nomina", shows: (page) => page.getByRole("heading", { name: "Generar y pagar una nómina" }) },
  { path: "/no-existe", shows: (page) => page.getByRole("heading", { name: "Página no encontrada" }) },
];

// El modal abierto con ese título.
const modal = (page, title) =>
  page.getByRole("heading", { name: title }).locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");

// Cierra el modal de arriba con Escape y espera a que se vaya.
async function closeTop(page, dialog) {
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
}

// Los modales clave, cada uno desde su pantalla. Generar la nómina va antes
// que su detalle, que abre la que se generó.
const FLOWS = [
  {
    name: "Resumen del ciclo",
    run: async (page, base) => {
      await page.goto(`${base}/cycles/${DEMO_CYCLE}`);
      await seen(page.getByText("Ana Pérez Soto")).waitFor(LOAD);
      await seen(page.getByRole("button", { name: "📊 Resumen ciclo" })).click();
      const summary = modal(page, /Resumen ciclo —/);
      await seen(summary.getByText("TOTAL GENERAL")).waitFor(LOAD);
      await summary.getByRole("button", { name: "Para cobrar", exact: true }).click();
      await page.waitForTimeout(800);
      await closeTop(page, summary);
    },
  },
  {
    name: "Ficha y resumen del trabajador",
    run: async (page, base) => {
      await page.goto(`${base}/workers`);
      await seen(page.getByText(/· \d+ trabajadores/)).waitFor(LOAD);
      // La lista se llena al buscar.
      await page.getByPlaceholder("Buscar por nombre, apellido o RUT…").fill("Pérez");
      await seen(page.getByText("Ana Pérez Soto")).waitFor();
      await seen(page.getByRole("button", { name: "Editar", exact: true })).click();
      const form = modal(page, /^Editar /);
      await form.waitFor();
      await page.waitForTimeout(800);
      await closeTop(page, form);
      await seen(page.getByTitle("Ver resumen del trabajador")).click();
      const summary = modal(page, /^📊 Resumen — /);
      await summary.waitFor();
      await page.waitForTimeout(1500);
      await closeTop(page, summary);
    },
  },
  {
    name: "Generar una nómina",
    desktopOnly: true,
    run: async (page, base) => {
      await page.goto(`${base}/payroll`);
      await seen(page.getByText("Ciclos con pendiente")).waitFor(LOAD);
      await page.getByRole("checkbox").first().check();
      await page.getByRole("button", { name: "Continuar →" }).click();
      const save = page.getByRole("button", { name: "Guardar nómina" });
      await save.waitFor({ timeout: 60000 });
      await page.waitForTimeout(1000);
      await save.click();
      // Lo que pide confirmar antes de guardar: las cuotas de los anticipos y la revisión.
      const saved = seen(page.getByText("Marcar pagada"));
      const confirm = seen(page.getByRole("button", { name: /^(Confirmar y generar|Generar igual|Generar de todos modos)$/ }));
      for (let i = 0; i < 3; i++) {
        await saved.or(confirm).first().waitFor({ timeout: 60000 });
        if (await saved.isVisible()) break;
        await confirm.click();
      }
      await saved.waitFor({ timeout: 60000 });
    },
  },
  {
    name: "Detalle de la nómina",
    run: async (page, base) => {
      await page.goto(`${base}/payroll`);
      await seen(page.getByText("Ciclos con pendiente")).waitFor(LOAD);
      await page.getByRole("button", { name: /Historial Nómina/ }).click();
      await seen(page.getByText("Marcar pagada")).waitFor(LOAD);
      await seen(page.getByText(/^\d{4}\p{L}+Semana\d+$/u)).click();
      const detail = page.getByRole("heading", { name: /^\d{4}\p{L}+Semana\d+$/u }).locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
      await seen(detail.getByText(/Transferencias/)).waitFor(LOAD);
      await page.waitForTimeout(1500);
      await detail.getByRole("button", { name: /🕘/ }).click();
      const history = modal(page, /^🕘 Historial · /);
      await history.waitFor();
      await page.waitForTimeout(800);
      await closeTop(page, history);
      await detail.getByRole("button", { name: /📎 Adjuntos/ }).click();
      const files = modal(page, /^Adjuntos · /);
      await files.getByText("Todavía no hay adjuntos.").waitFor();
      await closeTop(page, files);
      // El detalle tiene su propio fondo y no se cierra con Escape.
      await detail.getByRole("button", { name: "Cerrar", exact: true }).first().click();
      await detail.waitFor({ state: "detached" });
    },
  },
  {
    name: "Resumen del transportista",
    run: async (page, base) => {
      await page.goto(`${base}/transports`);
      await seen(page.getByText("Transportes Ríos Ltda.")).click(LOAD);
      const summary = modal(page, "📊 Resumen — Ríos");
      await seen(summary.getByText(/Vueltas sin resumen/)).waitFor(LOAD);
      await page.waitForTimeout(800);
      await closeTop(page, summary);
    },
  },
  {
    name: "Adjuntos de Cheques y pagos",
    run: async (page, base) => {
      await page.goto(`${base}/cheques-pagos`);
      const name = seen(page.getByText("Frutícola Cerro Verde S.A."));
      await name.waitFor(LOAD);
      // La fila de la tabla o, en el teléfono, su tarjeta: lo más cercano que tiene su ⋯.
      await name.locator("xpath=ancestor::*[.//button[@aria-label='Más acciones']][1]").getByRole("button", { name: "Más acciones" }).click();
      await page.getByRole("menuitem", { name: /Adjuntos/ }).click();
      const files = modal(page, /^Adjuntos · Frutícola Cerro Verde/);
      await files.getByText("Todavía no hay adjuntos.").waitFor();
      await closeTop(page, files);
    },
  },
];

requireEmulators("npm run test:smoke");
const browserPath = findBrowser();

await clearDemo();
await seedDemo();
for (const seed of [
  seedLaborTypes, seedCashWorkers, seedAdvances, seedTransports, seedDayNote, seedWorkerDetails, seedEmployments,
  seedBilling, seedCommitments, seedHarvestQr, seedPayrollHistory, seedInfoAndLinks, seedAdmin,
]) {
  await seed();
}

const app = await startApp({ root: ROOT, port: PORT });
const browser = await chromium.launch({ executablePath: browserPath, headless: true });
const problems = [];
let current = "";

// Una pasada con un ancho: cada pantalla y cada flujo, anotando lo que falla.
async function pass(label, viewport, { phone }) {
  const context = await browser.newContext({ viewport, locale: "es-CL", timezoneId: "America/Santiago", hasTouch: phone, isMobile: phone });
  let page = null;
  let onCrash = null;

  // Una pestaña con los avisos conectados. Un error de la página corta el paso:
  // la pantalla ya no va a mostrar sus datos.
  const openPage = async () => {
    page = await context.newPage();
    await preparePage(page);
    page.on("pageerror", (err) => {
      problems.push({ where: current, text: `Error en la página: ${err.message}` });
      onCrash?.();
    });
    page.on("console", (msg) => {
      if (msg.type() === "error" && !IGNORED.some((re) => re.test(msg.text()))) problems.push({ where: current, text: msg.text() });
    });
  };

  const step = async (name, run) => {
    current = `${label} · ${name}`;
    const before = problems.length;
    const crashed = new Promise((resolve) => {
      onCrash = resolve;
    });
    let outcome = "failed";
    try {
      outcome = await Promise.race([run().then(() => "done"), crashed.then(() => "crashed")]);
      // Lo que falla un poco después de dibujar (una carga, un efecto) cuenta para este paso.
      if (outcome === "done") await page.waitForTimeout(500);
    } catch (err) {
      const shotPath = path.join(os.tmpdir(), `smoke-${problems.length}.png`);
      await page.screenshot({ path: shotPath }).catch(() => {});
      problems.push({ where: current, text: `No terminó: ${String(err?.message || err).split("\n")[0]} (la pantalla: ${shotPath})` });
    }
    onCrash = null;
    // Lo que quedó corriendo del paso no sigue en el siguiente: la pestaña se
    // cierra y se abre otra, con la misma sesión.
    if (outcome !== "done") {
      await page.close();
      await openPage();
    }
    console.log(`${problems.length > before ? "✗" : "✓"} ${current}`);
  };

  await openPage();
  await step("Iniciar sesión", () => login(page, app.base));
  for (const screen of SCREENS) {
    await step(screen.path, async () => {
      await page.goto(`${app.base}${screen.path}`);
      await seen(screen.shows(page)).waitFor(LOAD);
    });
  }
  for (const flow of FLOWS) {
    if (phone && flow.desktopOnly) continue;
    await step(flow.name, () => flow.run(page, app.base));
  }
  await context.close();
}

try {
  await pass("Escritorio", DESKTOP, { phone: false });
  await pass("Teléfono", PHONE, { phone: true });
} finally {
  await browser.close();
  await app.close();
}

if (problems.length) {
  // React dibuja dos veces en desarrollo: el mismo error se cuenta una vez, con sus repeticiones.
  const grouped = new Map();
  for (const p of problems) {
    const key = `${p.where}: ${p.text.slice(0, 600)}`;
    grouped.set(key, (grouped.get(key) || 0) + 1);
  }
  console.error(`\n${grouped.size} problema(s):`);
  for (const [key, count] of grouped) console.error(`- ${key}${count > 1 ? ` (×${count})` : ""}`);
  process.exit(1);
}
console.log("\nSin errores.");
process.exit(0);
