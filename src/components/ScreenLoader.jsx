import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { rememberedBirthday } from "../services/userPrefsService";
import { localIsoDate } from "../utils/dates";
import { screenLoaderFor } from "../utils/screenLoaders";

// Una carga que sale de la caché termina antes de este tiempo: la animación no
// alcanza a aparecer y no queda un parpadeo.
const SHOW_DELAY_MS = 300;

// Lo que muestra una pantalla mientras carga: la animación del día
// (`screenLoaderFor`) y el texto, en el color del tema. Es para la carga de una
// pantalla o de una pestaña; un modal, un botón o una sección chica siguen con
// el texto solo. Con movimiento reducido en el sistema queda solo el texto.
export default function ScreenLoader({ label = "Cargando…", className = "" }) {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const loader = screenLoaderFor(localIsoDate(), user ? user.birthday : rememberedBirthday());

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div role="status" className={`flex flex-col items-center justify-center gap-2 py-8 ${className}`}>
      {/* La imagen se pide desde el inicio y se muestra pasado el retardo. El
          alto fijo y el borde de abajo dejan el suelo de todas las animaciones
          a la misma altura. */}
      <img
        src={`${import.meta.env.BASE_URL}loaders/${loader.file}`}
        alt=""
        width={220}
        height={145}
        decoding="async"
        className={`h-[145px] w-[220px] max-w-full object-contain object-bottom transition-opacity duration-200 motion-reduce:hidden ${
          visible ? "opacity-100" : "opacity-0"
        }`}
      />
      <span className="text-sm text-[var(--color-muted)]">{label}</span>
    </div>
  );
}
