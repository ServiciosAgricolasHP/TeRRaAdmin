// Regenera las capturas de la ayuda: levanta Vite contra los emuladores y,
// para cada guía, vacía la base, siembra los datos de demo y corre su guion. Se corre con
// `npm run help:shots`, que levanta los emuladores; con
// `HELP_GUIDES=grilla-del-ciclo` regenera solo esa guía.
//
// Un guion hace el flujo por la interfaz: si un paso ya no existe en la
// pantalla, falla, y eso avisa que la guía quedó vieja.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { clearDemo, seedDemo, DEMO_PROJECT } from "./seed.mjs";
import { DESKTOP, login, preparePage, shooterFor } from "./lib.mjs";
import * as firstSteps from "./guides/primeros-pasos.mjs";
import * as cycleGrid from "./guides/grilla-del-ciclo.mjs";
import * as jobsAndCycles from "./guides/faenas-y-ciclos.mjs";
import * as dayPrices from "./guides/precios-del-dia.mjs";
import * as payroll from "./guides/nomina.mjs";
import * as payrollFixes from "./guides/corregir-nomina.mjs";
import * as advances from "./guides/anticipos-y-bonos.mjs";
import * as workers from "./guides/trabajadores.mjs";
import * as employments from "./guides/contratos.mjs";
import * as cycleSummary from "./guides/resumen-del-ciclo.mjs";
import * as transports from "./guides/transportes.mjs";
import * as transportPayments from "./guides/pagar-transportes.mjs";
import * as billing from "./guides/facturacion.mjs";
import * as commitments from "./guides/cheques-y-pagos.mjs";
import * as harvestQr from "./guides/cosecha-qr.mjs";
import * as calendarAndDashboard from "./guides/calendario-y-dashboard.mjs";
import * as infoAndLinks from "./guides/agenda-precios-y-links.mjs";

const SCRIPTS = {
  "primeros-pasos": firstSteps,
  "grilla-del-ciclo": cycleGrid,
  "faenas-y-ciclos": jobsAndCycles,
  "precios-del-dia": dayPrices,
  nomina: payroll,
  "corregir-nomina": payrollFixes,
  "anticipos-y-bonos": advances,
  trabajadores: workers,
  contratos: employments,
  "resumen-del-ciclo": cycleSummary,
  transportes: transports,
  "pagar-transportes": transportPayments,
  facturacion: billing,
  "cheques-y-pagos": commitments,
  "cosecha-qr": harvestQr,
  "calendario-y-dashboard": calendarAndDashboard,
  "agenda-precios-y-links": infoAndLinks,
};
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SIZES_FILE = path.join(ROOT, "src", "screens", "help", "imageSizes.json");
const PORT = 5196;
const BASE = `http://localhost:${PORT}/TeRRaAdmin`;

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error("Falta el emulador: corre `npm run help:shots`, que lo levanta.");
  process.exit(1);
}

// El navegador instalado: HELP_BROWSER, o Edge o Chrome en sus rutas de siempre.
const browserPath = [
  process.env.HELP_BROWSER,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].find((p) => p && fs.existsSync(p));
if (!browserPath) {
  console.error("No encontré Edge ni Chrome: pon la ruta del navegador en HELP_BROWSER.");
  process.exit(1);
}

const wanted = (process.env.HELP_GUIDES || "").split(",").map((s) => s.trim()).filter(Boolean);
const guideIds = wanted.length ? wanted : Object.keys(SCRIPTS);
const unknown = guideIds.filter((id) => !SCRIPTS[id]);
if (unknown.length) {
  console.error(`No hay guion para: ${unknown.join(", ")}`);
  process.exit(1);
}

// La app de siempre, apuntada a los emuladores y a un proyecto `demo-`.
Object.assign(process.env, {
  VITE_FIRESTORE_EMULATOR: process.env.FIRESTORE_EMULATOR_HOST,
  VITE_AUTH_EMULATOR: process.env.FIREBASE_AUTH_EMULATOR_HOST,
  VITE_FIREBASE_PROJECT_ID: DEMO_PROJECT,
  VITE_FIREBASE_API_KEY: "demo-api-key",
  VITE_FIREBASE_AUTH_DOMAIN: `${DEMO_PROJECT}.firebaseapp.com`,
  VITE_FIREBASE_STORAGE_BUCKET: `${DEMO_PROJECT}.appspot.com`,
  VITE_FIREBASE_MESSAGING_SENDER_ID: "0",
  VITE_FIREBASE_APP_ID: "1:0:web:demo",
});

const server = await createServer({ root: ROOT, server: { port: PORT, strictPort: true }, logLevel: "warn" });
await server.listen();
const browser = await chromium.launch({ executablePath: browserPath, headless: true });
const sizes = JSON.parse(fs.readFileSync(SIZES_FILE, "utf8"));
let failed = false;

try {
  for (const guideId of guideIds) {
    // Cada guía parte de los mismos datos, se genere sola o con las demás.
    await clearDemo();
    await seedDemo();
    const context = await browser.newContext({ viewport: DESKTOP, locale: "es-CL", timezoneId: "America/Santiago" });
    const page = await context.newPage();
    await preparePage(page);
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    try {
      await SCRIPTS[guideId].run({ browser, page, base: BASE, login: () => login(page, BASE), shot: shooterFor({ guideId, root: ROOT, sizes }) });
      console.log(`✓ ${guideId}${errors.length ? ` (errores en la página: ${errors.slice(0, 2).join(" | ")})` : ""}`);
    } catch (err) {
      failed = true;
      console.error(`✗ ${guideId}: ${String(err?.message || err).split("\n")[0]}`);
      const shotPath = path.join(os.tmpdir(), `help-shots-error-${guideId}.png`);
      await page.screenshot({ path: shotPath }).catch(() => {});
      console.error(`  la pantalla al fallar: ${shotPath}`);
    }
    await context.close();
  }
} finally {
  const sorted = Object.fromEntries(Object.entries(sizes).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(SIZES_FILE, `${JSON.stringify(sorted, null, 2)}\n`);
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
