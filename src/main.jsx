import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";

// Si un import() dinámico falla porque el chunk ya no existe en el servidor
// (un `index.js` cacheado por el service worker apunta a los hashes de un
// deploy anterior), borra los caches de Workbox, desregistra los service
// workers y recarga desde la red. Se rinde tras 3 intentos por sesión
// (sessionStorage): ahí el chunk falta de verdad en el servidor.
if (typeof window !== "undefined") {
  let recovering = false;
  const attemptsKey = "__preload_recover_attempts";
  window.addEventListener("vite:preloadError", async (event) => {
    if (recovering) return;
    const attempts = Number(sessionStorage.getItem(attemptsKey) || 0);
    if (attempts >= 3) return;
    recovering = true;
    sessionStorage.setItem(attemptsKey, String(attempts + 1));
    event.preventDefault?.();
    try {
      // Caches de Workbox: precache y runtime.
      if ("caches" in window) {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      }
      // Sin service workers, la próxima navegación pide los assets a la red.
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
    } catch {
      /* noop: recarga igual */
    }
    // Navega con un query param nuevo para saltarse la caché HTTP, que
    // serviría el index.html con los chunks viejos. `?__v=` no afecta las
    // rutas del router.
    const url = new URL(window.location.href);
    url.searchParams.set("__v", String(Date.now()));
    window.location.replace(url.toString());
  });
  // Si la carga pasa 5 s sin otro preloadError, reinicia el contador de
  // intentos y saca `?__v=` de la URL.
  window.addEventListener("load", () => {
    setTimeout(() => {
      try { sessionStorage.removeItem(attemptsKey); } catch { /* noop */ }
      const url = new URL(window.location.href);
      if (url.searchParams.has("__v")) {
        url.searchParams.delete("__v");
        window.history.replaceState({}, "", url.toString());
      }
    }, 5000);
  });
}

// Intenta fijar la orientación horizontal desde JS. El `orientation:
// landscape` del manifest solo aplica con la PWA instalada, y este lock falla
// en silencio fuera de pantalla completa: en la práctica cubre la PWA
// instalada en Android.
if (typeof window !== "undefined" && typeof screen !== "undefined" && screen.orientation) {
  const tryLock = () => {
    try {
      const p = screen.orientation.lock?.("landscape");
      // Puede devolver una Promise o undefined; el rechazo se ignora.
      if (p && typeof p.then === "function") p.catch(() => { /* noop */ });
    } catch { /* noop */ }
  };
  tryLock();
  document.addEventListener("fullscreenchange", tryLock);
  // Al volver a la pestaña el lock pudo haberse liberado.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) tryLock();
  });
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
