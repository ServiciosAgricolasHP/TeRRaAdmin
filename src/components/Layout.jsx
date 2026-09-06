import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import Modal from "./Modal";
import { indicatorsService } from "../services";

const INDICATORS_DOC = "main";
const INDICATOR_DEFS = [
  { key: "sueldoBase", label: "Sueldo base", icon: "💵" },
  { key: "dia", label: "Día", icon: "📅" },
  { key: "hora", label: "Hora extra", icon: "⏱" },
];
// Isotipo real de TeRRA (public/terra.svg, sin la wordmark — esa va aparte
// como texto HTML de siempre). El archivo original es un trazado a un solo
// color; acá los mismos paths (el `d` de cada uno, copiado tal cual) se
// separan en 3 grupos según qué parte del dibujo son (identificado
// coloreando cada path por separado y comparando contra el diseño
// original), cada grupo con su propia variable de tema:
// --color-text (laptop + circuito), --color-accent (anillo + hoja) y
// --color-accent-hover (mitad del mosaico de píxeles, para el segundo verde
// que tenía el original).
function TerraLogo({ className }) {
  return (
    <svg className={className} viewBox="335 245 590 510" aria-hidden="true">
      <g transform="translate(0,1254) scale(0.1,-0.1)">
        <g style={{ fill: "var(--color-accent)" }}>
          <path d="M6240 9679 c-572 -48 -1122 -309 -1512 -718 -105 -110 -263 -314 -310 -401 l-28 -50 113 0 112 0 72 98 c341 459 844 759 1443 859 152 26 551 25 704 0 214 -36 474 -121 626 -205 257 -142 446 -295 626 -508 l96 -114 27 19 c14 11 37 30 49 44 28 30 27 34 -48 127 -320 402 -728 665 -1228 790 -198 49 -534 76 -742 59z" />
          <path d="M8824 7232 c-6 -9 -26 -44 -44 -77 -18 -33 -43 -78 -55 -100 -17 -31 -26 -74 -39 -190 -80 -747 -564 -1433 -1231 -1745 -201 -94 -413 -156 -660 -192 -147 -21 -485 -16 -633 10 -280 49 -521 136 -736 266 l-60 36 -150 0 -149 0 39 -35 c71 -63 237 -172 351 -229 341 -170 653 -246 1023 -246 249 0 430 24 650 87 288 82 553 217 810 413 169 129 440 421 531 574 129 217 175 304 216 411 120 312 164 535 162 833 0 92 -4 175 -7 184 -7 17 -8 17 -18 0z" />
          <path d="M8715 8470 c-641 -83 -1042 -246 -1345 -550 -133 -133 -193 -213 -265 -354 -204 -404 -223 -921 -52 -1466 l33 -105 13 105 c55 460 237 869 556 1249 103 123 274 286 386 369 96 71 217 147 224 140 2 -2 -37 -39 -86 -83 -176 -157 -409 -430 -551 -646 -83 -126 -200 -356 -263 -518 -49 -127 -105 -318 -105 -361 0 -10 23 6 58 39 102 98 197 151 495 281 98 43 221 104 273 135 371 221 604 556 720 1030 13 55 44 218 69 363 43 249 59 335 71 375 5 15 -1 17 -43 16 -26 -1 -111 -9 -188 -19z" />
          <path d="M8165 6470 c-148 -20 -378 -93 -495 -157 -332 -183 -484 -456 -505 -908 -7 -156 -7 -156 54 -35 114 227 272 431 469 607 90 79 177 141 187 131 3 -2 -32 -47 -78 -99 -135 -154 -203 -242 -286 -366 -78 -118 -177 -291 -170 -297 10 -9 214 60 307 105 324 152 492 414 577 901 17 92 19 129 8 127 -5 -1 -35 -5 -68 -9z" />
          <path d="M4715 7187 c-3 -7 -4 -94 -3 -192 l3 -180 190 0 190 0 0 190 0 190 -188 3 c-147 2 -189 0 -192 -11z" />
          <path d="M5557 6613 c-4 -3 -7 -75 -7 -158 l0 -153 58 -4 c31 -3 105 -3 165 0 l107 5 0 143 c0 78 -3 149 -6 158 -5 14 -29 16 -158 16 -84 0 -156 -3 -159 -7z" />
        </g>
        <g style={{ fill: "var(--color-accent-hover)" }}>
          <path d="M5227 7753 c-4 -3 -7 -62 -7 -130 l0 -123 130 0 130 0 0 99 c0 54 -3 113 -6 130 l-6 31 -118 0 c-64 0 -120 -3 -123 -7z" />
          <path d="M4334 7587 c-2 -7 -3 -71 -2 -143 l3 -129 130 0 130 0 3 143 3 142 -131 0 c-98 0 -132 -3 -136 -13z" />
          <path d="M5297 6993 c-4 -3 -7 -64 -7 -135 l0 -128 135 0 135 0 0 135 0 135 -128 0 c-71 0 -132 -3 -135 -7z" />
          <path d="M4958 6589 c-20 -11 -22 -40 -12 -162 l7 -77 119 0 119 0 -3 123 -3 122 -105 2 c-59 2 -113 -2 -122 -8z" />
        </g>
        <g style={{ fill: "var(--color-text)" }}>
          <path d="M6217 8836 c-48 -18 -85 -51 -103 -93 -18 -41 -18 -124 0 -166 13 -32 78 -97 96 -97 6 0 10 -38 10 -88 l0 -87 -265 -265 -265 -265 0 -307 0 -306 46 -26 c26 -14 50 -26 55 -26 5 0 9 136 9 302 l0 302 270 269 270 268 0 114 c0 105 2 114 20 120 30 9 79 53 95 86 31 59 15 168 -34 223 -40 46 -139 66 -204 42z m122 -132 c36 -45 22 -93 -33 -114 -31 -11 -79 7 -90 35 -19 50 17 105 69 105 24 0 39 -7 54 -26z" />
          <path d="M4077 8349 c-21 -5 -51 -15 -66 -24 -41 -21 -96 -88 -109 -134 -9 -28 -12 -343 -12 -1180 0 -1240 -3 -1167 55 -1221 l27 -25 1379 -3 c1523 -2 1412 -7 1371 60 -11 18 -34 45 -49 60 l-29 28 -1285 2 -1284 3 -3 1107 -2 1107 24 28 c24 27 27 28 128 28 56 1 415 2 796 3 l693 2 59 56 c64 61 81 91 59 105 -18 11 -1703 10 -1752 -2z" />
          <path d="M6697 8296 c-46 -17 -83 -49 -105 -91 -18 -34 -21 -140 -5 -168 8 -16 -34 -63 -314 -340 l-323 -322 2 -318 3 -318 47 -27 c26 -15 49 -24 52 -21 3 3 6 143 6 312 l1 306 312 313 313 313 69 -3 c83 -3 117 13 165 79 57 80 34 210 -48 263 -47 32 -124 41 -175 22z m126 -137 c42 -57 -13 -132 -81 -108 -28 9 -52 44 -52 73 0 7 10 25 21 40 28 36 83 33 112 -5z" />
          <path d="M6629 7540 c-73 -22 -129 -100 -129 -180 0 -43 -3 -47 -145 -190 l-145 -147 0 -271 0 -271 98 -67 c388 -269 604 -524 712 -842 l30 -87 0 92 c1 343 -195 642 -603 917 l-117 80 0 200 0 201 116 116 116 116 41 -19 c58 -29 141 -22 196 16 93 65 109 199 33 280 -52 55 -133 78 -203 56z m111 -130 c26 -26 26 -81 0 -105 -49 -44 -140 3 -125 64 13 57 85 81 125 41z" />
          <path d="M3509 5637 c-27 -60 39 -164 134 -211 l51 -26 1596 0 c1228 0 1599 3 1608 12 30 30 -1 173 -49 224 l-22 24 -608 0 -607 0 -21 -34 c-12 -19 -28 -37 -37 -40 -9 -3 -153 -6 -321 -6 l-305 0 -37 40 -36 40 -668 0 -667 0 -11 -23z" />
        </g>
      </g>
    </svg>
  );
}
// Wordmark real "TeRRA" del isotipo (los 5 paths de letras del mismo
// terra.svg, recortados a su propio bounding box) — reemplaza el texto HTML
// plano por la tipografía llamativa/bold que trae el diseño original.
function TerraWordmark({ className }) {
  return (
    <svg className={className} viewBox="290 800 670 200" aria-hidden="true">
      <g transform="translate(0,1254) scale(0.1,-0.1)" style={{ fill: "var(--color-text)" }}>
        <path d="M3194 4207 c-3 -8 -4 -54 -2 -103 l3 -89 207 -3 208 -2 2 -538 3 -537 120 0 120 0 3 538 2 537 215 0 215 0 0 105 0 105 -545 0 c-445 0 -547 -2 -551 -13z" />
        <path d="M4640 3895 c-191 -43 -331 -180 -375 -366 -28 -122 -16 -228 42 -342 42 -85 88 -136 167 -186 140 -88 324 -103 481 -38 66 27 168 99 196 139 l23 31 -55 49 c-30 26 -62 50 -71 54 -12 3 -34 -7 -60 -29 -70 -57 -125 -80 -205 -85 -147 -9 -265 72 -288 201 l-7 37 371 0 371 0 6 25 c3 13 1 62 -5 107 -25 192 -149 339 -330 394 -72 22 -187 26 -261 9z m218 -191 c67 -28 122 -92 137 -161 l7 -33 -251 0 c-194 0 -251 3 -251 13 0 6 11 35 24 63 25 55 75 101 128 121 48 17 162 16 206 -3z" />
        <path d="M5437 4213 c-4 -7 -11 -1083 -8 -1245 l1 -38 120 0 120 0 2 223 3 222 131 3 131 3 67 -93 c37 -51 108 -153 158 -225 l92 -133 138 0 c104 0 138 3 138 13 0 7 -43 71 -95 142 -137 186 -236 327 -233 329 2 1 28 13 59 28 82 39 160 115 195 190 26 57 29 73 28 163 0 79 -5 111 -23 154 -48 118 -125 192 -250 240 -66 26 -67 26 -418 29 -193 2 -353 -1 -356 -5z m680 -218 c80 -34 122 -102 123 -198 0 -67 -15 -102 -64 -145 -53 -46 -93 -53 -308 -50 l-193 3 -3 202 -2 202 42 4 c95 11 366 -2 405 -18z" />
        <path d="M6735 4208 c-3 -7 -4 -296 -3 -643 l3 -630 120 0 120 0 0 220 0 220 132 3 132 3 23 -33 c13 -18 45 -62 71 -98 26 -36 88 -122 138 -192 l90 -128 134 0 c74 0 136 4 139 8 3 5 -71 112 -164 238 -94 126 -170 232 -170 235 0 3 24 15 54 28 104 43 199 149 223 250 57 242 -77 459 -319 516 -85 20 -716 22 -723 3z m647 -199 c70 -15 139 -82 157 -153 20 -80 6 -133 -48 -187 -29 -29 -61 -51 -86 -58 -23 -6 -122 -11 -231 -11 l-192 0 -3 108 c-2 59 -2 151 -1 204 3 80 7 98 20 101 36 10 334 6 384 -4z" />
        <path d="M8472 4208 c-5 -7 -38 -74 -72 -148 -34 -74 -77 -166 -95 -205 -18 -38 -52 -113 -75 -165 -23 -52 -73 -162 -110 -245 -145 -319 -212 -471 -217 -493 l-5 -23 128 3 128 3 56 125 55 125 260 3 c143 2 287 0 320 -3 l60 -7 56 -121 57 -122 123 -3 c67 -1 126 1 131 6 6 6 -12 57 -45 128 -30 66 -110 241 -177 389 -192 425 -218 481 -286 625 l-64 135 -108 3 c-79 2 -112 -1 -120 -10z m166 -428 c27 -63 75 -172 106 -242 31 -70 56 -132 56 -138 0 -6 -78 -10 -221 -10 -173 0 -220 3 -216 13 3 6 34 77 70 157 35 80 83 189 107 243 23 54 44 96 46 95 1 -2 25 -55 52 -118z" />
      </g>
    </svg>
  );
}

// Motivo circuito+píxeles del isotipo, aislado (los mismos paths que ya usa
// TerraLogo adentro del laptop), para reutilizar como acento decorativo en
// otras partes de la UI en vez de dibujar uno nuevo a mano.
function TerraCircuitPixels({ className }) {
  return (
    <svg className={className} viewBox="410 355 320 370" aria-hidden="true">
      <g transform="translate(0,1254) scale(0.1,-0.1)">
        <g style={{ fill: "var(--color-text)" }}>
          <path d="M6217 8836 c-48 -18 -85 -51 -103 -93 -18 -41 -18 -124 0 -166 13 -32 78 -97 96 -97 6 0 10 -38 10 -88 l0 -87 -265 -265 -265 -265 0 -307 0 -306 46 -26 c26 -14 50 -26 55 -26 5 0 9 136 9 302 l0 302 270 269 270 268 0 114 c0 105 2 114 20 120 30 9 79 53 95 86 31 59 15 168 -34 223 -40 46 -139 66 -204 42z m122 -132 c36 -45 22 -93 -33 -114 -31 -11 -79 7 -90 35 -19 50 17 105 69 105 24 0 39 -7 54 -26z" />
          <path d="M6697 8296 c-46 -17 -83 -49 -105 -91 -18 -34 -21 -140 -5 -168 8 -16 -34 -63 -314 -340 l-323 -322 2 -318 3 -318 47 -27 c26 -15 49 -24 52 -21 3 3 6 143 6 312 l1 306 312 313 313 313 69 -3 c83 -3 117 13 165 79 57 80 34 210 -48 263 -47 32 -124 41 -175 22z m126 -137 c42 -57 -13 -132 -81 -108 -28 9 -52 44 -52 73 0 7 10 25 21 40 28 36 83 33 112 -5z" />
          <path d="M6629 7540 c-73 -22 -129 -100 -129 -180 0 -43 -3 -47 -145 -190 l-145 -147 0 -271 0 -271 98 -67 c388 -269 604 -524 712 -842 l30 -87 0 92 c1 343 -195 642 -603 917 l-117 80 0 200 0 201 116 116 116 116 41 -19 c58 -29 141 -22 196 16 93 65 109 199 33 280 -52 55 -133 78 -203 56z m111 -130 c26 -26 26 -81 0 -105 -49 -44 -140 3 -125 64 13 57 85 81 125 41z" />
        </g>
        <g style={{ fill: "var(--color-accent)" }}>
          <path d="M4715 7187 c-3 -7 -4 -94 -3 -192 l3 -180 190 0 190 0 0 190 0 190 -188 3 c-147 2 -189 0 -192 -11z" />
          <path d="M5557 6613 c-4 -3 -7 -75 -7 -158 l0 -153 58 -4 c31 -3 105 -3 165 0 l107 5 0 143 c0 78 -3 149 -6 158 -5 14 -29 16 -158 16 -84 0 -156 -3 -159 -7z" />
        </g>
        <g style={{ fill: "var(--color-accent-hover)" }}>
          <path d="M5227 7753 c-4 -3 -7 -62 -7 -130 l0 -123 130 0 130 0 0 99 c0 54 -3 113 -6 130 l-6 31 -118 0 c-64 0 -120 -3 -123 -7z" />
          <path d="M4334 7587 c-2 -7 -3 -71 -2 -143 l3 -129 130 0 130 0 3 143 3 142 -131 0 c-98 0 -132 -3 -136 -13z" />
          <path d="M5297 6993 c-4 -3 -7 -64 -7 -135 l0 -128 135 0 135 0 0 135 0 135 -128 0 c-71 0 -132 -3 -135 -7z" />
          <path d="M4958 6589 c-20 -11 -22 -40 -12 -162 l7 -77 119 0 119 0 -3 123 -3 122 -105 2 c-59 2 -113 -2 -122 -8z" />
        </g>
      </g>
    </svg>
  );
}
const fmtCLP = (v) =>
  Number(v) > 0
    ? new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(Number(v))
    : "—";

// Inyectado por Vite en build-time desde el count de commits de HEAD.
// Visible en el header para confirmar que el bundle no quedó en caché vieja
// (PWA/Service Worker). Si el usuario ve una versión menor a la última
// desplegada → hard refresh.
export const APP_VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";

const navItems = [
  { to: "/", label: "Dashboard", icon: "🏠", end: true },
  { to: "/faenas", label: "Faenas", icon: "🌾" },
  { to: "/calendar", label: "Calendario", icon: "📅" },
  { to: "/workers", label: "Trabajadores", icon: "👷" },
  { to: "/transports", label: "Transportes", icon: "🚛" },
  { to: "/advances", label: "Anticipos / Bonos", icon: "🪙" },
  { to: "/payroll", label: "Nómina", icon: "💰" },
  { to: "/facturacion", label: "Facturación", icon: "🧾" },
  { to: "/price-book", label: "Libro de Precios", icon: "📖" },
  { to: "/info-cuentas", label: "Información y Cuentas", icon: "📇" },
  { to: "/links", label: "Links útiles", icon: "🔗" },
];

function ThemePicker() {
  const { theme, setTheme, themes } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const current = themes.find((t) => t.key === theme) || themes[0];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] sm:px-3"
      >
        🎨 <span className="hidden sm:inline">{current.label}</span>
        <span className="text-[var(--color-muted)]">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-48 overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg">
          {themes.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setTheme(t.key);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-[var(--color-accent-soft)] ${
                t.key === theme
                  ? "font-medium text-[var(--color-accent)]"
                  : "text-[var(--color-text)]"
              }`}
            >
              <span>{t.label}</span>
              {t.key === theme && <span>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Desktop sidebar collapsed state, persisted between sessions. Hidden
  // entirely when collapsed to give the main content the full viewport width.
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try { return localStorage.getItem("layout.sidebarOpen") !== "false"; } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem("layout.sidebarOpen", String(sidebarOpen)); } catch { /* noop */ }
  }, [sidebarOpen]);
  // Sección Admin colapsable — persistida entre sesiones. Default cerrada
  // porque el admin la usa esporádicamente y evita que el sidebar quede
  // largo. Solo aplica cuando el usuario es admin.
  const [adminExpanded, setAdminExpanded] = useState(() => {
    try { return localStorage.getItem("layout.adminExpanded") === "true"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("layout.adminExpanded", String(adminExpanded)); } catch { /* noop */ }
  }, [adminExpanded]);

  // Indicadores del banner (sueldo base / día / hora extra). Carga única al
  // montar; se editan manualmente vía modal y quedan en el doc `indicators/main`.
  const [indicators, setIndicators] = useState(null);
  const [indicatorsModalOpen, setIndicatorsModalOpen] = useState(false);
  // Barra de indicadores en mobile/tablet (IndicatorsBar): colapsable porque
  // ocupa una fila entera en cada pantalla y la mayoría de las veces no hace
  // falta mirarla. Arranca cerrada; se recuerda entre sesiones.
  const [indicatorsBarOpen, setIndicatorsBarOpen] = useState(() => {
    try { return localStorage.getItem("layout.indicatorsBarOpen") === "true"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("layout.indicatorsBarOpen", String(indicatorsBarOpen)); } catch { /* noop */ }
  }, [indicatorsBarOpen]);
  useEffect(() => {
    (async () => {
      try {
        const doc = await indicatorsService.getById(INDICATORS_DOC);
        setIndicators(doc || {});
      } catch {
        setIndicators({});
      }
    })();
  }, []);
  const saveIndicators = async (values) => {
    await indicatorsService.upsert(INDICATORS_DOC, values);
    setIndicators((prev) => ({ ...(prev || {}), ...values }));
    setIndicatorsModalOpen(false);
  };

  // Auto-close drawer on route change
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // Single button handles both mobile drawer and desktop collapse depending
  // on viewport width so the user only has to learn one control.
  const onMenuClick = () => {
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches) {
      setSidebarOpen((o) => !o);
    } else {
      setDrawerOpen(true);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const linkClass = ({ isActive }) =>
    `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
      isActive
        ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
        : "text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
    }`;

  const sidebarContent = (
    <>
      <div className="flex h-14 items-center gap-2 border-b border-[var(--color-border)] px-4 font-semibold">
        <TerraLogo className="h-11 w-11 shrink-0" />
        <TerraWordmark className="h-6 w-auto" />
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {navItems.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
        {isAdmin && (
          <div className="mt-3 border-t border-[var(--color-border)] pt-2">
            <button
              type="button"
              onClick={() => setAdminExpanded((v) => !v)}
              className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
              aria-expanded={adminExpanded}
            >
              <span className="flex items-center gap-2">
                <span>🛡️</span>
                <span>Admin</span>
              </span>
              <span>{adminExpanded ? "▾" : "▸"}</span>
            </button>
            {adminExpanded && (
              <div className="mt-1 space-y-1">
                <NavLink to="/audit" className={linkClass}>
                  <span>🛡️</span>
                  <span>Auditoría</span>
                </NavLink>
                <NavLink to="/admin/migrate-workers" className={linkClass}>
                  <span>📥</span>
                  <span>Migrar CSV</span>
                </NavLink>
                <NavLink to="/admin/cleanup-paid-workdays" className={linkClass}>
                  <span>🧹</span>
                  <span>Limpiar pagados</span>
                </NavLink>
                <NavLink to="/admin/console" className={linkClass}>
                  <span>📟</span>
                  <span>Consola</span>
                </NavLink>
                <NavLink to="/admin/harvest-qr" className={linkClass}>
                  <span>📷</span>
                  <span>Cosecha QR</span>
                </NavLink>
              </div>
            )}
          </div>
        )}
      </nav>
      {/* Hoja como marca de agua, muy sutil, en la esquina inferior — mismo
          detalle "naturaleza" del isotipo. */}
      <svg
        className="pointer-events-none absolute -bottom-4 -right-6 -z-10 opacity-[0.1]"
        width="130" height="130" viewBox="0 0 130 130" aria-hidden="true"
      >
        <path d="M108 22 C 64 22, 22 60, 22 108 C 70 108, 108 70, 108 22 Z" style={{ fill: "var(--color-accent)" }} />
        <path d="M104 26 C 74 52, 48 78, 24 104" style={{ fill: "none", stroke: "var(--color-bg)", strokeWidth: 3 }} />
      </svg>
    </>
  );

  return (
    <div className="flex h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      {/* Desktop sidebar */}
      <aside className={`relative z-0 hidden w-60 flex-col overflow-hidden border-r border-[var(--color-border)] bg-[var(--color-surface)] ${sidebarOpen ? "md:flex" : ""}`}>
        {sidebarContent}
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDrawerOpen(false)}
            aria-label="Cerrar menú"
          />
          <aside className="absolute inset-y-0 left-0 z-0 flex w-60 flex-col overflow-hidden border-r border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl">
            {sidebarContent}
          </aside>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="relative z-0 flex h-14 items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 sm:px-4">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={onMenuClick}
              aria-label={sidebarOpen ? "Ocultar barra lateral" : "Mostrar barra lateral"}
              title={sidebarOpen ? "Ocultar barra lateral" : "Mostrar barra lateral"}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-sm hover:bg-[var(--color-accent-soft)]"
            >
              ☰
            </button>
            <div className="truncate text-xs text-[var(--color-muted)] sm:text-sm">
              <span className="font-semibold text-[var(--color-text)]">TeRRA {APP_VERSION}</span>
              <span className="mx-1.5 text-[var(--color-border)]">·</span>
              <span className="truncate">{user?.email}</span>
              <span className="ml-2 rounded bg-[var(--color-accent-soft)] px-2 py-0.5 text-[10px] text-[var(--color-accent)] sm:text-xs">
                {user?.role}
              </span>
            </div>
          </div>
          {/* Indicadores en el centro del header — solo en desktop ancho; en
              mobile van en la barra de abajo (IndicatorsBar). */}
          <div className="hidden min-w-0 flex-1 items-center justify-center gap-2 lg:flex">
            <div className="flex items-center gap-2 overflow-x-auto">
              <IndicatorChips indicators={indicators} />
            </div>
            <EditIndicatorsButton onEdit={() => setIndicatorsModalOpen(true)} />
          </div>
          <div className="flex shrink-0 flex-nowrap items-center justify-end gap-1 sm:gap-2">
            <ThemePicker />
            <button
              onClick={handleLogout}
              className="shrink-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] sm:px-3"
            >
              Salir
            </button>
          </div>
          {/* Acentos decorativos del header — envueltos aparte (no en el
              <header>) para que el overflow-hidden que los recorta nunca
              afecte al dropdown del selector de tema, que es hermano de este
              div, no descendiente. */}
          <div className="pointer-events-none absolute right-0 top-0 -z-10 h-14 w-56 overflow-hidden" aria-hidden="true">
            <svg className="absolute -right-[30px] -top-[55px] opacity-[0.14]" width="150" height="150" viewBox="0 0 150 150">
              <circle
                cx="75" cy="75" r="58" fill="none"
                style={{ stroke: "var(--color-accent)", strokeWidth: 3 }}
                strokeLinecap="round" strokeDasharray="230 105"
                transform="rotate(30 75 75)"
              />
            </svg>
            <TerraCircuitPixels className="absolute right-[80px] top-[6px] h-11 w-auto opacity-60" />
          </div>
        </header>
        <IndicatorsBar
          indicators={indicators}
          onEdit={() => setIndicatorsModalOpen(true)}
          open={indicatorsBarOpen}
          onToggle={() => setIndicatorsBarOpen((v) => !v)}
        />
        <main className="flex-1 overflow-auto p-3 sm:p-6">
          <Outlet />
        </main>
      </div>

      {indicatorsModalOpen && (
        <IndicatorsModal
          indicators={indicators}
          onCancel={() => setIndicatorsModalOpen(false)}
          onSave={saveIndicators}
        />
      )}
    </div>
  );
}

// Los 3 chips de indicadores (sin contenedor). Se reusa en el centro del
// header (desktop) y en la barra tipo ticker de mobile.
function IndicatorChips({ indicators }) {
  return INDICATOR_DEFS.map((ind) => (
    <div
      key={ind.key}
      className="flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-xs"
    >
      <span>{ind.icon}</span>
      <span className="text-[var(--color-muted)]">{ind.label}</span>
      <span className="font-semibold tabular-nums text-[var(--color-text)]">
        {fmtCLP(indicators?.[ind.key])}
      </span>
    </div>
  ));
}

function EditIndicatorsButton({ onEdit }) {
  return (
    <button
      onClick={onEdit}
      title="Editar indicadores"
      className="shrink-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)]"
    >
      ✎
    </button>
  );
}

// Barra tipo ticker — solo en mobile/tablet angosto, donde el header no tiene
// espacio para los indicadores en el centro. Colapsada (default) es solo una
// tira angosta con una flecha, casi sin altura, para no robarle espacio
// permanente a la pantalla. Al abrirla baja la fila completa de chips con
// scroll horizontal por si no entran todos, y la flecha para volver a
// cerrarla queda al final de esa fila.
function IndicatorsBar({ indicators, onEdit, open, onToggle }) {
  if (!open) {
    return (
      <button
        type="button"
        onClick={onToggle}
        title="Mostrar indicadores"
        className="flex w-full shrink-0 items-center justify-center border-b border-[var(--color-border)] bg-[var(--color-surface-2)] py-0.5 leading-none text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)] lg:hidden"
      >
        <span className="text-[10px]">▾</span>
      </button>
    );
  }
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 sm:px-4 lg:hidden">
      <div className="flex flex-1 items-center gap-2 overflow-x-auto">
        <IndicatorChips indicators={indicators} />
      </div>
      <EditIndicatorsButton onEdit={onEdit} />
      <button
        type="button"
        onClick={onToggle}
        title="Ocultar indicadores"
        className="shrink-0 rounded-md px-1.5 py-1 text-xs text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)]"
      >
        ▴
      </button>
    </div>
  );
}

// Modal para editar los 3 indicadores a la vez. Inputs numéricos simples.
function IndicatorsModal({ indicators, onCancel, onSave }) {
  const [form, setForm] = useState(() => ({
    sueldoBase: indicators?.sueldoBase ?? "",
    dia: indicators?.dia ?? "",
    hora: indicators?.hora ?? "",
  }));
  const [busy, setBusy] = useState(false);

  const set = (key, raw) => {
    // Solo dígitos — los montos en CLP no llevan decimales.
    const digits = String(raw).replace(/[^\d]/g, "");
    setForm((f) => ({ ...f, [key]: digits === "" ? "" : Number(digits) }));
  };

  const submit = async () => {
    setBusy(true);
    try {
      await onSave({
        sueldoBase: Number(form.sueldoBase) || 0,
        dia: Number(form.dia) || 0,
        hora: Number(form.hora) || 0,
      });
    } finally {
      setBusy(false);
    }
  };

  const inputCls = "w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";

  return (
    <Modal
      open
      onClose={onCancel}
      size="sm"
      title="Editar indicadores"
      footer={
        <>
          <button onClick={onCancel} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm">
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
          >
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {INDICATOR_DEFS.map((ind) => (
          <div key={ind.key}>
            <label className="mb-1 block text-xs font-medium text-[var(--color-muted)]">
              {ind.icon} {ind.label}
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-[var(--color-muted)]">$</span>
              <input
                type="text"
                inputMode="numeric"
                value={form[ind.key] === "" ? "" : Number(form[ind.key]).toLocaleString("es-CL")}
                onChange={(e) => set(ind.key, e.target.value)}
                placeholder="0"
                className={inputCls}
              />
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
