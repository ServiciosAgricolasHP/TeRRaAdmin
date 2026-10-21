import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { greeting, GREETING_SLOTS } from "../utils/greetings";
import IndicatorsBar, { EditIndicatorsButton, IndicatorChips } from "./layout/IndicatorsBar";
import IndicatorsModal from "./layout/IndicatorsModal";
import ProfileModal from "./layout/ProfileModal";
import { TerraCircuitPixels, TerraLogo, TerraWordmark } from "./layout/TerraLogo";
import ThemePicker from "./layout/ThemePicker";
import { useIndicators } from "./layout/useIndicators";

// Versión que inyecta Vite al compilar (v<mayor>.<menor>.<commits>, ver vite.config.js).
// Se muestra en el header: una versión menor a la desplegada indica un bundle
// viejo en la caché del service worker.
export const APP_VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";

const navItems = [
  { to: "/faenas", label: "Faenas", icon: "🌾" },
  { to: "/dashboard", label: "Dashboard", icon: "🏠" },
  { to: "/calendar", label: "Calendario", icon: "📅" },
  { to: "/harvest-qr", label: "Cosecha QR", icon: "📷" },
  { to: "/workers", label: "Trabajadores", icon: "👷" },
  { to: "/transports", label: "Transportes", icon: "🚛" },
  { to: "/advances", label: "Anticipos / Bonos", icon: "🪙" },
  { to: "/payroll", label: "Nómina", icon: "💰" },
  { to: "/facturacion", label: "Facturación", icon: "🧾" },
  { to: "/cheques-pagos", label: "Cheques y pagos", icon: "📆" },
  { to: "/price-book", label: "Libro de Precios", icon: "📖" },
  { to: "/info-cuentas", label: "Agenda y Cuentas", icon: "📇" },
  { to: "/links", label: "Links útiles", icon: "🔗" },
];

export default function Layout() {
  const { user, logout, isAdmin, displayName } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Barra lateral de escritorio, abierta o cerrada según la última sesión.
  // Cerrada se oculta entera y el contenido usa todo el ancho.
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try { return localStorage.getItem("layout.sidebarOpen") !== "false"; } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem("layout.sidebarOpen", String(sidebarOpen)); } catch { /* noop */ }
  }, [sidebarOpen]);
  // Sección Admin colapsable, cerrada por defecto y recordada entre sesiones.
  // Solo la ven los admins.
  const [adminExpanded, setAdminExpanded] = useState(() => {
    try { return localStorage.getItem("layout.adminExpanded") === "true"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("layout.adminExpanded", String(adminExpanded)); } catch { /* noop */ }
  }, [adminExpanded]);

  const { indicators, save: persistIndicators } = useIndicators();
  const [indicatorsModalOpen, setIndicatorsModalOpen] = useState(false);
  // Barra de indicadores en mobile y tablet (IndicatorsBar): colapsable,
  // cerrada por defecto y recordada entre sesiones.
  const [indicatorsBarOpen, setIndicatorsBarOpen] = useState(() => {
    try { return localStorage.getItem("layout.indicatorsBarOpen") === "true"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("layout.indicatorsBarOpen", String(indicatorsBarOpen)); } catch { /* noop */ }
  }, [indicatorsBarOpen]);
  const saveIndicators = async (values) => {
    await persistIndicators(values);
    setIndicatorsModalOpen(false);
  };

  // Cierra el drawer al cambiar de ruta.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // Un solo botón: según el ancho, colapsa la barra lateral (escritorio) o
  // abre el drawer (mobile).
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
      {/* La marca lleva al inicio. Apunta a `/`, así la home se define solo
          en el router. */}
      <Link
        to="/"
        aria-label="Ir al inicio"
        className="flex h-14 items-center gap-2 border-b border-[var(--color-border)] px-4 font-semibold transition-colors hover:bg-[var(--color-surface-2)]"
      >
        <TerraLogo className="h-11 w-11 shrink-0" />
        <TerraWordmark className="h-6 w-auto" />
      </Link>
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
                <NavLink to="/admin/users" className={linkClass}>
                  <span>👥</span>
                  <span>Usuarios</span>
                </NavLink>
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
              </div>
            )}
          </div>
        )}
      </nav>
      {/* Hoja como marca de agua sutil en la esquina inferior. */}
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
      {/* Barra lateral de escritorio */}
      <aside className={`relative z-0 hidden w-60 flex-col overflow-hidden border-r border-[var(--color-border)] bg-[var(--color-surface)] ${sidebarOpen ? "md:flex" : ""}`}>
        {sidebarContent}
      </aside>

      {/* Drawer en mobile */}
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
        <header className="relative z-20 flex h-14 items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 sm:px-4">
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
              <button
                type="button"
                onClick={() => setProfileOpen(true)}
                title={greeting(user, GREETING_SLOTS.profileHover, "Mi perfil")}
                className="inline-flex min-h-[32px] max-w-[9rem] items-center truncate underline decoration-dotted underline-offset-2 hover:text-[var(--color-text)] sm:max-w-none"
              >
                {displayName}
              </button>
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
          {/* Acentos decorativos del header. El overflow-hidden que los
              recorta va en este div y no en el <header>, para no cortar el
              dropdown del selector de tema. */}
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

      {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} />}
    </div>
  );
}
